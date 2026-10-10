/** Small helpers every generator definition uses. */
import { pathD, transform } from "./geom";
import type { Contour } from "./types";

export const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** `base` with every value from `raw` that has the same type (nested objects merged the same way). */
export function mergeInto<T extends object>(base: T, raw: unknown): T {
  if (!isObj(raw)) return base;
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(base)) {
    const r = raw[k];
    if (r === undefined) continue;
    if (isObj(v)) out[k] = mergeInto(v, r);
    else if (typeof v === typeof r) out[k] = r;
  }
  return out as T;
}

export const slug = (s: string, fallback: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || fallback;

/** File name `<kind>-<name>` unless the name already says what it is. */
export function namedFile(kind: string, name: string, tail: string): string {
  const s = slug(name, kind);
  return `${new RegExp(`(^|-)${kind}(-|$)`).test(s) ? s : `${kind}-${s}`}-${tail}`;
}

/** Rail card picture: contours scaled together into a `box` mm square centred in 64 × 44 (open ones stay open). */
export function fitArt(cs: Contour[], box = 38, open: boolean[] = []): string[] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cs) for (const [x, y] of c) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const s = box / Math.max(x1 - x0, y1 - y0, 1);
  return cs.map((c, i) => pathD(transform(c, { x: 32 - ((x0 + x1) / 2) * s, y: 22 - ((y0 + y1) / 2) * s, sx: s, sy: s }), !open[i]));
}

export const HEART_PATH = "M 50 90 C 20 70 0 50 0 28 C 0 10 14 0 27 0 C 38 0 46 7 50 16 C 54 7 62 0 73 0 C 86 0 100 10 100 28 C 100 50 80 70 50 90 Z";
