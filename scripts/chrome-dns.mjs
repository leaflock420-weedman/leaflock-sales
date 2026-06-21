import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SUBDOMAIN = "sales";
const TARGET = "leaflock-sales.onrender.com";
const DNS_URL = "https://dcc.godaddy.com/control/dnsmanagement?domainName=leaflock.com.au";

async function connectCdp() {
  for (const port of [9222, 9223, 9333]) {
    try {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      console.log(`Connected to your open Chrome (port ${port})`);
      return browser;
    } catch {}
  }
  return null;
}

async function clickFirst(page, makers) {
  for (const make of makers) {
    try {
      const el = make(page).first();
      if (await el.isVisible({ timeout: 3000 })) {
        await el.click();
        return true;
      }
    } catch {}
  }
  return false;
}

async function fillFirst(page, makers, value) {
  for (const make of makers) {
    try {
      const el = make(page).first();
      if (await el.isVisible({ timeout: 3000 })) {
        await el.fill(value);
        return true;
      }
    } catch {}
  }
  return false;
}

async function addRecord(page) {
  await page.bringToFront();
  if (!/godaddy|dns/i.test(page.url())) {
    await page.goto(DNS_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
  }
  await page.waitForTimeout(5000);

  const html = await page.content();
  if (new RegExp(`${SUBDOMAIN}.*${TARGET.replace(/\./g, "\\.")}`, "i").test(html)) {
    console.log("CNAME already exists");
    return true;
  }

  if (/sign\\s*in|sign in with google/i.test(html)) {
    console.log("Sign in to GoDaddy in your Chrome window — waiting up to 2 minutes...");
    const start = Date.now();
    while (Date.now() - start < 120000) {
      await page.waitForTimeout(4000);
      const body = await page.locator("body").innerText();
      if (/dns records|add new record/i.test(body)) break;
    }
  }

  await clickFirst(page, [
    (p) => p.getByRole("button", { name: /add.*record/i }),
    (p) => p.getByRole("button", { name: /^add$/i }),
    (p) => p.locator("button:has-text('Add')"),
    (p) => p.getByText("Add New Record"),
  ]);
  await page.waitForTimeout(1500);

  await clickFirst(page, [(p) => p.getByLabel(/type/i), (p) => p.locator("select").first()]);
  await clickFirst(page, [
    (p) => p.getByRole("option", { name: /^cname$/i }),
    (p) => p.getByText(/^CNAME$/i),
  ]);

  await fillFirst(page, [
    (p) => p.getByLabel(/^name$/i),
    (p) => p.getByPlaceholder(/name/i),
    (p) => p.locator("input[name='name']"),
    (p) => p.locator("input[aria-label*='Name']"),
  ], SUBDOMAIN);

  await fillFirst(page, [
    (p) => p.getByLabel(/value|points to|host/i),
    (p) => p.getByPlaceholder(/value|points to/i),
    (p) => p.locator("input[name='data']"),
    (p) => p.locator("input[name='value']"),
    (p) => p.locator("input[aria-label*='Value']"),
    (p) => p.locator("input[aria-label*='Points to']"),
  ], TARGET);

  const saved = await clickFirst(page, [
    (p) => p.getByRole("button", { name: /save/i }),
    (p) => p.getByRole("button", { name: /add record/i }),
    (p) => p.locator("button:has-text('Save')"),
    (p) => p.locator("button:has-text('Add Record')"),
  ]);

  await page.screenshot({ path: path.join(root, "godaddy-dns.png"), fullPage: true });
  console.log(saved ? "DNS record saved in Chrome" : "Check Chrome — click Save if needed");
  console.log(`CNAME  ${SUBDOMAIN}  ->  ${TARGET}`);
  return saved;
}

async function main() {
  const browser = await connectCdp();
  if (!browser) {
    console.log("Opened GoDaddy DNS in your existing Chrome (new tab, browser not closed).");
    console.log("Add this record manually:");
    console.log(`  Type: CNAME   Name: ${SUBDOMAIN}   Value: ${TARGET}`);
    console.log("");
    console.log("For auto-fill next time, add to your Chrome shortcut Target:");
    console.log("  --remote-debugging-port=9222");
    process.exit(0);
  }

  const context = browser.contexts()[0];
  let page = context.pages().find((p) => /godaddy|dns/i.test(p.url()));
  if (!page) page = context.pages()[0] || (await context.newPage());
  await addRecord(page);
  console.log("Done — https://sales.leaflock.com.au/ should work in a few minutes.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});