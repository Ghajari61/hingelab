// Parametric P5 (photo to relief + quality): a portrait photo goes through Depth-Anything-V2-Small
// in the browser, becomes a relief, is sliced into fins, and the deviation heat map and fidelity
// score are shown. Also steps the Slice Inspector with its buttons and the arrow keys.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BASE, shot, withBrowser } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORTRAIT = path.join(here, "fixtures", "portrait.jpg");

const assert = (cond, msg) => { if (!cond) throw new Error("FAILED: " + msg); console.log("ok -", msg); };
const stage = (page) => page.locator(".pe-stage").textContent();
const waitSliced = async (page, prev = "", timeout = 120000) => {
  await page.waitForFunction((p) => {
    const t = document.querySelector(".pe-stage")?.textContent ?? "";
    return /\d+ parts/.test(t) && t !== p && !document.querySelector(".pe-progress");
  }, prev, { timeout });
  await page.waitForTimeout(800);
  return stage(page);
};
const dockText = async (page) => (await page.locator(".dock").textContent()).replace(/\s+/g, " ");

await withBrowser(async (page) => {
  const logs = [];
  page.on("console", (m) => { if (m.type() === "error") logs.push(m.text()); });
  await page.addInitScript(() => { if (!sessionStorage.getItem("p5")) { localStorage.clear(); indexedDB.deleteDatabase("hingelab-models"); sessionStorage.setItem("p5", "1"); } });
  await page.goto(`${BASE}/app/editor/local`);
  await page.getByRole("button", { name: "Parametric", exact: true }).click();
  let s = await waitSliced(page);

  const t0 = Date.now();
  await page.locator('input[aria-label="Load photo"]').setInputFiles(PORTRAIT);
  await page.waitForFunction(() => /portrait\.jpg/.test(document.querySelector(".dock")?.textContent ?? ""), null, { timeout: 300000 })
    .catch(async (e) => { console.log("console errors:", logs.join("\n")); console.log("toast:", await page.locator(".toast").textContent().catch(() => "")); throw e; });
  s = await waitSliced(page, s, 300000);
  console.log(`photo → fins in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${s}`);
  const parts = Number(/(\d+) parts/.exec(s)[1]);
  assert(parts >= 20, `portrait sliced into ${parts} parts`);

  let dock = await dockText(page);
  assert(/Depth \(light = near\)/.test(dock), "photo and depth thumbnails shown");
  assert(/faces come out softer/.test(dock), "approximate-depth note shown");
  const fid = await page.getByTestId("fidelity").textContent();
  const fidelity = Number(fid.replace("%", ""));
  assert(fidelity > 0 && fidelity <= 100, `fidelity ${fid}`);
  assert(/Mean deviation ?\d/.test(dock) && /Max deviation ?\d/.test(dock), "deviation stats shown");

  await page.waitForTimeout(800);
  await shot(page, "parametric-5-portrait-fins-3d");

  await page.locator(".pe-hud label", { hasText: "Model" }).locator("input").uncheck();
  await page.locator('input[aria-label="Explode"]').fill("0.35");
  await page.waitForTimeout(1000);
  await shot(page, "parametric-5-portrait-fins-exploded");
  await page.locator('input[aria-label="Explode"]').fill("0");
  await page.locator(".pe-hud label", { hasText: "Model" }).locator("input").check();

  await page.locator(".pe-hud label", { hasText: "Deviation" }).locator("input").check();
  await page.locator(".pe-hud label", { hasText: "Parts" }).locator("input").uncheck();
  await page.locator(".pe-hud label", { hasText: "Model" }).locator("input").uncheck();
  await page.getByTestId("deviation-legend").waitFor();
  await page.waitForTimeout(800);
  await shot(page, "parametric-5-deviation-heatmap");
  await page.locator(".pe-hud label", { hasText: "Parts" }).locator("input").check();
  await page.locator(".pe-hud label", { hasText: "Model" }).locator("input").check();
  await page.locator(".pe-hud label", { hasText: "Deviation" }).locator("input").uncheck();

  // Slice Inspector: buttons and arrow keys.
  await page.locator('input[aria-label="Part"]').fill("0");
  await page.waitForTimeout(300);
  const label = () => page.locator(".pe-inspect-nav span").textContent();
  assert(/· 1 of /.test(await label()), "inspector starts at the first part");
  await page.getByRole("button", { name: "Next part" }).click();
  assert(/· 2 of /.test(await label()), "next button steps forward");
  await page.locator(".pe-inspect").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  assert(/· 4 of /.test(await label()), "arrow keys step through the parts");
  await page.keyboard.press("End");
  assert(new RegExp(`· ${parts} of ${parts}`).test(await label()), "End jumps to the last part");
  await page.keyboard.press("Home");
  assert(/· 1 of /.test(await label()), "Home jumps to the first part");
  const insp = (await page.locator(".pe-inspect").textContent()).replace(/\s+/g, " ");
  assert(/Area ?\d/.test(insp) && /Sheet ?\d/.test(insp) && /Cut length ?\d/.test(insp), `inspector shows area, cut length and sheet: ${insp}`);

  // The relief controls re-slice.
  await page.locator('.fld[data-id="iDepth"] input').first().fill("40");
  await page.keyboard.press("Enter");
  s = await waitSliced(page, s);
  assert(/\d+ parts/.test(s), "max depth change re-slices");

  await page.getByRole("tab", { name: /Sheets/ }).click();
  await page.waitForTimeout(1200);
  await shot(page, "parametric-5-portrait-sheets");

  // The photo and its depth map survive a reload (IndexedDB).
  await page.reload();
  await page.getByRole("button", { name: "Parametric", exact: true }).click().catch(() => {});
  await waitSliced(page, "", 120000);
  dock = await dockText(page);
  assert(/portrait\.jpg/.test(dock), "photo source kept after reload");
  if (logs.length) console.log("console errors:", logs.join("\n"));
});
