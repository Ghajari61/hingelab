// Every product's editor on the website renders its design with no page errors, at desktop and phone
// widths. Start the site (next start), then: node scripts/smoke/web.mjs [base-url]
import { chromium } from "playwright";

const base = process.argv[2] || "http://127.0.0.1:3200";
// Kept in step with GENERATOR_IDS (lib/generators/ids.ts) plus the three hand-built editors.
const PRODUCTS = ["hinge", "letters", "parametric", "clock", "puzzle", "qr", "boxes", "topper", "keyrack", "sign", "tablenum", "trophy", "shadowbox", "paperbox", "keychain", "popup", "charm", "family", "miniature", "leather"];

const browser = await chromium.launch();
const failed = [];
for (const p of PRODUCTS) {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 500, hasTouch: width < 500 });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
    page.on("console", (m) => { if (m.type() === "error" && /Uncaught|TypeError|ReferenceError|Refused to/.test(m.text())) errors.push(m.text().slice(0, 200)); });
    await page.goto(`${base}/app/editor/local?p=${p}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    // Generators open their phone flow on phones; its first step lists the designs.
    const ready = width < 500 && p !== "hinge" && p !== "letters" && p !== "parametric" ? "svg#stage path, .preset-card, .phone-flow" : p === "parametric" ? "canvas, svg#stage path" : "svg#stage path";
    let ok = true;
    try { await page.waitForSelector(ready, { timeout: 90000 }); } catch { ok = false; }
    await page.waitForTimeout(1200);
    const where = `${p} @${width}px`;
    if (!ok || errors.length) { failed.push(where); console.log(`FAIL  ${where}${ok ? "" : " (did not render)"}`); for (const e of errors.slice(0, 3)) console.log(`        ${e}`); }
    else console.log(`  ok  ${where}`);
    await context.close();
  }
}
await browser.close();
if (failed.length) { console.log(`\n${failed.length} failed.`); process.exit(1); }
console.log(`\nAll ${PRODUCTS.length} products render at both widths.`);
