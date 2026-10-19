// Publishes a built installer in the update manifest (desktop/releases/stable.json).
//
//   node scripts/desktop/release.mjs --url https://github.com/<owner>/<repo>/releases/download/v1.0.1/HingeLab_1.0.1_x64-setup.exe \
//     --notes "What changed" [--installer path\to\HingeLab_1.0.1_x64-setup.exe] [--minimum 1.0.0]
//
// Upload the installer first. The script checks that the file verifies against the public key in
// tauri.conf.json, and (unless --offline) that the uploaded file at --url is byte-identical. Commit
// stable.json and deploy the website: the update endpoint then offers this version.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { verifyFile } from "./minisign.mjs";

const root = new URL("../../", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const conf = JSON.parse(readFileSync(join(root, "desktop/src-tauri/tauri.conf.json"), "utf8"));
const manifestPath = join(root, "desktop/releases/stable.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const url = arg("url");
if (!url) {
  console.error("--url is required (where the installer is downloaded from, https).");
  process.exit(1);
}
const nsis = join(root, "desktop/src-tauri/target/release/bundle/nsis");
const installer = arg("installer") ?? (existsSync(nsis) ? readdirSync(nsis).filter((f) => f.endsWith(`_${conf.version}_x64-setup.exe`)).map((f) => join(nsis, f))[0] : undefined);
if (!installer || !existsSync(installer) || !existsSync(installer + ".sig")) {
  console.error(`Installer for ${conf.version} (and its .sig) not found. Build it with npm run desktop:build, or pass --installer.`);
  process.exit(1);
}
const bytes = readFileSync(installer);
const signature = readFileSync(installer + ".sig", "utf8").trim();
const check = verifyFile(bytes, signature, conf.plugins.updater.pubkey);
if (!check.ok) {
  console.error("Refusing to publish: the installer does not verify against the app's public key:", check.reason);
  process.exit(1);
}
if (!check.trusted.split("\t").includes(`version:${conf.version}`)) {
  console.error(`Refusing to publish: the signature was not made for version ${conf.version} (trusted comment: ${check.trusted}).`);
  process.exit(1);
}
const u = new URL(url);
if (u.protocol !== "https:" || !/\.exe$/i.test(u.pathname)) {
  console.error("The URL must be https and end in .exe.");
  process.exit(1);
}
if (!process.argv.includes("--offline")) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    console.error(`Download check failed: HTTP ${res.status}. Upload the installer first, or pass --offline.`);
    process.exit(1);
  }
  const remote = Buffer.from(await res.arrayBuffer());
  if (!remote.equals(bytes)) {
    console.error("The file at --url is not the same as the local installer.");
    process.exit(1);
  }
}
const prev = manifest.latest?.version;
if (prev && prev.split(".").map(Number).reduce((a, n, i) => a || Math.sign(n - Number(conf.version.split(".")[i])), 0) >= 0) {
  console.error(`The manifest already offers ${prev}; ${conf.version} must be newer.`);
  process.exit(1);
}
manifest.latest = {
  version: conf.version,
  pub_date: new Date().toISOString(),
  notes: (arg("notes") ?? "").slice(0, 5000),
  platforms: { "windows-x86_64": { url, signature, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") } },
};
if (arg("minimum")) manifest.minimumVersion = arg("minimum");
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`stable.json now offers ${conf.version} (${bytes.length} bytes, sha256 ${createHash("sha256").update(bytes).digest("hex")}).`);
console.log("Next: npx vitest run lib/desktop (validates the manifest), commit desktop/releases/stable.json, deploy the website.");
