// Letters L4: three.js preview, lifted lid, marquee light holes, Persian box, Analysis panel.
import path from "node:path";
import { BASE, OUT, shot, withBrowser } from "./lib.mjs";

const assert = (cond, msg) => { if (!cond) throw new Error("FAILED: " + msg); console.log("ok -", msg); };
const el = async (page, sel, name) => {
  await page.locator(sel).first().screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log("saved", `docs/screenshots/${name}.png`);
};
const settle = (page) => page.waitForTimeout(1500);

await withBrowser(async (page) => {
  await page.goto(`${BASE}/app/editor/local`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Letters", exact: true }).click();
  await page.waitForSelector('[aria-label="Letters mode"]');
  await page.locator('[aria-label="Letters mode"] button[data-v="box"]').click();
  await page.fill('textarea[aria-label="Text"]', "Sam");
  await page.locator('textarea[aria-label="Text"]').blur();
  await page.getByRole("tab", { name: "3D" }).click();
  await page.waitForSelector("#preview3d canvas", { timeout: 30000 });
  await settle(page);
  assert(await page.locator("#preview3d canvas").count() === 1, "the 3D preview renders one WebGL canvas");
  const lit = await page.evaluate(() => {
    const c = document.querySelector("#preview3d canvas");
    const gl = c.getContext("webgl2", { preserveDrawingBuffer: true }) || c.getContext("webgl");
    return !!gl;
  });
  assert(lit, "WebGL context is available");
  await page.getByRole("button", { name: "Fit sheet" }).click().catch(() => {});
  await shot(page, "letters-4-box-3d");
  await el(page, "#preview3d", "letters-4-preview-sam");

  await page.locator(".explode input[type=range]").fill("1");
  await settle(page);
  await el(page, "#preview3d", "letters-4-preview-lid-lifted");

  await page.getByLabel(/Marquee light holes/).check();
  await settle(page);
  const analysis = await page.locator(".dock").innerText();
  assert(/light holes of 12 mm go through the lid/.test(analysis), "Analysis reports the light holes");
  await el(page, "#preview3d", "letters-4-preview-marquee");
  await page.getByRole("tab", { name: /Sheets/ }).click();
  await page.getByRole("button", { name: "Fit sheet" }).click().catch(() => {});
  await page.waitForTimeout(400);
  await shot(page, "letters-4-marquee-sheet");

  await page.getByText("To check", { exact: true }).or(page.getByText("Notes", { exact: true })).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shot(page, "letters-4-analysis");

  await page.fill('textarea[aria-label="Text"]', "سام");
  await page.locator('textarea[aria-label="Text"]').blur();
  await page.locator('.fontpick > button[aria-haspopup="listbox"]').click();
  await page.locator('[aria-label="Fonts"] [role="option"]', { hasText: "Vazirmatn" }).first().click();
  await page.getByLabel(/Marquee light holes/).uncheck();
  await page.getByRole("tab", { name: "3D" }).click();
  await page.locator(".explode input[type=range]").fill("0");
  await page.waitForTimeout(3000);
  await el(page, "#preview3d", "letters-4-preview-persian");
});
