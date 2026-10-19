// Input responsiveness in an editor: the Event Timing duration of each key press in the first number
// field (input handling until the next paint), like Chrome's INP. Usage: start the site, then
//   node scripts/perf/inp.mjs [url] [presses]
import { chromium } from "playwright";

const url = process.argv[2] || "http://localhost:3200/app/editor/local?p=shadowbox&preset=oval-weave";
const presses = Number(process.argv[3] || 15);

const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForSelector("svg#stage path", { timeout: 120000 });
await page.waitForTimeout(2000);
await page.evaluate(() => {
  window.__ev = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === "keydown" || e.name === "keyup" || e.name === "input") window.__ev.push(e.duration); }).observe({ type: "event", durationThreshold: 16, buffered: false });
});
const field = page.locator("aside.dock input[type=text], aside.dock input[inputmode=decimal], aside input").first();
await field.click();
for (let i = 0; i < presses; i++) {
  await page.keyboard.press(i % 2 ? "ArrowDown" : "ArrowUp");
  await page.waitForTimeout(400);
}
await page.waitForTimeout(1500);
const d = (await page.evaluate(() => window.__ev)).sort((a, b) => a - b);
const q = (p) => (d.length ? d[Math.min(d.length - 1, Math.floor(d.length * p))] : 0);
console.log(`${url}\n${d.length} slow events (over 16 ms) of ${presses * 2} key events; worst ${Math.round(d.at(-1) ?? 0)} ms, p90 ${Math.round(q(0.9))} ms`);
await browser.close();
