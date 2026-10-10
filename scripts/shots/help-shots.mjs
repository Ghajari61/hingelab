// Screenshots for the help centre, saved as public/help/shots/<name>.jpg.
// Usage: node scripts/shots/help-shots.mjs (dev server on :3456, or SHOTS_BASE).
import fs from "node:fs";
import path from "node:path";
import { BASE, withBrowser } from "./lib.mjs";

const OUT = path.resolve("public/help/shots");
fs.mkdirSync(OUT, { recursive: true });
const save = async (target, name) => {
  const file = path.join(OUT, `${name}.jpg`);
  await target.screenshot({ path: file, type: "jpeg", quality: 82 });
  console.log("saved", path.relative(process.cwd(), file), `${(fs.statSync(file).size / 1024).toFixed(0)} kB`);
};
const section = (page, title) => page.locator("details.sec").filter({ has: page.locator("summary", { hasText: new RegExp(`^${title}`) }) }).first();
async function open(page, title) {
  const sec = section(page, title);
  await sec.scrollIntoViewIfNeeded();
  if (!(await sec.evaluate((d) => d.open))) await sec.locator("summary").click();
  return sec;
}
const waitSliced = async (page) => {
  await page.waitForTimeout(400);
  await page.waitForFunction(() => /\d+ parts/.test(document.querySelector(".pe-stage")?.textContent ?? "") && !document.querySelector(".pe-progress"), null, { timeout: 120000 });
  await page.waitForTimeout(700);
};

await withBrowser(async (page) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem("hs")) { localStorage.clear(); sessionStorage.setItem("hs", "1"); } });
  await page.goto(`${BASE}/app/editor/local`);
  await page.waitForSelector(".start .start-tile");
  await page.waitForTimeout(500);
  await save(page, "start");

  await page.getByRole("button", { name: "Hinge Box", exact: true }).click();
  await page.waitForSelector(".gallery .gcard");
  await page.locator(".view-toggle").getByText("3D view").click();
  await page.waitForSelector(".stage-3d canvas");
  await page.waitForTimeout(1500);
  await save(page.locator(".stage"), "hinge-3d");
  await page.locator(".view-toggle").getByText("Sheets").click();

  await save(await open(page, "Layers"), "layers");

  const sheet = await open(page, "Sheet");
  await page.getByRole("combobox", { name: "Sheet preset" }).selectOption("bed-k40");
  await page.waitForSelector('.checks li.issue[data-code="TOO_BIG"]');
  await page.locator(".checks").scrollIntoViewIfNeeded();
  await save(page.locator(".checks"), "checks");
  await page.getByRole("group", { name: "Fit product to" }).getByRole("button", { name: "1 sheet" }).click();
  await page.waitForTimeout(400);
  await sheet.scrollIntoViewIfNeeded();
  await save(sheet, "sheet-fit");

  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: /Start page/ }).click();
  await page.getByRole("button", { name: "Letters", exact: true }).click();
  await page.waitForSelector(".gallery .gcard");
  await page.getByRole("textbox", { name: "Text" }).fill("Sam سام");
  await page.getByRole("textbox", { name: "Text" }).blur();
  await page.waitForSelector('.checks li.issue[data-code="MISSING_GLYPHS"]', { timeout: 30000 });
  await page.locator(".checks").scrollIntoViewIfNeeded();
  await save(page.locator(".checks"), "letters-checks");

  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: /Start page/ }).click();
  await page.getByRole("button", { name: "Parametric", exact: true }).click();
  await waitSliced(page);
  await page.getByRole("group", { name: "Slicing method" }).getByRole("button", { name: "Along a curve" }).click();
  await waitSliced(page);
  await page.getByRole("group", { name: "Outer outline" }).getByRole("button", { name: "Shape" }).click();
  await waitSliced(page);
  await page.getByRole("group", { name: "Outline shape" }).getByRole("button", { name: "Heart" }).click();
  await waitSliced(page);
  const pick = page.locator('[data-target="outline"]');
  await pick.scrollIntoViewIfNeeded();
  await save(pick, "shape-buttons");
}, { width: 1440, height: 1000 });
