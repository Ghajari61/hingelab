// Parametric P1 (core slicing): the abstract head and the sphere sliced into parallel fins on the
// debug page, plus an STL import through the worker.
import { BASE, shot, withBrowser } from "./lib.mjs";

const assert = (cond, msg) => { if (!cond) throw new Error("FAILED: " + msg); console.log("ok -", msg); };
const status = (page) => page.locator(".dbg-status").textContent();
const waitSliced = async (page, prev = "") => {
  await page.waitForFunction((p) => { const t = document.querySelector(".dbg-status")?.textContent ?? ""; return t.includes("parts") && t !== p; }, prev, { timeout: 60000 });
  await page.waitForTimeout(500);
  return status(page);
};

/** Binary STL of an axis-aligned box (outward triangles). */
function boxStl(w, h, d) {
  const V = [[0, 0, 0], [w, 0, 0], [w, h, 0], [0, h, 0], [0, 0, d], [w, 0, d], [w, h, d], [0, h, d]];
  const F = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const buf = Buffer.alloc(84 + F.length * 50);
  buf.writeUInt32LE(F.length, 80);
  F.forEach((f, i) => f.forEach((v, k) => V[v].forEach((c, a) => buf.writeFloatLE(c, 84 + i * 50 + 12 + k * 12 + a * 4))));
  return buf;
}

await withBrowser(async (page) => {
  await page.goto(`${BASE}/app/parametric-debug`);
  let s = await waitSliced(page);
  assert(/manifold/.test(s), `head sliced with manifold: ${s}`);
  const n = Number(s.match(/(\d+) parts/)[1]);
  assert(n >= 15 && n <= 40, `head gives ${n} fins`);
  await shot(page, "parametric-1-head-fins");

  await page.locator('input[aria-label="Plane"]').fill("10");
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.locator(".dbg").evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.waitForTimeout(300);
  await shot(page, "parametric-1-head-fin-outlines");
  await page.locator(".dbg").evaluate((el) => el.scrollTo(0, 0));

  await page.selectOption('select[aria-label="Source"]', "sphere");
  s = await waitSliced(page, s);
  await page.fill('input[aria-label="Spacing"]', "10");
  s = await waitSliced(page, s);
  assert(/^20 parts · 20 planes · manifold/.test(s), `sphere at spacing 10: ${s}`);
  await shot(page, "parametric-1-sphere-fins");

  await page.locator('input[aria-label="Import model"]').setInputFiles({ name: "box.stl", mimeType: "model/stl", buffer: boxStl(120, 80, 40) });
  s = await waitSliced(page, s);
  assert(/manifold/.test(s), `imported STL box sliced: ${s}`);
  const report = await page.locator(".dbg-card pre").first().textContent();
  assert(/-60\.0, -40\.0, -20\.0/.test(report), "imported model is centred on the origin");
});
