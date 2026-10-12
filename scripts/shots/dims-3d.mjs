// 3D view: overall dimensions on the product (Hinge Box, Letters laid flat, a generator).
// Usage: node scripts/shots/dims-3d.mjs (dev server on BASE).
import { BASE, OUT, withBrowser } from "./lib.mjs";
import path from "node:path";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok" : "FAIL"} ${msg}`); if (!ok) failed++; };

await withBrowser(async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const dims = () => page.locator("#preview3d .dims3d text").allTextContents();
  const open3d = async () => {
    await page.getByRole("tab", { name: "3D view" }).click();
    await page.waitForSelector("#preview3d canvas", { state: "attached", timeout: 30000 });
    await page.waitForTimeout(1200);
  };
  const shot = async (name) => {
    const file = path.join(OUT, `dims-3d-${name}.png`);
    await page.locator("#preview3d").screenshot({ path: file });
    console.log("saved", file);
  };

  await page.goto(`${BASE}/`);
  await page.evaluate(() => localStorage.clear());
  await page.locator('a.product[href$="p=hinge"]').click();
  await page.waitForURL(/p=hinge/);
  const W = await page.getByLabel("Width", { exact: true }).inputValue();
  await open3d();
  let d = await dims();
  check(d.length === 3 && d.includes(`${W}.0 mm`), `Hinge Box: width, depth and height (${d.join(", ")}; Width field ${W})`);
  await shot("hinge-box");
  await page.locator('input[aria-label="Explode"]').fill("0.6");
  await page.waitForTimeout(400);
  check((await dims()).length === 0, "Hinge Box: no dimensions while exploded");
  await page.locator('input[aria-label="Explode"]').fill("0");
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Dimensions", exact: true }).click();
  await page.waitForTimeout(300);
  check((await dims()).length === 0, "the ruler button hides them");
  await page.getByRole("button", { name: "Dimensions", exact: true }).click();
  await page.waitForTimeout(300);
  check((await dims()).length === 3, "and shows them again");

  const product = async (id) => {
    await page.goto(`${BASE}/`);
    await page.locator(`a.product[href$="p=${id}"]`).first().click();
    await page.waitForURL(new RegExp(`p=${id}`));
  };
  await product("letters");
  await page.waitForSelector('[aria-label="Letters mode"]', { timeout: 15000 }).catch(async (e) => { await page.screenshot({ path: path.join(OUT, "dims-3d-debug.png") }); throw e; });
  await page.locator('[aria-label="Letters mode"] button[data-v="solid"]').click();
  await page.fill('textarea[aria-label="Text"]', "Stencil");
  await page.locator('textarea[aria-label="Text"]').blur();
  await page.waitForTimeout(1500);
  await open3d();
  await page.getByRole("button", { name: "Lay flat" }).click();
  await page.getByRole("button", { name: "Top view" }).click();
  await page.waitForTimeout(900);
  d = await dims();
  check(d.length === 2 && d.every((t) => /^\d+\.\d mm$/.test(t)), `Letters laid flat, top view: width and depth only (${d.join(", ")})`);
  await shot("letters-flat-top");

  await product("trophy");
  await page.waitForTimeout(2500);
  await open3d();
  d = await dims();
  check(d.length === 3, `Trophy: three dimensions (${d.join(", ")})`);
  await shot("trophy");
  check(errors.length === 0, `no page errors ${errors.join(" | ")}`);
}, { width: 1440, height: 900 });
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
