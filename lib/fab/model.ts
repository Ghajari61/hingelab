/**
 * The fabrication model: one statement of what a design makes, shared by the status bar, the
 * analysis panel, the assembly guide and the export notes, so they cannot disagree. It keeps four
 * sizes apart: the assembled product, each part (nominal, before kerf), each sheet, and the bounds
 * the parts occupy on it. All lengths are millimetres.
 */
import type { BBox, Layout } from "@/lib/hinge";
import type { SheetRect } from "@/lib/fit/arrange";
import { SHEET_EDGE } from "@/lib/fit/arrange";

type Pt = [number, number];
type Contour = Pt[];

/** A part's operations, as contours (closed outlines and holes; open cuts and scores). */
export interface PartOps {
  outline: Contour[];
  inner: Contour[];
  cuts: Contour[];
  score: Contour[];
  engrave: Contour[];
}

export interface FabPart {
  id: string;
  name: string;
  /** The part's size on the sheet (after kerf, as cut), mm. */
  w: number;
  h: number;
  /** Which sheet it is on (0-based), or -1 when it is on none. */
  sheet: number;
  /** Material, thickness and colour it is cut from. */
  stock: string;
  /** Lengths of its operations, mm. */
  cut: number;
  score: number;
  /** Engraved area's outline length, mm (a size for the job, not a time). */
  engrave: number;
}

export interface FabSheet {
  index: number;
  w: number;
  h: number;
  stock: string;
  parts: number;
  /** The occupied bounds from the sheet's corner, with the edge margin, mm. */
  used: { w: number; h: number };
}

export interface FabModel {
  product: string;
  units: "mm";
  /** The assembled product's size, mm (x, y, z), when the design knows how it goes together. */
  assembled: [number, number, number] | null;
  material: { name: string; T: number; kx: number; ky: number };
  /** The scale the product was built at (1 unless it was resized to fit). */
  scale: number;
  parts: FabPart[];
  sheets: FabSheet[];
  /** The whole layout (every sheet stacked), mm. */
  layout: { w: number; h: number };
  totals: { cut: number; score: number; engrave: number; partArea: number; sheetArea: number; usage: number; stocks: string[] };
}

export function polyLength(c: Contour, closed: boolean): number {
  let L = 0;
  for (let i = 1; i < c.length; i++) L += Math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]);
  if (closed && c.length > 2) L += Math.hypot(c[0][0] - c[c.length - 1][0], c[0][1] - c[c.length - 1][1]);
  return L;
}
export function polyArea(c: Contour): number {
  let a = 0;
  for (let i = 0; i < c.length; i++) { const [x0, y0] = c[i], [x1, y1] = c[(i + 1) % c.length]; a += x0 * y1 - x1 * y0; }
  return a / 2;
}

/** Which stacked sheet a layout item sits on. */
export function sheetOf(sheets: SheetRect[] | null, y0: number): number {
  if (!sheets?.length) return 0;
  return sheets.findIndex((r) => y0 >= r.y - 1e-6 && y0 <= r.y + r.h + 1e-6);
}

/** The stock a sheet holds: its tag (material), else the main material. */
const stockOfSheet = (s: SheetRect, main: string) => {
  const m = / · (.+?)(?: · part larger than the sheet)?$/.exec(s.label);
  return m ? m[1] : main;
};

export interface FabInput<P extends { bbox: BBox }> {
  product: string;
  lay: Layout<P>;
  sheets: SheetRect[] | null;
  /** The sheet size when the layout has no stacked sheets. */
  bed: { w: number; h: number };
  material: FabModel["material"];
  scale?: number;
  assembled?: FabModel["assembled"];
  /** Items to leave out (a calibration bar is not a part). */
  skip?: (item: Layout<P>["items"][number]) => boolean;
  id: (pt: P) => string;
  name: (pt: P) => string;
  stock?: (pt: P) => string | undefined;
  ops?: (pt: P) => PartOps;
}

