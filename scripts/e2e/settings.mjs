// End-to-end check of Settings (D181): Edit › Settings… and Ctrl+, in the classic editors and on the
// account page; units, interface size (kept across a reload), Reset all without asking, New keeping
// the material and sheet, autosave off, and Reset these settings.
// Usage: a production server on SHOTS_BASE (default :3456), then node scripts/e2e/settings.mjs.
import { BASE, signInAsPro, withBrowser } from "../shots/lib.mjs";

const SHOTS = process.env.E2E_SHOTS;

const failures = [];
const check = (ok, what) => { console.log(`${ok ? "✓" : "✗"} ${what}`); if (!ok) failures.push(what); };

await withBrowser(async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const settle = () => page.waitForTimeout(500);
  const dialog = () => page.getByRole("dialog", { name: "Settings", exact: true });
  const field = (id) => page.locator(`.fld[data-id="${id}"] input`).first();
  const setField = async (id, v) => { await field(id).fill(String(v)); await field(id).press("Enter"); await settle(); };
  const root = (k) => page.evaluate((key) => document.documentElement.dataset[key] ?? null, k);

  await page.goto(`${BASE}/app/editor/local?p=hinge`);
  await field("W").waitFor({ timeout: 20000 });
  await page.evaluate(() => { const p = JSON.parse(localStorage.getItem("hingelab-prefs") || "{}"); delete p.editor; localStorage.setItem("hingelab-prefs", JSON.stringify(p)); });

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  check(await page.getByRole("menuitem", { name: /Settings…/ }).isVisible(), "Hinge Box: the Edit menu has Settings…");
  await page.getByRole("menuitem", { name: /Settings…/ }).click();
  await dialog().waitFor({ timeout: 10000 });
  check(true, "Edit › Settings… opens the dialog");
  await page.keyboard.press("Escape");
  await settle();
  check(!(await dialog().isVisible().catch(() => false)), "Escape closes it");
  await page.keyboard.press("Control+,");
  await dialog().waitFor({ timeout: 10000 });
  check(true, "Ctrl+, opens it");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/settings-1-dialog.png` });

  // ---- New keeps the material and sheet; Reset all without asking
  await dialog().getByRole("checkbox", { name: /New designs keep the material/ }).check();
  await dialog().getByRole("checkbox", { name: "Ask before Reset all" }).uncheck();
  await dialog().getByRole("button", { name: "Done" }).click();
  const w0 = await field("W").inputValue();
  await setField("T", 4.5);
  await setField("W", Number(w0) + 23);
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: /New box/ }).click();
  await settle();
  check(Number(await field("T").inputValue()) === 4.5, `New box keeps the material thickness (${await field("T").inputValue()})`);
  check((await field("W").inputValue()) === w0, `New box resets the width (${await field("W").inputValue()} = ${w0})`);
  await setField("W", Number(w0) + 11);
  await page.getByRole("button", { name: "Reset all", exact: true }).click();
  await settle();
  check((await page.getByRole("dialog", { name: "Reset all settings" }).count()) === 0, "Reset all does not ask when Ask before Reset all is off");
  check((await field("W").inputValue()) === w0, "Reset all restores the width");
  await page.keyboard.press("Control+z");
  await settle();
  check((await field("W").inputValue()) === String(Number(w0) + 11), "Ctrl+Z takes Reset all back");

  // ---- Units and interface size, kept across a reload
  await page.keyboard.press("Control+,");
  await dialog().waitFor();
  await dialog().getByRole("button", { name: "Inches", exact: true }).click();
  await dialog().getByRole("button", { name: "Large", exact: true }).click();
  await settle();
  check((await page.locator('.unit-toggle [data-u="in"]').getAttribute("aria-pressed")) === "true", "Units › Inches switches the open editor to inches");
  check((await root("uiSize")) === "large", "Interface size › Large is set on the page");
  const railW = await page.locator(".main > .gallery").evaluate((e) => e.getBoundingClientRect().width).catch(() => 0);
  check(railW > 250, `The options rail grows (${Math.round(railW)} px)`);
  await dialog().getByRole("checkbox", { name: /Save designs in this browser/ }).uncheck();
  await dialog().getByRole("button", { name: "Done" }).click();
  await settle();
  check((await page.locator("body").innerText()).includes("Autosave is off"), "Autosave off shows in the status bar");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/settings-2-large.png` });
  await page.reload();
  await field("W").waitFor({ timeout: 20000 });
  check((await root("uiSize")) === "large", "Interface size survives a reload");
  check((await page.locator('.unit-toggle [data-u="in"]').getAttribute("aria-pressed")) === "true", "Units survive a reload");

  // ---- Reset these settings
  await page.keyboard.press("Control+,");
  await dialog().waitFor();
  await dialog().getByRole("button", { name: /Reset these settings/ }).click();
  await settle();
  check((await root("uiSize")) === null, "Reset these settings: normal size");
  check((await page.locator('.unit-toggle [data-u="mm"]').getAttribute("aria-pressed")) === "true", "Reset these settings: millimetres");
  check(await dialog().getByRole("checkbox", { name: "Ask before Reset all" }).isChecked(), "Reset these settings: Ask before Reset all is on again");
  await dialog().getByRole("button", { name: "Done" }).click();

  // ---- The other editors share it
  for (const [p, ready] of [["letters", () => page.getByRole("group", { name: "Weld", exact: true }).waitFor({ timeout: 20000 })], ["clock", () => page.locator(".dock-col").waitFor({ timeout: 20000 })], ["parametric", () => page.locator(".dock-col").waitFor({ timeout: 20000 })]]) {
    await page.goto(`${BASE}/app/editor/local?p=${p}`);
    await ready();
    await page.keyboard.press("Control+,");
    check(await dialog().waitFor({ timeout: 8000 }).then(() => true, () => false), `${p}: Ctrl+, opens Settings`);
    await page.keyboard.press("Escape");
  }

  // ---- Account page (signed in)
  const cleanup = await signInAsPro(page, "settings").catch(() => null);
  if (!cleanup) console.log("- Account page skipped: no local Supabase stack to sign in with");
  else try {
    await page.goto(`${BASE}/account`);
    const open = page.getByRole("button", { name: "Open editor settings" });
    check(await open.waitFor({ timeout: 20000 }).then(() => true, () => false), "Account: an Editor settings section");
    if (await open.isVisible().catch(() => false)) {
      await open.click();
      check(await dialog().waitFor({ timeout: 8000 }).then(() => true, () => false), "Account: it opens the same dialog");
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/settings-3-account.png` });
    }
  } finally {
    await cleanup();
  }

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
}, { width: 1440, height: 900 });

if (failures.length) { console.log(`\n${failures.length} failed`); process.exit(1); }
console.log("\nAll settings checks passed.");
