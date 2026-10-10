// UX U1 (D80): light theme by default and the product shell — gallery rail, Sheets / 3D switch,
// zoom HUD with view tools, sliders in the dock, export pinned under the dock.
import { BASE, shot, withBrowser } from "./lib.mjs";

const check = (ok, msg) => { if (!ok) throw new Error("FAILED: " + msg); console.log("ok", msg); };

await withBrowser(async (page) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem("u1")) { localStorage.clear(); sessionStorage.setItem("u1", "1"); } });
  await page.goto(`${BASE}/app/editor/local?p=hinge`);
  await page.waitForSelector(".gallery .gcard");
  check(await page.evaluate(() => document.documentElement.dataset.theme) === "light", "light theme by default");
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector(".menubar")).backgroundColor);
  check(bg === "rgb(255, 255, 255)", `white header (${bg})`);

  check(await page.getByRole("group", { name: "Box shape" }).getByRole("button").count() === 4, "four shape cards");
  await page.getByRole("group", { name: "Lid type" }).getByRole("button", { name: "Fixed lid" }).click();
  check(await page.getByRole("group", { name: "Lid type" }).getByRole("button", { name: "Fixed lid" }).getAttribute("aria-pressed") === "true", "lid card selects");
  check(await page.getByRole("button", { name: "Undo" }).isEnabled(), "undo is enabled after a change");
  await page.getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(200);
  check(await page.getByRole("group", { name: "Lid type" }).getByRole("button", { name: "Removable lid" }).getAttribute("aria-pressed") === "true", "undo restores the lid");

  const slider = page.getByRole("slider", { name: "Width slider", exact: true });
  check(await slider.count() === 1, "width has a slider");
  const box = await slider.boundingBox();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
  await page.waitForTimeout(300);
  const w = await page.locator('.fld[data-id="W"] input').inputValue();
  check(Number(w) > 10, `slider sets the width (${w})`);
  await page.getByRole("button", { name: "Fit sheet" }).click();
  await page.waitForTimeout(300);
  await shot(page, "ux-u1-hinge-sheets");

  await page.getByRole("tab", { name: "3D" }).click();
  await page.waitForSelector(".stage-3d #preview3d canvas", { timeout: 30000 });
  await page.waitForTimeout(800);
  check(await page.locator(".stage-3d #preview3d canvas").isVisible(), "3D view shows the assembled box");
  await shot(page, "ux-u1-hinge-3d");
  await page.getByRole("tab", { name: /Sheets/ }).click();

  await page.getByRole("button", { name: "Letters", exact: true }).click();
  await page.waitForSelector('[aria-label="Letters mode"]');
  await page.waitForFunction(() => !/Loading font/.test(document.querySelector(".canvas")?.textContent ?? ""), null, { timeout: 30000 });
  await page.getByRole("button", { name: "Fit sheet" }).click();
  await page.waitForTimeout(500);
  await shot(page, "ux-u1-letters-sheets");
  await page.getByRole("tab", { name: "3D" }).click();
  await page.waitForSelector("#preview3d canvas", { timeout: 30000 });
  await page.waitForTimeout(800);
  await shot(page, "ux-u1-letters-3d");

  await page.getByRole("button", { name: "Parametric", exact: true }).click();
  await page.waitForFunction(() => /\d+ parts/.test(document.querySelector(".pe-stage")?.textContent ?? ""), null, { timeout: 90000 });
  await page.waitForTimeout(800);
  await shot(page, "ux-u1-parametric-3d");
  await page.getByRole("tab", { name: /Sheets/ }).click();
  await page.waitForTimeout(800);
  await shot(page, "ux-u1-parametric-sheets");

  await page.evaluate(() => { localStorage.setItem("hingelab-prefs", JSON.stringify({ theme: "dark", themeChosen: true })); });
  await page.reload();
  await page.waitForSelector(".gallery .gcard");
  check(await page.evaluate(() => document.documentElement.dataset.theme) === "dark", "a chosen dark theme still applies");
  await shot(page, "ux-u1-parametric-dark");
});
