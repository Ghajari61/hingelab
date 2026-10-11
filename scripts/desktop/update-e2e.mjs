// End-to-end test of the auto-updater with real NSIS installers: `node scripts/desktop/update-e2e.mjs`.
//
// Builds a separately named test app ("HingeLab Update Test", its own identifier) at 1.0.0 and 1.0.1,
// signed with a throwaway key pair made for this run (the real signing key is never used), installs
// 1.0.0 for the current user, and serves update answers from a local server. Checks that the app
// installs only a correctly signed newer version: no update, malformed answers, downgrades, a
// tampered installer, a signature from another key, "Later", then a good update and no update loop.
// Uninstalls the test app at the end. Screenshots go to docs/screenshots/desktop-update-*.png.
import { execFileSync, execSync, spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = resolve(".");
const DESKTOP = join(ROOT, "desktop");
const NAME = "HingeLab Update Test";
const BIN = "HingeLabUpdateTest";
const PORT = 8765;
const CDP = 9334;
const SHOTS = join(ROOT, "docs/screenshots");
const work = mkdtempSync(join(tmpdir(), "hingelab-upd-"));
const installDir = join(process.env.LOCALAPPDATA, NAME);
const tauri = join(ROOT, "node_modules/.bin/tauri.cmd");
const PASS = "e2e-throwaway";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, msg) => {
  if (!c) throw new Error(msg);
};
const run = (args, env = {}) => {
  const r = spawnSync(tauri, args, { cwd: DESKTOP, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"], shell: true, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`tauri ${args[0]} failed:\n${(r.stderr || r.stdout).slice(-2000)}`);
  return r.stdout;
};
const killApp = () => {
  try { execSync(`taskkill /IM ${BIN}.exe /T /F`, { stdio: "ignore" }); } catch {}
};
const installedVersion = () => {
  try {
    const out = execFileSync("reg", ["query", `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${NAME}`, "/v", "DisplayVersion"], { encoding: "utf8" });
    return /DisplayVersion\s+REG_SZ\s+(\S+)/.exec(out)?.[1] ?? null;
  } catch {
    return null;
  }
};
const b64 = (s) => Buffer.from(s).toString("base64");

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

// ------------------------------------------------------------------ keys and builds

function keyPair(name) {
  const path = join(work, name);
  run(["signer", "generate", "--ci", "-p", PASS, "-w", `"${path}"`, "-f"]);
  return { priv: readFileSync(path, "utf8").trim(), pub: readFileSync(path + ".pub", "utf8").trim(), path };
}

function build(version, key) {
  const conf = {
    productName: NAME,
    mainBinaryName: BIN,
    version,
    identifier: "app.hingelab.updatetest",
    plugins: { updater: { pubkey: key.pub, endpoints: [`http://127.0.0.1:${PORT}/{{target}}/{{arch}}/{{current_version}}`], dangerousInsecureTransportProtocol: true, requireSignedVersion: true } },
  };
  const confPath = join(work, `conf-${version}.json`);
  writeFileSync(confPath, JSON.stringify(conf));
  run(["build", "--debug", "--bundles", "nsis", "--config", `"${confPath}"`], { TAURI_SIGNING_PRIVATE_KEY: key.priv, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: PASS });
  const setup = join(DESKTOP, "src-tauri/target/debug/bundle/nsis", `${NAME}_${version}_x64-setup.exe`);
  assert(existsSync(setup) && existsSync(setup + ".sig"), `missing ${setup} or its .sig`);
  const out = join(work, `setup-${version}.exe`);
  copyFileSync(setup, out);
  copyFileSync(setup + ".sig", out + ".sig");
  return out;
}

// ------------------------------------------------------------------ the update server

let mode = "none";
const files = {};
const answer = (version, file, sig) => JSON.stringify({ version, notes: "Faster previews and a new box style.", pub_date: new Date().toISOString(), url: `http://127.0.0.1:${PORT}/files/${file}`, signature: sig, size: readFileSync(files[file]).length });
const server = createServer((req, res) => {
  const m = /^\/windows\/x86_64\/(\d+\.\d+\.\d+)$/.exec(req.url ?? "");
  if (m) {
    const current = m[1];
    const sig = (f) => readFileSync(files[f] + ".sig", "utf8").trim();
    const body = {
      none: null,
      malformed: '{"version": "1.0.1", "url": 12',
      downgrade: answer("0.9.0", "good", sig("good")),
      same: answer(current, "good", sig("good")),
      tampered: answer("1.0.1", "tampered", sig("good")),
      wrongkey: answer("1.0.1", "wrongkey", sig("wrongkey")),
      replay: answer("1.0.2", "good", sig("good")),
      good: current === "1.0.1" ? null : answer("1.0.1", "good", sig("good")),
    }[mode];
    if (body === null) {
      res.writeHead(204).end();
      return;
    }
    res.writeHead(200, { "content-type": "application/json" }).end(body);
    return;
  }
  const f = /^\/files\/(\w+)$/.exec(req.url ?? "")?.[1];
  if (f && files[f]) {
    const bytes = readFileSync(files[f]);
    res.writeHead(200, { "content-type": "application/octet-stream", "content-length": bytes.length }).end(bytes);
    return;
  }
  res.writeHead(404).end();
});

// ------------------------------------------------------------------ the installed app

let cdp, page;
async function startApp() {
  killApp();
  await cdp?.close().catch(() => {});
  cdp = page = undefined;
  spawn(join(installDir, `${BIN}.exe`), [], { env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP}` }, stdio: "ignore", detached: true }).unref();
  await attach();
}
async function attach(tries = 60) {
  for (let i = 0; i < tries && !page; i++) {
    try {
      cdp ??= await chromium.connectOverCDP(`http://127.0.0.1:${CDP}`);
      page = cdp.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes("tauri.localhost"));
    } catch {
      cdp = undefined;
    }
    if (!page) await sleep(500);
  }
  assert(page, "could not attach to the app");
  page.setDefaultTimeout(30000);
  await page.waitForSelector(".signin, .sidebar");
}
const check = () => page.evaluate(() => window.__TAURI_INTERNALS__.invoke("plugin:updater|check", {}).then((v) => ({ ok: v }), (e) => ({ err: String(e) })));
const shot = (name) => page.screenshot({ path: join(SHOTS, `desktop-update-${name}.png`) });
const dialog = () => page.getByRole("dialog");

