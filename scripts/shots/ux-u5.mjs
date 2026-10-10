// UX U5 (D84): shared three.js 3D view — ground and shadows, orbit, view cube, material looks,
// explode and lay flat — for Hinge Box (replacing the SVG preview) and Letters.
import { BASE, shot, withBrowser } from "./lib.mjs";

const check = (ok, msg) => { if (!ok) throw new Error("FAILED: " + msg); console.log("ok", msg); };
const settle = (page, ms = 700) => page.waitForTimeout(ms);
const cubeTransform = (page) => page.locator(".vcube").evaluate((el) => el.style.transform);

await withBrowser(async (page) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem("u5")) { localStorage.clear(); sessionStorage.setItem("u5", "1"); } });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/app/editor/local?p=hinge`);
  await page.waitForSelector(".gallery .gcard");
  check(await page.locator("#preview3d").count() === 0, "three.js is not loaded until the 3D view opens");

  await page.getByRole("tab", { name: "3D" }).click();
  await page.waitForSelector("#preview3d canvas", { timeout: 30000 });
  await settle(page, 1200);
  check(await page.locator("#preview3d canvas").count() === 1, "the Hinge Box 3D view is a WebGL canvas");
  check(await page.getByRole("group", { name: "Views" }).getByRole("button").count() === 5, "view buttons: perspective, top, front, side, fit");
  await shot(page, "ux-u5-hinge-3d");

  const before = await cubeTransform(page);
  await page.getByRole("group", { name: "Views" }).getByRole("button", { name: "Top", exact: true }).click();
  await settle(page);
  check((await cubeTransform(page)) !== before, "Top turns the camera and the view cube follows");
  await shot(page, "ux-u5-hinge-top");
  await page.getByRole("button", { name: "Front view" }).click();
  await settle(page);
  await page.getByRole("button", { name: "Perspective view" }).click();
  await settle(page);

  await page.locator(".hud3d .explode input[type=range]").fill("1");
  await settle(page);
  await shot(page, "ux-u5-hinge-exploded");
  await page.locator(".hud3d .explode input[type=range]").fill("0");

  await page.getByRole("group", { name: "3D layout" }).getByRole("button", { name: "Lay flat" }).click();
  await settle(page, 900);
  check(await page.locator(".hud3d .explode").count() === 0, "Lay flat hides the explode slider");
  await shot(page, "ux-u5-hinge-flat");
  await page.getByRole("group", { name: "3D layout" }).getByRole("button", { name: "Assembled" }).click();

  await page.getByRole("combobox", { name: "Material preset" }).selectOption("acr3");
  await settle(page, 900);
  await shot(page, "ux-u5-hinge-acrylic");

  await page.getByRole("button", { name: "Letters", exact: true }).click();
  await page.waitForSelector('[aria-label="Letters mode"]');
  await page.locator('[aria-label="Letters mode"] button[data-v="box"]').click();
  await page.getByRole("tab", { name: "3D" }).click();
  await page.waitForSelector("#preview3d canvas", { timeout: 30000 });
  await settle(page, 2000);
  check(await page.getByRole("group", { name: "Views" }).count() === 1, "Letters uses the same 3D stage");
  await shot(page, "ux-u5-letters-3d");
  await page.getByRole("group", { name: "3D layout" }).getByRole("button", { name: "Lay flat" }).click();
  await settle(page, 1200);
  await shot(page, "ux-u5-letters-flat");
});
