// Canvas zoom HUD: every button reacts (zoom in/out, actual size, fit, grid, zoom and hand tools)
// and dragging the sheet still pans. Usage: node scripts/shots/canvas-hud.mjs (dev server on BASE).
import { BASE, withBrowser } from "./lib.mjs";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok" : "FAIL"} ${msg}`); if (!ok) failed++; };

for (const p of ["hinge", "letters", "parametric", "boxes", "clock"]) {
  await withBrowser(async (page) => {
    await page.goto(`${BASE}/app/editor/local?p=${p}`);
    if (p === "parametric") {
      await page.getByRole("tab", { name: /Sheets/ }).waitFor();
      await page.waitForTimeout(1500);
      await page.getByRole("tab", { name: /Sheets/ }).click();
    }
    await page.waitForSelector(".canvas-hud .hud-pct");
    await page.waitForTimeout(1500);
    const hud = (l) => page.locator(`.canvas-hud [aria-label="${l}"]`);
    const pct = async () => Number.parseInt(await page.locator(".canvas-hud .hud-pct").innerText());
    const settle = () => page.waitForTimeout(150);

    const a = await pct();
    await hud("Zoom in").click(); await settle();
    const b = await pct(); check(b > a, `${p}: Zoom in ${a}% → ${b}%`);
    await hud("Zoom out").click(); await settle();
    const c = await pct(); check(c < b, `${p}: Zoom out ${b}% → ${c}%`);
    await page.locator(".canvas-hud .hud-pct").click(); await settle();
    check(await pct() === 100, `${p}: percentage button goes to actual size`);
    await hud("Fit sheet").click(); await settle();
    check(await pct() === a, `${p}: Fit sheet returns to ${a}%`);
    const g0 = await hud("Grid").getAttribute("aria-pressed");
    await hud("Grid").click(); await settle();
    check(await hud("Grid").getAttribute("aria-pressed") !== g0, `${p}: Grid toggles`);
    await hud("Zoom tool").click(); await settle();
    check(await hud("Zoom tool").getAttribute("aria-pressed") === "true", `${p}: Zoom tool selects`);
    const d = await pct();
    await hud("Zoom out").click(); await settle();
    check(await pct() < d, `${p}: Zoom out works while the zoom tool is active`);
    await hud("Hand tool").click(); await settle();
    check(await hud("Hand tool").getAttribute("aria-pressed") === "true", `${p}: Hand tool selects`);

    const world = () => page.locator("#world").first().getAttribute("transform");
    const box = await page.locator(".canvas").first().boundingBox();
    const t0 = await world();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 3 + 40, { steps: 5 });
    await page.mouse.up(); await settle();
    check(await world() !== t0, `${p}: dragging the sheet pans`);
  }, { width: 1280, height: 720 });
}
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
