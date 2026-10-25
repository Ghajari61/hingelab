// Licence gate (CURSOR_INKSCAPE_PARITY.md §0.3): fails on GPL, LGPL, AGPL, SSPL or any licence that is
// not on the allow-list, for every installed npm package and every Rust crate of the desktop app.
//   node scripts/licenses.mjs            npm packages, plus Rust crates when cargo is available
//   node scripts/licenses.mjs --cargo    Rust crates are required (CI)
//   node scripts/licenses.mjs --list     print every package with its licence
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));

/** The allow-list from §0.3. MPL-2.0 is file-level copyleft: we use MPL files unmodified. */
export const ALLOWED = new Set([
  "MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "MPL-2.0", "Unlicense", "CC0-1.0", "Zlib", "OFL-1.1",
  // Permissive, non-copyleft licences that are not on the list in §0.3 but carry no source obligation
  // (recorded in DECISIONS.md D115): public-domain-like, Boost, attribution-only data and Unicode data.
  "0BSD", "MIT-0", "BlueOak-1.0.0", "BSL-1.0", "Python-2.0", "Unicode-3.0", "Unicode-DFS-2016", "CC-BY-4.0", "CDLA-Permissive-2.0",
]);
/** SPDX exceptions that only add permissions. */
const EXCEPTIONS = new Set(["LLVM-exception"]);
const COPYLEFT = /(^|[^A-Z])(A?GPL|LGPL|SSPL)/i;

/** Old package.json spellings mapped to SPDX ids. */
const ALIASES = { BSL: "BSL-1.0", "Apache 2.0": "Apache-2.0", "Apache-2": "Apache-2.0", "BSD": "BSD-3-Clause", "MIT*": "MIT", "Public Domain": "Unlicense" };

/** Packages whose metadata has no usable licence field, checked by hand (name → SPDX). */
const VERIFIED = {};

/** Parses an SPDX expression ("MIT OR (Apache-2.0 AND Zlib)", legacy "MIT/Apache-2.0") into a tree. */
export function parseSpdx(expr) {
  const toks = expr.replace(/\s*\/\s*/g, " OR ").replace(/[()]/g, (m) => ` ${m} `).trim().split(/\s+/).filter(Boolean);
  let i = 0;
  const atom = () => {
    const t = toks[i++];
    if (t === "(") { const e = or(); i++; return e; }
    const id = ALIASES[t] ?? t.replace(/\+$/, "");
    if (toks[i] === "WITH") { const ex = toks[i + 1]; i += 2; return { id, ex }; }
    return { id };
  };
  const and = () => { const xs = [atom()]; while (toks[i] === "AND") { i++; xs.push(atom()); } return xs.length === 1 ? xs[0] : { and: xs }; };
  const or = () => { const xs = [and()]; while (toks[i] === "OR") { i++; xs.push(and()); } return xs.length === 1 ? xs[0] : { or: xs }; };
  return or();
}

/** True when the licence expression can be satisfied using allowed licences only. */
export function allowed(expr) {
  if (!expr || !expr.trim()) return false;
  const ok = (n) => n.or ? n.or.some(ok) : n.and ? n.and.every(ok) : ALLOWED.has(n.id) && !COPYLEFT.test(n.id) && (!n.ex || EXCEPTIONS.has(n.ex));
  try { return ok(parseSpdx(expr)); } catch { return false; }
}

function licenceOf(pj) {
  if (VERIFIED[pj.name]) return VERIFIED[pj.name];
  if (typeof pj.license === "string") return pj.license;
  if (pj.license?.type) return pj.license.type;
  if (Array.isArray(pj.licenses)) return pj.licenses.map((l) => (typeof l === "string" ? l : l.type)).join(" OR ");
  return "";
}

function npmPackages() {
  const out = new Map();
  const seenDirs = new Set();
  const walk = (dir) => {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if ((!e.isDirectory() && !e.isSymbolicLink()) || e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      if (e.name.startsWith("@")) { walk(p); continue; }
      let real;
      try { real = fs.realpathSync(p); } catch { continue; }
      if (seenDirs.has(real)) continue;
      seenDirs.add(real);
      try {
        const pj = JSON.parse(fs.readFileSync(path.join(p, "package.json"), "utf8"));
        if (pj.name && pj.version) out.set(`${pj.name}@${pj.version}`, licenceOf(pj));
      } catch { /* a folder without package.json */ }
      walk(path.join(p, "node_modules"));
    }
  };
  walk(path.join(ROOT, "node_modules"));
  return out;
}

function cargoBin() {
  const home = path.join(os.homedir(), ".cargo", "bin", process.platform === "win32" ? "cargo.exe" : "cargo");
  return fs.existsSync(home) ? home : "cargo";
}

function cargoPackages() {
  const dir = path.join(ROOT, "desktop", "src-tauri");
  if (!fs.existsSync(path.join(dir, "Cargo.toml"))) return null;
  let raw;
  try {
    raw = execFileSync(cargoBin(), ["metadata", "--format-version", "1", "--locked", ...(args.has("--online") ? [] : ["--offline"])], { cwd: dir, encoding: "utf8", maxBuffer: 256 << 20, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    if (args.has("--cargo")) throw new Error(`cargo metadata failed: ${String(e.stderr || e.message).trim().split("\n")[0]}`);
    return null;
  }
  const out = new Map();
  // Workspace members (our own crate) have no source.
  for (const p of JSON.parse(raw).packages) if (p.source) out.set(`${p.name}@${p.version}`, p.license ?? "");
  return out;
}

function check(kind, pkgs) {
  const bad = [...pkgs].filter(([, lic]) => !allowed(lic));
  if (args.has("--list")) for (const [k, lic] of [...pkgs].sort()) console.log(`  ${kind} ${k}: ${lic || "(none)"}`);
  console.log(`${bad.length ? "✗" : "✓"} ${pkgs.size} ${kind} packages${bad.length ? `, ${bad.length} not allowed:` : ", all licences allowed"}`);
  for (const [k, lic] of bad) console.log(`    ${k}: ${lic || "(no licence field)"}${COPYLEFT.test(lic) ? "  ← copyleft" : ""}`);
  return bad.length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  let failed = check("npm", npmPackages());
  const crates = cargoPackages();
  if (crates) failed += check("cargo", crates);
  else console.log("– Rust crates skipped (cargo not available); CI runs them with --cargo");
  if (failed) {
    console.log("\nLicence check failed. HingeLab ships closed-source; see CURSOR_INKSCAPE_PARITY.md §0.3 and docs/FEATURE_SOURCES.md.");
    process.exit(1);
  }
}
