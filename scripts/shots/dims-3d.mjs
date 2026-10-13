// The web 3D workspace (shared with the desktop app): four views, toolbar, display modes and
// overall dimensions on Hinge Box, Letters laid flat, a generator and Parametric.
// Usage: node scripts/shots/dims-3d.mjs (dev server on BASE).
import { BASE, OUT, withBrowser } from "./lib.mjs";
import path from "node:path";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok" : "FAIL"} ${msg}`); if (!ok) failed++; };

await withBrowser(async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const view = "#preview3d";
  const dims = (pane) => page.locator(`${view} ${pane ? `[data-pane="${pane}"] ` : ""}.v3-dims text`).allTextContents();
  const labels = () => page.locator(`${view} .v3-pane:not([hidden]) .v3-label`).allTextContents();
  const tool = (name) => page.getByRole("toolbar", { name: "3D view" }).getByRole("button", { name, exact: true });
  const open3d = async () => {
    await page.getByRole("tab", { name: "3D view" }).click();
    await page.waitForSelector(`${view} canvas.v3-gl`, { state: "attached", timeout: 30000 });
    await page.waitForTimeout(1200);
  };
  const shot = async (name, sel = ".stage") => {
    const file = path.join(OUT, `web-3d-${name}.png`);
    await page.locator(sel).first().screenshot({ path: file });
    console.log("saved", file);
  };

  await page.goto(`${BASE}/`);
  await page.evaluate(() => localStorage.clear());
  await page.locator('a.product[href$="p=hinge"]').click();
  await page.waitForURL(/p=hinge/);
  const W = await page.getByLabel("Width", { exact: true }).inputValue();
  await open3d();
  let l = await labels();
  check(l.join(",") === "[Top] [Shaded],[Front] [Shaded],[Left] [Shaded],[Perspective] [Shaded]", `Hinge Box: four views (${l.join(", ")})`);
  let d = await dims("persp");
  check(d.length === 3 && d.includes(`${W}.0 mm`), `Hinge Box: width, depth and height in perspective (${d.join(", ")}; Width field ${W})`);
  check((await dims("top")).length === 2 && (await dims("front")).length === 2, "two dimensions on the Top and Front views");
  const bar = await page.locator(".view-bar").boundingBox(), pane = await page.locator(`${view} [data-pane="top"]`).boundingBox();
  check(bar && pane && pane.y >= bar.y + bar.height, "the views start below the toolbar");
  await shot("hinge-quad");
  await page.locator('input[aria-label="Explode"]').fill("0.6");
  await page.waitForTimeout(400);
  check((await dims()).length === 0, "Hinge Box: no dimensions while exploded");
  await page.locator('input[aria-label="Explode"]').fill("0");
  await page.waitForTimeout(400);
  await tool("Dimensions").click();
  await page.waitForTimeout(300);
  check((await dims()).length === 0, "the ruler button hides them");
  await tool("Dimensions").click();
  await page.waitForTimeout(300);
  check((await dims("persp")).length === 3, "and shows them again");
  await tool("Edges").click();
  await tool("Maximize the active view").click();
  await page.waitForTimeout(500);
  l = await labels();
  check(l.join(",") === "[Perspective] [Edged faces]", `one view, edged faces (${l.join(", ")})`);
  await shot("hinge-single-edges");
  await page.locator(view).focus();
  await page.keyboard.press("Alt+w");
  await page.waitForTimeout(300);
  check((await labels()).length === 4, "Alt+W brings back the four views");
  await page.locator(`${view} [data-pane="persp"] .v3-hit`).click({ position: { x: 200, y: 160 } });
  await page.waitForTimeout(300);
  const pick = await page.locator(`${view} .v3-pick`).textContent().catch(() => null);
  console.log("  pick:", pick);
  await page.keyboard.press("F4");
  await page.waitForTimeout(200);
  check((await labels())[0] === "[Top] [Shaded]", "F4 switches back to shaded");
  await page.reload();
  await open3d();
  check((await labels()).length === 4, "the layout is remembered");

  const product = async (id) => {
    await page.goto(`${BASE}/`);
    await page.locator(`a.product[href$="p=${id}"]`).first().click();
    await page.waitForURL(new RegExp(`p=${id}`));
  };
  await product("letters");
  await page.waitForSelector('[aria-label="Letters mode"]', { timeout: 15000 });
  await page.locator('[aria-label="Letters mode"] button[data-v="solid"]').click();
  await page.fill('textarea[aria-label="Text"]', "Stencil");
  await page.locator('textarea[aria-label="Text"]').blur();
  await page.waitForTimeout(1500);
  await open3d();
  await tool("Lay flat").click();
  await page.waitForTimeout(900);
  d = await dims("top");
  check(d.length === 2 && d.every((t) => /^\d+\.\d mm$/.test(t)), `Letters laid flat, top view: width and depth only (${d.join(", ")})`);
  check(await page.locator('input[aria-label="Explode"]').count() === 0, "no explode slider while laid flat");
  await shot("letters-flat");

  await product("trophy");
  await page.waitForTimeout(2500);
  await open3d();
  d = await dims("persp");
  check(d.length === 3, `Trophy: three dimensions (${d.join(", ")})`);
  await shot("trophy");

  await product("parametric");
  await page.waitForSelector('[data-testid="parametric-view"] canvas.v3-gl', { state: "attached", timeout: 30000 });
  await page.waitForTimeout(4000);
  l = await page.locator('[data-testid="parametric-view"] .v3-pane:not([hidden]) .v3-label').allTextContents();
  check(l.length === 4, `Parametric: four views (${l.join(", ")})`);
  const pd = await page.locator('[data-testid="parametric-view"] [data-pane="persp"] .v3-dims text').allTextContents();
  check(pd.length === 3, `Parametric: dimensions (${pd.join(", ")})`);
  check(await page.getByRole("group", { name: "Show" }).getByRole("button").count() >= 3, "Parametric: Model, Planes and Parts in the toolbar");
  await shot("parametric");
  check(errors.length === 0, `no page errors ${errors.join(" | ")}`);
}, { width: 1440, height: 900 });
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
