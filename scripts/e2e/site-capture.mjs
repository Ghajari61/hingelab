// Usage: node scripts/e2e/site-capture.mjs [base url] [out dir]  (QA_ONLY=pages,editors,journeys)
// QA capture: every route at three sizes, every editor product, timing, console errors, overflow.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
const BASE = process.argv[2] ?? "http://localhost:3200", OUT = process.argv[3] ?? "/tmp/qa";
mkdirSync(OUT, { recursive: true });
const DEVICES = { desktop: { width: 1440, height: 900 }, tablet: { width: 768, height: 1024 }, mobile: { width: 375, height: 667 } };
const PAGES = ["/", "/generators", "/generators/qr", "/start", "/tools", "/gallery", "/collections", "/materials", "/learn/kerf", "/about", "/blog", "/changelog", "/contact", "/developers", "/graphics", "/leather-studio", "/miniature-studio", "/privacy", "/terms", "/login", "/signup", "/home", "/templates", "/presets", "/help", "/projects", "/app", "/app/ai", "/app/billing", "/bookmarks", "/exports", "/preferences", "/invite", "/account"];
const PRODUCTS = ["hinge", "letters", "parametric", "clock", "puzzle", "qr", "boxes", "topper", "keyrack", "sign", "tablenum", "trophy", "shadowbox", "keychain", "popup", "charm", "family", "miniature", "leather", "paperbox"];
const results = { pages: [], editors: [], journeys: [] };
const browser = await chromium.launch();
async function ctxFor(size) {
  const c = await browser.newContext({ viewport: size });
  await c.addInitScript(() => { try { localStorage.setItem("hingelab-prefs", JSON.stringify({ onboarded: true, laser: "diode" })); } catch {} });
  return c;
}
function watch(page) {
  const log = { console: [], page: [], failed: [] };
  page.on("console", (m) => { if (m.type() === "error") log.console.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => log.page.push(String(e).slice(0, 200)));
  page.on("response", (r) => { if (r.status() >= 400) log.failed.push(`${r.status()} ${r.url().replace(BASE, "")}`.slice(0, 160)); });
  return log;
}
const shot = async (page, o) => { try { await page.screenshot(o); } catch (e) { (page.__log ?? { page: [] }).page.push('screenshot failed: ' + String(e).slice(0, 80)); } };
const ONLY = (process.env.QA_ONLY ?? 'pages,editors,journeys').split(',');
const slug = (s) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root";
if (ONLY.includes('pages')) for (const [dev, size] of Object.entries(DEVICES)) {
  const c = await ctxFor(size);
  for (const path of PAGES) {
    const page = await c.newPage(), log = watch(page);
    const t0 = Date.now();
    let status = 0, err = "";
    try { const r = await page.goto(BASE + path, { waitUntil: "load", timeout: 30000 }); status = r?.status() ?? 0; } catch (e) { err = String(e).slice(0, 120); }
    const load = Date.now() - t0;
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => ({ url: location.pathname, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, title: document.title, h1: document.querySelector("h1")?.textContent?.slice(0, 60) ?? "" })).catch(() => ({}));
    if (dev === "desktop" || ["/", "/generators", "/start", "/home", "/templates", "/app"].includes(path)) await shot(page, { path: `${OUT}/${dev}-${slug(path)}.png` });
    writeFileSync(`${OUT}/partial-pages.json`, JSON.stringify(results.pages));
    results.pages.push({ dev, path, status, load, err, ...m, ...log });
    await page.close();
  }
  await c.close();
}
// Every editor product: renders, no error box, 3D view opens.
if (ONLY.includes('editors')) {
  const c = await ctxFor(DEVICES.desktop);
  for (const p of PRODUCTS) {
    const page = await c.newPage(), log = watch(page);
    const t0 = Date.now();
    await page.goto(`${BASE}/app/editor/local?p=${p}`, { waitUntil: "load" }).catch(() => {});
    let rendered = false;
    try { await page.waitForSelector("svg#stage path, canvas", { timeout: 45000 }); rendered = true; } catch {}
    const ready = Date.now() - t0;
    await page.waitForTimeout(1500);
    const errBox = await page.locator(".gen-error, [role=alert]").allTextContents().catch(() => []);
    await shot(page, { path: `${OUT}/editor-${p}.png` });
    let threeD = "n/a";
    const b3 = page.getByText("3D view").first();
    if (await b3.count()) { await b3.click().catch(() => {}); await page.waitForTimeout(3500); threeD = (await page.locator("canvas").count()) ? "ok" : "no canvas"; await shot(page, { path: `${OUT}/editor-${p}-3d.png` }); }
    writeFileSync(`${OUT}/partial-editors.json`, JSON.stringify(results.editors));
    results.editors.push({ product: p, rendered, ready, threeD, errBox: errBox.filter(Boolean).slice(0, 3), ...log });
    await page.close();
  }
  await c.close();
}
// Journey: Studio blank document, draw a rectangle, insert a QR code, save to computer.
if (ONLY.includes('journeys')) {
  const c = await ctxFor(DEVICES.desktop), page = await c.newPage(), log = watch(page), steps = [];
  const step = async (name, fn) => { try { await fn(); steps.push({ name, ok: true }); } catch (e) { steps.push({ name, ok: false, err: String(e).slice(0, 160) }); } await shot(page, { path: `${OUT}/journey-studio-${steps.length}-${slug(name)}.png` }).catch(() => {}); };
  await step("open home", async () => { await page.goto(`${BASE}/home`); await page.getByTestId("blank-canvas").waitFor({ timeout: 20000 }); });
  await step("new document", async () => { await page.getByTestId("blank-canvas").click(); await page.getByTestId("new-document-dialog").waitFor(); await page.getByTestId("document-name").fill("QA doc"); await page.getByTestId("create-document").click(); await page.waitForURL(/\/editor\/local-/); await page.getByTestId("studio-editor").waitFor(); });
  await step("draw rectangle", async () => { await page.keyboard.press("m").catch(() => {}); const box = await page.locator("[data-testid=studio-canvas], canvas, svg").first().boundingBox(); await page.mouse.move(box.x + 300, box.y + 250); await page.mouse.down(); await page.mouse.move(box.x + 420, box.y + 330, { steps: 6 }); await page.mouse.up(); });
  await step("insert QR", async () => { await page.getByRole("button", { name: "File" }).click(); await page.getByRole("menuitem", { name: /Insert QR Code/ }).click(); await page.getByTestId("qr-dialog").waitFor(); await page.getByTestId("dlg-ok").click(); });
  await step("undo/redo", async () => { await page.keyboard.press("Control+z"); await page.keyboard.press("Control+Shift+z"); });
  results.journeys.push({ name: "studio", steps, ...log });
  await c.close();
}
// Journey: start page → pick a product → editor → export SVG download.
if (ONLY.includes('journeys')) {
  const c = await ctxFor(DEVICES.desktop), page = await c.newPage(), log = watch(page), steps = [];
  const step = async (name, fn) => { try { await fn(); steps.push({ name, ok: true }); } catch (e) { steps.push({ name, ok: false, err: String(e).slice(0, 160) }); } await shot(page, { path: `${OUT}/journey-gen-${steps.length}-${slug(name)}.png` }).catch(() => {}); };
  await step("generators page", async () => { await page.goto(`${BASE}/generators`); await page.waitForTimeout(1500); });
  await step("open QR preset", async () => { await page.goto(`${BASE}/app/editor/local?p=qr&preset=review-stand`); await page.waitForSelector("svg#stage path", { timeout: 30000 }); });
  await step("change a field", async () => { await page.getByText("3D view").first().click(); await page.waitForTimeout(2500); });
  await step("export SVG", async () => { const [d] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.getByRole("button", { name: /Export SVG/ }).click()]); steps.push({ name: `downloaded ${d.suggestedFilename()}`, ok: true }); });
  results.journeys.push({ name: "generator-export", steps, ...log });
  await c.close();
}
await browser.close();
writeFileSync(`${OUT}/test-results-${ONLY.join('-')}.json`, JSON.stringify(results, null, 1));
console.log("done", results.pages.length, results.editors.length);
