// Letters: the Base rim field moves the tab slots in from the edge of the base.
// Usage: node scripts/shots/letters-base-rim.mjs (dev server on BASE).
import { BASE, OUT, withBrowser } from "./lib.mjs";
import path from "node:path";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok" : "FAIL"} ${msg}`); if (!ok) failed++; };

await withBrowser(async (page) => {
  await page.goto(`${BASE}/`);
  await page.evaluate(() => localStorage.clear());
  await page.locator('a.product[href$="p=letters"]').click();
  await page.waitForURL(/p=letters/);
  await page.waitForSelector('[aria-label="Letters mode"]');
  await page.locator('[aria-label="Letters mode"] button[data-v="box"]').click();
  await page.locator('[aria-label="Wall style"] button[data-v="faceted"]').click();
  await page.fill('textarea[aria-label="Text"]', "A");
  await page.locator('textarea[aria-label="Text"]').blur();
  await page.getByRole("tab", { name: /Sheets/ }).click();
  await page.locator("details.sec", { hasText: "Joints & Fit" }).evaluate((d) => { d.open = true; });
  const rim = page.getByLabel("Base rim", { exact: true });
  check(await rim.isVisible(), "Base rim is in Joints & Fit");
  const shot = async (mm) => {
    await rim.fill(String(mm));
    await rim.press("Enter");
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Fit sheet" }).click().catch(() => {});
    await page.waitForTimeout(500);
    const file = path.join(OUT, `letters-base-rim-${mm}.png`);
    await page.locator(".viewport").screenshot({ path: file });
    console.log("saved", file);
  };
  await shot(0);
  await shot(4);
  check(await rim.inputValue() === "4", "Base rim keeps 4 mm");
}, { width: 1440, height: 900 });
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
