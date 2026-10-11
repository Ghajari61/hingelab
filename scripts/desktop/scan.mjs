// Scans desktop build output for things that must never ship in the app: secrets (Stripe, Supabase
// service role, signing keys, values of secret env vars) and server-side geometry code.
// `node scripts/desktop/scan.mjs [paths...]` (defaults to desktop/dist and the built executables).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(new URL("../../", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"));

const PATTERNS = [
  [/sk_(live|test)_[A-Za-z0-9]{10,}/, "Stripe secret key"],
  [/rk_(live|test)_[A-Za-z0-9]{10,}/, "Stripe restricted key"],
  [/whsec_[A-Za-z0-9]{10,}/, "Stripe webhook secret"],
  [/SUPABASE_SERVICE_ROLE_KEY/, "service role key name"],
  [/eyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, "JWT (Supabase key or token)"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "PEM private key"],
  [/rsign encrypted secret key|minisign encrypted secret key/, "updater signing private key"],
  [/postgres(ql)?:\/\/[^\s"']+:[^\s"'@]+@/, "database URL with password"],
  [/VERCEL_OIDC_TOKEN|VERCEL_TOKEN/, "Vercel token name"],
];

/** Text that only exists in the server's geometry and export code. */
const SERVER_CODE = [
  "Torsion bars are under",
  "Corner radius must be at least",
  "Slit spacing is too tight",
  "inkscape:groupmode",
  "Made with HingeLab</text>",
  "computeModel",
  "arrangeGenerator",
  "sanitizeGeneratorParams",
  "hingeRequestError",
  "desktop_session_refresh",
];

/** Values of secret variables from the local env files and the signing key files. */
function secretValues() {
  const out = [];
  for (const f of [".env.local", ".env", ".env.production.local", ".env.vercel.production"]) {
    const p = join(root, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/.exec(line);
      if (!m || m[1].startsWith("NEXT_PUBLIC_")) continue;
      if (/SECRET|SERVICE_ROLE|PASSWORD|TOKEN|PRIVATE|WEBHOOK|_KEY$/.test(m[1]) && m[2].length >= 16) out.push([m[2], `value of ${m[1]} (${f})`]);
    }
  }
  const dir = join(homedir(), ".hingelab", "updater");
  for (const [f, label] of [["hingelab-updater.key", "updater private key"], ["hingelab-updater.password", "updater key password"]]) {
    const p = join(dir, f);
    if (!existsSync(p)) continue;
    const v = readFileSync(p, "utf8").trim();
    out.push([v, label]);
    if (f.endsWith(".key")) {
      const inner = Buffer.from(v, "base64").toString("utf8").split("\n")[1]?.trim();
      if (inner) out.push([inner, label + " (decoded)"]);
    }
  }
  return out;
}

function files(p) {
  if (!existsSync(p)) return [];
  if (statSync(p).isFile()) return [p];
  return readdirSync(p).flatMap((f) => files(join(p, f)));
}

export function scanPaths(paths, { serverCode = true } = {}) {
  const secrets = secretValues();
  const problems = [];
  for (const file of paths.flatMap(files)) {
    const buf = readFileSync(file);
    const text = buf.toString("latin1");
    const utf16 = buf.toString("utf16le");
    for (const [re, label] of PATTERNS) if (re.test(text) || re.test(utf16)) problems.push(`${file}: ${label}`);
    for (const [v, label] of secrets) if (text.includes(v) || utf16.includes(v)) problems.push(`${file}: ${label}`);
    if (serverCode && /\.(js|html|css|exe)$/i.test(file)) {
      for (const s of SERVER_CODE) if (text.includes(s)) problems.push(`${file}: server code "${s}"`);
    }
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const paths = args.length ? args : [join(root, "desktop/dist"), join(root, "desktop/src-tauri/target/release/HingeLab.exe")];
  const problems = scanPaths(paths);
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(`Clean: ${paths.join(", ")}`);
}
