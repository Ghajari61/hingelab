// Parametric P2 (parallel fins complete): the face sculpture with a slat backboard in the
// Parametric editor (3D and Sheets tabs), its assembly guide, and the ZIP export.
import fs from "node:fs";
import path from "node:path";
import { BASE, OUT, shot, signInAsPro, withBrowser } from "./lib.mjs";

const assert = (cond, msg) => { if (!cond) throw new Error("FAILED: " + msg); console.log("ok -", msg); };
const stage = (page) => page.locator(".pe-stage").textContent();
const waitSliced = async (page, prev = "") => {
  await page.waitForFunction((p) => {
    const t = document.querySelector(".pe-stage")?.textContent ?? "";
    return /\d+ parts/.test(t) && t !== p && !document.querySelector(".pe-progress");
  }, prev, { timeout: 90000 });
  await page.waitForTimeout(600);
  return stage(page);
};
const download = async (page, click) => {
  const [d] = await Promise.all([page.waitForEvent("download"), click()]);
  const file = path.join(OUT, d.suggestedFilename());
  await d.saveAs(file);
  return file;
};

let cleanup = async () => {};
await withBrowser(async (page) => {
  cleanup = await signInAsPro(page, "parametric2");
  await page.addInitScript(() => { if (!sessionStorage.getItem("p2")) { localStorage.clear(); sessionStorage.setItem("p2", "1"); } });
  await page.goto(`${BASE}/app/editor/local?p=hinge`);
  await page.getByRole("button", { name: "Parametric", exact: true }).click();
  let s = await waitSliced(page);
  assert(/\d+ parts/.test(s), `head sliced in the editor: ${s}`);

  await page.getByRole("group", { name: "Backboard" }).getByRole("button", { name: "Slats" }).click();
  s = await waitSliced(page, s);
  const sheetsTab = await page.getByRole("tab", { name: /Sheets/ }).textContent();
  assert(/Sheets \(\d+\)/.test(sheetsTab), `sheets counted: ${sheetsTab}`);
  const analysis = await page.locator(".dock .stats").last().textContent();
  assert(/Parts\d+Sheets\d+/.test(analysis.replace(/\s+/g, "")), "analysis shows parts and sheets");

  await page.locator('input[aria-label="Explode"]').fill("0.45");
  await page.waitForTimeout(800);
  await shot(page, "parametric-2-face-slats-3d");

  await page.locator('input[aria-label="Part"]').fill("8");
  await page.waitForTimeout(400);
  const inspected = await page.locator(".pe-inspect-nav span").textContent();
  assert(/^F\d+/.test(inspected), `slice inspector shows a fin: ${inspected}`);

  await page.getByRole("tab", { name: /Sheets/ }).click();
  await page.waitForTimeout(1200);
  const sheetCount = await page.locator("#world rect").count();
  assert(sheetCount >= 1, `${sheetCount} sheets drawn`);
  await shot(page, "parametric-2-sheets");

  const zip = await download(page, () => page.getByRole("button", { name: "Export all sheets (ZIP)" }).click());
  const bytes = fs.readFileSync(zip);
  assert(bytes.length > 1000 && bytes.subarray(0, 2).toString() === "PK", `ZIP saved (${bytes.length} bytes)`);
  fs.rmSync(zip);

  const guide = await download(page, () => page.getByRole("button", { name: "Assembly guide" }).click());
  const svg = fs.readFileSync(guide, "utf8");
  assert(svg.includes("assembly guide") && !/NaN/.test(svg), "assembly guide saved");
  const guidePage = await page.context().newPage();
  await guidePage.setViewportSize({ width: 1200, height: 1400 });
  await guidePage.setContent(`<body style="margin:0;background:#fff"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" style="width:1200px;display:block"></body>`);
  await guidePage.waitForTimeout(500);
  await guidePage.screenshot({ path: path.join(OUT, "parametric-2-assembly-guide.png"), fullPage: true });
  console.log("saved docs/screenshots/parametric-2-assembly-guide.png");
  fs.rmSync(guide);
  await guidePage.close();

  await page.getByRole("tab", { name: "3D" }).click();
  await page.getByRole("group", { name: "Model from" }).getByRole("button", { name: "Formula" }).click();
  s = await waitSliced(page, s);
  assert(/\d+ parts/.test(s), `formula surface sliced: ${s}`);
  await page.locator('textarea[aria-label="Formula"]').fill("sin(");
  await page.waitForSelector(".pe-3d .canvas-error", { timeout: 30000 });
  const err = await page.locator(".pe-3d .canvas-error").textContent();
  assert(/formula/i.test(err), `a broken formula is reported: ${err}`);

  await page.locator('input[aria-label="Import model"]').setInputFiles({ name: "box-in-metres.stl", mimeType: "model/stl", buffer: boxStl(0.3, 0.2, 0.1) });
  await page.waitForSelector(".pe-units", { timeout: 60000 });
  assert(true, "an implausibly small model asks for its units");
  await page.locator(".pe-units").getByRole("button", { name: "m", exact: true }).click();
  await page.waitForFunction(() => /300 mm wide/.test(document.querySelector(".dock")?.textContent ?? ""), null, { timeout: 60000 });
  assert((await page.locator(".pe-units").count()) === 0, "choosing metres scales the model to 300 mm");
}).finally(() => cleanup());

/** Binary STL of an axis-aligned box (outward triangles). */
function boxStl(w, h, d) {
  const V = [[0, 0, 0], [w, 0, 0], [w, h, 0], [0, h, 0], [0, 0, d], [w, 0, d], [w, h, d], [0, h, d]];
  const F = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const buf = Buffer.alloc(84 + F.length * 50);
  buf.writeUInt32LE(F.length, 80);
  F.forEach((f, i) => f.forEach((v, k) => V[v].forEach((c, a) => buf.writeFloatLE(c, 84 + i * 50 + 12 + k * 12 + a * 4))));
  return buf;
}
