// Editor input latency: time from a key press in a number field to the next paint after the canvas
// changes, in a real browser. Usage: start the site (next start), then
//   node scripts/perf/latency.mjs [url] [presses]
// Prints the median and 90th percentile in milliseconds.
import { chromium } from "playwright";

const url = process.argv[2] || "http://localhost:3200/app/editor/local?p=hinge";
const presses = Number(process.argv[3] || 25);

const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForSelector("svg#stage path", { timeout: 60000 });
// The first number field in the right-hand dock (Width on the Hinge Box).
const field = page.locator("aside.dock input[type=text], aside.dock input[inputmode=decimal], aside input").first();
await field.click();
await page.evaluate(() => {
  const stage = document.querySelector("svg#stage");
  window.__lat = [];
  window.__t0 = 0;
  new MutationObserver(() => {
    if (!window.__t0) return;
    const t0 = window.__t0;
    window.__t0 = 0;
    requestAnimationFrame(() => setTimeout(() => window.__lat.push(performance.now() - t0), 0));
  }).observe(stage, { subtree: true, childList: true, attributes: true, characterData: true });
  document.addEventListener("keydown", () => { window.__t0 = performance.now(); }, true);
});
for (let i = 0; i < presses; i++) {
  await page.keyboard.press(i % 2 ? "ArrowDown" : "ArrowUp");
  await page.waitForTimeout(400);
}
const lat = (await page.evaluate(() => window.__lat)).sort((a, b) => a - b);
await browser.close();
if (!lat.length) { console.log("No canvas updates were seen; check the selector."); process.exit(1); }
const q = (p) => lat[Math.min(lat.length - 1, Math.floor(p * lat.length))];
console.log(JSON.stringify({ url, samples: lat.length, medianMs: Math.round(q(0.5)), p90Ms: Math.round(q(0.9)) }));
