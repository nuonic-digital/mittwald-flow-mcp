import { chromium, type Browser, type Page } from "playwright";
import { cacheGet, cacheSet, TTL } from "./cache.js";
import type { DevelopData, PropertiesSection, PropertyInfo } from "../types.js";

const SITE_BASE = "https://mittwald.github.io/flow";

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: true });
  }
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

async function extractTable(page: Page, tableContainer: string): Promise<PropertyInfo[]> {
  return page.evaluate((selector) => {
    const container = document.querySelector(selector);
    if (!container) return [];
    const table = container.querySelector("table");
    if (!table) return [];

    const rows = table.querySelectorAll("tbody tr");
    return Array.from(rows).map((row) => {
      const cells = row.querySelectorAll("td");
      const nameEl = cells[0]?.querySelector("code");
      return {
        name: nameEl?.textContent?.trim() ?? cells[0]?.textContent?.trim() ?? "",
        type: cells[1]?.textContent?.trim() ?? "",
        default: cells[2]?.textContent?.trim() ?? "",
        required: false,
        description: cells[3]?.textContent?.trim() ?? "",
      };
    });
  }, tableContainer);
}

export async function scrapeDevelop(
  category: string,
  component: string,
): Promise<DevelopData> {
  const cacheKey = `develop:${category}/${component}`;
  const cached = cacheGet<DevelopData>(cacheKey);
  if (cached) return cached;

  const b = await getBrowser();
  const context = await b.newContext();

  // Block images, fonts, and analytics for speed
  await context.route(
    /\.(png|jpg|jpeg|gif|svg|webp|woff2?|ttf|eot)$/,
    (route) => route.abort(),
  );

  const page = await context.newPage();

  try {
    const url = `${SITE_BASE}/04-components/${category}/${component}/develop`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });

    // Wait for the main content area to have a table
    await page.waitForSelector("[class*='mainContent'] .flow--table--table-container", {
      timeout: 15_000,
    });

    const sections: PropertiesSection[] = [];

    // Extract main Properties table
    const mainProps = await extractTable(
      page,
      "[class*='mainContent'] > .flow--table--table-container",
    );
    if (mainProps.length > 0) {
      sections.push({ heading: "Properties", properties: mainProps });
    }

    // Expand and extract accordion sections (Events, Accessibility)
    const accordions = await page.$$("[class*='mainContent'] > .flow--accordion");

    for (const accordion of accordions) {
      const heading = await accordion.evaluate((el) => {
        return el.querySelector(".flow--heading--heading-text")?.textContent?.trim() ?? "";
      });

      const isExpanded = await accordion.evaluate((el) =>
        el.classList.contains("flow--accordion--expanded"),
      );

      if (!isExpanded) {
        const button = await accordion.$(".flow--accordion--header-button");
        if (button) {
          await button.click();
          // Wait for the content to render
          await accordion.waitForSelector(".flow--accordion--content-inner table", {
            timeout: 5_000,
          }).catch(() => {});
        }
      }

      const props = await accordion.evaluate((el) => {
        const table = el.querySelector(".flow--accordion--content-inner table");
        if (!table) return [];
        const rows = table.querySelectorAll("tbody tr");
        return Array.from(rows).map((row) => {
          const cells = row.querySelectorAll("td");
          const nameEl = cells[0]?.querySelector("code");
          return {
            name: nameEl?.textContent?.trim() ?? cells[0]?.textContent?.trim() ?? "",
            type: cells[1]?.textContent?.trim() ?? "",
            default: cells[2]?.textContent?.trim() ?? "",
            required: false,
            description: cells[3]?.textContent?.trim() ?? "",
          };
        });
      });

      if (props.length > 0) {
        sections.push({ heading: heading || "Other", properties: props });
      }
    }

    const data: DevelopData = { sections };
    cacheSet(cacheKey, data, TTL.DEVELOP);
    return data;
  } finally {
    await context.close();
  }
}

export function formatDevelopData(data: DevelopData): string {
  if (data.sections.length === 0) {
    return "No property data found for this component.";
  }

  const parts: string[] = [];

  for (const section of data.sections) {
    parts.push(`## ${section.heading}\n`);
    parts.push("| Property | Type | Default | Description |");
    parts.push("|----------|------|---------|-------------|");

    for (const prop of section.properties) {
      const escapedType = prop.type.replace(/\|/g, "\\|");
      const escapedDesc = prop.description.replace(/\|/g, "\\|");
      const escapedDefault = prop.default.replace(/\|/g, "\\|");
      parts.push(
        `| \`${prop.name}\` | ${escapedType} | ${escapedDefault} | ${escapedDesc} |`,
      );
    }

    parts.push("");
  }

  return parts.join("\n");
}
