/** The Windows installer the site offers: the release manifest's latest version (server only, read at build). */
import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

export interface SiteRelease {
  version: string;
  url: string;
  size: string;
}

export function desktopRelease(): SiteRelease | null {
  try {
    const manifest = JSON.parse(readFileSync(path.join(process.cwd(), "desktop/releases/stable.json"), "utf8"));
    const latest = manifest.latest;
    const win = latest?.platforms?.["windows-x86_64"];
    if (!latest?.version || !win?.url) return null;
    const bytes = Number(win.size) || 0;
    return { version: latest.version, url: new URL(win.url).pathname, size: bytes ? `${(bytes / 1048576).toFixed(1)} MB` : "" };
  } catch {
    return null;
  }
}
