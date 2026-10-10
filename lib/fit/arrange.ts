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

/** One layout for packed sheets stacked vertically, plus the sheet outlines for the canvas. */
export function stackSheets<P extends { bbox: BBox }>(parts: P[], packed: Packed): { lay: Layout<P>; sheets: SheetRect[] } {
  const items: Layout<P>["items"] = [];
  const sheets: SheetRect[] = [];
  let y = 0, width = 0;
  const n = packed.sheets.length;
  packed.sheets.forEach((sh, si) => {
    sheets.push({ x: 0, y, w: sh.w, h: sh.h, label: sh.oversize ? `Sheet ${si + 1} of ${n} · part larger than the sheet` : `Sheet ${si + 1} of ${n}`, warn: sh.oversize });
    for (const it of sh.items) {
      const i = Number(it.id), pt = parts[i];
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
): Arranged<Q, M, P> {
  const fit = cleanFit(fitIn);
  const sheet: SheetSpec = { w: spec.w, h: spec.h, margin: SHEET_EDGE, gap: spec.gap };
  const trial = (s: number) => {
    const b = build(s);
    return "error" in b.result ? null : { value: b as { params: Q; result: M }, boxes: boxesOf(b.result.parts) };
  };
  let scale = 1, value: { params: Q; result: M } | null = null, packed: Packed | null = null, fits = true;
  if (fit.mode === "sheets") {
    const r = fitToSheets({ build: trial, sheet, sheets: fit.sheets });
    if (r) ({ scale, value, packed, fits } = r);
  } else {
    const t = trial(1);
    if (t) { value = t.value; packed = packBoxes(t.boxes, sheet); fits = packed.tooBig.length === 0; }
  }
  if (!value || !packed) {
    const b = build(1);
    return { params: b.params, result: b.result, lay: null, sheets: null, fit: null };
  }
  const { lay, sheets } = stackSheets(value.result.parts, packed);
  return {
    params: value.params, result: value.result, lay, sheets,
    fit: { mode: fit.mode, scale, sheets: packed.sheets.length, target: fit.mode === "sheets" ? fit.sheets : packed.sheets.length, fits },
  };
}

/** Round a scaled length to 0.1 mm so the settings read cleanly. */
export const r1 = (x: number) => Math.round(x * 10) / 10;
