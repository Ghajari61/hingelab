// Opens every page and editor of a running server and reports Content-Security-Policy violations,
// console errors and the security headers. Usage: SHOTS_BASE=http://localhost:3457 node scripts/security/csp-check.mjs
import { chromium } from "playwright";

const BASE = process.env.SHOTS_BASE || "http://localhost:3457";
const PAGES = [
  "/", "/home", "/projects", "/presets", "/templates", "/help", "/help/hinge-pattern", "/login", "/signup", "/privacy", "/app/billing", "/app/editor/local",
  ...["hinge", "letters", "parametric", "clock", "puzzle", "qr", "boxes"].map((p) => `/app/editor/local?p=${p}`),
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  window.__csp = [];
  document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile ?? ""}:${e.lineNumber ?? ""}`));
});
let problems = 0;
for (const path of PAGES) {
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "load" });
  await page.waitForTimeout(path.includes("parametric") || path.includes("letters") ? 7000 : 2500);
  const csp = await page.evaluate(() => window.__csp);
  const h = res ? res.headers() : {};
  const missing = ["content-security-policy", "x-content-type-options", "x-frame-options", "referrer-policy"].filter((k) => !h[k]);
  const bad = csp.length || errors.some((e) => /Content Security Policy|Refused to/i.test(e)) || missing.length;
  if (bad) problems++;
  console.log(`${bad ? "✗" : "✓"} ${res?.status()} ${path}${missing.length ? `  missing headers: ${missing.join(", ")}` : ""}`);
  for (const c of csp) console.log(`    CSP: ${c}`);
  for (const e of errors) console.log(`    console: ${e}`);
  if (path === "/app/editor/local?p=hinge") {
    const out = await page.evaluate(async () => {
      const r = await fetch("/api/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ params: {} }) });
      const text = await r.text();
      return { status: r.status, cd: r.headers.get("content-disposition"), csp: r.headers.get("content-security-policy"), svg: text.startsWith("<?xml") };
    });
    console.log(`    same-origin export: ${JSON.stringify(out)}`);
    if (out.status !== 200 || !out.svg || !/^attachment/.test(out.cd ?? "") || !/sandbox/.test(out.csp ?? "")) problems++;
  }
  await page.close();
}
await browser.close();
console.log(problems ? `\n${problems} page(s) with problems` : "\nNo CSP violations.");
process.exit(problems ? 1 : 0);
