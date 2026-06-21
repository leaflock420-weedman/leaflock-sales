import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DOMAIN = "leaflock.com.au";
const SUBDOMAIN = "sales";
const TARGET = "leaflock420-weedman.github.io";
const DNS_URL = `https://dcc.godaddy.com/control/dnsmanagement?domainName=${DOMAIN}`;
const CDP = process.env.CHROME_CDP || "http://127.0.0.1:9222";

async function tryClick(page, locators) {
  for (const locator of locators) {
    try {
      const el = typeof locator === "string" ? page.locator(locator).first() : locator;
      if (await el.isVisible({ timeout: 2500 })) {
        await el.click();
        return true;
      }
    } catch {}
  }
  return false;
}

async function tryFill(page, locators, value) {
  for (const locator of locators) {
    try {
      const el = typeof locator === "string" ? page.locator(locator).first() : locator;
      if (await el.isVisible({ timeout: 2500 })) {
        await el.fill(value);
        return true;
      }
    } catch {}
  }
  return false;
}

async function main() {
  console.log(`Connecting to Chrome at ${CDP}...`);
  const browser = await chromium.connectOverCDP(CDP);
  const contexts = browser.contexts();
  let page = null;
  for (const ctx of contexts) {
    for (const p of ctx.pages()) {
      if (/godaddy|dns/i.test(p.url())) { page = p; break; }
    }
    if (page) break;
  }
  if (!page) {
    const ctx = contexts[0] || (await browser.newContext());
    page = await ctx.newPage();
  }
  await page.bringToFront();
  await page.goto(DNS_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(6000);

  const existing = page.getByText(new RegExp(`${SUBDOMAIN}.*github`, "i"));
  if (await existing.isVisible({ timeout: 4000 }).catch(() => false)) {
    console.log(`CNAME already exists: ${SUBDOMAIN} -> ${TARGET}`);
    return;
  }

  await tryClick(page, [
    page.getByRole("button", { name: /add.*record/i }),
    page.getByRole("button", { name: /^add$/i }),
    page.getByRole("button", { name: /add/i }),
    "button:has-text('Add')",
    "text=Add New Record",
  ]);

  await page.waitForTimeout(2000);

  await tryClick(page, [
    page.getByLabel(/type/i),
    "select",
    "[data-testid*='type']",
  ]);

  await tryClick(page, [
    page.getByRole("option", { name: /^cname$/i }),
    page.getByText(/^CNAME$/i),
    "text=CNAME",
  ]);

  await tryFill(page, [
    page.getByLabel(/^name$/i),
    page.getByPlaceholder(/name/i),
    "input[name='name']",
    "input[aria-label*='Name']",
  ], SUBDOMAIN);

  await tryFill(page, [
    page.getByLabel(/value|points to|host/i),
    page.getByPlaceholder(/value|points to/i),
    "input[name='data']",
    "input[name='value']",
    "input[aria-label*='Value']",
    "input[aria-label*='Points to']",
  ], TARGET);

  const saved = await tryClick(page, [
    page.getByRole("button", { name: /save/i }),
    page.getByRole("button", { name: /add record/i }),
    "button:has-text('Save')",
    "button:has-text('Add Record')",
  ]);

  console.log(saved ? "DNS record saved!" : "Could not auto-save — finish manually in the browser window.");
  console.log(`Record: CNAME  ${SUBDOMAIN}  ->  ${TARGET}`);
  await page.waitForTimeout(saved ? 5000 : 3000);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});