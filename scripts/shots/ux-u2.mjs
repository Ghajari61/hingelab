// UX U2 (D81): the guest editor opens on a product and preset gallery; undo/redo on the gallery rail;
// section resets and an undoable Reset all; units in the dock header; presets apply as one undo step.
import { BASE, shot, withBrowser } from "./lib.mjs";

const check = (ok, msg) => { if (!ok) throw new Error("FAILED: " + msg); console.log("ok", msg); };

await withBrowser(async (page) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem("u2")) { localStorage.clear(); sessionStorage.setItem("u2", "1"); } });
  await page.goto(`${BASE}/app/editor/local`);
  await page.waitForSelector(".start .start-tile");
  check(await page.locator(".start-tile").count() === 3, "three product tiles");
  for (const name of ["Hinge Box", "Letters", "Parametric"]) {
    const n = await page.getByRole("region", { name: `${name} presets` }).locator(".preset-card").count();
    check(n >= 12, `${name} has ${n} presets`);
  }
  await shot(page, "ux-u2-start");

  await page.getByRole("button", { name: "Hinge Box", exact: true }).click();
  await page.waitForSelector(".gallery .gcard");
  check(new URL(page.url()).searchParams.get("p") === "hinge", "the product is kept in ?p=");
  const w = page.locator('.fld[data-id="W"] input');
  await w.fill("200");
  await w.press("Tab");
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Reset Dimensions section" }).click();
  await page.waitForTimeout(200);
  check(await w.inputValue() === "140", "section reset restores the width");
  await page.locator(".gallery-head").getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(200);
  check(await w.inputValue() === "200", "undo brings the width back");

  await page.getByRole("button", { name: "Reset all" }).click();
  check(await page.getByRole("dialog", { name: "Reset all settings" }).isVisible(), "Reset all asks first");
  await shot(page, "ux-u2-reset-all");
  await page.getByRole("dialog", { name: "Reset all settings" }).getByRole("button", { name: "Reset" }).click();
  await page.waitForTimeout(200);
  check(await w.inputValue() === "140", "Reset all restores the defaults");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(200);
  check(await w.inputValue() === "200", "Reset all is undoable");

  await page.locator(".dock-head").getByRole("button", { name: "inch" }).click();
  await page.waitForTimeout(200);
  const inch = Number(await w.inputValue());
  check(Math.abs(inch - 200 / 25.4) < 0.05, `units switch in the dock header (${inch} in)`);
  await page.locator(".dock-head").getByRole("button", { name: "mm" }).click();

  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: /Start page/ }).click();
  await page.waitForSelector(".start");
  check(!new URL(page.url()).searchParams.get("p"), "Start page clears ?p=");
  check(/Continue/.test(await page.getByRole("button", { name: "Hinge Box", exact: true }).textContent()), "the tile offers to continue the saved box");

  await page.locator('[data-preset="pencil-cup"]').click();
  await page.waitForSelector(".gallery .gcard");
  await page.waitForTimeout(300);
  check(await page.locator('[aria-label="Box shape"] [data-v="cyl"]').getAttribute("aria-pressed") === "true", "the preset opens as a cylinder");
  await shot(page, "ux-u2-preset-hinge");
  await page.locator(".gallery-head").getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(200);
  check(await w.inputValue() === "200", "undo returns to the design before the preset");

  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: /Start page/ }).click();
  await page.locator('[data-preset="open-stencil"]').click();
  await page.waitForSelector('[aria-label="Letters mode"]');
  await page.waitForFunction(() => !/Loading font/.test(document.querySelector(".canvas")?.textContent ?? ""), null, { timeout: 30000 });
  check(await page.locator('[aria-label="Letters mode"] [data-v="stencil"]').getAttribute("aria-pressed") === "true", "Letters preset opens in Stencil mode");
  await page.waitForTimeout(500);
  await shot(page, "ux-u2-preset-letters");

  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: /Start page/ }).click();
  await page.locator('[data-preset="sphere-waffle"]').click();
  await page.waitForFunction(() => /\d+ parts/.test(document.querySelector(".pe-stage")?.textContent ?? ""), null, { timeout: 90000 });
  check(await page.locator('[aria-label="Slicing method"] [data-v="waffle"]').getAttribute("aria-pressed") === "true", "Parametric preset opens as Waffle");
  await page.waitForTimeout(800);
  await shot(page, "ux-u2-preset-parametric");

  await page.reload();
  await page.waitForSelector(".gallery .gcard");
  check(new URL(page.url()).searchParams.get("p") === "parametric", "a reload stays in the editor");
});
