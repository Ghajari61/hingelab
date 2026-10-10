/**
 * Nesting v1: bounding-box packing with MaxRects (best short side fit) over as many sheets as
 * needed. Parts turn by 0° or 90° (free rotation for slim parts when it shrinks the box by more
 * than 10 %), unless the grain forbids it. The API takes outlines and returns placements, so a
 * true-shape nester can replace it later.
 */
import { convexHull } from "./backboard";
import type { Contour, MaterialSettings, Point, Sheet, SheetItem } from "./types";

export interface NestPart {
  id: string;
  /** Kerf-compensated outline contours, part-local mm. */
  outline: Contour[];
  area: number;
}

export interface NestResult {
  sheets: Sheet[];
  tooBig: string[];
}

interface Rect { x: number; y: number; w: number; h: number }

class MaxRects {
  free: Rect[];
  constructor(public w: number, public h: number) { this.free = [{ x: 0, y: 0, w, h }]; }

  find(w: number, h: number): { r: Rect; score: number } | null {
    let best: Rect | null = null, bs = Infinity, bl = Infinity;
    for (const f of this.free) {
      if (w <= f.w + 1e-9 && h <= f.h + 1e-9) {
        const s = Math.min(f.w - w, f.h - h), l = Math.max(f.w - w, f.h - h);
        if (s < bs || (s === bs && l < bl)) { best = { x: f.x, y: f.y, w, h }; bs = s; bl = l; }
      }
    }
    return best ? { r: best, score: bs } : null;
  }

  place(r: Rect) {
    const next: Rect[] = [];
    for (const f of this.free) {
      if (r.x >= f.x + f.w || r.x + r.w <= f.x || r.y >= f.y + f.h || r.y + r.h <= f.y) { next.push(f); continue; }
      if (r.x > f.x) next.push({ x: f.x, y: f.y, w: r.x - f.x, h: f.h });
      if (r.x + r.w < f.x + f.w) next.push({ x: r.x + r.w, y: f.y, w: f.x + f.w - r.x - r.w, h: f.h });
      if (r.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: r.y - f.y });
      if (r.y + r.h < f.y + f.h) next.push({ x: f.x, y: r.y + r.h, w: f.w, h: f.y + f.h - r.y - r.h });
    }
    this.free = next.filter((a, i) => !next.some((b, j) => j !== i && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h && (j < i || a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h)));
  }
}

const rot = ([x, y]: Point, deg: number): Point => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
};

/** Sheet point for a part-local point. */
export const toSheet = (pt: Point, it: SheetItem): Point => { const [x, y] = rot(pt, it.angle); return [x + it.x, y + it.y]; };

function rotatedBox(pts: Point[], deg: number) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    const [x, y] = rot(p, deg);
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}

/** Allowed rotations: grain fixes the part's x axis along the sheet's x (or y). */
export function candidateAngles(hull: Point[], grain: MaterialSettings["grain"]): number[] {
  if (grain === "along-x") return [0];
  if (grain === "along-y") return [90];
  const out = [0, 90];
  const area = (d: number) => { const b = rotatedBox(hull, d); return b.w * b.h; };
  const base = Math.min(area(0), area(90));
  let bestA = Infinity, bestD = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const d = (-Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    const ar = area(d);
    if (ar < bestA) { bestA = ar; bestD = d; }
  }
  if (bestA < 0.9 * base) out.push(bestD, bestD + 90);
  return out;
}

function pack(parts: { p: NestPart; hull: Point[]; angles: number[] }[], o: MaterialSettings) {
  const W = o.sheetW - 2 * o.sheetMargin + o.partGap, H = o.sheetH - 2 * o.sheetMargin + o.partGap;
  const bins: { mr: MaxRects; items: SheetItem[]; area: number }[] = [];
  const tooBig: { p: NestPart; hull: Point[] }[] = [];
  for (const { p, hull, angles } of parts) {
    const boxes = angles.map(a => ({ a, b: rotatedBox(hull, a) }));
    const fitsEmpty = boxes.some(({ b }) => b.w + o.partGap <= W + 1e-9 && b.h + o.partGap <= H + 1e-9);
    if (!fitsEmpty) { tooBig.push({ p, hull }); continue; }
    let placed = false;
    for (let bi = 0; bi <= bins.length && !placed; bi++) {
      if (bi === bins.length) bins.push({ mr: new MaxRects(W, H), items: [], area: 0 });
      const bin = bins[bi];
      let best: { r: Rect; score: number; a: number; b: { x0: number; y0: number } } | null = null;
      for (const { a, b } of boxes) {
        const f = bin.mr.find(b.w + o.partGap, b.h + o.partGap);
        if (f && (!best || f.score < best.score)) best = { ...f, a, b };
      }
      if (!best) continue;
      bin.mr.place(best.r);
      bin.items.push({ partId: p.id, angle: best.a, x: o.sheetMargin + best.r.x - best.b.x0, y: o.sheetMargin + best.r.y - best.b.y0 });
      bin.area += p.area;
      placed = true;
    }
  }
  return { bins, tooBig };
}

const natural = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

/**
 * Nest parts onto sheets. Consecutive ids stay together (packing in id order) unless packing by
 * size saves more than 5 % of the material.
 */
export function nestParts(parts: NestPart[], o: MaterialSettings): NestResult {
  const prepared = parts.map(p => {
    const hull = convexHull(p.outline.flat());
    return { p, hull, angles: candidateAngles(hull, o.grain) };
  });
  const byId = [...prepared].sort((a, b) => natural(a.p.id, b.p.id));
  const bySize = [...prepared].sort((a, b) => {
    const A = rotatedBox(a.hull, 0), B = rotatedBox(b.hull, 0);
    return B.w * B.h - A.w * A.h || natural(a.p.id, b.p.id);
  });
  const A = pack(byId, o), B = pack(bySize, o);
  const sheetArea = o.sheetW * o.sheetH;
  const total = parts.reduce((s, p) => s + p.area, 0);
  const usage = (n: number) => (n ? total / (n * sheetArea) : 0);
  const pick = A.bins.length <= B.bins.length || usage(B.bins.length) - usage(A.bins.length) < 0.05 ? A : B;

  const sheets: Sheet[] = pick.bins.map((b, i) => ({ index: i, width: o.sheetW, height: o.sheetH, items: b.items, usage: b.area / sheetArea }));
  for (const { p, hull } of pick.tooBig) {
    const options = [0, 90].map(a => ({ a, b: rotatedBox(hull, a) })).sort((x, y) => x.b.w * x.b.h - y.b.w * y.b.h || Math.max(x.b.w - o.sheetW, x.b.h - o.sheetH) - Math.max(y.b.w - o.sheetW, y.b.h - o.sheetH));
    const { a, b } = options[0];
    const w = b.w + 2 * o.sheetMargin, h = b.h + 2 * o.sheetMargin;
    sheets.push({ index: sheets.length, width: w, height: h, items: [{ partId: p.id, angle: a, x: o.sheetMargin - b.x0, y: o.sheetMargin - b.y0 }], usage: p.area / (w * h), oversize: true });
  }
  return { sheets, tooBig: pick.tooBig.map(t => t.p.id) };
}
