import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const profile = path.join(root, ".chrome-jsonbin-profile");

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function extractKey(page) {
  await page.goto("https://jsonbin.io/app/api-keys", { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(5000);
  const html = await page.content();
  const text = await page.locator("body").innerText();
  const blob = html + text;
  const m =
    blob.match(/\$2[aby]\$[\dA-Za-z./]{10,}/) ||
    blob.match(/Master[^$]{0,40}(\$2[aby]\$[\w./]+)/i);
  return m ? (m[1] || m[0]) : null;
}

async function createBin(masterKey) {
  const body = {
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
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || JSON.stringify(json));
  return json.metadata.id;
}

async function main() {
  if (!fs.existsSync(profile)) {
    console.error("Profile copy missing. Run scripts/copy-chrome-profile.ps1 first.");
    process.exit(1);
  }

  const context = await chromium.launchPersistentContext(profile, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"]
  });

  const page = context.pages()[0] || (await context.newPage());
  let key = await extractKey(page);

  if (!key) {
    console.log("Sign in to JSONBin in this window if needed — waiting 90s...");
    await sleep(90000);
    key = await extractKey(page);
  }

  if (!key) {
    await page.screenshot({ path: path.join(root, "jsonbin-keys.png"), fullPage: true });
    await context.close();
    process.exit(1);
  }

  const binId = await createBin(key);
  const out = path.join(root, "jsonbin-setup.txt");
  fs.writeFileSync(
    out,
    [
      `JSONBIN_BIN_ID=${binId}`,
      `JSONBIN_MASTER_KEY=${key}`,
      `CRM_TEAM_PASSWORD=LeafLockSales2026`,
      `APP_URL=https://sales.leaflock.com.au`,
      ""
    ].join("\n"),
    "utf8"
  );

  console.log("SUCCESS");
  console.log("BIN_ID=" + binId);
  console.log("Saved jsonbin-setup.txt");
  await context.close();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});