// End-to-end test of the Windows app against a local production build of the website and the
// local Supabase stack. Needs:
//   $env:NEXT_DIST_DIR=".next-build"; npx next build
//   $env:HINGELAB_API_BASE="http://127.0.0.1:3457"; cd desktop; npx tauri build --debug --features e2e --no-bundle
// Then: node scripts/desktop/e2e.mjs   (screenshots go to docs/screenshots/desktop-*.png)
//
// The app is driven through WebView2's DevTools port; the browser sign-in runs in Playwright's
// Chromium. Covers sign-in (PKCE + consent), generate, export, the Pro lock and upgrade, rate
// limits, revoked sessions, offline, required updates, navigation lockdown, the website view
// (signed in, no IPC, outside links to the browser, downloads), and sign-out.
import { spawn, execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";

const ROOT = resolve(".");
const PORT = 3457;
const API = `http://127.0.0.1:${PORT}`;
const EXE = join(ROOT, "desktop/src-tauri/target/debug/HingeLab.exe");
const CDP = 9333;
const APP_VERSION = JSON.parse(readFileSync(join(ROOT, "desktop/src-tauri/tauri.conf.json"), "utf8")).version;
const SHOTS = join(ROOT, "docs/screenshots");
const env = loadEnv("development", ROOT, "");
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
if (!/^http:\/\/127\.0\.0\.1:/.test(env.NEXT_PUBLIC_SUPABASE_URL)) throw new Error("E2E runs only against the local Supabase stack.");

const work = mkdtempSync(join(tmpdir(), "hingelab-e2e-"));
const exportDir = join(work, "exports");
mkdirSync(exportDir);
const authFile = join(work, "auth-url.txt");
const browserFile = join(work, "browser-urls.txt");
const configDir = join(process.env.APPDATA, "app.hingelab.desktop");
const prefsFile = join(configDir, "prefs.json");
const prefsBackup = join(work, "prefs.backup.json");

let passed = 0;
const failures = [];
async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : e}`);
  }
}
const assert = (c, msg) => {
  if (!c) throw new Error(msg);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kill = (p) => {
  if (p?.pid) try { execSync(`taskkill /pid ${p.pid} /T /F`, { stdio: "ignore" }); } catch {}
};

// ------------------------------------------------------------------ the local API server

let server;
async function startServer(extraEnv = {}) {
  server = spawn(process.execPath, [join(ROOT, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT)], {
    cwd: ROOT, env: { ...process.env, NEXT_DIST_DIR: ".next-build", ...extraEnv }, stdio: "ignore",
  });
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${API}/api/desktop/update/windows/x86_64/999.0.0`)).status === 204) return;
    } catch {}
    await sleep(500);
  }
  throw new Error("the local server did not start");
}
async function stopServer() {
  kill(server);
  for (let i = 0; i < 40; i++) {
    try { await fetch(API); } catch { return; }
    await sleep(250);
  }
}

// ------------------------------------------------------------------ the app

let app, cdp, page;
async function startApp() {
  app = spawn(EXE, [], {
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP}`, HINGELAB_E2E_AUTH_URL_FILE: authFile, HINGELAB_E2E_BROWSER_FILE: browserFile },
    stdio: "ignore",
  });
  for (let i = 0; i < 60 && !cdp; i++) {
    try { cdp = await chromium.connectOverCDP(`http://127.0.0.1:${CDP}`); } catch { await sleep(500); }
  }
  assert(cdp, "could not reach the app's WebView over CDP");
  for (let i = 0; i < 60 && !page; i++) {
    page = cdp.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes("tauri.localhost"));
    if (!page) await sleep(250);
  }
  assert(page, "the app window did not load");
  page.setDefaultTimeout(30000);
  await page.waitForSelector(".signin, .sidebar", { timeout: 30000 });
}
const invoke = (cmd, args = {}) => page.evaluate(([c, a]) => window.__TAURI_INTERNALS__.invoke(c, a).then((v) => ({ ok: v }), (e) => ({ err: e })), [cmd, args]);
const shot = async (name) => page.screenshot({ path: join(SHOTS, `desktop-${name}.png`) });
const nav = (label) => page.locator(".sidebar").getByRole("button", { name: label, exact: false }).first().click();

