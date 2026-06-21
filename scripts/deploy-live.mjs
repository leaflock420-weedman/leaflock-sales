import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CDP = process.env.CHROME_CDP || "http://127.0.0.1:9222";
const DOMAIN = "leaflock.com.au";
const SUBDOMAIN = "sales";
const TARGET = "leaflock420-weedman.github.io";
const DNS_URL = `https://dcc.godaddy.com/control/dnsmanagement?domainName=${DOMAIN}`;
const RENDER_URL = "https://dashboard.render.com/select-repo?type=blueprint";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function setupDns(page) {
  console.log("Opening GoDaddy DNS...");
  await page.goto(DNS_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(5000);

  const body = await page.locator("body").innerText();
  if (new RegExp(`${SUBDOMAIN}.*github`, "i").test(body)) {
    console.log(`DNS OK: ${SUBDOMAIN} already points at GitHub Pages`);
    return true;
  }

  const add = page.getByRole("button", { name: /add new record/i }).first();
  if (await add.isVisible({ timeout: 8000 }).catch(() => false)) {
    await add.click();
    await sleep(1500);
  }

  const type = page.locator("select").first();
  if (await type.isVisible().catch(() => false)) {
    await type.selectOption("CNAME").catch(() => {});
  }

  const inputs = page.locator("input:visible");
  const count = await inputs.count();
  for (let i = 0; i < count; i++) {
    const el = inputs.nth(i);
    const ph = ((await el.getAttribute("placeholder")) || "").toLowerCase();
    const label = ((await el.getAttribute("aria-label")) || "").toLowerCase();
    if (/^name$|host/i.test(ph + label)) await el.fill(SUBDOMAIN);
    if (/value|points/i.test(ph + label)) await el.fill(TARGET);
  }

  if (count >= 2) {
    await inputs.nth(0).fill(SUBDOMAIN).catch(() => {});
    await inputs.nth(1).fill(TARGET).catch(() => {});
  }

  const save = page.getByRole("button", { name: /^(Save|Add Record)$/i }).first();
  if (await save.isVisible({ timeout: 5000 }).catch(() => false)) {
    await save.click();
    await sleep(4000);
  }

  const after = await page.locator("body").innerText();
  const ok = new RegExp(`${SUBDOMAIN}`, "i").test(after) && /github/i.test(after);
  console.log(ok ? `DNS saved: CNAME ${SUBDOMAIN} -> ${TARGET}` : "DNS needs manual save in browser");
  return ok;
}

async function setupRender(page) {
  console.log("Opening Render blueprint...");
  await page.goto(RENDER_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(4000);

  const repo = page.getByText(/leaflock-sales/i).first();
  if (await repo.isVisible({ timeout: 8000 }).catch(() => false)) {
    await repo.click();
    await sleep(2000);
    const connect = page.getByRole("button", { name: /connect|deploy|apply/i }).first();
    if (await connect.isVisible({ timeout: 5000 }).catch(() => false)) {
      await connect.click();
      console.log("Connected leaflock-sales blueprint on Render");
      return true;
    }
  }

  console.log("Render: connect leaflock-sales repo manually if you prefer Render over GitHub Pages");
  return false;
}

async function getPage(browser) {
  const contexts = browser.contexts();
  for (const ctx of contexts) {
    for (const p of ctx.pages()) {
      if (/godaddy|dns|render/i.test(p.url())) return p;
    }
  }
  const ctx = contexts[0] || (await browser.newContext());
  return ctx.pages()[0] || (await ctx.newPage());
}

async function main() {
  console.log(`Connecting to Chrome at ${CDP}...`);
  const browser = await chromium.connectOverCDP(CDP);
  const page = await getPage(browser);
  const dnsOk = await setupDns(page);
  await setupRender(page);

  console.log("");
  console.log("Live URLs:");
  console.log("  GitHub Pages: https://leaflock420-weedman.github.io/leaflock-sales/");
  console.log("  Subdomain:    https://sales.leaflock.com.au/ (after DNS propagates)");
  console.log(dnsOk ? "DNS step complete." : `Add CNAME manually: ${SUBDOMAIN} -> ${TARGET}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});