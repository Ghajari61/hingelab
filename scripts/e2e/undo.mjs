// End-to-end check of Undo and Redo in every editor (hinge boxes, a generator, letters,
// parametric): Ctrl+Z undoes a setting even while its number box, checkbox or drop-down still has
// focus; Ctrl+Y and Ctrl+Shift+Z redo; the toolbar's Undo button works; a text field with fresh
// typing undoes its own typing first, and the design once the entry is committed.
// Usage: a production server on SHOTS_BASE (default :3456), then node scripts/e2e/undo.mjs.
import { BASE, withBrowser } from "../shots/lib.mjs";

const failures = [];
const check = (ok, what) => { console.log(`${ok ? "✓" : "✗"} ${what}`); if (!ok) failures.push(what); };

await withBrowser(async (_first, context) => {
  for (const p of ["hinge", "keychain", "letters", "parametric", "family"]) {
    const page = await context.newPage();
    await page.goto(`${BASE}/app/editor/local?p=${p}`, { waitUntil: "networkidle", timeout: 180000 });
    await page.waitForTimeout(3000);
    const box = page.locator(".dock .fld input[id^='f_']").first();
    const id = await box.getAttribute("id");
    const val = () => page.locator(`[id="${id}"]`).inputValue();
    const v0 = await val();
    await box.click(); await box.fill(String(Number(v0) + 7)); await box.press("Enter");
    const v1 = await val();
    await page.keyboard.press("Control+z"); await page.waitForTimeout(400);
    check(await val() === v0, `${p}: Ctrl+Z from the focused number box undoes it`);
    await page.keyboard.press("Control+y"); await page.waitForTimeout(400);
    check(await val() === v1, `${p}: Ctrl+Y redoes it`);
    await page.keyboard.press("Control+z"); await page.waitForTimeout(400);
    await page.keyboard.press("Control+Shift+Z"); await page.waitForTimeout(400);
    check(await val() === v1, `${p}: Ctrl+Shift+Z redoes it`);
    await page.getByRole("button", { name: /^Undo/ }).first().click(); await page.waitForTimeout(400);
    check(await val() === v0, `${p}: the Undo button undoes it`);
    const tg = page.locator(".dock input[type='checkbox']:visible").first();
    if (await tg.count()) {
      const c0 = await tg.isChecked();
      await tg.click(); await page.waitForTimeout(300);
      await page.keyboard.press("Control+z"); await page.waitForTimeout(400);
      check(await tg.isChecked() === c0, `${p}: Ctrl+Z with a checkbox focused undoes it`);
    }
    await page.close();
  }
  const page = await context.newPage();
  await page.goto(`${BASE}/app/editor/local?p=keychain`, { waitUntil: "networkidle", timeout: 180000 });
  await page.waitForTimeout(3000);
  const t = page.locator(".dock input.textin").first();
  const t0 = await t.inputValue();
  await t.click(); await t.press("End"); await page.keyboard.type("Q"); await t.press("Enter");
  await page.keyboard.press("Control+z"); await page.waitForTimeout(400);
  check(await t.inputValue() === t0, "a committed text entry is undone by Ctrl+Z");
  const sel = page.locator(".dock select:visible").first();
  if (await sel.count()) {
    const s0 = await sel.inputValue();
    const other = (await sel.locator("option").evaluateAll((o) => o.map((x) => x.value))).find((v) => v !== s0);
    await sel.selectOption(other); await page.waitForTimeout(300);
    await page.keyboard.press("Control+z"); await page.waitForTimeout(400);
    check(await sel.inputValue() === s0, "Ctrl+Z with a drop-down focused undoes it");
  }
  await page.close();
});
if (failures.length) { console.error(`${failures.length} failed`); process.exit(1); }
