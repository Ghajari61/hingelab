// Smoke test of the Windows app's UI bundle (desktop/dist, the files the installer carries) in
// Chromium, the engine inside WebView2, served with the window's exact CSP from tauri.conf.json.
// The Rust commands are stand-ins (signed in, Pro); nothing reaches the network or a real account.
// Opens the start gallery and editors that use WebAssembly (HarfBuzz, Manifold), fonts, workers
// and three.js, and fails on any CSP violation or page error.
// Usage: npm run desktop:ui:build, then node scripts/desktop/bundle-smoke.mjs
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { chromium } from "playwright";

const ROOT = resolve(".");
const DIST = join(ROOT, "desktop/dist");
const conf = JSON.parse(readFileSync(join(ROOT, "desktop/src-tauri/tauri.conf.json"), "utf8"));
// SMOKE_CSP overrides it, to check that the test catches a broken policy.
const CSP = process.env.SMOKE_CSP || conf.app.security.csp;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf", ".wasm": "application/wasm", ".json": "application/json" };

if (!existsSync(join(DIST, "index.html"))) { console.error("Build the UI first: npm run desktop:ui:build"); process.exit(1); }

const server = createServer((req, res) => {
  let p = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (p === "/") p = "/index.html";
  const file = normalize(join(DIST, p));
  if (!file.startsWith(DIST + sep) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "content-security-policy": CSP });
  res.end(readFileSync(file));
}).listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;

// The Rust side, as the page sees it through window.__TAURI_INTERNALS__.
const STUB = () => {
  const account = { user: { id: "smoke", email: "smoke@example.com", name: "Smoke Test" }, plan: "pro", tier: "pro", status: "active", periodEnd: null, entitlements: { cleanExport: true, proShapes: true, proGenerators: true }, minimumVersion: "1.0.0" };
  const prefs = { exportDir: null, lastDir: null, openAfterExport: false, projectDir: null, recentFiles: [], homeDir: null, recentMax: 12 };
  let cb = 0;
  window.__smokeCalls = [];
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
    transformCallback: () => ++cb,
    unregisterCallback: () => {},
    convertFileSrc: (p) => p,
    invoke: async (cmd, args) => {
      window.__smokeCalls.push(cmd);
      switch (cmd) {
        case "app_info": return { version: "smoke", server: "https://hingelab.vercel.app", signedIn: true };
        case "me": return account;
        case "get_prefs": return prefs;
        case "recent_projects": return [];
        case "take_open_request": return null;
        case "plugin:app|version": return "smoke";
        case "plugin:event|listen": return ++cb;
        case "plugin:event|unlisten": return null;
        case "plugin:window|set_title": return null;
        case "api_request": return { status: 503, contentType: "application/json", body: btoa("{}"), base64: true };
        default: return null;
      }
    },
  };
};

const PAGES = [
  ["start gallery", "/", ".start-tile"],
  ["Hinge Box", "/#/editor/hinge", "svg#stage path"],
  ["Letters (HarfBuzz, fonts)", "/#/editor/letters", "svg#stage path"],
  ["Boxes, shaped pattern", "/#/editor/boxes?preset=photo-box", "svg#stage path"],
  ["Shadow Box (build worker)", "/#/editor/shadowbox?preset=oval-weave", "svg#stage path"],
  ["Clock (numeral fonts)", "/#/editor/clock", "svg#stage path"],
  ["Parametric (Manifold worker, three.js)", "/#/editor/parametric", "canvas"],
];

const browser = await chromium.launch();
const problems = [];
for (const [name, path, ready] of PAGES) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 860 } });
  await context.addInitScript(STUB);
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource: the server responded with a status of 404/.test(m.text())) errors.push(m.text().slice(0, 240)); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 240)}`));
  await page.goto(base + path);
  let ok = true;
  try { await page.waitForSelector(ready, { timeout: 60000 }); } catch { ok = false; }
  await page.waitForTimeout(2500);
  const crashed = await page.evaluate(() => !!document.querySelector(".dk-crash"));
  const csp = errors.filter((e) => /Content Security Policy|Refused to/i.test(e));
  const bad = !ok || crashed || errors.length;
  console.log(`${bad ? "FAIL" : "  ok"}  ${name}${!ok ? " (did not render)" : ""}${crashed ? " (page error screen)" : ""}`);
  for (const e of errors.slice(0, 4)) console.log(`        ${e}`);
  if (bad) problems.push(name);
  if (csp.length) problems.push(`${name}: CSP`);
  await context.close();
}
// Sign out from the account menu in the editor's top bar signs the whole app out
// (the shared menu must not post to /auth/signout, which only the website has).
{
  const context = await browser.newContext({ viewport: { width: 1400, height: 860 } });
  await context.addInitScript(STUB);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 240)}`));
  await page.goto(base + "/#/editor/hinge");
  let ok = false;
  try {
    await page.waitForSelector("svg#stage path", { timeout: 60000 });
    await page.click(".user-menu .avatar", { timeout: 15000 });
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await page.waitForSelector(".signin", { timeout: 10000 });
    ok = (await page.evaluate(() => window.__smokeCalls.includes("sign_out"))) && !errors.length;
  } catch (e) { errors.push(String(e).slice(0, 240)); }
  console.log(`${ok ? "  ok" : "FAIL"}  Sign out from the account menu`);
  for (const e of errors.slice(0, 4)) console.log(`        ${e}`);
  if (!ok) problems.push("account menu sign out");
  await context.close();
}

await browser.close();
server.close();
if (problems.length) { console.log(`\n${problems.length} problem(s).`); process.exit(1); }
console.log("\nThe bundle runs under the window's CSP: no violations, no page errors.");
