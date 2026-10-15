// End-to-end check of reset for every option (D178): the ↺ beside choices, checkboxes, text and
// rail groups in Hinge Box, Letters, Parametric and a generator, Parametric's Style sliders and
// Style section, each one undo step.
// Usage: a production server on SHOTS_BASE (default :3456), then node scripts/e2e/reset.mjs.
import { BASE, withBrowser } from "../shots/lib.mjs";

const failures = [];
const check = (ok, what) => { console.log(`${ok ? "✓" : "✗"} ${what}`); if (!ok) failures.push(what); };

await withBrowser(async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const settle = () => page.waitForTimeout(500);
  const pressed = (group) => page.getByRole("group", { name: group, exact: true }).locator('[aria-pressed="true"]').first().innerText();
  const reset = (label) => page.locator(`button.rst-mark[aria-label="Reset to default"][data-field="${label}"]`);

  /** Pick another option in a button group, then its ↺ brings the default back. */
  const choice = async (where, group, label, other) => {
    const before = await pressed(group);
    check(!(await reset(label).isVisible()), `${where}: no ↺ on ${label} while it is the default`);
    await page.getByRole("group", { name: group, exact: true }).getByRole("button", { name: other, exact: true }).click();
    await settle();
    check(await reset(label).isVisible(), `${where}: ${label} shows a ↺ once changed`);
    await reset(label).click();
    await settle();
    check((await pressed(group)).trim() === before.trim(), `${where}: the ↺ restores ${label} (${before.trim()})`);
  };
  const checkbox = async (where, label) => {
    const box = page.getByRole("checkbox", { name: label, exact: true });
    const before = await box.isChecked();
    await box.click();
    await settle();
    check(await reset(label).isVisible(), `${where}: "${label}" shows a ↺ once changed`);
    await reset(label).click();
    await settle();
    check((await box.isChecked()) === before, `${where}: the ↺ restores "${label}"`);
  };

  // ---- Hinge Box
  await page.goto(`${BASE}/app/editor/local?p=hinge`);
  await page.locator('.fld[data-id="W"] input').waitFor({ timeout: 20000 });
  await choice("Hinge Box", "Cut style", "Cut style", "Single line");
  await checkbox("Hinge Box", "Separate X and Y kerf");
  const lidBefore = await pressed("Lid type");
  await page.getByRole("group", { name: "Lid type", exact: true }).locator('[data-v="open"]').click();
  await settle();
  await reset("Lid").click();
  await settle();
  check((await pressed("Lid type")) === lidBefore, "Hinge Box: the rail's ↺ restores the lid");
  await page.keyboard.press("Control+z");
  await settle();
  check((await pressed("Lid type")).includes("Open"), "Hinge Box: Ctrl+Z takes the reset back");

  // ---- Letters
  await page.goto(`${BASE}/app/editor/local?p=letters`);
  await page.getByRole("group", { name: "Weld", exact: true }).waitFor({ timeout: 20000 });
  await choice("Letters", "Weld", "Weld", "Each letter");
  await choice("Letters", "Direction", "Direction", "Right to left");

  // ---- Parametric: Style sliders and the Style section
  await page.goto(`${BASE}/app/editor/local?p=parametric`);
  const size = page.getByRole("slider", { name: "Size", exact: true });
  await size.waitFor({ timeout: 30000 });
  const sizeOut = page.locator(".style-slider", { has: size }).locator("output");
  const sizeBefore = await sizeOut.innerText();
  await size.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  await settle();
  check((await sizeOut.innerText()) !== sizeBefore, `Parametric: the Size slider moves (${sizeBefore} → ${await sizeOut.innerText()})`);
  await reset("Size").click();
  await settle();
  check((await sizeOut.innerText()) === sizeBefore, "Parametric: the slider's ↺ restores Size");
  const spacing = page.getByRole("slider", { name: "Fin spacing", exact: true });
  if (await spacing.isVisible()) {
    const out = page.locator(".style-slider", { has: spacing }).locator("output");
    const before = await out.innerText();
    await spacing.focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
    await settle();
    await page.getByRole("button", { name: "Reset Style section", exact: true }).click();
    await settle();
    check((await out.innerText()) === before, "Parametric: the Style section's ↺ restores its sliders");
  } else check(false, "Parametric: the Fin spacing slider is shown");

  // ---- A generator (Sign): choice, toggle, text and a rail group
  await page.goto(`${BASE}/app/editor/local?p=sign`);
  const text = page.getByRole("textbox", { name: "Text", exact: true }).first();
  await text.waitFor({ timeout: 20000 });
  await choice("Sign", "Align", "Align", "Left");
  await checkbox("Sign", "Fit to the text");
  const was = await text.inputValue();
  await text.fill("RESET ME");
  await text.press("Tab");
  await settle();
  await reset("Text").click();
  await settle();
  check((await text.inputValue()) === was, `Sign: the text's ↺ restores "${was}"`);
  const shapeBefore = await pressed("Shape");
  await page.getByRole("group", { name: "Shape", exact: true }).locator('[aria-pressed="false"]').first().click();
  await settle();
  await reset("Shape").click();
  await settle();
  check((await pressed("Shape")) === shapeBefore, "Sign: the rail's ↺ restores the board shape");

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
}, { width: 1440, height: 900 });

if (failures.length) { console.log(`\n${failures.length} failed`); process.exit(1); }
console.log("\nAll reset checks passed.");
