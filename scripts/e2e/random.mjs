// End-to-end check of Randomise (D179): Hinge Box "Randomise pattern" keeps the box's size, Letters
// "Randomise style" keeps the words, and a generator's Randomise design keeps locked choices and
// checkboxes; each one undo step.
// Usage: a production server on SHOTS_BASE (default :3456), then node scripts/e2e/random.mjs.
import { BASE, withBrowser } from "../shots/lib.mjs";

const failures = [];
const check = (ok, what) => { console.log(`${ok ? "✓" : "✗"} ${what}`); if (!ok) failures.push(what); };

await withBrowser(async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const settle = () => page.waitForTimeout(500);
  const pressed = (group) => page.getByRole("group", { name: group, exact: true }).locator('[aria-pressed="true"]').first().innerText().catch(() => "");
  const toasts = () => page.locator(".toast, [role=status]").allInnerTexts();

  // ---- Hinge Box: a new pattern and lattice; the size stays
  await page.goto(`${BASE}/app/editor/local?p=hinge`);
  const w = page.locator('.fld[data-id="W"] input');
  await w.waitFor({ timeout: 20000 });
  const width = await w.inputValue();
  const look = async () => `${await pressed("Hinge pattern")}|${await pressed("Hinge style")}`;
  const before = await look();
  let rolled = false;
  for (let i = 0; i < 4 && !rolled; i++) {
    await page.getByRole("button", { name: "Randomise Pattern", exact: true }).click();
    await settle();
    rolled = (await look()) !== before;
  }
  check(rolled, `Hinge Box: Randomise pattern changes the lattice (${before} → ${await look()})`);
  check((await w.inputValue()) === width, "Hinge Box: the box keeps its width");
  check((await toasts()).some((t) => t.includes("Ctrl+Z undoes it")), "Hinge Box: a toast says Ctrl+Z undoes it");
  await page.keyboard.press("Control+z");
  await settle();
  check((await look()) === before, "Hinge Box: Ctrl+Z takes the randomise back");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  check(await page.getByRole("menuitem", { name: /Randomise hinge pattern/ }).isVisible(), "Hinge Box: the Edit menu has Randomise hinge pattern");
  await page.keyboard.press("Escape");

  // ---- Letters: a new font and mode; the words stay
  await page.goto(`${BASE}/app/editor/local?p=letters`);
  await page.getByRole("group", { name: "Weld", exact: true }).waitFor({ timeout: 20000 });
  const words = page.getByRole("textbox").first();
  const said = await words.inputValue();
  await page.getByRole("button", { name: "Randomise Style", exact: true }).click();
  await settle();
  check((await words.inputValue()) === said, `Letters: Randomise style keeps the words (${said})`);
  check((await toasts()).some((t) => t.includes("Ctrl+Z undoes it")), "Letters: a toast names the new style");

  // ---- A generator (Clock): locks on a rail choice and a checkbox
  await page.goto(`${BASE}/app/editor/local?p=clock`);
  await page.getByRole("group", { name: "Face shape", exact: true }).first().waitFor({ timeout: 20000 }).catch(() => {});
  const shape = () => page.getByRole("group", { name: /Face shape/ }).first().locator('[aria-pressed="true"]').first().innerText().catch(() => "");
  const shapeBefore = await shape();
  await page.getByRole("button", { name: "Lock Face shape", exact: true }).first().click();
  const ticks = page.getByRole("checkbox", { name: "Minute ticks", exact: true });
  const tickLock = page.getByRole("button", { name: "Lock Minute ticks", exact: true });
  const hasTickLock = await tickLock.count() > 0;
  check(hasTickLock, "Clock: a checkbox Randomise may change has a lock");
  const ticksBefore = hasTickLock && await ticks.isVisible() ? await ticks.isChecked() : null;
  if (ticksBefore !== null) await tickLock.click();
  check((await page.getByRole("button", { name: /^Lock Font$/ }).count()) > 0 || (await page.getByRole("button", { name: /^Unlock Font$/ }).count()) > 0, "Clock: a font Randomise may change has a lock");
  const btn = page.getByRole("button", { name: /Randomise design/ });
  check((await btn.innerText()).includes("locked"), `Clock: the Randomise button counts the locks (${(await btn.innerText()).trim()})`);
  for (let i = 0; i < 3; i++) {
    await btn.click();
    await settle();
    check((await shape()) === shapeBefore, `Clock: the locked face shape stays (${shapeBefore}), roll ${i + 1}`);
    if (ticksBefore !== null) check((await ticks.isChecked()) === ticksBefore, `Clock: the locked Minute ticks stays, roll ${i + 1}`);
  }
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  check(await page.getByRole("menuitem", { name: /Randomise design/ }).isVisible(), "Clock: the Edit menu has Randomise design");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Unlock Face shape", exact: true }).first().click();
  if (ticksBefore !== null) await page.getByRole("button", { name: "Unlock Minute ticks", exact: true }).click();

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
}, { width: 1440, height: 900 });

if (failures.length) { console.log(`\n${failures.length} failed`); process.exit(1); }
console.log("\nAll randomise checks passed.");
