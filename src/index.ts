#!/usr/bin/env bun

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  listComponents,
  resolveCategory,
  suggestComponent,
  getRegistry,
  fetchMdx,
  fetchExample,
} from "./services/github.js";
import { scrapeDevelop, formatDevelopData, closeBrowser } from "./services/scraper.js";
import { cleanMdx } from "./services/mdx-cleaner.js";
import type { ComponentInfo } from "./types.js";

const server = new McpServer({
  name: "mittwald-flow-docs",
  version: "1.0.0",
});

// --- Tool: list_components ---

server.tool(
  "list_components",
  "List all components in the mittwald flow component library, optionally filtered by category.",
  { category: z.string().optional().describe("Filter by category slug (e.g. 'actions', 'form-controls')") },
  async ({ category }) => {
    try {
      const components = await listComponents(category);

      if (components.length === 0) {
        const registry = await getRegistry();
        const categories = [...new Set(registry.components.map((c) => c.category))].sort();
        return {
          content: [
            {
              type: "text" as const,
              text: category
                ? `No components found in category "${category}". Available categories: ${categories.join(", ")}`
                : "No components found.",
            },
          ],
        };
      }

      // Group by category
      const grouped = new Map<string, ComponentInfo[]>();
      for (const c of components) {
        const list = grouped.get(c.category) ?? [];
        list.push(c);
        grouped.set(c.category, list);
      }

      const lines: string[] = [];
      for (const [cat, comps] of [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        lines.push(`## ${cat}\n`);
        for (const c of comps.sort((a, b) => a.slug.localeCompare(b.slug))) {
          lines.push(`- **${c.name}** (\`${c.slug}\`): ${c.description}`);
        }
        lines.push("");
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing components: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// --- Tool: get_component_overview ---

server.tool(
  "get_component_overview",
  "Get the overview documentation for a mittwald flow component, including playground examples and usage information.",
  {
    component: z.string().describe("Component slug (e.g. 'button', 'text-field')"),
    category: z.string().optional().describe("Category slug; auto-detected if omitted"),
  },
  async ({ component, category }) => {
    try {
      const resolved = await resolveCategory(component, category);
      if (!resolved) {
        const registry = await getRegistry();
        const suggestions = suggestComponent(component, registry);
        return {
          content: [
            {
              type: "text" as const,
              text: `Component "${component}" not found.${suggestions.length > 0 ? ` Did you mean: ${suggestions.join(", ")}?` : ""}`,
            },
          ],
          isError: true,
        };
      }

      const registry = await getRegistry();
      const info = registry.bySlug.get(resolved.slug);

      const mdx = await fetchMdx(resolved.category, resolved.slug, "overview");
      if (!mdx) {
        return {
          content: [
            { type: "text" as const, text: `No overview found for "${component}".` },
          ],
          isError: true,
        };
      }

      const content = cleanMdx(mdx);

      // Try to fetch default example
      const example = await fetchExample(resolved.category, resolved.slug, "default");

      const parts: string[] = [];
      parts.push(`# ${info?.name ?? component} — Overview\n`);
      if (info?.description) {
        parts.push(`> ${info.description}\n`);
      }
      parts.push(content);
      if (example) {
        parts.push("\n## Default Example\n");
        parts.push("```tsx\n" + example + "\n```");
      }

      return {
        content: [{ type: "text" as const, text: parts.join("\n") }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error fetching overview: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// --- Tool: get_component_develop ---

server.tool(
  "get_component_develop",
  "Get the development documentation for a mittwald flow component, including property tables, events, and accessibility props.",
  {
    component: z.string().describe("Component slug (e.g. 'button', 'text-field')"),
    category: z.string().optional().describe("Category slug; auto-detected if omitted"),
  },
  async ({ component, category }) => {
    try {
      const resolved = await resolveCategory(component, category);
      if (!resolved) {
        const registry = await getRegistry();
        const suggestions = suggestComponent(component, registry);
        return {
          content: [
            {
              type: "text" as const,
              text: `Component "${component}" not found.${suggestions.length > 0 ? ` Did you mean: ${suggestions.join(", ")}?` : ""}`,
            },
          ],
          isError: true,
        };
      }

      const registry = await getRegistry();
      const info = registry.bySlug.get(resolved.slug);

      // Also fetch the develop.mdx for any prose content
      const mdx = await fetchMdx(resolved.category, resolved.slug, "develop");
      const prose = mdx ? cleanMdx(mdx) : "";

      const data = await scrapeDevelop(resolved.category, resolved.slug);
      const tables = formatDevelopData(data);

      const parts: string[] = [];
      parts.push(`# ${info?.name ?? component} — Develop\n`);
      if (prose) {
        parts.push(prose);
        parts.push("");
      }
      parts.push(tables);

      return {
        content: [{ type: "text" as const, text: parts.join("\n") }],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("browserType.launch")) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Browser launch failed. Make sure Playwright Chromium is installed:\n  bunx playwright install chromium\n\nOriginal error: ${msg}`,
            },
          ],
          isError: true,
        };
      }
      if (msg.includes("Timeout")) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Timed out loading property tables for "${component}". The develop page may not have rendered in time.`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: `Error fetching develop info: ${msg}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// --- Tool: get_component_guidelines ---

server.tool(
  "get_component_guidelines",
  "Get the usage guidelines for a mittwald flow component, including best practices, dos and don'ts.",
  {
    component: z.string().describe("Component slug (e.g. 'button', 'text-field')"),
    category: z.string().optional().describe("Category slug; auto-detected if omitted"),
  },
  async ({ component, category }) => {
    try {
      const resolved = await resolveCategory(component, category);
      if (!resolved) {
        const registry = await getRegistry();
        const suggestions = suggestComponent(component, registry);
        return {
          content: [
            {
              type: "text" as const,
              text: `Component "${component}" not found.${suggestions.length > 0 ? ` Did you mean: ${suggestions.join(", ")}?` : ""}`,
            },
          ],
          isError: true,
        };
      }

      const registry = await getRegistry();
      const info = registry.bySlug.get(resolved.slug);

      const mdx = await fetchMdx(resolved.category, resolved.slug, "guidelines");
      if (!mdx) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No guidelines available for "${info?.name ?? component}".`,
            },
          ],
        };
      }

      const content = cleanMdx(mdx);

      const parts: string[] = [];
      parts.push(`# ${info?.name ?? component} — Guidelines\n`);
      if (info?.description) {
        parts.push(`> ${info.description}\n`);
      }
      parts.push(content);

      return {
        content: [{ type: "text" as const, text: parts.join("\n") }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error fetching guidelines: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// --- Graceful shutdown ---

async function shutdown() {
  await closeBrowser();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// --- Start server ---

const transport = new StdioServerTransport();
await server.connect(transport);
