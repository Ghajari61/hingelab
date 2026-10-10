/**
 * Fit to sheet: one uniform scale for a product so all its parts nest into N sheets or fewer.
 * The caller's build function decides what scales (sizes) and what stays fixed (material, joints),
 * so the parts are rebuilt at every trial scale. Packing is MaxRects from the Parametric nester,
 * with parts kept upright (labels, hinge direction and reading order stay as designed).
 */
import { nestParts } from "@/lib/parametric/nest";

export type FitMode = "off" | "sheets" | "auto";

/** "off": rows on one bed (the classic layout). "sheets": shrink to fit `sheets` sheets. "auto": design size, as many sheets as needed. */
export interface FitSettings {
  mode: FitMode;
  sheets: number;
}

export const FIT_OFF: FitSettings = { mode: "off", sheets: 1 };
export const MAX_FIT_SHEETS = 20;

export interface FitBox {
  id: string;
  w: number;
  h: number;
}

export interface SheetSpec {
  w: number;
  h: number;
  margin: number;
  gap: number;
}

export interface PackedSheet {
  /** Sheet size; larger than the spec only for an oversize sheet holding one part that is too big. */
  w: number;
  h: number;
  oversize: boolean;
  /** Top-left corner of each part's box on the sheet. */
  items: { id: string; x: number; y: number }[];
}

export interface Packed {
  sheets: PackedSheet[];
  tooBig: string[];
}

/** Pack boxes onto as many sheets as needed (MaxRects, consecutive ids kept together where it costs little). */
export function packBoxes(boxes: FitBox[], s: SheetSpec): Packed {
  const res = nestParts(
    boxes.map(b => ({ id: b.id, outline: [[[0, 0], [b.w, 0], [b.w, b.h], [0, b.h]]], area: b.w * b.h })),
    { id: "fit", T: 1, K: 0, sheetW: s.w, sheetH: s.h, sheetMargin: s.margin, partGap: s.gap, grain: "along-x" },
  );
  return {
    sheets: res.sheets.map(sh => ({ w: sh.width, h: sh.height, oversize: !!sh.oversize, items: sh.items.map(it => ({ id: it.partId, x: it.x, y: it.y })) })),
    tooBig: res.tooBig,
  };
}

export interface FitResult<T> {
  scale: number;
  value: T;
  packed: Packed;
  /** Every part is on a regular sheet and no more than the target count is used. */
  fits: boolean;
  /** Smallest scale tried above `scale` that did not fit (null when `scale` is the maximum). */
  upper: number | null;
}

export interface FitOptions<T> {
  /** The product at a scale, or null when it cannot be built there (for example too small). */
  build: (scale: number) => { value: T; boxes: FitBox[] } | null;
  sheet: SheetSpec;
  /** Target sheet count N. */
  sheets: number;
  /** Scale range searched; the default only shrinks. */
  min?: number;
  max?: number;
  /** Relative precision of the result. */
  tol?: number;
}

/**
 * The largest scale in [min, max] at which the product nests into `sheets` sheets, found by a
 * downward scan from an area estimate and then bisection, so `scale` fits and `upper` does not.
 * Returns the product at `max` with `fits: false` when no scale in the range fits.
 */
export function fitToSheets<T>(o: FitOptions<T>): FitResult<T> | null {
  const min = o.min ?? 0.05, max = o.max ?? 1, tol = o.tol ?? 0.004;
  const n = Math.max(1, Math.floor(o.sheets));
  const cache = new Map<number, { value: T; packed: Packed; ok: boolean; area: number } | null>();
  const trial = (s: number) => {
    if (cache.has(s)) return cache.get(s)!;
    const b = o.build(s);
    let t: { value: T; packed: Packed; ok: boolean; area: number } | null = null;
    if (b) {
      const packed = packBoxes(b.boxes, o.sheet);
      t = { value: b.value, packed, ok: packed.tooBig.length === 0 && packed.sheets.length <= n, area: b.boxes.reduce((a, x) => a + x.w * x.h, 0) };
    }
    cache.set(s, t);
    return t;
  };
  const done = (s: number, upper: number | null) => {
    const t = trial(s)!;
    return { scale: s, value: t.value, packed: t.packed, fits: t.ok, upper };
  };

  const top = trial(max);
  if (top?.ok) return done(max, null);

  // Area estimate: parts fill about 70 % of the usable sheet area; never start above max.
  const usable = n * Math.max(1, o.sheet.w - 2 * o.sheet.margin) * Math.max(1, o.sheet.h - 2 * o.sheet.margin);
  let s = top && top.area > 0 ? Math.min(max * 0.995, max * Math.sqrt((0.7 * usable) / top.area)) : max * 0.9;
  s = Math.max(min, s);
  let hi = max, lo: number | null = null;
  // Scan down until something fits.
  for (let guard = 0; guard < 60; guard++) {
    const t = trial(s);
    if (t?.ok) { lo = s; break; }
    hi = s;
    if (s <= min) break;
    s = Math.max(min, s * 0.9);
  }
  if (lo == null) {
    if (top) return { ...done(max, null), fits: false };
    return null;
  }
  while (hi / lo > 1 + tol) {
    const mid = Math.sqrt(lo * hi);
    if (trial(mid)?.ok) lo = mid; else hi = mid;
  }
  return done(lo, hi);
}

/** Saved settings, cleaned: unknown modes are off, the count is 1…MAX_FIT_SHEETS. */
export function cleanFit(f: unknown): FitSettings {
  const q = (f && typeof f === "object" ? f : {}) as Partial<FitSettings>;
  const mode: FitMode = q.mode === "sheets" || q.mode === "auto" ? q.mode : "off";
  const sheets = Math.min(MAX_FIT_SHEETS, Math.max(1, Math.round(Number(q.sheets) || 1)));
  return { mode, sheets };
}
