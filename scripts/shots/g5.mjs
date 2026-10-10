// G5 (D93): lamina ideas — the Folded (papercraft) method with its preset, nets in 3D and on sheets,
// the calibration bar, and a generator nested by outline with part labels and the calibration bar.
import fs from "node:fs";
import path from "node:path";
import { BASE, OUT, shot, signInAsPro, withBrowser } from "./lib.mjs";

const check = (ok, msg) => { if (!ok) throw new Error("FAILED: " + msg); console.log("ok", msg); };
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
  const text = fs.readFileSync(file, "utf8");
  fs.rmSync(file);
  return { name: d.suggestedFilename(), text };
};
const layerPaths = (svg, label) => {
  const m = new RegExp(`inkscape:label="[^"]*${label}"[^>]*>([\\s\\S]*?)</g>`).exec(svg);
  return m ? (m[1].match(/<path /g) ?? []).length : 0;
};
const dockText = async (page) => (await page.locator(".dock").textContent()).replace(/\s+/g, " ");
const openSec = (page, title) => page.locator(".dock details.sec").evaluateAll((els, t) => { for (const d of els) if (d.querySelector("summary")?.textContent?.trim().startsWith(t)) d.open = true; }, title);
const drawn = (page) => page.waitForFunction(() => document.querySelectorAll(".canvas svg path").length > 4 && !document.querySelector(".canvas-error"), null, { timeout: 60000 });

let cleanup = async () => {};
await withBrowser(async (page) => {
  cleanup = await signInAsPro(page, "g5");
  await page.addInitScript(() => { if (!sessionStorage.getItem("g5")) { localStorage.clear(); sessionStorage.setItem("g5", "1"); } });
  await page.goto(`${BASE}/app/editor/local`);
  await page.waitForSelector(".start-tile");
  const card = page.locator('[data-preset="folded-sphere"]').first();
  await card.scrollIntoViewIfNeeded();
  check(await card.locator('img[src="/presets/parametric/folded-sphere.svg"]').count() === 1, "the Papercraft ball preset shows its net thumbnail");
  await card.click();
  let s = await waitSliced(page);
  check(await page.locator('[aria-label="Slicing method"] [data-v="folded"]').getAttribute("aria-pressed") === "true", "the preset opens with the Folded method");
  const dock = await dockText(page);
  check(/80 faces/.test(dock), "the method line names the 80 faces");
  check(/Score lines/.test(dock), "the Layers panel lists Score lines");
  await page.locator('input[aria-label="Explode"]').fill("0.5").catch(() => {});
  await page.waitForTimeout(1200);
  await shot(page, "g5-folded-3d");
  await page.locator('input[aria-label="Explode"]').fill("0").catch(() => {});
  await page.getByRole("tab", { name: /Sheets/ }).click();
  await page.waitForTimeout(1200);
  await shot(page, "g5-folded-sheets");

  const plain = await download(page, () => page.getByRole("button", { name: "Export this sheet (SVG)" }).click());
  const folds = layerPaths(plain.text, "Score lines");
  check(folds > 20 && !/NaN/.test(plain.text), `the sheet exports with ${folds} score lines (${plain.name})`);

  // The calibration bar on every sheet.
  await openSec(page, "Material");
  await page.getByRole("checkbox", { name: "Calibration bar on every sheet" }).check();
  s = await waitSliced(page, s);
  const cal = await download(page, () => page.getByRole("button", { name: "Export this sheet (SVG)" }).click());
  check(layerPaths(cal.text, "Score lines") >= folds + 15, "the calibration bar adds its scored scale");
  await page.waitForTimeout(600);
  await shot(page, "g5-folded-calibration");

  // The head as a papercraft model.
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: /Start page/ }).click();
  await page.locator('[data-preset="folded-head"]').first().click();
  s = await waitSliced(page, s);
  check(Number(/(\d+) parts/.exec(s)[1]) >= 2, `the folded head unfolds into nets (${s})`);
  await page.getByRole("tab", { name: "3D" }).click().catch(() => {});
  await page.waitForTimeout(1500);
  await shot(page, "g5-folded-head-3d");
}).finally(() => cleanup());

// A generator nested by outline, with part labels and the calibration bar.
await withBrowser(async (page) => {
  await page.goto(`${BASE}/app/editor/local?p=boxes`);
  await page.waitForSelector('.gen-app[data-generator="boxes"]');
  await drawn(page);
  await openSec(page, "Sheet");
  await page.getByRole("group", { name: "Nesting" }).getByRole("button", { name: "By outline" }).click();
  await page.getByRole("checkbox", { name: "Calibration bar on every sheet" }).check();
  await page.getByRole("checkbox", { name: "Part labels" }).check();
  await page.waitForTimeout(800);
  await drawn(page);
  const svg = (await download(page, () => page.keyboard.press("Control+e"))).text;
  check(/Calibration bar/.test(svg), "the export carries the calibration bar");
  check(layerPaths(svg, "Score lines") > 20, "part labels and the scale go on the Score lines layer");
  check(!/NaN|undefined/.test(svg), "the export is clean");
  await page.locator(".dock").getByRole("checkbox", { name: "Part labels" }).scrollIntoViewIfNeeded();
  await shot(page, "g5-boxes-outline");
});
