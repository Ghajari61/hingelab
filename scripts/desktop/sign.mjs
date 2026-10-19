// Authenticode signing for the Windows build, called by the Tauri bundler for the program and the
// installer (bundle.windows.signCommand): `node scripts/desktop/sign.mjs <file>`.
//
// With Azure Trusted Signing configured (the AZURE_* variables below, as CI secrets) the file is
// signed and timestamped with signtool and the Trusted Signing dlib. Without them it says so and
// leaves the file unsigned (exit 0), so local builds keep working. No self-signed certificates:
// a certificate Windows does not trust would only change SmartScreen's warning, not remove it.
// The updater's minisign signature is separate and made after this, over the signed installer.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.error(`sign.mjs: no file to sign (${file ?? "none given"}).`);
  process.exit(1);
}

/** Azure Trusted Signing: the app registration's credentials and the signing account. */
const NEEDED = ["AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET", "AZURE_TRUSTED_SIGNING_ENDPOINT", "AZURE_TRUSTED_SIGNING_ACCOUNT", "AZURE_TRUSTED_SIGNING_PROFILE", "AZURE_TRUSTED_SIGNING_DLIB"];
const missing = NEEDED.filter((k) => !process.env[k]);
if (missing.length) {
  console.warn(`sign.mjs: Authenticode signing skipped for ${file} (not configured: ${missing.join(", ")}). See docs/SIGNING.md.`);
  process.exit(0);
}

const signtool = process.env.SIGNTOOL || "signtool.exe";
const dir = mkdtempSync(join(tmpdir(), "hl-sign-"));
try {
  const metadata = join(dir, "metadata.json");
  writeFileSync(metadata, JSON.stringify({
    Endpoint: process.env.AZURE_TRUSTED_SIGNING_ENDPOINT,
    CodeSigningAccountName: process.env.AZURE_TRUSTED_SIGNING_ACCOUNT,
    CertificateProfileName: process.env.AZURE_TRUSTED_SIGNING_PROFILE,
  }));
  // The dlib reads the AZURE_* credentials from the environment; nothing secret is on the command line.
  execFileSync(signtool, ["sign", "/v", "/fd", "SHA256", "/tr", "http://timestamp.acs.microsoft.com", "/td", "SHA256", "/dlib", process.env.AZURE_TRUSTED_SIGNING_DLIB, "/dmdf", metadata, file], { stdio: "inherit" });
  console.log(`sign.mjs: signed ${file}`);
} catch (e) {
  console.error(`sign.mjs: signing ${file} FAILED: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
