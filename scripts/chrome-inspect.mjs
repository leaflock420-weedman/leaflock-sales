import { chromium } from "playwright";

const CDP = process.env.CHROME_CDP || "http://127.0.0.1:9222";
const browser = await chromium.connectOverCDP(CDP);
const pages = browser.contexts().flatMap((c) => c.pages());
console.log("Pages:");
for (const p of pages) {
  const title = await p.title().catch(() => "");
  console.log(` - ${p.url()} | ${title}`);
}
if (pages[0]) {
  const text = await pages[0].locator("body").innerText();
  console.log("\nBody excerpt:\n", text.slice(0, 2000));
}