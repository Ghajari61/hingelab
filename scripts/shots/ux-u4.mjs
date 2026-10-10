// UX U4 (D83): Sheet section with sheet presets and "Fit product to" 1 sheet / N sheets / Auto.
import { BASE, shot, withBrowser } from "./lib.mjs";

const check = (ok, msg) => { if (!ok) throw new Error("FAILED: " + msg); console.log("ok", msg); };

async function openSheet(page) {
  const sum = page.locator("details.sec > summary").filter({ hasText: /^Sheet/ });
  await sum.scrollIntoViewIfNeeded();
  if (!(await sum.locator("xpath=..").evaluate((d) => d.open))) await sum.click();
  await page.getByRole("group", { name: "Fit product to" }).waitFor();
}

await withBrowser(async (page) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem("u4")) { localStorage.clear(); sessionStorage.setItem("u4", "1"); } });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/app/editor/local?p=hinge`);
  await page.waitForSelector(".gallery .gcard");
  await openSheet(page);
  const fitGroup = page.getByRole("group", { name: "Fit product to" });
  const result = page.getByRole("status", { name: "Fit result" });
  check(await fitGroup.getByRole("button", { name: "Off" }).getAttribute("aria-pressed") === "true", "Fit is off by default");

  await page.getByRole("combobox", { name: "Sheet preset" }).selectOption("bed-k40");
  await page.waitForTimeout(250);
  check(await page.locator('.fld[data-id="bedW"] input').inputValue() === "300", "K40 bed sets a 300 mm sheet width");
  check(/Larger than the bed/.test(await page.locator(".statusbar, .status").first().textContent()), "the default box is larger than a K40 bed");

  await fitGroup.getByRole("button", { name: "1 sheet" }).click();
  await page.waitForTimeout(300);
  const one = await result.textContent();
  check(/Scaled to \d+(\.\d)? %/.test(one) && /1 sheet/.test(one), `fit to 1 sheet shrinks the box (${one})`);
  check(await page.locator(".sheet-rect").count() === 1, "one sheet is drawn");
  check(await page.locator('.fld[data-id="W"] input').inputValue() === "140", "the design width stays as typed");
  await page.getByRole("button", { name: "Fit sheet" }).click();
  await page.waitForTimeout(300);
  await shot(page, "ux-u4-hinge-fit");

  await fitGroup.getByRole("button", { name: "N sheets" }).click();
  await page.waitForTimeout(200);
  check(await page.getByRole("group", { name: "Number of sheets" }).locator("output").textContent() === "2", "N sheets starts at 2");
  await page.getByRole("button", { name: "More sheets" }).click();
  await page.waitForTimeout(200);
  check(await page.getByRole("group", { name: "Number of sheets" }).locator("output").textContent() === "3", "More sheets raises the count");

  await fitGroup.getByRole("button", { name: "Auto" }).click();
  await page.waitForTimeout(300);
  const auto = await result.textContent();
  check(/Design size on [2-9] sheets/.test(auto), `Auto keeps the size and uses several sheets (${auto})`);
  check(await page.locator(".sheet-rect").count() >= 2, "several sheets are drawn");
  await page.getByRole("button", { name: "Fit sheet" }).click();
  await page.waitForTimeout(300);
  await shot(page, "ux-u4-hinge-auto");

  await page.keyboard.press("Control+z");
  await page.waitForTimeout(200);
  check(await fitGroup.getByRole("button", { name: "N sheets" }).getAttribute("aria-pressed") === "true", "Ctrl+Z returns to N sheets");
  await fitGroup.getByRole("button", { name: "Off" }).click();
  await page.waitForTimeout(200);
  check(await page.locator(".sheet-rect").count() === 1 && /rows on one sheet/.test(await result.textContent()), "Off returns to the row layout");

  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: /Start page/ }).click();
  await page.getByRole("button", { name: "Letters", exact: true }).click();
  await page.waitForSelector(".gallery .gcard");
  await page.waitForFunction(() => !document.querySelector(".canvas-error"), null, { timeout: 30000 });
  await openSheet(page);
  await page.getByRole("combobox", { name: "Sheet preset" }).selectOption("bed-k40");
  await page.getByRole("group", { name: "Fit product to" }).getByRole("button", { name: "1 sheet" }).click();
  await page.waitForFunction(() => /Scaled to|Full size/.test(document.querySelector(".fit-result")?.textContent ?? ""), null, { timeout: 30000 });
  const lt = await page.getByRole("status", { name: "Fit result" }).textContent();
  check(/1 sheet/.test(lt), `Letters fit to one K40 bed (${lt})`);
  await page.getByRole("button", { name: "Fit sheet" }).click();
  await page.waitForTimeout(300);
  await shot(page, "ux-u4-letters-fit");
});
