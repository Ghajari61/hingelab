// Accessibility check with axe-core on the main pages and every editor, in a real browser.
// Start the site (next start), then: node scripts/a11y/axe.mjs [base-url]
// Fails on serious or critical violations (WCAG 2.1 A and AA rules); lists the rest as notes.
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";

const base = process.argv[2] || "http://127.0.0.1:3200";
const PAGES = [
  "/",
  "/generators",
  "/pricing",
  "/app/editor/local",
  "/app/editor/local?p=hinge",
  "/app/editor/local?p=letters",
  "/app/editor/local?p=boxes&preset=photo-box",
  "/app/editor/local?p=clock",
];

const browser = await chromium.launch();
let failed = 0;
for (const path of PAGES) {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.goto(base + path, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(1500);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    const notes = r.violations.filter((v) => !bad.includes(v));
    const where = `${path} @${width}px`;
    if (bad.length) {
      failed += bad.length;
      console.log(`✗ ${where}`);
      for (const v of bad) console.log(`   ${v.impact} ${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0]?.target?.join(" ")}`);
    } else console.log(`✓ ${where}${notes.length ? ` (notes: ${notes.map((v) => v.id).join(", ")})` : ""}`);
    await context.close();
  }
}
await browser.close();
if (failed) { console.log(`\n${failed} serious or critical problems.`); process.exit(1); }
console.log("\nNo serious or critical problems.");
