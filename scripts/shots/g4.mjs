// G4 (D92): Boxes — presets with three-quarter thumbnails, the finger-joint box in 3D, a tray's
// compartment check and its fix, the bird house and phone stand in 3D, export, help.
import { promises as fs } from "node:fs";
import { BASE, shot, withBrowser } from "./lib.mjs";

const check = (ok, msg) => { if (!ok) throw new Error("FAILED: " + msg); console.log("ok", msg); };
const drawn = (page) => page.waitForFunction(() => document.querySelectorAll(".canvas svg path").length > 4 && !document.querySelector(".canvas-error"), null, { timeout: 60000 });
const stat = (page, label) => page.locator(`.gen-stats > div:has(dt:text-is("${label}")) dd`).textContent();
const codes = (page) => page.locator(".checks li.issue").evaluateAll((els) => els.map((e) => e.dataset.code));
const card = (page, group, text) => page.locator(".gallery section, .gallery .ggroup, .gallery").filter({ hasText: group }).locator(".gcard").filter({ hasText: new RegExp(`^${text}$`) }).first();
const setNum = async (page, key, v) => {
  const el = page.locator(`[id="f_${key}"]`);
  await el.fill(String(v));
  await el.blur();
};
async function view3d(page, name) {
  await page.getByRole("tab", { name: "3D" }).click();
  await page.waitForSelector("#preview3d canvas", { timeout: 60000 });
  await page.waitForTimeout(1500);
  await shot(page, name);
  await page.getByRole("tab", { name: "Sheets" }).click();
}

await withBrowser(async (page) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem("g4")) { localStorage.clear(); sessionStorage.setItem("g4", "1"); } });
  await page.goto(`${BASE}/app/editor/local`);
  await page.waitForSelector(".start-tile");
  check((await page.locator(".gen-tile").filter({ hasText: "Boxes" }).count()) === 1, "a Boxes tile sits under Generators");
  const thumbs = page.locator('img[src^="/presets/boxes/"]');
  check((await thumbs.count()) >= 12, `Boxes presets show thumbnails (${await thumbs.count()})`);
  await thumbs.first().scrollIntoViewIfNeeded();
  await shot(page, "g4-start");

  // The small box: inside sizes, outside size reported, and its panels in 3D.
  await page.locator('img[src="/presets/boxes/small-box.svg"]').first().click();
  await page.waitForSelector('.gen-app[data-generator="boxes"]');
  await drawn(page);
  await page.waitForTimeout(300);
  const outside = await stat(page, "Outside");
  check(outside === "126 × 86 × 66 mm", `120 × 80 × 60 inside is 126 × 86 × 66 outside in 3 mm (${outside})`);
  check((await stat(page, "Inside")) === "120 × 80 × 60 mm", "the inside size is kept");
  await shot(page, "g4-box");
  await view3d(page, "g4-box-3d");

  // A tray with compartments too small for fingers, and its fix.
  await card(page, "Design", "Tray").click();
  await drawn(page);
  await setNum(page, "tray.width", 100);
  await setNum(page, "tray.cols", 6);
  await page.waitForSelector('.checks li.issue[data-code="SMALL_COMPARTMENTS"]');
  check(true, "six compartments across 100 mm are flagged");
  await page.locator('.checks li.issue[data-code="SMALL_COMPARTMENTS"]').scrollIntoViewIfNeeded();
  await shot(page, "g4-tray-check");
  await page.locator('.checks li.issue[data-code="SMALL_COMPARTMENTS"]').getByRole("button").first().click();
  await page.waitForTimeout(500);
  check(!(await codes(page)).includes("SMALL_COMPARTMENTS"), "its fix (fewer compartments) clears it");
  check(/^\d × 2, each/.test(await stat(page, "Compartments")), "the tray reports its compartments");

  // The bird house in 3D, then exported.
  await card(page, "Design", "Bird house").click();
  await drawn(page);
  check(/32 mm/.test(await stat(page, "Entrance")), "the bird house reports its entrance");
  await view3d(page, "g4-bird-3d");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Control+e")]);
  const svg = await fs.readFile(await dl.path(), "utf8");
  const outlines = (svg.match(/<path /g) ?? []).length;
  check(/^birdhouse-.*\.svg$/.test(dl.suggestedFilename()) && outlines >= 7, `the bird house exports (${dl.suggestedFilename()}, ${outlines} paths)`);

  // The phone stand in 3D.
  await card(page, "Design", "Phone stand").click();
  await drawn(page);
  check((await stat(page, "Lean")) === "65°", "the phone stand leans 65°");
  await view3d(page, "g4-stand-3d");

  // Help.
  await page.locator(".dock").getByRole("button", { name: "Help: Phone stand", exact: true }).click();
  const frame = page.frameLocator(".help-drawer iframe");
  await frame.locator("h1", { hasText: "Boxes" }).waitFor({ timeout: 15000 }).catch(() => {});
  const h1 = await frame.locator("h1").textContent();
  check(/Boxes/.test(h1), `the ? opens the Boxes article (${h1})`);
  await frame.locator('.help-field[data-field="stand.angle"]').waitFor();
  check(true, "it lists the Boxes fields");
});

// The default box straight from the URL.
await withBrowser(async (page) => {
  await page.goto(`${BASE}/app/editor/local?p=boxes`);
  await page.waitForSelector('.gen-app[data-generator="boxes"]');
  await drawn(page);
  await page.waitForTimeout(600);
  await shot(page, "g4-default");
});
