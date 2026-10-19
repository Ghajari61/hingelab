// Builds the signed Windows installer: `npm run desktop:build`.
//
// The updater signing key is read from TAURI_SIGNING_PRIVATE_KEY / TAURI_SIGNING_PRIVATE_KEY_PASSWORD
// (CI secrets), or on a release machine from %USERPROFILE%\.hingelab\updater (outside the repo).
// It is passed to the Tauri bundler only and never printed. After the build the installer's
// signature is checked against the public key in tauri.conf.json and the bundle is scanned for
// secrets and server code.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { verifyFile } from "./minisign.mjs";
import { scanPaths } from "./scan.mjs";

const root = new URL("../../", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const conf = JSON.parse(readFileSync(join(root, "desktop/src-tauri/tauri.conf.json"), "utf8"));
const args = process.argv.slice(2);
const extra = args.filter((a) => a !== "--no-scan");

const env = { ...process.env };
if (!env.TAURI_SIGNING_PRIVATE_KEY) {
  const dir = join(homedir(), ".hingelab", "updater");
  if (!existsSync(join(dir, "hingelab-updater.key"))) {
    console.error("No updater signing key. Set TAURI_SIGNING_PRIVATE_KEY and TAURI_SIGNING_PRIVATE_KEY_PASSWORD (see WINDOWS_BUILD.md).");
    process.exit(1);
  }
  env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(join(dir, "hingelab-updater.key"), "utf8").trim();
  if (existsSync(join(dir, "hingelab-updater.password"))) env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = readFileSync(join(dir, "hingelab-updater.password"), "utf8").trim();
}
// A release build must talk to the production site only.
delete env.HINGELAB_API_BASE;
// Paths compiled into the program (panic locations, dependency sources) name no user folder.
const remap = [`--remap-path-prefix=${homedir()}=~`, `--remap-path-prefix=${resolve(root)}=hingelab`];
env.RUSTFLAGS = [env.RUSTFLAGS, ...remap].filter(Boolean).join(" ");

const tauri = join(root, "node_modules/.bin/tauri.cmd");
const r = spawnSync(process.platform === "win32" ? tauri : join(root, "node_modules/.bin/tauri"), ["build", ...extra], { cwd: join(root, "desktop"), env, stdio: "inherit", shell: process.platform === "win32" });
if (r.status !== 0) process.exit(r.status ?? 1);

const debug = extra.includes("--debug");
const nsis = join(root, "desktop/src-tauri/target", debug ? "debug" : "release", "bundle/nsis");
const setup = readdirSync(nsis).filter((f) => f.endsWith("-setup.exe")).map((f) => join(nsis, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
if (!setup || !existsSync(setup + ".sig")) {
  console.error("Installer or its .sig is missing in", nsis);
  process.exit(1);
}
const bytes = readFileSync(setup);
const check = verifyFile(bytes, readFileSync(setup + ".sig", "utf8"), conf.plugins.updater.pubkey);
if (!check.ok) {
  console.error("The installer does NOT verify against the public key in tauri.conf.json:", check.reason);
  process.exit(1);
}
console.log(`\nInstaller: ${setup}\nSignature: ${setup}.sig (verifies against tauri.conf.json pubkey)\nSize: ${bytes.length} bytes\nSHA-256: ${createHash("sha256").update(bytes).digest("hex")}`);

let authenticode = "unknown";
try {
  authenticode = execFileSync("powershell", ["-NoProfile", "-Command", `(Get-AuthenticodeSignature -LiteralPath '${setup.replace(/'/g, "''")}').Status`], { encoding: "utf8" }).trim();
} catch {}
console.log(`Authenticode: ${authenticode}${authenticode === "NotSigned" ? " (no code-signing certificate configured; see WINDOWS_RELEASE_CHECKLIST.md)" : ""}`);

if (!args.includes("--no-scan")) {
  const exe = join(root, "desktop/src-tauri/target", debug ? "debug" : "release", `${conf.mainBinaryName ?? conf.productName}.exe`);
  const problems = scanPaths([join(root, "desktop/dist"), exe, setup]);
  if (problems.length) {
    console.error("\nSecret / server-code scan FAILED:\n" + problems.join("\n"));
    process.exit(1);
  }
  console.log("Secret and server-code scan: clean");
  const home = homedir();
  const raw = readFileSync(exe);
  if (raw.toString("latin1").includes(home) || raw.toString("utf16le").includes(home)) {
    console.error(`\nThe program still contains the path ${home}; check RUSTFLAGS (--remap-path-prefix).`);
    process.exit(1);
  }
  console.log("Local paths in the program: none");
}
