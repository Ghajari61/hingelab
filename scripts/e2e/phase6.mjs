// End-to-end check of precision (D164, D174): the user's own material with two kerfs picked in Hinge Box (thickness, Kerf X and Kerf Y), the lid options and the
// honeycomb pattern, the materials dialog (laser settings, export, import) with the settings landing
// in a LightBurn file, and the separate Y kerf in a generator.
// Usage: a production server on SHOTS_BASE (default :3456), then node scripts/e2e/phase6.mjs.
import fs from "node:fs";
import path from "node:path";
import { BASE, OUT, withBrowser } from "../shots/lib.mjs";

const failures = [];
const check = (ok, what) => { console.log(`${ok ? "✓" : "✗"} ${what}`); if (!ok) failures.push(what); };

async function grab(page, act) {
  const [dl] = await Promise.all([page.waitForEvent("download"), act()]);
  const file = path.join(OUT, dl.suggestedFilename());
  await dl.saveAs(file);
  const text = fs.readFileSync(file, "utf8");
  fs.rmSync(file);
  return { name: dl.suggestedFilename(), text };
}

const field = (page, id) => page.locator(`.fld[data-id="${id}"] input`);
async function type(page, id, v) {
  await field(page, id).fill(String(v));
  await field(page, id).press("Enter");
}
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("hingelab-materials") ?? "[]"));

