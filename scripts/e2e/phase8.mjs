// End-to-end check of the seller tools (D166): the job estimate (lengths, the time only once the user
// has given speeds, the material cost) in the checks and in the export window, batch personalisation
// from a pasted CSV downloaded as a ZIP with a folder per row, and a listing photo PNG from the 3D view;
// and the estimate in Hinge Box and Letters.
// Usage: a production server on SHOTS_BASE (default :3456), then node scripts/e2e/phase8.mjs.
import fs from "node:fs";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { BASE, OUT, withBrowser } from "../shots/lib.mjs";

const failures = [];
const check = (ok, what) => { console.log(`${ok ? "✓" : "✗"} ${what}`); if (!ok) failures.push(what); };

async function grab(page, act) {
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), act()]);
  const file = path.join(OUT, dl.suggestedFilename());
  await dl.saveAs(file);
  const data = fs.readFileSync(file);
  fs.rmSync(file);
  return { name: dl.suggestedFilename(), data };
}

await withBrowser(async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const uploads = [];
  page.on("request", (r) => { if (r.method() === "POST" && !r.url().startsWith(BASE)) uploads.push(r.url()); });
  const openAll = () => page.locator(".dock details").evaluateAll((els) => { for (const d of els) d.open = true; });

  // ---- Job estimate in a generator.
  await page.goto(`${BASE}/app/editor/local?p=sign`);
  await page.waitForTimeout(2500);
  await openAll();
  const est = page.getByRole("group", { name: "Job estimate" });
  await est.waitFor({ timeout: 10000 });
  await est.locator("dd").first().waitFor();
  const card = await est.innerText();
  check(/Cut\s+[\d.]+ (mm|m)/.test(card), "the estimate gives the cut length");
  check(/Material\s+[\d.]+ (cm²|m²) in the parts · 1 sheet of \d+ × \d+ mm \(\d+ % used\)/.test(card), "and the material the parts take from the sheet");
  check(/HingeLab does not guess laser speeds/.test(card), "no time is shown before the user gives speeds");
  const machine = await est.getByLabel("Estimate for machine").inputValue();
  const speeds = est.locator("details.jobest-speeds");
  if (!(await speeds.evaluate((d) => d.open))) await speeds.locator("summary").click();
  await est.getByLabel("Cut speed (mm/s)", { exact: true }).waitFor({ state: "visible", timeout: 5000 });
  for (const [label, v] of [["Cut speed (mm/s)", "20"], ["Score speed (mm/s)", "100"], ["Engrave speed (mm/s)", "300"]]) await est.getByLabel(label, { exact: true }).fill(v);
  await est.getByLabel("Cut passes", { exact: true }).fill("2");
  await page.waitForTimeout(300);
  const time = await est.locator(".jobest-time").innerText();
  check(/Job time on .+: about \d+ (s|min|h)/.test(time), `the job time appears with my speeds (“${time}”)`);
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("hingelab-estimate") ?? "{}"));
  check(kept.speeds?.[machine]?.cut?.speed === 20 && kept.speeds?.[machine]?.cut?.passes === 2, "my speeds are kept on this device for the machine");
  await est.getByLabel("Currency").fill("€");
  await est.getByLabel("Price per sheet").fill("12.5");
  await page.waitForTimeout(300);
  check(/Material cost: €12\.50 for 1 sheet · €\d+\.\d\d for the parts alone/.test(await est.innerText()), "the material cost comes from the price per sheet");
  if (process.env.E2E_SHOTS) await est.screenshot({ path: path.join(process.env.E2E_SHOTS, "phase8-estimate.png") });

  await page.getByRole("button", { name: "More…" }).click();
  const exp = page.getByRole("dialog", { name: "Export" });
  await exp.waitFor();
  const sum = exp.getByRole("group", { name: "Job summary" });
  await sum.locator(".jobest-time").waitFor({ timeout: 5000 });
  check(/Job time on .+: about/.test(await sum.innerText()) && /€12\.50/.test(await sum.innerText()), "the export window repeats it as the job summary");
  await page.keyboard.press("Escape");
  await exp.waitFor({ state: "detached" });

  // ---- Batch personalisation.
  await openAll();
  await page.getByRole("button", { name: "Batch files (ZIP)…" }).click();
  const dlg = page.getByRole("dialog", { name: "Batch personalisation" });
  await dlg.waitFor();
  await dlg.getByLabel("Batch rows").fill('name,date\nAna,2027\n"Smith, Ben",\nCy & Di,12.06.2027');
  check(/3 rows \(header row found\)/.test(await dlg.locator("p[role=status]").innerText()), "a pasted CSV gives three rows");
  check(await dlg.locator(".batch-rows tbody tr").count() === 3, "the rows are previewed");
  await dlg.getByRole("group", { name: "Files for each row" }).getByRole("button", { name: "DXF" }).click();
  const zip = await grab(page, () => dlg.getByRole("button", { name: "Download ZIP" }).click());
  check(/-batch\.zip$/.test(zip.name), `the batch downloads as a ZIP (${zip.name})`);
  const files = unzipSync(new Uint8Array(zip.data));
  const names = Object.keys(files).sort();
  const want = ["01-Ana/Ana.dxf", "01-Ana/Ana.svg", "02-Smith-Ben/Smith-Ben.dxf", "02-Smith-Ben/Smith-Ben.svg", "03-Cy-Di/Cy-Di.dxf", "03-Cy-Di/Cy-Di.svg", "summary.csv"];
  check(JSON.stringify(names) === JSON.stringify(want), `a folder per row with the chosen files (${names.join(", ")})`);
  const svgs = names.filter((n) => n.endsWith(".svg")).map((n) => strFromU8(files[n]));
  check(svgs.length === 3 && new Set(svgs).size === 3 && svgs.every((s) => s.includes("<svg")), "each row's SVG is its own design");
  const summary = strFromU8(files["summary.csv"] ?? new Uint8Array()).replace(/^\uFEFF/, "").trim().split(/\r\n/);
  check(summary.length === 4 && summary.slice(1).every((l) => l.endsWith(",made")) && summary[2].startsWith('2,"Smith, Ben"'), "summary.csv lists every row");
  await page.locator(".toast").filter({ hasText: /Downloading .*-batch\.zip: 3 of 3 rows/ }).first().waitFor({ timeout: 5000 })
    .then(() => check(true, "and says how many rows were made"), () => check(false, "and says how many rows were made"));
  check(await dlg.count() === 0, "the batch window closes when done");

  // ---- Listing photo from the 3D view.
  await page.getByRole("tab", { name: "3D view" }).click();
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "Listing photo" }).click();
  const shot = page.getByRole("dialog", { name: "Listing photo" });
  await shot.waitFor();
  await shot.getByLabel("Background").selectOption("wood");
  await shot.getByLabel("Size").selectOption("port");
  await page.waitForTimeout(500);
  if (process.env.E2E_SHOTS) await page.screenshot({ path: path.join(process.env.E2E_SHOTS, "phase8-listing.png") });
  const png = await grab(page, () => shot.getByRole("button", { name: "Download PNG" }).click());
  const sig = png.data.subarray(0, 8).toString("hex");
  const w = png.data.readUInt32BE(16), h = png.data.readUInt32BE(20);
  check(sig === "89504e470d0a1a0a" && w === 1080 && h === 1350, `the listing photo is a 1080 × 1350 PNG (${png.name}, ${w} × ${h})`);
  check(png.data.length > 50000, `with the model on the wooden desk (${Math.round(png.data.length / 1024)} KB)`);
  if (process.env.E2E_SHOTS) fs.writeFileSync(path.join(process.env.E2E_SHOTS, "phase8-listing-photo.png"), png.data);
  await shot.getByLabel("Background").selectOption("none");
  await shot.getByLabel("Angle").selectOption("top");
  await shot.getByLabel("Size").selectOption("sq1080");
  const clear = await grab(page, () => shot.getByRole("button", { name: "Download PNG" }).click());
  check(clear.data.readUInt32BE(16) === 1080 && clear.data.readUInt32BE(20) === 1080 && clear.data[25] === 6, "a transparent top-down square is an RGBA PNG");
  await page.keyboard.press("Escape");
  check(await shot.count() === 0, "Escape closes the listing photo");

  // ---- Hinge Box and Letters show the estimate too.
  for (const [p, name] of [["hinge", "Hinge Box"], ["letters", "Letters"]]) {
    await page.goto(`${BASE}/app/editor/local?p=${p}`);
    await page.waitForTimeout(3000);
    await openAll();
    const g = page.getByRole("group", { name: "Job estimate" });
    await g.locator("dd").first().waitFor({ timeout: 10000 }).catch(() => {});
    const t = await g.innerText().catch(() => "");
    check(/Cut\s+[\d.]+ (mm|m)/.test(t) && /Job time on .+: about/.test(t), `${name} shows the estimate with the saved speeds`);
  }

  check(uploads.length === 0, `nothing is uploaded${uploads.length ? `: ${uploads.join(", ")}` : ""}`);
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
}, { width: 1440, height: 900 });

if (failures.length) { console.log(`\n${failures.length} failed`); process.exit(1); }
console.log("\nAll Phase 8 checks passed.");
