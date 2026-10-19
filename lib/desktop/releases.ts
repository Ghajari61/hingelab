/**
 * The desktop release manifest (desktop/releases/stable.json, reviewed in Git and deployed with the
 * website) and the answer the Tauri updater gets. The server only says where a newer installer is;
 * the app installs it only if its minisign signature verifies against the public key built into
 * the app, so a wrong or tampered answer here cannot install anything.
 */
import { compareVersions, formatVersion, parseVersion, type Version } from "./version";

export interface PlatformRelease {
  url: string;
  signature: string;
  /** Installer size in bytes, shown in the update dialog. */
  size: number;
  /** SHA-256 of the installer (hex), shown beside the download so it can be checked. */
  sha256?: string;
}

export interface Release {
  version: string;
  pub_date: string;
  notes: string;
  platforms: Record<string, PlatformRelease>;
}

export interface ReleaseManifest {
  channel: "stable";
  /** Older apps must update before they can use the service (HTTP 426). */
  minimumVersion: string;
  latest: Release | null;
}

/** Hosts an installer may be downloaded from (HTTPS only). */
export const UPDATE_HOSTS = ["github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com", "hingelab.vercel.app"];
const UPDATE_HOST_SUFFIXES = [".public.blob.vercel-storage.com"];

export const PLATFORMS = ["windows-x86_64"] as const;

export function isAllowedUpdateURL(u: unknown): u is string {
  if (typeof u !== "string" || u.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  if (!UPDATE_HOSTS.includes(host) && !UPDATE_HOST_SUFFIXES.some((s) => host.endsWith(s))) return false;
  return /\.exe$/i.test(url.pathname);
}

/** A minisign signature as the Tauri bundler writes it: base64 of "untrusted comment: ..." text. */
export function isSignature(s: unknown): s is string {
  if (typeof s !== "string" || s.length < 100 || s.length > 4000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return false;
  const text = Buffer.from(s, "base64").toString("utf8");
  const lines = text.split("\n");
  return lines[0].startsWith("untrusted comment:") && lines.length >= 4 && lines[2].startsWith("trusted comment:");
}

/**
 * The version recorded in the signature's trusted comment (`version:1.2.3`). The app is built with
 * requireSignedVersion, so it rejects a release whose signed version differs from the one offered.
 */
export function signedVersion(s: string): string | null {
  const trusted = Buffer.from(s, "base64").toString("utf8").split("\n")[2]?.slice("trusted comment: ".length) ?? "";
  return trusted.split("\t").map((f) => f.trim()).find((f) => f.startsWith("version:"))?.slice("version:".length) ?? null;
}

/** Checks a manifest; returns the reason it is unusable, or null. */
export function manifestError(m: unknown): string | null {
  if (!m || typeof m !== "object" || Array.isArray(m)) return "not an object";
  const r = m as Partial<ReleaseManifest>;
  if (r.channel !== "stable") return "channel";
  if (!parseVersion(r.minimumVersion)) return "minimumVersion";
  if (r.latest === null) return null;
  const l = r.latest;
  if (!l || typeof l !== "object") return "latest";
  if (!parseVersion(l.version)) return "latest.version";
  if (compareVersions(parseVersion(r.minimumVersion)!, parseVersion(l.version)!) > 0) return "minimumVersion is above the latest version";
  if (typeof l.pub_date !== "string" || Number.isNaN(Date.parse(l.pub_date))) return "latest.pub_date";
  if (typeof l.notes !== "string" || l.notes.length > 5000) return "latest.notes";
  if (!l.platforms || typeof l.platforms !== "object") return "latest.platforms";
  for (const [k, p] of Object.entries(l.platforms)) {
    if (!(PLATFORMS as readonly string[]).includes(k)) return `unknown platform ${k}`;
    if (!p || !isAllowedUpdateURL(p.url)) return `${k}.url`;
    if (!isSignature(p.signature)) return `${k}.signature`;
    if (signedVersion(p.signature) !== l.version) return `${k}.signature was not made for ${l.version}`;
    if (!Number.isInteger(p.size) || p.size <= 0 || p.size > 500 * 1024 * 1024) return `${k}.size`;
    if (p.sha256 !== undefined && !/^[0-9a-f]{64}$/.test(p.sha256)) return `${k}.sha256`;
  }
  return null;
}

/** The body the Tauri updater expects (plus `size` for the dialog), or null when there is nothing newer. */
export function updateFor(m: ReleaseManifest, target: string, arch: string, current: Version) {
  if (manifestError(m) || !m.latest) return null;
  const p = m.latest.platforms[`${target}-${arch}`];
  if (!p) return null;
  const latest = parseVersion(m.latest.version)!;
  // Never offer the same or an older version (no downgrades, no update loops).
  if (compareVersions(latest, current) <= 0) return null;
  return { version: formatVersion(latest), notes: m.latest.notes, pub_date: m.latest.pub_date, url: p.url, signature: p.signature, size: p.size };
}

/** The oldest app version the service accepts: the manifest's, or DESKTOP_MIN_VERSION when higher. */
export function minimumVersion(m: ReleaseManifest, env = process.env.DESKTOP_MIN_VERSION): Version {
  const base = parseVersion(m.minimumVersion) ?? [0, 0, 0];
  const extra = parseVersion(env);
  return extra && compareVersions(extra, base) > 0 ? extra : base;
}
