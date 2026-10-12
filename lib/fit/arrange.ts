/**
 * Products on sheets with Fit on: build at the fitted scale, nest the parts, and stack the sheets
 * top to bottom in one layout (so the canvas and the single SVG export show every sheet).
 */
import type { BBox, Layout } from "@/lib/hinge";
import { cleanFit, fitToSheets, packBoxes, type FitBox, type FitSettings, type Packed, type SheetSpec } from "./fitToSheets";

/** Space between stacked sheets, mm. */
export const SHEET_SPACING = 30;
/** Margin kept free along every sheet edge, mm (as the row layout). */
export const SHEET_EDGE = 5;

export interface SheetRect {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  warn?: boolean;
}

export interface FitInfo {
  mode: FitSettings["mode"];
  scale: number;
  /** Sheets used. */
  sheets: number;
  /** Target count ("sheets" mode). */
  target: number;
  fits: boolean;
}

export interface Arranged<Q, M, P> {
  /** The settings actually built (scaled when Fit shrank the product). */
  params: Q;
  result: M | { error: string };
  lay: Layout<P> | null;
  sheets: SheetRect[] | null;
  fit: FitInfo | null;
}

const pid = (i: number) => String(i).padStart(4, "0");
const boxesOf = (parts: { bbox: BBox }[]): FitBox[] =>
  parts.map((pt, i) => ({ id: pid(i), w: pt.bbox.x1 - pt.bbox.x0, h: pt.bbox.y1 - pt.bbox.y0 }));

export interface ArrangeOptions<P> {
  /** Packs instead of the bounding-box packer. */
  pack?: (parts: P[], sheet: SheetSpec) => Packed;
  /** A copy of the part turned by `angle` degrees (for packers that turn parts). */
  turn?: (part: P, angle: number) => P;
  /** Strip kept free along the bottom of every sheet, mm. */
  reserve?: number;
}

/** One layout for packed sheets stacked vertically, plus the sheet outlines for the canvas. */
export function stackSheets<P extends { bbox: BBox }>(parts: P[], packed: Packed, turn?: (part: P, angle: number) => P): { lay: Layout<P>; sheets: SheetRect[] } {
  const items: Layout<P>["items"] = [];
  const sheets: SheetRect[] = [];
  let y = 0, width = 0;
  const n = packed.sheets.length;
  packed.sheets.forEach((sh, si) => {
    const tag = sh.tag ? ` · ${sh.tag}` : "";
    sheets.push({ x: 0, y, w: sh.w, h: sh.h, label: sh.oversize ? `Sheet ${si + 1} of ${n}${tag} · part larger than the sheet` : `Sheet ${si + 1} of ${n}${tag}`, warn: sh.oversize });
    for (const it of sh.items) {
      const i = Number(it.id), pt = it.angle && turn ? turn(parts[i], it.angle) : parts[i];
      items.push({ pt, i, w: pt.bbox.x1 - pt.bbox.x0, h: pt.bbox.y1 - pt.bbox.y0, ox: it.x - pt.bbox.x0, oy: y + it.y - pt.bbox.y0 });
    }
    width = Math.max(width, sh.w);
    y += sh.h + SHEET_SPACING;
  });
  return { lay: { items, width, height: Math.max(0, y - SHEET_SPACING) }, sheets };
}

/**
 * Arrange a product with Fit on ("sheets" or "auto"). `build` makes the product at a scale and
 * returns its settings and model; the model's parts are what gets nested.
 */
export function arrangeFit<Q, M extends { parts: P[] }, P extends { bbox: BBox }>(
  fitIn: FitSettings,
  spec: { w: number; h: number; gap: number },
  build: (scale: number) => { params: Q; result: M | { error: string } },
  opts: ArrangeOptions<P> = {},
): Arranged<Q, M, P> {
  const fit = cleanFit(fitIn);
  const reserve = opts.reserve ?? 0;
  const sheet: SheetSpec = { w: spec.w, h: spec.h - reserve, margin: SHEET_EDGE, gap: spec.gap };
  const trial = (s: number) => {
    const b = build(s);
    return "error" in b.result ? null : { value: b as { params: Q; result: M }, boxes: boxesOf(b.result.parts) };
  };
  const pack = opts.pack;
  let scale = 1, value: { params: Q; result: M } | null = null, packed: Packed | null = null, fits = true;
  if (fit.mode === "sheets") {
    const r = fitToSheets<{ params: Q; result: M }>({ build: trial, sheet, sheets: fit.sheets, pack: pack && ((v) => pack(v.result.parts, sheet)) });
    if (r) ({ scale, value, packed, fits } = r);
  } else {
    const t = trial(1);
    if (t) { value = t.value; packed = pack ? pack(t.value.result.parts, sheet) : packBoxes(t.boxes, sheet); fits = packed.tooBig.length === 0; }
  }
  if (!value || !packed) {
    const b = build(1);
    return { params: b.params, result: b.result, lay: null, sheets: null, fit: null };
  }
  if (reserve) packed = { ...packed, sheets: packed.sheets.map((sh) => ({ ...sh, h: sh.h + reserve })) };
  const { lay, sheets } = stackSheets(value.result.parts, packed, opts.turn);
  return {
    params: value.params, result: value.result, lay, sheets,
    fit: { mode: fit.mode, scale, sheets: packed.sheets.length, target: fit.mode === "sheets" ? fit.sheets : packed.sheets.length, fits },
  };
}

export interface UsedArea {
  /** Width and height used on a sheet; with several sheets, the largest of each. */
  w: number;
  h: number;
  sheets: number;
}

/**
 * How much of the sheet the parts take, measured like the row layout: from the sheet's corner to
 * the far edge of the parts plus the edge margin. Without stacked sheets that is the layout size.
 */
export function usedArea(lay: Layout<{ bbox: BBox }>, sheets: SheetRect[] | null): UsedArea {
  if (!sheets?.length) return { w: lay.width, h: lay.height, sheets: 1 };
  let w = 0, h = 0;
  for (const { pt, ox, oy } of lay.items) {
    const y0 = oy + pt.bbox.y0;
    const s = sheets.find((r) => y0 >= r.y - 1e-6 && y0 <= r.y + r.h + 1e-6);
    if (!s) continue;
    w = Math.max(w, Math.min(s.w, ox + pt.bbox.x1 - s.x + SHEET_EDGE));
    h = Math.max(h, Math.min(s.h, oy + pt.bbox.y1 - s.y + SHEET_EDGE));
  }
  return { w, h, sheets: sheets.length };
}

/** The status bar's "Used" text: one sheet's size, or the sheet count and the largest size on any of them. */
export function usedText(u: UsedArea, fmt: (mm: number) => string): string {
  const size = `${fmt(u.w)} × ${fmt(u.h)}`;
  return u.sheets > 1 ? `${u.sheets} sheets, up to ${size} each` : size;
}

/** Round a scaled length to 0.1 mm so the settings read cleanly. */
export const r1 = (x: number) => Math.round(x * 10) / 10;