/** The website view inside the app window (a second WebView2 on the same DevTools port). */
const WEB = `http://localhost:${PORT}`;
async function webView(pred = () => true, timeout = 30000) {
  const end = Date.now() + timeout;
  let urls = [];
  while (Date.now() < end) {
    const pages = cdp.contexts().flatMap((c) => c.pages());
    urls = pages.map((p) => p.url());
    const hit = pages.find((p) => p.url().startsWith(WEB) && pred(new URL(p.url())));
    if (hit) return hit;
    await sleep(250);
  }
  throw new Error(`website view not found (pages: ${urls.join(", ")})`);
}

/** "visible"/"hidden" for each WebView host window of the app, as Windows reports them. */
const webViewWindows = () =>
  execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${join(ROOT, "scripts/desktop/webview-windows.ps1")}" -ProcessId ${app.pid}`, { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);

/** The app window as the user sees it: the app's page with the website view laid over its area. */
async function shotWindow(name, web) {
  const box = await page.locator(".web-area").boundingBox();
  const size = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const [a, b] = [await page.screenshot(), await web.screenshot()];
  const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h } });
  const p = await ctx.newPage();
  await p.setContent(`<body style="margin:0;position:relative"><img src="data:image/png;base64,${a.toString("base64")}" style="display:block"><img src="data:image/png;base64,${b.toString("base64")}" style="position:absolute;left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px"></body>`);
  await p.screenshot({ path: join(SHOTS, `desktop-${name}.png`) });
  await ctx.close();
}

/** Clicks Sign in in the app, approves in a separate browser, waits for the dashboard. */
async function signIn(browser, email) {
  rmSync(authFile, { force: true });
  await page.getByRole("button", { name: "Sign in with your browser" }).click();
  for (let i = 0; i < 40 && !existsSync(authFile); i++) await sleep(250);
  const url = readFileSync(authFile, "utf8");
  assert(url.startsWith(`${API}/desktop/authorize?`) && url.includes("code_challenge_method=S256") && /[?&]port=\d+/.test(url) && !url.includes("redirect_uri"), `unexpected authorize URL ${url.slice(0, 60)}`);
  const ctx = await browser.newContext();
  const web = await ctx.newPage();
  await web.goto(url);
  if (web.url().includes("/login")) {
    await web.fill('input[type="email"]', email);
    await web.fill('input[type="password"]', "test-password-123");
    await web.click('button[type="submit"]');
    await web.waitForURL((u) => u.pathname.startsWith("/desktop/authorize"));
  }
  await web.getByRole("button", { name: "Allow" }).click();
  await web.getByText("You can close this tab").waitFor();
  await ctx.close();
  await page.getByRole("heading", { name: /Welcome/ }).waitFor();
}

