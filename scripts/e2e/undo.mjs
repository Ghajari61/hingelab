// End-to-end check of undo and redo everywhere (D177): Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z in Hinge Box,
// Letters, Parametric and a generator; Undo and Redo in a generator's phone view; and the AI
// designer's edit history (Undo edit, Redo edit, Ctrl+Z and Ctrl+Y), with the AI answers stubbed.
// Usage: a production server on SHOTS_BASE (default :3456), then node scripts/e2e/undo.mjs.
import { BASE, withBrowser } from "../shots/lib.mjs";

const failures = [];
const check = (ok, what) => { console.log(`${ok ? "✓" : "✗"} ${what}`); if (!ok) failures.push(what); };

await withBrowser(async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const blur = () => page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
  const roundTrip = async (name, field, value) => {
    const before = await field.inputValue();
    await field.fill(value);
    await field.press("Tab");
    await blur();
    await page.waitForTimeout(700);
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(500);
    const undone = await field.inputValue();
    await page.keyboard.press("Control+y");
    await page.waitForTimeout(500);
    const redone = await field.inputValue();
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(400);
    await page.keyboard.press("Control+Shift+z");
    await page.waitForTimeout(500);
    const again = await field.inputValue();
    check(undone === before && redone === value && again === value, `${name}: Ctrl+Z undoes, Ctrl+Y and Ctrl+Shift+Z redo (${before} → ${value}: ${undone}, ${redone}, ${again})`);
  };

  await page.goto(`${BASE}/app/editor/local?p=hinge`);
  await page.locator('.fld[data-id="W"] input').waitFor({ timeout: 20000 });
  await roundTrip("Hinge Box", page.locator('.fld[data-id="W"] input'), "123");

  await page.goto(`${BASE}/app/editor/local?p=letters`);
  await page.getByRole("textbox", { name: "Text", exact: true }).first().waitFor({ timeout: 20000 });
  await roundTrip("Letters", page.getByRole("textbox", { name: "Text", exact: true }).first(), "UNDO");

  await page.goto(`${BASE}/app/editor/local?p=parametric`);
  await page.locator('.fld[data-id="uniformScale"] input').waitFor({ timeout: 30000 });
  await roundTrip("Parametric", page.locator('.fld[data-id="uniformScale"] input'), "0.5");

  await page.goto(`${BASE}/app/editor/local?p=sign`);
  await page.getByRole("textbox", { name: "Text", exact: true }).first().waitFor({ timeout: 20000 });
  await roundTrip("Sign", page.getByRole("textbox", { name: "Text", exact: true }).first(), "REDO");

  // ---- The phone view has Undo and Redo.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => sessionStorage.removeItem("hingelab-full-editor"));
  await page.goto(`${BASE}/app/editor/local?p=sign`);
  await page.getByRole("navigation", { name: "Steps" }).waitFor({ timeout: 20000 });
  const history = page.getByRole("toolbar", { name: "History" });
  check(await history.isVisible(), "the phone view shows Undo and Redo");
  await page.locator(".pf-card.keep").click();
  const text = page.getByRole("textbox", { name: "Text", exact: true });
  const before = await text.inputValue();
  await text.fill("PHONE UNDO");
  await text.blur();
  await page.waitForTimeout(700);
  await history.getByRole("button", { name: /Undo/ }).click();
  await page.waitForTimeout(500);
  check(await text.inputValue() === before, `Undo in the phone view takes the text back (${await text.inputValue()})`);
  await history.getByRole("button", { name: /Redo/ }).click();
  await page.waitForTimeout(500);
  check(await text.inputValue() === "PHONE UNDO", "and Redo puts it back");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => sessionStorage.setItem("hingelab-full-editor", "1"));

  // ---- The AI designer keeps every edit: Undo edit and Redo edit, and the shortcuts.
  let n = 0;
  await page.route("**/api/ai/design", async (route) => {
    n++;
    const body = JSON.parse(route.request().postData() ?? "{}");
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ product: "hinge", productName: "Hinge Box", match: "exact", name: `Design ${n}`, summary: body.prompt ?? "", notes: [], params: { W: 60 + n }, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="0 0 10 10"><rect width="${n}" height="5" fill="none" stroke="red"/></svg>` }),
    });
  });
  await page.goto(`${BASE}/app/ai`);
  const prompt = page.locator("#ai-prompt");
  if (await prompt.waitFor({ timeout: 15000 }).then(() => true, () => false)) {
    await prompt.fill("a box");
    await page.getByRole("button", { name: "Design it" }).click();
    const title = page.locator(".ai-result h2");
    await title.waitFor({ timeout: 15000 });
    for (const [ask, want] of [["wider", "Design 2"], ["taller", "Design 3"]]) {
      await page.locator("#ai-edit").fill(ask);
      await page.getByRole("button", { name: "Apply" }).click();
      await page.waitForFunction((w) => document.querySelector(".ai-result h2")?.textContent === w, want, { timeout: 15000 });
    }
    await page.getByRole("button", { name: "Undo edit" }).click();
    check(await title.innerText() === "Design 2", "AI designer: Undo edit steps back");
    await blur();
    await page.keyboard.press("Control+z");
    check(await title.innerText() === "Design 1", "AI designer: Ctrl+Z steps back again");
    check(await page.getByRole("button", { name: "Undo edit" }).isDisabled(), "AI designer: nothing left to undo");
    await page.keyboard.press("Control+y");
    check(await title.innerText() === "Design 2", "AI designer: Ctrl+Y redoes");
    await page.getByRole("button", { name: "Redo edit" }).click();
    check(await title.innerText() === "Design 3", "AI designer: Redo edit redoes");
    await page.locator("#ai-edit").fill("shorter");
    await page.getByRole("button", { name: "Apply" }).click();
    await page.waitForFunction(() => document.querySelector(".ai-result h2")?.textContent === "Design 4", null, { timeout: 15000 });
    check(await page.getByRole("button", { name: "Redo edit" }).isDisabled(), "AI designer: a new edit clears what could be redone");
  } else if (page.url().includes("/login")) {
    console.log("– AI designer skipped: it needs a signed-in user");
  } else {
    check(false, "the AI designer page opens");
  }

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
}, { width: 1440, height: 900 });

if (failures.length) { console.log(`\n${failures.length} failed`); process.exit(1); }
console.log("\nAll undo checks passed.");
