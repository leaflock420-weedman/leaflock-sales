import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CDP_PORTS = [9222, 9223, 9333];

async function connectChrome() {
  for (const port of CDP_PORTS) {
    try {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      console.log(`Connected to Chrome on port ${port}`);
      return browser;
    } catch {}
  }
  throw new Error("Chrome debug port not found. Add --remote-debugging-port=9222 to your Chrome shortcut.");
}

async function findOrOpenPage(browser, pattern, url) {
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      if (pattern.test(p.url())) return p;
    }
  }
  const ctx = browser.contexts()[0];
  const page = ctx?.pages()[0] || (await ctx.newPage());
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  return page;
}

async function extractMasterKey(page) {
  await page.bringToFront();
  const urls = [
    "https://jsonbin.io/app",
    "https://jsonbin.io/app/account/summary",
    "https://jsonbin.io/app/api-keys"
  ];
  for (const url of urls) {
    await page.goto(url, { waitUntil: "networkidle", timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const text = await page.locator("body").innerText();
    const html = await page.content();
    const blob = text + html;
    const match =
      blob.match(/\$2[aby]\$[\w./]+/) ||
      blob.match(/X-Master-Key["'\s:>]+([$][\w./$]+)/i) ||
      blob.match(/Master Key[^$]*(\$2[aby]\$[\w./]+)/i);
    if (match) return match[1] || match[0];
  }
  return null;
}

async function createBin(masterKey) {
  const initial = {
    pharmacies: [],
    tasks: [],
    teamConfig: {
      members: ["Lewis", "Brittany", "Sarah", "Ken"],
      memberEmails: { Lewis: "info@leaflock.com.au" }
    },
    meta: { emailLog: {} }
  };

  const res = await fetch("https://api.jsonbin.io/v3/b", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": masterKey,
      "X-Bin-Name": "leaflock-sales-crm",
      "X-Bin-Private": "true"
    },
    body: JSON.stringify(initial)
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.message || JSON.stringify(json));
  return json.metadata?.id;
}

async function main() {
  const browser = await connectChrome();
  const page = await findOrOpenPage(browser, /jsonbin/i, "https://jsonbin.io/app/api-keys");

  console.log("Reading JSONBin API keys from your Chrome tab...");
  let masterKey = await extractMasterKey(page);

  if (!masterKey) {
    await page.screenshot({ path: path.join(root, "jsonbin-keys.png"), fullPage: true });
    console.log("Could not auto-read key. On the API Keys page, copy X-Master-Key then run:");
    console.log("  set JSONBIN_MASTER_KEY=your-key");
    console.log("  node scripts/provision-jsonbin.mjs");
    process.exit(1);
  }

  console.log("Master key found.");
  const binId = await createBin(masterKey);
  console.log("");
  console.log("JSONBin ready:");
  console.log("  BIN_ID=" + binId);
  console.log("  MASTER_KEY=" + masterKey.slice(0, 12) + "...");
  console.log("");
  console.log("Add both to Render -> leaflock-sales -> Environment, then redeploy.");

  const out = path.join(root, "jsonbin-setup.txt");
  const fs = await import("fs");
  fs.writeFileSync(
    out,
    `JSONBIN_BIN_ID=${binId}\nJSONBIN_MASTER_KEY=${masterKey}\nCRM_TEAM_PASSWORD=LeafLockSales2026\n`,
    "utf8"
  );
  console.log("Saved to jsonbin-setup.txt (do not commit this file)");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});