async function newUser(tag) {
  const email = `${tag}-${Date.now()}@hingelab.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "test-password-123", email_confirm: true });
  if (error) throw error;
  return { id: data.user.id, email };
}

// ------------------------------------------------------------------ run

assert(existsSync(EXE), `build the e2e app first: ${EXE}`);
mkdirSync(SHOTS, { recursive: true });
mkdirSync(configDir, { recursive: true });
if (existsSync(prefsFile)) copyFileSync(prefsFile, prefsBackup);
writeFileSync(prefsFile, JSON.stringify({ exportDir, lastDir: null, openAfterExport: false }));

const users = [];
const browser = await chromium.launch();
try {
  await startServer();
  await startApp();
  console.log("HingeLab desktop E2E");

  // A previous run may have left a session in the e2e credential slot.
  if (await page.locator(".sidebar").count()) await invoke("sign_out");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector(".signin");
  await shot("signin");

  const free = await newUser("desktop-e2e");
  users.push(free);

  await step("sign in through the browser (PKCE + consent)", async () => {
    await signIn(browser, free.email);
    const info = await invoke("app_info");
    assert(info.ok?.signedIn === true && info.ok.version === APP_VERSION, JSON.stringify(info));
    await shot("dashboard");
  });

  await step("tokens never reach the web page", async () => {
    const dump = await page.evaluate(() => Object.values({ ...localStorage }).join("\n") + document.cookie);
    assert(!/(^|[^A-Za-z0-9_-])[A-Za-z0-9_-]{43}([^A-Za-z0-9_-]|$)/.test(dump), "token-like value in web storage");
    const me = await invoke("me");
    assert(me.ok && !JSON.stringify(me.ok).match(/access|refresh/i), "me returned token fields");
  });

  await step("Hinge Box builds on the server and previews", async () => {
    await page.locator(".tile", { hasText: "Hinge Box" }).click();
    await page.locator('img[alt="Preview of the cut file"]').waitFor();
    const src = await page.locator('img[alt="Preview of the cut file"]').getAttribute("src");
    assert(src?.startsWith("blob:"), "preview is not a blob image");
    await page.waitForTimeout(400);
    await shot("workspace-free");
  });

  await step("export writes the server's SVG (with the Free mark)", async () => {
    await page.getByRole("button", { name: "Export", exact: true }).click();
    let files = [];
    for (let i = 0; i < 40 && !files.length; i++) {
      files = readdirSync(exportDir).filter((f) => f.endsWith(".svg"));
      await sleep(150);
    }
    assert(files.length === 1, "no exported file");
    const svg = readFileSync(join(exportDir, files[0]), "utf8");
    assert(/^(<\?xml[^>]*>\s*)?<svg/.test(svg), "not an SVG");
    assert(svg.includes("HingeLab"), "Free export has no watermark");
  });

  await step("Save and Export refuse an unknown design id", async () => {
    const r = await invoke("export_design", { designId: 999999 });
    assert(r.err?.kind === "not_found", JSON.stringify(r));
  });

  await step("a Pro shape is locked on Free (no SVG sent)", async () => {
    await page.locator(".settings").getByRole("radio", { name: /Cylinder/ }).first().click();
    await page.getByText(/is a Pro feature|are Pro features/).first().waitFor();
    assert(await page.getByRole("button", { name: "Save SVG" }).isDisabled(), "Save enabled while locked");
    const r = await invoke("generate", { request: { product: "hinge", params: { shape: "cyl" } } });
    assert(r.ok?.status === 403 && !r.ok.body.svg && r.ok.body.designId === undefined, JSON.stringify(r).slice(0, 200));
    await shot("workspace-locked");
  });

  await step("upgrading on the website unlocks it (I've upgraded)", async () => {
    await admin.from("profiles").update({ plan: "pro", plan_status: "active", current_period_end: new Date(Date.now() + 30 * 864e5).toISOString() }).eq("id", free.id);
    await page.getByRole("button", { name: "I've upgraded" }).click();
    await page.locator('img[alt="Preview of the cut file"]').waitFor();
    await page.waitForTimeout(400);
    await shot("workspace-pro");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    let files = [];
    for (let i = 0; i < 40 && files.length < 2; i++) {
      files = readdirSync(exportDir).filter((f) => f.endsWith(".svg"));
      await sleep(150);
    }
    assert(files.length === 2, "second export missing (unique name expected)");
  });

  await step("an expired paid period falls back to Free", async () => {
    await admin.from("profiles").update({ current_period_end: new Date(Date.now() - 10 * 864e5).toISOString() }).eq("id", free.id);
    const me = await invoke("me");
    assert(me.ok?.plan === "free", JSON.stringify(me.ok));
    await admin.from("profiles").update({ current_period_end: new Date(Date.now() + 30 * 864e5).toISOString() }).eq("id", free.id);
  });

  await step("the window stays on the app (navigation blocked)", async () => {
    await page.evaluate(() => { location.href = "https://example.com/"; });
    await page.waitForTimeout(1500);
    assert(page.url().includes("tauri.localhost"), `navigated to ${page.url()}`);
  });

  await step("commands outside the capability are denied", async () => {
    const fs = await invoke("plugin:fs|read_text_file", { path: "C:\\Windows\\win.ini" });
    assert(fs.err, "fs read allowed");
    const open = await invoke("plugin:opener|open_url", { url: "https://example.com" });
    assert(open.err, "opener open_url allowed");
    const reveal = await invoke("reveal_file", { path: "C:\\Windows\\System32\\cmd.exe" });
    assert(reveal.err?.kind === "not_found", "reveal_file accepted an arbitrary path");
    const web = await invoke("open_web", { page: "https://evil.example" });
    assert(web.err?.kind === "invalid", "open_web accepted a URL");
    const big = await invoke("generate", { request: { product: "hinge", params: { name: "x".repeat(300 * 1024) } } });
    assert(big.err?.kind === "invalid", "oversized request accepted");
  });

  await step("too many requests: 429 with retry-after", async () => {
    let hit;
    for (let i = 0; i < 140 && !hit; i++) {
      const r = await invoke("generate", { request: { product: "hinge" } });
      if (r.err?.kind === "rate_limited") hit = r.err;
    }
    assert(hit && hit.retryAfter > 0, "never rate limited");
    await page.locator(".settings input[type=text], .settings input").first().focus();
    await page.getByRole("button", { name: /Update/ }).first().click().catch(() => {});
    await page.waitForTimeout(800);
    await shot("rate-limited");
  });

  await step("offline: the server is unreachable", async () => {
    await stopServer();
    const r = await invoke("me");
    assert(r.err?.kind === "network", JSON.stringify(r));
    await page.getByRole("button", { name: /Update/ }).first().click().catch(() => {});
    await page.locator(".overlay.banner").waitFor();
    await shot("offline");
    await startServer();
  });

  await step("a revoked session signs the app out", async () => {
    const { error } = await admin.rpc("desktop_sessions_revoke_all", { p_user: free.id });
    if (error) throw error;
    const r = await invoke("me");
    assert(r.err?.kind === "unauthorized", JSON.stringify(r));
    const info = await invoke("app_info");
    assert(info.ok?.signedIn === false, "tokens were kept after a failed refresh");
    await page.reload();
    await page.waitForSelector(".signin");
  });

  await step("an outdated app must update (426)", async () => {
    await signIn(browser, free.email);
    await stopServer();
    await startServer({ DESKTOP_MIN_VERSION: "9.0.0" });
    const r = await invoke("me");
    assert(r.err?.kind === "update_required" && r.err.minimumVersion === "9.0.0", JSON.stringify(r));
    await page.reload();
    await page.getByText(/update/i).first().waitFor();
    await page.waitForTimeout(500);
    await shot("update-required");
    await stopServer();
    await startServer();
    await page.reload();
    await page.waitForSelector(".sidebar");
  });

  await step("settings and help pages render", async () => {
    await nav("Settings");
    await page.getByRole("heading", { name: "Settings" }).waitFor();
    await shot("settings");
    await nav("Help");
    await page.waitForTimeout(300);
    await shot("help");
    await nav("Generators");
    await page.waitForTimeout(300);
    await shot("generators");
  });

  await step("the dashboard shows pictures and a preview of recent designs", async () => {
    await nav("Dashboard");
    await page.locator(".rcard-media.drawn img").first().waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll(".tile-media img, .idea-media img, .hero-card img")].every((i) => i.complete), null, { timeout: 5000 }).catch(() => {});
    const pics = await page.evaluate(() => [...document.querySelectorAll(".tile-media img, .idea-media img, .hero-card img")].map((i) => i.complete && i.naturalWidth > 0));
    assert(pics.length >= 10 && pics.every(Boolean), `pictures not loaded: ${JSON.stringify(pics)}`);
    const thumb = await page.locator(".rcard-media.drawn img").first().getAttribute("src");
    assert(thumb?.startsWith("data:image/webp"), "recent design has no preview");
    await page.locator("#dash-recent").scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await shot("dashboard-recent");
    await nav("Settings");
    await page.getByRole("radio", { name: "Dark" }).click();
    await nav("Dashboard");
    await page.locator(".main").evaluate((el) => el.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await shot("dashboard-dark");
    await nav("Generators");
    await page.waitForTimeout(300);
    await shot("generators-dark");
    await nav("Settings");
    await page.getByRole("radio", { name: "Use Windows setting" }).click();
  });

  await step("the sidebar collapses to icons and expands again (button and Ctrl+B)", async () => {
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await page.waitForTimeout(400);
    const narrow = await page.locator(".sidebar").evaluate((el) => el.getBoundingClientRect().width);
    assert(narrow <= 70, `collapsed sidebar is ${narrow}px wide`);
    await nav("Recent designs");
    await page.getByRole("heading", { name: "Recent designs" }).waitFor();
    await nav("Generators");
    await page.waitForTimeout(400);
    await shot("sidebar-collapsed");
    await page.keyboard.press("Control+b");
    await page.waitForTimeout(400);
    const wide = await page.locator(".sidebar").evaluate((el) => el.getBoundingClientRect().width);
    assert(wide >= 200, `expanded sidebar is ${wide}px wide`);
    assert(await page.getByRole("button", { name: "Collapse sidebar" }).isVisible(), "no collapse button after expanding");
  });

  await step("the website's pages open inside the window, signed in as the app's account", async () => {
    await nav("Cloud projects");
    await page.locator(".web-bar").waitFor();
    const web = await webView((u) => u.pathname === "/app");
    await web.waitForLoadState("load");
    assert(new URL(web.url()).pathname === "/app", `signed-out redirect: ${web.url()}`);
    await web.waitForTimeout(1200);
    await shotWindow("online-projects", web);
  });

  await step("the website view has no access to the app's commands", async () => {
    const web = await webView();
    const tryAll = await web.evaluate(async () => {
      const t = window.__TAURI_INTERNALS__;
      if (!t) return ["no ipc"];
      const out = [];
      for (const [cmd, args] of [["app_info", {}], ["me", {}], ["sign_out", {}], ["web_open", { path: "/", bounds: { x: 0, y: 0, width: 1, height: 1 } }], ["plugin:opener|open_url", { url: "https://example.com" }], ["plugin:updater|check", {}]]) {
        out.push(await t.invoke(cmd, args).then(() => `${cmd}: allowed`, () => `${cmd}: refused`));
      }
      return out;
    });
    assert(tryAll.every((r) => !r.endsWith("allowed")), `website view reached commands: ${tryAll.join(", ")}`);
    assert((await invoke("app_info")).ok?.signedIn === true, "the app was signed out by the website view");
    assert(await page.evaluate(() => Object.isFrozen(Object.prototype)), "the app's UI lost its frozen Object.prototype");
    assert(!(await web.evaluate(() => Object.isFrozen(Object.prototype))), "the website view got the app's prototype freeze");
  });

  await step("the online editors open from the sidebar and the dashboard", async () => {
    await nav("All editors");
    await webView((u) => u.pathname === "/app/editor/local" && !u.search);
    await nav("Dashboard");
    await page.locator(".tile", { hasText: "Letters" }).click();
    const web = await webView((u) => u.pathname === "/app/editor/local" && u.searchParams.get("p") === "letters");
    await web.waitForLoadState("load");
    await web.getByText("Letter Box").first().waitFor();
    assert(!(await web.getByText("Application error").count()), "the Letters editor crashed in the website view");
    await web.waitForTimeout(2500);
    await shotWindow("online-letters", web);
  });

  await step("links to other sites open in the browser, never inside the app", async () => {
    const web = await webView();
    rmSync(browserFile, { force: true });
    await web.evaluate(() => { location.href = "https://example.com/"; });
    await sleep(1500);
    assert(web.url().startsWith(WEB), `website view left the site: ${web.url()}`);
    await web.evaluate(() => { window.open("https://example.org/pricing", "_blank"); });
    await sleep(1000);
    const opened = existsSync(browserFile) ? readFileSync(browserFile, "utf8") : "";
    assert(opened.includes("https://example.com/") && opened.includes("https://example.org/pricing"), `browser got: ${opened}`);
    const pages = cdp.contexts().flatMap((c) => c.pages()).map((p) => p.url());
    assert(!pages.some((u) => u.includes("example.")), `opened inside the app: ${pages.join(", ")}`);
  });

  await step("downloads from the website land in the export folder; programs are refused", async () => {
    const web = await webView();
    // Playwright's DevTools connection takes over downloads; hand them back to WebView2 (and the app).
    const session = await cdp.newBrowserCDPSession();
    await session.send("Browser.setDownloadBehavior", { behavior: "default" });
    const download = (name, text) => web.evaluate(([n, t]) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([t], { type: "application/octet-stream" }));
      a.download = n;
      document.body.append(a);
      a.click();
      a.remove();
    }, [name, text]);
    await download("online-e2e.svg", '<svg xmlns="http://www.w3.org/2000/svg"/>');
    let ok = false;
    for (let i = 0; i < 40 && !ok; i++) {
      ok = existsSync(join(exportDir, "online-e2e.svg"));
      await sleep(250);
    }
    assert(ok, `download not in the export folder: ${readdirSync(exportDir).join(", ")}`);
    const toast = (sel, text) => page.locator(sel, { hasText: text }).waitFor({ timeout: 10000 })
      .catch(async () => { throw new Error(`no "${text}" message; shown: ${(await page.locator(".toast").allInnerTexts()).join(" | ")}`); });
    await toast(".toast", "Saved online-e2e.svg");
    const shown = await invoke("reveal_file", { path: "C:\\nowhere\\x.svg" });
    assert(shown.err?.kind === "not_found", "reveal accepted another path");
    await download("setup.exe", "MZ");
    await toast(".toast.err", "drawings and project files only");
    await sleep(800);
    assert(!readdirSync(exportDir).some((f) => /setup/i.test(f)), "a program was saved");
  });

  await step("native pages hide the website view; it comes back as it was", async () => {
    const web = await webView();
    const before = web.url();
    const shown = () => webViewWindows().filter((v) => v === "visible").length;
    const hosts = webViewWindows();
    assert(hosts.length === 2 && shown() === 2, `expected the app and website views: ${hosts}`);
    await nav("Generators");
    await page.getByRole("heading", { name: "Generators" }).waitFor();
    await sleep(500);
    assert(shown() === 1, `website view still shown over a native page: ${webViewWindows()}`);
    await nav("All editors");
    await sleep(800);
    assert(shown() === 2, `website view not shown again: ${webViewWindows()}`);
    assert(web.url() === before, `the view navigated: ${before} -> ${web.url()}`);
  });

  await step("sign out revokes the session and clears the credential", async () => {
    await nav("Settings");
    await page.getByRole("button", { name: "Sign out" }).last().click();
    await page.waitForSelector(".signin");
    const info = await invoke("app_info");
    assert(info.ok?.signedIn === false, "still signed in");
    const r = await invoke("me");
    assert(r.err?.kind === "unauthorized", JSON.stringify(r));
    let left = 1;
    for (let i = 0; i < 40 && left; i++) {
      await sleep(250);
      left = cdp.contexts().flatMap((c) => c.pages()).filter((p) => p.url().startsWith(WEB) && !p.isClosed()).length;
    }
    assert(!left, "the website view stayed open after sign-out");
  });
} finally {
  await cdp?.close().catch(() => {});
  kill(app);
  await browser.close();
  await stopServer();
  for (const u of users) await admin.auth.admin.deleteUser(u.id).catch(() => {});
  if (existsSync(prefsBackup)) copyFileSync(prefsBackup, prefsFile);
  else rmSync(prefsFile, { force: true });
  rmSync(work, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failures.length} failed${failures.length ? ": " + failures.join("; ") : ""}`);
process.exit(failures.length ? 1 : 0);
