import { cacheGet, cacheSet, TTL } from "./cache.js";
import type { ComponentInfo, ComponentRegistry } from "../types.js";

const REPO = "mittwald/flow";
const BRANCH = "main";
const CONTENT_BASE = `apps/docs/src/content/04-components`;
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;

interface TreeEntry {
  path: string;
  type: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "mittwald-flow-mcp",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function fetchRaw(url: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: { "User-Agent": "mittwald-flow-mcp" },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GitHub raw fetch error: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

function parseFrontmatter(mdx: string): { component: string; description: string } {
  const match = mdx.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { component: "", description: "" };

  const yaml = match[1];
  const componentMatch = yaml.match(/^component:\s*(.+)$/m);
  // Description can be single-line or multi-line (indented continuation)
  const descMatch = yaml.match(/^description:\s*([\s\S]*?)(?=\n[a-z]|\n*$)/m);

  let description = "";
  if (descMatch) {
    description = descMatch[1]
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join(" ");
  }

  return {
    component: componentMatch?.[1]?.trim() ?? "",
    description,
  };
}

export async function getRegistry(): Promise<ComponentRegistry> {
  const cached = cacheGet<ComponentRegistry>("registry");
  if (cached) return cached;

  const tree = await fetchJson<{ tree: TreeEntry[] }>(
    `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`,
  );

  const indexPattern = new RegExp(
    `^${CONTENT_BASE}/([^/]+)/([^/]+)/index\\.mdx$`,
  );

  const entries: { category: string; slug: string }[] = [];
  for (const entry of tree.tree) {
    const m = entry.path.match(indexPattern);
    if (m) {
      entries.push({ category: m[1], slug: m[2] });
    }
  }

  // Fetch index.mdx for each component to get name + description
  const components: ComponentInfo[] = await Promise.all(
    entries.map(async ({ category, slug }) => {
      const url = `${RAW_BASE}/${CONTENT_BASE}/${category}/${slug}/index.mdx`;
      const raw = await fetchRaw(url);
      if (!raw) {
        return { slug, name: slug, description: "", category };
      }
      const { component, description } = parseFrontmatter(raw);
      return {
        slug,
        name: component || slug,
        description,
        category,
      };
    }),
  );

  const bySlug = new Map<string, ComponentInfo>();
  for (const c of components) {
    bySlug.set(c.slug, c);
  }

  const registry: ComponentRegistry = { components, bySlug };
  cacheSet("registry", registry, TTL.REGISTRY);
  return registry;
}

export async function resolveCategory(
  component: string,
  category?: string,
): Promise<{ category: string; slug: string } | null> {
  if (category) {
    return { category, slug: component };
  }
  const registry = await getRegistry();
  const info = registry.bySlug.get(component);
  if (info) {
    return { category: info.category, slug: info.slug };
  }
  return null;
}

export function suggestComponent(input: string, registry: ComponentRegistry): string[] {
  const lower = input.toLowerCase();
  return registry.components
    .filter(
      (c) =>
        c.slug.includes(lower) ||
        c.name.toLowerCase().includes(lower),
    )
    .slice(0, 5)
    .map((c) => c.slug);
}

export async function fetchMdx(
  category: string,
  component: string,
  tab: "overview" | "guidelines" | "develop",
): Promise<string | null> {
  const cacheKey = `mdx:${category}/${component}/${tab}`;
  const cached = cacheGet<string>(cacheKey);
  if (cached) return cached;

  const url = `${RAW_BASE}/${CONTENT_BASE}/${category}/${component}/${tab}.mdx`;
  const content = await fetchRaw(url);
  if (content) {
    cacheSet(cacheKey, content, TTL.MDX);
  }
  return content;
}

export async function fetchExample(
  category: string,
  component: string,
  name: string = "default",
): Promise<string | null> {
  const cacheKey = `example:${category}/${component}/${name}`;
  const cached = cacheGet<string>(cacheKey);
  if (cached) return cached;

  const url = `${RAW_BASE}/${CONTENT_BASE}/${category}/${component}/examples/${name}.tsx`;
  const content = await fetchRaw(url);
  if (content) {
    cacheSet(cacheKey, content, TTL.EXAMPLE);
  }
  return content;
}

export async function listComponents(
  category?: string,
): Promise<ComponentInfo[]> {
  const registry = await getRegistry();
  if (category) {
    return registry.components.filter((c) => c.category === category);
  }
  return registry.components;
}
