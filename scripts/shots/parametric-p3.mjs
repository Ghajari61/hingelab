// Parametric P3 (stacked + waffle): a stacked mountain (formula relief, layers out of the wall)
// and a waffle vase, in the 3D and Sheets tabs, plus the waffle assembly guide.
import fs from "node:fs";
import path from "node:path";
import { BASE, OUT, shot, signInAsPro, withBrowser } from "./lib.mjs";

const assert = (cond, msg) => { if (!cond) throw new Error("FAILED: " + msg); console.log("ok -", msg); };
const stage = (page) => page.locator(".pe-stage").textContent();
const waitSliced = async (page, prev = "") => {
  await page.waitForFunction((p) => {
    const t = document.querySelector(".pe-stage")?.textContent ?? "";
    return /\d+ parts/.test(t) && t !== p && !document.querySelector(".pe-progress");
  }, prev, { timeout: 120000 });
  await page.waitForTimeout(800);
  return stage(page);
};
const download = async (page, click) => {
  const [d] = await Promise.all([page.waitForEvent("download"), click()]);
  const file = path.join(OUT, d.suggestedFilename());
  await d.saveAs(file);
  return file;
};
const method = (page, name) => page.getByRole("group", { name: "Slicing method" }).getByRole("button", { name }).click();

let cleanup = async () => {};
await withBrowser(async (page) => {
  cleanup = await signInAsPro(page, "parametric3");
  await page.addInitScript(() => { if (!sessionStorage.getItem("p3")) { localStorage.clear(); sessionStorage.setItem("p3", "1"); } });
  await page.goto(`${BASE}/app/editor/local?p=hinge`);
  await page.getByRole("button", { name: "Parametric", exact: true }).click();
  let s = await waitSliced(page);

  // Stacked mountain.
  await page.getByRole("group", { name: "Model from" }).getByRole("button", { name: "Formula" }).click();
  s = await waitSliced(page, s);
  const f = page.locator('textarea[aria-label="Formula"]');
  await f.fill("70*exp(-(x^2+y^2)/3000) + 18*exp(-((x-55)^2+(y+25)^2)/700) + 4*noise2(x/18, y/18)");
  await f.blur();
  s = await waitSliced(page, s);
  await method(page, "Stacked layers");
  s = await waitSliced(page, s);
  await page.getByRole("group", { name: "Layers stacked along" }).getByRole("button", { name: "Out of the wall (Z)" }).click();
  s = await waitSliced(page, s);
  assert(/\d+ parts/.test(s), `mountain stacked: ${s}`);
  const meta = await page.locator(".dock").textContent();
  assert(/Layers along Z/.test(meta), "method meta names the stacked layers");
  await page.locator('input[aria-label="Part"]').fill("0");
  await page.waitForTimeout(400);
  const insp = await page.locator(".pe-inspect-nav span").textContent();
  assert(/^L\d+/.test(insp), `slice inspector shows a layer: ${insp}`);
  const dock = await page.locator(".dock").textContent();
  assert(/Dowels\d/.test(dock.replace(/\s+/g, "")), "the layer has dowel holes");
  await page.locator('input[aria-label="Explode"]').fill("0.6");
  await page.waitForTimeout(1000);
  await shot(page, "parametric-3-stacked-mountain-3d");
  await page.getByRole("tab", { name: /Sheets/ }).click();
  await page.waitForTimeout(1200);
  await shot(page, "parametric-3-stacked-mountain-sheets");
  await page.getByRole("tab", { name: "3D" }).click();

  // Waffle vase.
  await page.getByRole("group", { name: "Model from" }).getByRole("button", { name: "Library" }).click();
  s = await waitSliced(page, s);
  await page.locator('select[aria-label="Library model"]').selectOption("vase");
  s = await waitSliced(page, s);
  await method(page, "Waffle");
  s = await waitSliced(page, s);
  assert(/\d+ parts/.test(s), `vase waffle: ${s}`);
  const analysis = await page.locator(".dock").textContent();
  assert(/Waffle X × Z/.test(analysis), "method meta names the waffle");
  await page.locator('input[aria-label="Explode"]').fill("0");
  await page.waitForTimeout(1000);
  await shot(page, "parametric-3-waffle-vase-3d");
  await page.getByRole("tab", { name: /Sheets/ }).click();
  await page.waitForTimeout(1200);
  await shot(page, "parametric-3-waffle-vase-sheets");

  const guide = await download(page, () => page.getByRole("button", { name: "Assembly guide" }).click());
  const svg = fs.readFileSync(guide, "utf8");
  assert(svg.includes("Slide the") && !/NaN/.test(svg), "waffle assembly guide saved");
  const guidePage = await page.context().newPage();
  await guidePage.setViewportSize({ width: 1200, height: 1400 });
  await guidePage.setContent(`<body style="margin:0;background:#fff"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" style="width:1200px;display:block"></body>`);
  await guidePage.waitForTimeout(500);
  await guidePage.screenshot({ path: path.join(OUT, "parametric-3-waffle-guide.png"), fullPage: true });
  console.log("saved docs/screenshots/parametric-3-waffle-guide.png");
  fs.rmSync(guide);
  await guidePage.close();
}).finally(() => cleanup());