export function fabModel<P extends { bbox: BBox }>(f: FabInput<P>): FabModel {
  const main = `${f.material.name}`;
  const parts: FabPart[] = [];
  let cut = 0, score = 0, engrave = 0, partArea = 0;
  const used = new Map<number, { w: number; h: number; n: number }>();
  for (const it of f.lay.items) {
    if (f.skip?.(it)) continue;
    const pt = it.pt;
    const si = sheetOf(f.sheets, it.oy + pt.bbox.y0);
    const o = f.ops?.(pt);
    const c = o ? [...o.outline, ...o.inner].reduce((a, k) => a + polyLength(k, true), 0) + o.cuts.reduce((a, k) => a + polyLength(k, false), 0) : 0;
    const s = o ? o.score.reduce((a, k) => a + polyLength(k, false), 0) : 0;
    const e = o ? o.engrave.reduce((a, k) => a + polyLength(k, true), 0) : 0;
    const area = o ? Math.max(0, o.outline.reduce((a, k) => a + Math.abs(polyArea(k)), 0) - o.inner.reduce((a, k) => a + Math.abs(polyArea(k)), 0)) : (pt.bbox.x1 - pt.bbox.x0) * (pt.bbox.y1 - pt.bbox.y0);
    cut += c; score += s; engrave += e; partArea += area;
    const sheet = f.sheets?.[si];
    const stock = f.stock?.(pt) ?? (sheet ? stockOfSheet(sheet, main) : main);
    parts.push({ id: f.id(pt), name: f.name(pt), w: pt.bbox.x1 - pt.bbox.x0, h: pt.bbox.y1 - pt.bbox.y0, sheet: si, stock, cut: c, score: s, engrave: e });
    if (si >= 0) {
      const u = used.get(si) ?? { w: 0, h: 0, n: 0 };
      const sx = sheet?.x ?? 0, sy = sheet?.y ?? 0, sw = sheet?.w ?? f.bed.w, sh = sheet?.h ?? f.bed.h;
      u.w = Math.max(u.w, Math.min(sw, it.ox + pt.bbox.x1 - sx + SHEET_EDGE));
      u.h = Math.max(u.h, Math.min(sh, it.oy + pt.bbox.y1 - sy + SHEET_EDGE));
      u.n++;
      used.set(si, u);
    }
  }
  const rects = f.sheets?.length ? f.sheets : [{ x: 0, y: 0, w: f.bed.w, h: f.bed.h, label: "Sheet 1 of 1" }];
  const sheets: FabSheet[] = rects.map((r, i) => {
    const u = used.get(i) ?? { w: 0, h: 0, n: 0 };
    const on = parts.filter((p) => p.sheet === i);
    return { index: i, w: r.w, h: r.h, stock: on[0]?.stock ?? stockOfSheet(r, main), parts: u.n, used: { w: u.w, h: u.h } };
  });
  const sheetArea = sheets.reduce((a, s) => a + s.w * s.h, 0);
  return {
    product: f.product, units: "mm", assembled: f.assembled ?? null, material: f.material, scale: f.scale ?? 1,
    parts, sheets, layout: { w: f.lay.width, h: f.lay.height },
    totals: { cut, score, engrave, partArea, sheetArea, usage: sheetArea ? partArea / sheetArea : 0, stocks: [...new Set(parts.map((p) => p.stock))] },
  };
}

/** The status bar's parts and "Used" text: one sheet's occupied size, or the sheet count and the largest on any of them. */
export function fabStatus(m: FabModel, fmt: (mm: number) => string): { count: number; used: string } {
  const w = Math.max(0, ...m.sheets.map((s) => s.used.w)), h = Math.max(0, ...m.sheets.map((s) => s.used.h));
  const size = `${fmt(w)} × ${fmt(h)}`;
  return { count: m.parts.length, used: m.sheets.length > 1 ? `${m.sheets.length} sheets, up to ${size} each` : size };
}

/** One line for status bars and file notes: parts, sheets and the stocks they come from. */
export function fabSummary(m: FabModel, fmt: (mm: number) => string = (v) => `${Math.round(v * 10) / 10} mm`): string {
  const n = m.sheets.length;
  const stocks = m.totals.stocks.length > 1 ? `, ${m.totals.stocks.length} stocks` : "";
  const size = m.assembled ? `; assembled ${m.assembled.map((v) => fmt(v)).join(" × ")}` : "";
  return `${m.parts.length} part${m.parts.length === 1 ? "" : "s"} on ${n} sheet${n === 1 ? "" : "s"}${stocks}${size}`;
}
