import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const profile = path.join(root, ".edge-automation");
const DNS_URL = "https://dcc.godaddy.com/control/dnsmanagement?domainName=leaflock.com.au";

const context = await chromium.launchPersistentContext(profile, {
  channel: "msedge",
  headless: true,
  viewport: { width: 1400, height: 900 },
});

const page = context.pages()[0] || (await context.newPage());
await page.goto(DNS_URL, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(5000);

const text = await page.locator("body").innerText();
console.log("URL:", page.url());
console.log("Has sales:", /sales/i.test(text));
console.log("Has github:", /github/i.test(text));
console.log("--- excerpt ---");
console.log(text.slice(0, 4000));

await page.screenshot({ path: path.join(root, "godaddy-dns.png"), fullPage: true });
console.log("Screenshot saved");
await context.close();