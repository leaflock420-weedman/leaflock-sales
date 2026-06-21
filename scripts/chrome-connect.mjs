import { chromium } from "playwright";
import http from "http";

const CDP = process.env.CHROME_CDP || "http://127.0.0.1:9222";

function cdpAvailable() {
  return new Promise((resolve) => {
    const req = http.get(`${CDP}/json/version`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

export async function connectChrome() {
  if (!(await cdpAvailable())) {
    console.error("Your Chrome is open but remote debugging is not enabled yet.");
    console.error("One-time setup (does not close tabs if Chrome is already running):");
    console.error("  1. Close Chrome completely yourself when convenient");
    console.error("  2. Start it using the shortcut: LeafLock Chrome (Debug).lnk on your Desktop");
    console.error("  3. Open GoDaddy DNS, then run DEPLOY-SALES-DNS.bat");
    console.error("");
    console.error("Or add this flag to your Chrome shortcut Target:");
    console.error("  --remote-debugging-port=9222");
    throw new Error("Chrome debug port 9222 not available");
  }
  return chromium.connectOverCDP(CDP);
}

export async function listChromeTabs(browser) {
  const tabs = browser.contexts().flatMap((c) => c.pages());
  console.log(`Found ${tabs.length} open tab(s):`);
  for (const p of tabs) {
    const title = await p.title().catch(() => "");
    console.log(`  - ${p.url()} (${title})`);
  }
}

export async function findPage(browser, pattern = /godaddy|dns|render/i) {
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      if (pattern.test(p.url())) return p;
    }
  }
  const ctx = browser.contexts()[0];
  return ctx?.pages()[0] || null;
}