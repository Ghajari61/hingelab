// Letters L2 (stencil): "ABOPQR8" and a Persian word as stencils in the guest editor.
import { BASE, shot, withBrowser } from "./lib.mjs";

const assert = (cond, msg) => { if (!cond) throw new Error("FAILED: " + msg); console.log("ok -", msg); };

await withBrowser(async (page) => {
  await page.goto(`${BASE}/app/editor/local`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Letters", exact: true }).click();
  await page.waitForSelector('[aria-label="Letters mode"]');
  await page.locator('[aria-label="Letters mode"] button[data-v="stencil"]').click();
  await page.fill('textarea[aria-label="Text"]', "ABOPQR8");
  await page.locator('textarea[aria-label="Text"]').blur();
  await page.waitForFunction(() => document.querySelector(".statusbar")?.textContent?.includes("Parts 1"), null, { timeout: 30000 });
  await page.waitForTimeout(800);
  assert(true, "stencil mode makes one part (the sheet)");
  await page.getByRole("button", { name: "Fit", exact: true }).click().catch(() => {});
  await page.waitForTimeout(400);
  await shot(page, "letters-2-stencil-abopqr8");

  await page.getByRole("button", { name: "Two" }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Fit", exact: true }).click().catch(() => {});
  await page.waitForTimeout(400);
  await shot(page, "letters-2-stencil-two-bridges");

  await page.fill('textarea[aria-label="Text"]', "هشت ۸ ف");
  await page.locator('textarea[aria-label="Text"]').blur();
  await page.locator('.fontpick > button[aria-haspopup="listbox"]').click();
  await page.locator('[aria-label="Fonts"] [role="option"]', { hasText: "Vazirmatn" }).first().click();
  await page.waitForFunction(() => document.querySelector(".statusbar")?.textContent?.includes("Parts 1"), null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  assert(true, "Persian stencil makes one sheet");
  await page.getByRole("button", { name: "Fit", exact: true }).click().catch(() => {});
  await page.waitForTimeout(400);
  await shot(page, "letters-2-stencil-persian");

  await page.goto(`${BASE}/app/letters-debug`);
  await page.waitForSelector('select[aria-label="Mode"]');
  await page.selectOption('select[aria-label="Mode"]', "stencil");
  await page.fill('.dbg-bar input[aria-label="Text"]', "ABOPQR8");
  await page.waitForTimeout(2500);
  await shot(page, "letters-2-stencil-debug");
});