await withBrowser(async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const uploads = [];
  page.on("request", (r) => { if (r.method() === "POST" && !r.url().startsWith(BASE)) uploads.push(r.url()); });

  // ---- My material with two kerfs, as measured from a cut square.
  const body = () => page.locator("body").innerText();
  const kx = 0.15, ky = 0.25, myId = "my-e2ephase6";
  await page.goto(`${BASE}/app/editor/local?p=hinge`);
  await page.evaluate((m) => localStorage.setItem("hingelab-materials", JSON.stringify([m])), {
    id: myId, name: "My Baltic birch plywood 3 mm", T: 3, kx, ky, minFeature: 0, like: "birch3", laser: {},
  });
  let mats = await stored(page);
  check(mats.length === 1 && mats[0].kx === kx && mats[0].ky === ky, `my material has kerf X ${kx} and Y ${ky}`);

  // ---- Hinge Box picks it up.
  const SERVER_SVG = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="120mm" height="80mm" viewBox="0 0 120 80">\n`
    + `<g id="outline" inkscape:groupmode="layer" inkscape:label="02 Outline cut" fill="none" stroke="#FF0000" stroke-width="0.1">\n  <path d="M10 10 L110 10 L110 70 L10 70 Z"/>\n</g>\n`
    + `<g id="hinge" inkscape:groupmode="layer" inkscape:label="01 Hinge slits" fill="none" stroke="#0000FF" stroke-width="0.1">\n  <path d="M20 20 L20 60"/>\n</g>\n</svg>\n`;
  await page.route("**/api/export", (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: SERVER_SVG }));
  await page.goto(`${BASE}/app/editor/local?p=hinge`);
  await page.waitForTimeout(2500);
  const sel = page.getByLabel("Material preset");
  check(await sel.locator("optgroup[label='My materials'] option").count() === 1, "Hinge Box lists my material");
  const before = await sel.inputValue();
  await sel.selectOption(myId);
  await page.waitForTimeout(500);
  await page.evaluate(() => document.activeElement?.blur());
  check(await page.getByLabel("Separate X and Y kerf").isChecked(), "a material with two kerfs turns on Separate X and Y kerf");
  check(await field(page, "K").inputValue() === String(kx) && await field(page, "Ky").inputValue() === String(ky), `Kerf X ${await field(page, "K").inputValue()} and Kerf Y ${await field(page, "Ky").inputValue()} come from it`);
  check(/Kerf X/.test(await page.locator('.fld[data-id="K"] label').innerText()), "the kerf field is labelled Kerf X");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);
  check(!(await page.getByLabel("Separate X and Y kerf").isChecked()) && await sel.inputValue() === before, "Ctrl+Z puts the built-in material back in one step");
  await page.keyboard.press("Control+Shift+z");
  await page.waitForTimeout(300);
  check(await sel.inputValue() === myId, "and Ctrl+Shift+Z brings mine back");

  // Lid options.
  const lid = page.locator("details.sec").filter({ has: page.locator('button[aria-label="Reset Lid section"]') });
  await lid.locator("summary").click();
  await type(page, "lidOver", 5);
  await lid.getByRole("button", { name: "Finger" }).click();
  await page.waitForTimeout(1500);
  check(await field(page, "lidHoleD").inputValue() === "22", "a finger hole starts at 22 mm");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("hingelab-v1") ?? "{}"));
  check(saved?.params?.lidOver === 5 && saved?.params?.lidHole === "finger", "overhang and hole are autosaved");
  check(!/hole is too big/.test(await body()), "the hole fits the lid");

  // Honeycomb.
  await page.getByRole("group", { name: "Hinge pattern" }).locator('.gcard[data-v="honeycomb"]').click();
  await page.waitForTimeout(800);
  check(await page.locator('.fld[data-id="slotW"] label').innerText() === "Cell width" && await page.locator('.fld[data-id="slit"]').isHidden(), "honeycomb shows Cell width and hides Slit");
  check(!/Honeycomb walls are too thin/.test(await body()), "switching to honeycomb starts from a lattice that builds");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: path.join(process.env.E2E_SHOTS, "phase6-hinge.png") });
  // Honeycomb is a Pro pattern like Wave; a free plan exports Straight.
  await page.getByRole("group", { name: "Hinge pattern" }).locator('.gcard[data-v="straight"]').click();
  await page.waitForTimeout(500);
  check(!/spacing is too tight/.test(await body()), "going back to Straight leaves a lattice that builds");

  // ---- The materials dialog: laser settings into LightBurn, export and import.
  await sel.selectOption("__manage");
  const dlg = page.getByRole("dialog", { name: "My materials" });
  await dlg.waitFor();
  check(await dlg.locator(".mats-list button[aria-pressed=true]").innerText().then((t) => t.includes("My Baltic birch plywood 3 mm")), "the dialog opens on the design's material");
  await dlg.getByLabel("Cut speed").fill("15");
  await dlg.getByLabel("Cut power").fill("60");
  await dlg.getByRole("button", { name: "Save", exact: true }).click();
  await dlg.getByText(/Saved “My Baltic birch plywood 3 mm”/).waitFor();
  mats = await stored(page);
  check(JSON.stringify(mats[0].laser) === JSON.stringify({ cut: { speed: 15, power: 60, passes: 1 } }), "my cut settings are kept with the material");
  await dlg.getByLabel("Score speed").fill("20");
  await dlg.getByRole("button", { name: "Save", exact: true }).click();
  check(/Score: enter a speed/.test(await dlg.getByRole("alert").innerText()), "half a laser setting is refused with a reason");
  await dlg.getByLabel("Score speed").fill("");
  const file = await grab(page, () => dlg.getByRole("button", { name: "Export all" }).click());
  const parsed = JSON.parse(file.text);
  check(file.name === "hingelab-materials.json" && parsed.kind === "materials" && parsed.materials.length === 1, "Export all saves a materials file");
  const extra = path.join(OUT, "phase6-import.json");
  fs.writeFileSync(extra, JSON.stringify({ app: "hingelab", kind: "materials", version: 1, materials: [{ name: "Acrylic from work", T: 2.8, kx: 0.09, ky: 0.11 }] }));
  await dlg.locator('input[type="file"]').setInputFiles(extra);
  await dlg.getByText(/Imported: 1 added/).waitFor();
  fs.rmSync(extra);
  check((await stored(page)).length === 2 && await dlg.locator(".mats-list li").count() === 2, "importing a file adds its materials");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: path.join(process.env.E2E_SHOTS, "phase6-materials.png") });
  await page.keyboard.press("Escape");
  check(await dlg.count() === 0, "Escape closes the dialog");
  check(await sel.locator("optgroup[label='My materials'] option").count() === 2, "the list updates at once");

  await page.getByRole("button", { name: "More…" }).click();
  const exp = page.getByRole("dialog", { name: "Export" });
  await exp.waitFor();
  await exp.getByRole("group", { name: "Format" }).getByRole("button", { name: "LightBurn" }).click();
  check(/carries the speed, power and passes you saved/.test(await exp.innerText()), "the export dialog says your settings go in");
  const lb = await grab(page, () => exp.getByRole("button", { name: /^(Export|Download)/ }).click());
  const outline = /<CutSetting type="Cut">[\s\S]*?Outline cut[\s\S]*?<\/CutSetting>/.exec(lb.text)?.[0] ?? "";
  check(/<speed Value="15"\/>/.test(outline) && /<maxPower Value="60"\/>/.test(outline) && /<numPasses Value="1"\/>/.test(outline), "the LightBurn file carries my cut speed and power");
  await page.locator(".toast").filter({ hasText: /Check them in LightBurn/ }).first().waitFor({ timeout: 5000 }).then(() => check(true, "and asks to check them in LightBurn"), () => check(false, "and asks to check them in LightBurn"));

  // ---- A generator: separate Y kerf and the larger limits.
  await page.goto(`${BASE}/app/editor/local?p=boxes`);
  await page.waitForTimeout(2000);
  check(await field(page, "sheet.kerfY").count() === 0, "Kerf Y is hidden until asked for");
  await page.getByLabel("Separate X and Y kerf").check();
  await page.waitForTimeout(300);
  check(await field(page, "sheet.kerfY").inputValue() === await field(page, "K").inputValue(), "Kerf Y starts at the kerf");
  await type(page, "T", 40);
  await page.waitForTimeout(300);
  check(await field(page, "T").inputValue() === "40", "a 40 mm sheet is accepted");

  check(uploads.length === 0, `nothing is uploaded${uploads.length ? `: ${uploads.join(", ")}` : ""}`);
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
}, { width: 1440, height: 900 });

if (failures.length) { console.log(`\n${failures.length} failed`); process.exit(1); }
console.log("\nAll Phase 6 checks passed.");
