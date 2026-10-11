// Sets the desktop app version in tauri.conf.json and Cargo.toml: `node scripts/desktop/version.mjs 1.0.1`.
import { readFileSync, writeFileSync } from "node:fs";

const v = process.argv[2];
if (!/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(v ?? "")) {
  console.error("Usage: node scripts/desktop/version.mjs <major.minor.patch>");
  process.exit(1);
}
const conf = new URL("../../desktop/src-tauri/tauri.conf.json", import.meta.url);
const cargo = new URL("../../desktop/src-tauri/Cargo.toml", import.meta.url);
const c = JSON.parse(readFileSync(conf, "utf8"));
c.version = v;
writeFileSync(conf, JSON.stringify(c, null, 2) + "\n");
writeFileSync(cargo, readFileSync(cargo, "utf8").replace(/^version = "[^"]+"/m, `version = "${v}"`));
console.log(`Desktop version set to ${v} (tauri.conf.json, Cargo.toml).`);
