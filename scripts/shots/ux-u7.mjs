// UX U7 (D86): checks list every issue with its fixes; Auto-fix all applies the safe ones.
import { BASE, shot, withBrowser } from "./lib.mjs";

const check = (ok, msg) => { if (!ok) throw new Error("FAILED: " + msg); console.log("ok", msg); };
const codes = (page) => page.locator(".checks li.issue").evaluateAll((els) => els.map((e) => e.dataset.code));
const showChecks = (page) => page.locator(".checks").evaluate((el) => el.scrollIntoView({ block: "center" }));

await withBrowser(async (page) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem("u7")) { localStorage.clear(); sessionStorage.setItem("u7", "1"); } });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/app/editor/local?p=hinge`);
  await page.waitForSelector(".gallery .gcard");

  // A K40 bed is smaller than the default box.
  const sum = page.locator("details.sec > summary").filter({ hasText: /^Sheet/ });
  await sum.scrollIntoViewIfNeeded();
  if (!(await sum.locator("xpath=..").evaluate((d) => d.open))) await sum.click();
  await page.getByRole("combobox", { name: "Sheet preset" }).selectOption("bed-k40");
  await page.waitForSelector('.checks li.issue[data-code="TOO_BIG"]');
  check((await codes(page)).includes("TOO_BIG"), "a box larger than the bed is listed");
  const fixes = await page.locator('.checks li.issue[data-code="TOO_BIG"] .issue-fixes button').allTextContents();
  check(fixes.length > 0, `it offers fixes (${fixes.join(", ")})`);
  await showChecks(page);
  await shot(page, "ux-u7-hinge-issues");

  await page.getByRole("button", { name: "Auto-fix all" }).click();
  await page.waitForTimeout(400);
  check(!(await codes(page)).includes("TOO_BIG"), "Auto-fix all makes it fit");
  check(!/Larger than the bed/.test(await page.locator(".statusbar, .status").first().textContent()), "the status bar no longer says it is too big");
  await page.keyboard.press("Control+z");
  await page.waitForSelector('.checks li.issue[data-code="TOO_BIG"]');
  check(true, "Ctrl+Z brings the issue back");

  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: /Start page/ }).click();
  await page.getByRole("button", { name: "Letters", exact: true }).click();
  await page.waitForSelector(".gallery .gcard");
  await page.waitForFunction(() => !document.querySelector(".canvas-error"), null, { timeout: 30000 });
  await page.getByRole("textbox", { name: "Text" }).fill("Sam سام");
  await page.getByRole("textbox", { name: "Text" }).blur();
  await page.waitForSelector('.checks li.issue[data-code="MISSING_GLYPHS"]', { timeout: 30000 });
  const fontFix = page.locator('.checks li.issue[data-code="MISSING_GLYPHS"] .issue-fixes button').first();
  const label = await fontFix.textContent();
  check(/^Use /.test(label), `missing letters offer a font (${label})`);
  await showChecks(page);
  await shot(page, "ux-u7-letters-font");
  await fontFix.click();
  await page.waitForFunction(() => !document.querySelector('.checks li.issue[data-code="MISSING_GLYPHS"]'), null, { timeout: 30000 });
  check(true, "the font fix covers every letter");
});
