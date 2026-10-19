/** The Windows installer the site offers: the release manifest's latest version (server only, read at build). */
import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

export interface SiteRelease {
  version: string;
  url: string;
  size: string;
  /** SHA-256 of the installer (hex), when the manifest has it. */
  sha256: string | null;
}

export function desktopRelease(): SiteRelease | null {
  try {
    const manifest = JSON.parse(readFileSync(path.join(process.cwd(), "desktop/releases/stable.json"), "utf8"));
    const latest = manifest.latest;
    const win = latest?.platforms?.["windows-x86_64"];
    if (!latest?.version || !win?.url) return null;
    const bytes = Number(win.size) || 0;
    const sha256 = typeof win.sha256 === "string" && /^[0-9a-f]{64}$/.test(win.sha256) ? win.sha256 : null;
    return { version: latest.version, url: new URL(win.url).pathname, size: bytes ? `${(bytes / 1048576).toFixed(1)} MB` : "", sha256 };
  } catch {
    return null;
  }
}
