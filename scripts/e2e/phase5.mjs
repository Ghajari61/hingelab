// End-to-end check of the export dialog (D163): the machine bed check, SVG one file per sheet (ZIP),
// a PDF with a page per sheet, a LightBurn project, DXF in inches, mirror, remembered choices, and
// the default SVG being exactly what Export SVG saves (Shadow Box and Hinge Box).
// Usage: a production server on SHOTS_BASE (default :3456), then node scripts/e2e/phase5.mjs.
import fs from "node:fs";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { BASE, OUT, withBrowser } from "../shots/lib.mjs";

const failures = [];
const check = (ok, what) => { console.log(`${ok ? "✓" : "✗"} ${what}`); if (!ok) failures.push(what); };

/** Runs an action that downloads a file; returns its name and bytes. */
async function grab(page, act) {
  const [dl] = await Promise.all([page.waitForEvent("download"), act()]);
  const file = path.join(OUT, dl.suggestedFilename());
  await dl.saveAs(file);
  const bytes = fs.readFileSync(file);
  fs.rmSync(file);
  return { name: dl.suggestedFilename(), bytes, text: bytes.toString("latin1") };
}

await withBrowser(async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const uploads = [];
  page.on("request", (r) => { if (r.method() === "POST" && !r.url().startsWith(BASE)) uploads.push(r.url()); });
  await page.goto(`${BASE}/app/editor/local?p=shadowbox&preset=lit-forest-box`);
  await page.locator(".toast, [role=status]").filter({ hasText: "Started from" }).first().waitFor();
  await page.waitForTimeout(1500);
  const sheets = Number(/Used (\d+) sheets?/.exec(await page.locator("body").innerText())?.[1] ?? 0);
  check(sheets > 1, `the Lit forest box needs several sheets (${sheets})`);

  const dlg = page.getByRole("dialog", { name: "Export" });
  const go = (name) => dlg.getByRole("button", { name: /^(Export|Download)/ }).click();
  await page.getByRole("button", { name: "More…" }).click();
  await dlg.waitFor();
  check(await dlg.getByLabel("Machine").inputValue() === "co2-50", "the dialog starts on your machine (Generic CO₂ 50 W)");
  const status = () => dlg.getByRole("status").innerText();
  check(/larger than this bed \(500 × 300 mm\)/.test(await status()), `600 × 400 mm sheets are flagged on a 500 × 300 mm bed: “${await status()}”`);
  await dlg.getByLabel("Machine").selectOption("co2-100");
  check(/All \d+ sheets fit this machine's 900 × 600 mm bed/.test(await status()), `a 900 × 600 mm bed fits them: “${await status()}”`);
  check(await dlg.getByRole("group", { name: "Format" }).getByRole("button", { name: "DXF" }).getAttribute("aria-pressed") === "true", "that machine's profile picks DXF");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: path.join(process.env.E2E_SHOTS, "phase5-dialog.png") });

  // SVG, one file per sheet.
  await dlg.getByRole("group", { name: "Format" }).getByRole("button", { name: "SVG" }).click();
  await dlg.getByRole("group", { name: "Sheets" }).getByRole("button", { name: /One file per sheet/ }).click();
  const zip = await grab(page, () => go());
  const files = unzipSync(new Uint8Array(zip.bytes));
  const names = Object.keys(files);
  check(/-sheets\.zip$/.test(zip.name) && names.length === sheets && names.every((n, i) => n.endsWith(`-sheet-${i + 1}-of-${sheets}.svg`)), `one SVG per sheet in ${zip.name} (${names.length})`);
  check(names.every((n) => /viewBox="0 0 600 400"/.test(strFromU8(files[n]))), "each is one 600 × 400 mm sheet");
  check(await dlg.count() === 0, "the dialog closes after exporting");

  // Choices are remembered; a PDF with a page per sheet.
  await page.keyboard.press("Control+Shift+E");
  await dlg.waitFor();
  check(await dlg.getByLabel("Machine").inputValue() === "co2-100", "Ctrl+Shift+E opens it again on the same machine");
  await dlg.getByRole("group", { name: "Format" }).getByRole("button", { name: "PDF" }).click();
  await dlg.getByRole("group", { name: "Sheets" }).getByRole("button", { name: /One PDF/ }).click();
  const pdf = await grab(page, () => go());
  const pages = (pdf.text.match(/\/Type \/Page /g) ?? []).length;
  check(/\.pdf$/.test(pdf.name) && pdf.text.startsWith("%PDF-1.4") && pages === sheets, `a PDF with a page per sheet (${pages})`);
  check((pdf.text.match(/\/MediaBox \[0 0 1700\.787 1133\.858\]/g) ?? []).length === sheets, "each page is 600 × 400 mm");

  // LightBurn.
  await page.keyboard.press("Control+Shift+E");
  await dlg.getByRole("group", { name: "Format" }).getByRole("button", { name: "LightBurn" }).click();
  await dlg.getByRole("group", { name: "Sheets" }).getByRole("button", { name: /All in one file/ }).click();
  const lb = await grab(page, () => go());
  check(/\.lbrn2$/.test(lb.name) && lb.text.includes("<LightBurnProject") && (lb.text.match(/<CutSetting /g) ?? []).length >= 2 && (lb.text.match(/<Shape Type="Path"/g) ?? []).length > 50, `a LightBurn project with its cut layers and shapes (${lb.name})`);

  // DXF in inches.
  await page.keyboard.press("Control+Shift+E");
  await dlg.getByRole("group", { name: "Format" }).getByRole("button", { name: "DXF" }).click();
  await dlg.getByLabel(/Numbers in inches/).check();
  const dxf = await grab(page, () => go());
  check(/\.dxf$/.test(dxf.name) && dxf.text.includes("$INSUNITS\n70\n1\n"), "a DXF in inches");

  // Mirror: the SVG is flipped left to right.
  await page.keyboard.press("Control+Shift+E");
  await dlg.getByRole("group", { name: "Format" }).getByRole("button", { name: "SVG" }).click();
  await dlg.getByLabel(/Mirror left to right/).check();
  const mir = await grab(page, () => go());
  check(mir.text.includes('<g transform="matrix(-1 0 0 1 '), "Mirror flips the SVG");

  // Escape closes it; the default SVG is exactly Export SVG's.
  await page.keyboard.press("Control+Shift+E");
  await dlg.waitFor();
  await page.keyboard.press("Escape");
  check(await dlg.count() === 0, "Escape closes the dialog");
  const quick = await grab(page, () => page.keyboard.press("Control+e"));
  await page.keyboard.press("Control+Shift+E");
  await dlg.getByLabel(/Mirror left to right/).uncheck();
  const same = await grab(page, () => go());
  check(same.text === quick.text, "with no option changed the dialog's SVG is byte for byte Export SVG's");

  // Hinge Box has it too. With accounts set up, Hinge Box exports through /api/export (which needs the
  // database); here the server's answer is a small layered SVG, so only the editor's side is tested.
  const SERVER_SVG = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="120mm" height="80mm" viewBox="0 0 120 80">\n`
    + `<g id="labels" inkscape:groupmode="layer" inkscape:label="00 Part labels (engrave)" fill="none" stroke="#000000" stroke-width="0.1">\n  <text x="60" y="40" font-family="Arial, Helvetica, sans-serif" font-size="5" fill="#000000" stroke="none" text-anchor="middle" dominant-baseline="middle">BASE</text>\n</g>\n`
    + `<g id="outline" inkscape:groupmode="layer" inkscape:label="02 Outline cut" fill="none" stroke="#FF0000" stroke-width="0.1">\n  <path d="M10 10 L110 10 L110 70 L10 70 Z"/>\n</g>\n</svg>\n`;
  await page.route("**/api/export", (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: SERVER_SVG }));
  await page.goto(`${BASE}/app/editor/local?p=hinge`);
  await page.waitForTimeout(2500);
  const hq = await grab(page, () => page.keyboard.press("Control+e"));
  await page.getByRole("button", { name: "More…" }).click();
  await dlg.waitFor();
  check(await dlg.getByRole("group", { name: "Sheets" }).count() === 0, "one sheet: no file-per-sheet choice");
  const hs = await grab(page, () => go());
  check(hs.text === hq.text, "Hinge Box: the dialog's SVG is Export SVG's");
  await page.keyboard.press("Control+Shift+E");
  await dlg.getByRole("group", { name: "Format" }).getByRole("button", { name: "PDF" }).click();
  const hp = await grab(page, () => go());
  check(hp.text.startsWith("%PDF-1.4") && hp.text.includes("/BaseFont /Helvetica"), "Hinge Box: a PDF with its part labels as text");

  check(uploads.length === 0, `nothing is uploaded${uploads.length ? `: ${uploads.join(", ")}` : ""}`);
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
}, { width: 1440, height: 900 });

if (failures.length) { console.log(`\n${failures.length} failed`); process.exit(1); }
console.log("\nAll Phase 5 checks passed.");
