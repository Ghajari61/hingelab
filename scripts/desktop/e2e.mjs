// End-to-end test of the Windows app against a local production build of the website and the
// local Supabase stack. Needs:
//   $env:NEXT_DIST_DIR=".next-build"; npx next build
//   $env:HINGELAB_API_BASE="http://127.0.0.1:3457"; cd desktop; npx tauri build --debug --features e2e --no-bundle
// Then: node scripts/desktop/e2e.mjs   (screenshots go to docs/screenshots/desktop-*.png)
//
// The app is driven through WebView2's DevTools port; the browser sign-in runs in Playwright's
// Chromium. Covers sign-in (PKCE + consent), generate, export, the Pro lock and upgrade, rate
// limits, revoked sessions, offline, required updates, navigation lockdown, and sign-out.
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
const SHOTS = join(ROOT, "docs/screenshots");
const env = loadEnv("development", ROOT, "");
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
if (!/^http:\/\/127\.0\.0\.1:/.test(env.NEXT_PUBLIC_SUPABASE_URL)) throw new Error("E2E runs only against the local Supabase stack.");

const work = mkdtempSync(join(tmpdir(), "hingelab-e2e-"));
const exportDir = join(work, "exports");
mkdirSync(exportDir);
const authFile = join(work, "auth-url.txt");
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
      if ((await fetch(`${API}/api/desktop/update/windows/x86_64/1.0.0`)).status === 204) return;
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
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP}`, HINGELAB_E2E_AUTH_URL_FILE: authFile },
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
    assert(info.ok?.signedIn === true && info.ok.version === "1.0.0", JSON.stringify(info));
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

  await step("sign out revokes the session and clears the credential", async () => {
    await nav("Settings");
    await page.getByRole("button", { name: "Sign out" }).last().click();
    await page.waitForSelector(".signin");
    const info = await invoke("app_info");
    assert(info.ok?.signedIn === false, "still signed in");
    const r = await invoke("me");
    assert(r.err?.kind === "unauthorized", JSON.stringify(r));
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
