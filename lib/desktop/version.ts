/** Desktop app versions: strict x.y.z, compared numerically. */

export type Version = [number, number, number];

export function parseVersion(v: unknown): Version | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function compareVersions(a: Version, b: Version): number {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

/** The app sends `x-hingelab-client: desktop/1.2.3`; null for any other caller. */
export function clientVersion(header: string | null): Version | null {
  const m = /^desktop\/(\S+)$/.exec(header ?? "");
  return m ? parseVersion(m[1]) : null;
}

export const formatVersion = (v: Version) => v.join(".");