// ------------------------------------------------------------------ run

mkdirSync(SHOTS, { recursive: true });
killApp();
const uninstall = () => {
  if (existsSync(join(installDir, "uninstall.exe"))) spawnSync(join(installDir, "uninstall.exe"), ["/S"], { stdio: "ignore" });
};
uninstall();

try {
  console.log("Building the test app (1.0.0 and 1.0.1) with a throwaway key…");
  const trusted = keyPair("trusted.key");
  const other = keyPair("other.key");
  const v100 = build("1.0.0", trusted);
  const v101 = build("1.0.1", trusted);
  files.good = v101;
  files.tampered = join(work, "tampered.exe");
  const t = readFileSync(v101);
  t[Math.floor(t.length / 2)] ^= 0xff;
  writeFileSync(files.tampered, t);
  files.wrongkey = join(work, "wrongkey.exe");
  copyFileSync(v101, files.wrongkey);
  run(["signer", "sign", "--app-version", "1.0.1", `"${files.wrongkey}"`], { TAURI_SIGNING_PRIVATE_KEY: other.priv, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: PASS });
  assert(existsSync(files.wrongkey + ".sig"), "wrong-key signature missing");

  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  console.log("Updater E2E");

  await step("installs 1.0.0 silently for the current user", async () => {
    const r = spawnSync(v100, ["/S"], { stdio: "ignore" });
    assert(r.status === 0, `installer exit ${r.status}`);
    assert(installedVersion() === "1.0.0", `installed ${installedVersion()}`);
    await startApp();
  });

  await step("no update offered: nothing happens", async () => {
    mode = "none";
    const r = await check();
    assert(r.ok === null, JSON.stringify(r));
  });

  await step("a malformed answer is an error, nothing installed", async () => {
    mode = "malformed";
    const r = await check();
    assert(r.err, JSON.stringify(r));
  });

  await step("downgrades and same-version answers are ignored", async () => {
    mode = "downgrade";
    assert((await check()).ok === null, "downgrade offered");
    mode = "same";
    assert((await check()).ok === null, "same version offered");
  });

  await step("a tampered installer is rejected and 1.0.0 keeps running", async () => {
    mode = "tampered";
    await startApp();
    await dialog().getByText("An update is available").waitFor({ timeout: 20000 });
    await shot("available");
    await dialog().getByRole("button", { name: "Update now" }).click();
    await dialog().getByText(/could not be verified/).waitFor({ timeout: 60000 });
    await shot("rejected");
    assert(installedVersion() === "1.0.0", "version changed");
  });

  await step("a signature from another key is rejected (Try again re-checks)", async () => {
    mode = "wrongkey";
    await dialog().getByRole("button", { name: "Try again" }).click();
    await page.waitForTimeout(500);
    await dialog().getByText(/could not be verified/).waitFor({ timeout: 60000 });
    assert(installedVersion() === "1.0.0", "version changed");
  });

  await step("a genuine installer offered under another version number is rejected", async () => {
    mode = "replay";
    await dialog().getByRole("button", { name: "Try again" }).click();
    await page.waitForTimeout(500);
    await dialog().getByText(/could not be verified/).waitFor({ timeout: 60000 });
    assert(installedVersion() === "1.0.0", "version changed");
    await dialog().getByRole("button", { name: "Close", exact: true }).last().click();
  });

  await step("Later postpones without installing", async () => {
    mode = "good";
    await startApp();
    await dialog().getByText("An update is available").waitFor({ timeout: 20000 });
    await dialog().getByRole("button", { name: "Later" }).click();
    await page.waitForTimeout(1000);
    assert((await dialog().count()) === 0, "dialog still open");
    assert(installedVersion() === "1.0.0", "installed without consent");
  });

  await step("a signed update installs and the app restarts on 1.0.1", async () => {
    await startApp();
    await dialog().getByText("An update is available").waitFor({ timeout: 20000 });
    await dialog().getByRole("button", { name: "Update now" }).click();
    for (let i = 0; i < 240 && installedVersion() !== "1.0.1"; i++) await sleep(500);
    assert(installedVersion() === "1.0.1", `installed ${installedVersion()}`);
    await cdp?.close().catch(() => {});
    cdp = page = undefined;
    let running = false;
    for (let i = 0; i < 60 && !running; i++) {
      running = execSync(`tasklist /FI "IMAGENAME eq ${BIN}.exe" /NH`, { encoding: "utf8" }).includes(BIN);
      if (!running) await sleep(500);
    }
    assert(running, "the app did not restart after the update");
    await attach(40).catch(() => startApp());
    const v = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("plugin:app|version"));
    assert(v === "1.0.1", `running ${v}`);
    await shot("updated");
  });

  await step("after updating, no update is offered again (no loop)", async () => {
    const r = await check();
    assert(r.ok === null, JSON.stringify(r));
  });
} finally {
  await cdp?.close().catch(() => {});
  killApp();
  server.close();
  await sleep(500);
  uninstall();
  rmSync(work, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failures.length} failed${failures.length ? ": " + failures.join("; ") : ""}`);
process.exit(failures.length ? 1 : 0);
