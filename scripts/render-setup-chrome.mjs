import { chromium } from "playwright";

const CDP_PORTS = [9222, 9223, 9333];
const REPO = "leaflock-sales";

async function connect() {
  for (const port of CDP_PORTS) {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    } catch {}
  }
  return null;
}

async function main() {
  const browser = await connect();
  if (!browser) {
    console.log("No Chrome debug port — open Render dashboard manually:");
    console.log("  New + -> Blueprint -> connect leaflock-sales repo");
    return;
  }

  const ctx = browser.contexts()[0];
  let page = ctx.pages().find((p) => /render/i.test(p.url()));
  if (!page) {
    page = await ctx.newPage();
    await page.goto("https://dashboard.render.com/", { waitUntil: "domcontentloaded", timeout: 120000 });
  }
  await page.bringToFront();
  await page.waitForTimeout(3000);

  const link = page.getByRole("link", { name: new RegExp(REPO, "i") }).first();
  if (await link.isVisible({ timeout: 5000 }).catch(() => false)) {
    await link.click();
    console.log("Opened leaflock-sales on Render");
  } else {
    await page.goto("https://dashboard.render.com/select-repo?type=blueprint", { waitUntil: "domcontentloaded" });
    const repo = page.getByText(new RegExp(REPO, "i")).first();
    if (await repo.isVisible({ timeout: 8000 }).catch(() => false)) {
      await repo.click();
      const btn = page.getByRole("button", { name: /connect|apply|deploy/i }).first();
      if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) await btn.click();
      console.log("Connecting blueprint...");
    }
  }
}

main().catch((e) => console.error(e.message));