// Parametric P4 (radial + along a curve): a radial-formula sunburst, a radial vase lamp shade, and
// the leaf-shaped wall clock built with "Along a curve" from formulas only, plus its assembly guide.
import fs from "node:fs";
import path from "node:path";
import { BASE, OUT, shot, withBrowser } from "./lib.mjs";

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
const dockText = async (page) => (await page.locator(".dock").textContent()).replace(/\s+/g, " ");

await withBrowser(async (page) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem("p4")) { localStorage.clear(); sessionStorage.setItem("p4", "1"); } });
  await page.goto(`${BASE}/app/editor/local`);
  await page.getByRole("button", { name: "Parametric", exact: true }).click();
  let s = await waitSliced(page);

  // Radial vase: a lamp shade round the upright axis.
  await page.locator('select[aria-label="Library model"]').selectOption("vase");
  s = await waitSliced(page, s);
  await method(page, "Radial");
  s = await waitSliced(page, s);
  await page.getByRole("group", { name: "Fins turn round" }).getByRole("button", { name: "Upright (Y)" }).click();
  s = await waitSliced(page, s);
  await page.getByRole("group", { name: "Hub rings" }).getByRole("button", { name: "Both ends" }).click();
  s = await waitSliced(page, s);
  let dock = await dockText(page);
  assert(/24 fins round Y/.test(dock), "method meta names the radial fins");
  await page.locator('input[aria-label="Part"]').fill("0");
  await page.waitForTimeout(400);
  dock = await dockText(page);
  assert(/Radial fin/.test(dock), "slice inspector shows a radial fin");
  await page.locator('input[aria-label="Explode"]').fill("0.5");
  await page.waitForTimeout(1000);
  await shot(page, "parametric-4-radial-vase-3d");

  // Radial formula: a sunburst drawn straight from z = f(theta, s).
  await page.getByRole("group", { name: "Fin shape from" }).getByRole("button", { name: "Radial formula" }).click();
  s = await waitSliced(page, s);
  dock = await dockText(page);
  assert(/Radial profile formula/.test(dock) && /24 fins round Z/.test(dock), "radial formula source and Z axis");
  await page.locator('input[aria-label="Explode"]').fill("0");
  await page.waitForTimeout(1000);
  await shot(page, "parametric-4-radial-sunburst-3d");

  // Leaf clock, along a curve, formulas only.
  await method(page, "Along a curve");
  s = await waitSliced(page, s);
  await page.getByRole("button", { name: "Load the leaf clock" }).click();
  s = await waitSliced(page, s);
  const parts = Number(/(\d+) parts/.exec(s)[1]);
  assert(parts > 40, `leaf clock: ${s}`);
  dock = await dockText(page);
  assert(/Formulas only/.test(dock) && /56 fins round a 120 mm × 76 mm oval/.test(dock), "leaf clock meta");
  assert(!/Fins touch/.test(dock), "no fins touch on the leaf clock");
  const modelBox = await page.locator(".pe-hud").textContent();
  assert(/Model/.test(modelBox), "3D toggles present");
  await page.waitForTimeout(800);
  await shot(page, "parametric-4-leaf-clock-3d");
  await page.locator('input[aria-label="Explode"]').fill("0.6");
  await page.waitForTimeout(1000);
  await shot(page, "parametric-4-leaf-clock-exploded");
  await page.locator('input[aria-label="Explode"]').fill("0");
  await page.getByRole("tab", { name: /Sheets/ }).click();
  await page.waitForTimeout(1200);
  await shot(page, "parametric-4-leaf-clock-sheets");

  const guide = await download(page, () => page.getByRole("button", { name: "Assembly guide" }).click());
  const svg = fs.readFileSync(guide, "utf8");
  assert(svg.includes("clock insert") && svg.includes("fins along a curve") && !/NaN/.test(svg), "leaf clock assembly guide saved");
  const guidePage = await page.context().newPage();
  await guidePage.setViewportSize({ width: 1200, height: 1400 });
  await guidePage.setContent(`<body style="margin:0;background:#fff"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" style="width:1200px;display:block"></body>`);
  await guidePage.waitForTimeout(500);
  await guidePage.screenshot({ path: path.join(OUT, "parametric-4-leaf-clock-guide.png"), fullPage: true });
  console.log("saved docs/screenshots/parametric-4-leaf-clock-guide.png");
  fs.rmSync(guide);
  await guidePage.close();
});
