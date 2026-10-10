/**
 * True-shape nesting on a grid. Each part's outline, grown by half the part gap (and a little more,
 * so the grid can only err on the safe side), is rasterised with its holes, so parts nest into
 * each other's notches and small parts drop into big holes. Parts go largest first to the lowest,
 * then leftmost, free position on the first sheet where they fit, trying each allowed angle.
 * Free-run tables let a blocked candidate jump straight past the cell that blocks it.
 */
import { offsetShapes, unionShapes } from "@/lib/letters/polygon";
import type { Contour, Point } from "@/lib/letters/types";

export interface OutlinePart {
  id: string;
  /** Outline contours (outer and holes, any orientation), part-local mm. */
  outline: Contour[];
  /** Angles to try, degrees (sheet point = rotate(angle) · local + (x, y)). */
  angles: number[];
}

export interface OutlineSheetSpec {
  w: number;
  h: number;
  margin: number;
  gap: number;
  /** Grid cell, mm (default: 1 mm, coarser on very large sheets). */
  cell?: number;
}

export interface OutlineItem { id: string; angle: number; x: number; y: number }
export interface OutlineSheet { w: number; h: number; oversize: boolean; items: OutlineItem[] }
export interface OutlineNest { sheets: OutlineSheet[]; tooBig: string[] }

/** A point turned by `deg` degrees about the origin (the turn the nester's angles mean). */
export const rotatePoint = ([x, y]: Point, deg: number): Point => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
};
const rot = rotatePoint;

interface Raster {
  angle: number;
  /** Grid origin in rotated part coordinates, mm. */
  gx: number;
  gy: number;
  cw: number;
  ch: number;
  /** Filled runs [a, b] (inclusive cells) per row. */
  rows: [number, number][][];
  cells: number;
  /** Rotated outline bbox, for oversize sheets. */
  bx0: number;
  by0: number;
  bw: number;
  bh: number;
}

/** Cells whose centres are inside the even-odd fill of `cs`, as runs per row. */
function rasterise(cs: Contour[], gx: number, gy: number, cw: number, ch: number, cell: number): [number, number][][] {
  const rows: [number, number][][] = [];
  const edges: number[] = [];
  for (const c of cs) for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length];
    if (a[1] !== b[1]) edges.push(a[0], a[1], b[0], b[1]);
  }
  for (let j = 0; j < ch; j++) {
    const y = gy + (j + 0.5) * cell;
    const xs: number[] = [];
    for (let e = 0; e < edges.length; e += 4) {
      const ay = edges[e + 1], by = edges[e + 3];
      if ((ay > y) !== (by > y)) xs.push(edges[e] + ((y - ay) * (edges[e + 2] - edges[e])) / (by - ay));
    }
    xs.sort((p, q) => p - q);
    const runs: [number, number][] = [];
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil((xs[k] - gx) / cell - 0.5)), b = Math.min(cw - 1, Math.floor((xs[k + 1] - gx) / cell - 0.5));
      if (b < a) continue;
      if (runs.length && a <= runs[runs.length - 1][1] + 1) runs[runs.length - 1][1] = Math.max(runs[runs.length - 1][1], b);
      else runs.push([a, b]);
    }
    rows.push(runs);
  }
  return rows;
}

function rasterOf(outline: Contour[], angle: number, grow: number, cell: number): Raster | null {
  const turned = outline.map((c) => c.map((q) => rot(q, angle)));
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const c of turned) for (const [x, y] of c) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
  if (!isFinite(bx0)) return null;
  const grown = grow > 0 ? offsetShapes(unionShapes(turned, [], true), grow) : unionShapes(turned, [], true);
  const cs = grown.flatMap((s) => [s.outer, ...s.holes]);
  if (!cs.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cs) for (const [x, y] of c) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const cw = Math.max(1, Math.ceil((x1 - x0) / cell)), ch = Math.max(1, Math.ceil((y1 - y0) / cell));
  const rows = rasterise(cs, x0, y0, cw, ch, cell);
  const cells = rows.reduce((a, r) => a + r.reduce((b, [p, q]) => b + q - p + 1, 0), 0);
  return { angle, gx: x0, gy: y0, cw, ch, rows, cells, bx0, by0, bw: bx1 - bx0, bh: by1 - by0 };
}

class Grid {
  /** free[y][x]: free cells from x to the right, inclusive. */
  free: Int32Array[];
  constructor(public w: number, public h: number) {
    this.free = Array.from({ length: h }, () => {
      const r = new Int32Array(w);
      for (let x = 0; x < w; x++) r[x] = w - x;
      return r;
    });
  }

  /** First (lowest, then leftmost) position where the raster fits, or null. */
  find(r: Raster): [number, number] | null {
    if (r.cw > this.w || r.ch > this.h) return null;
    const order = r.rows.map((_, j) => j).filter((j) => r.rows[j].length);
    for (let Y = 0; Y + r.ch <= this.h; Y++) {
      let X = 0;
      scan: while (X + r.cw <= this.w) {
        for (const j of order) {
          const row = this.free[Y + j];
          for (const [a, b] of r.rows[j]) {
            const f = row[X + a];
            if (f < b - a + 1) { X += f + 1; continue scan; }
          }
        }
        return [X, Y];
      }
    }
    return null;
  }

  place(r: Raster, X: number, Y: number) {
    for (let j = 0; j < r.ch; j++) {
      if (!r.rows[j].length) continue;
      const row = this.free[Y + j];
      for (const [a, b] of r.rows[j]) for (let x = X + a; x <= X + b; x++) row[x] = 0;
      for (let x = Math.min(this.w - 1, X + r.cw); x >= 0; x--) row[x] = row[x] === 0 ? 0 : x + 1 < this.w ? row[x + 1] + 1 : 1;
    }
  }
}

/** Nest parts by their outlines onto as many sheets as needed. */
export function nestOutlines(parts: OutlinePart[], s: OutlineSheetSpec): OutlineNest {
  const cell = s.cell ?? Math.max(1, Math.sqrt((s.w * s.h) / 400000));
  // The usable area reaches gap/2 into the margin: grown outlines then stop exactly at the margin.
  const ux = s.margin - s.gap / 2, uy = s.margin - s.gap / 2;
  const gw = Math.floor((s.w - 2 * s.margin + s.gap) / cell), gh = Math.floor((s.h - 2 * s.margin + s.gap) / cell);
  const grow = s.gap / 2 + cell * 0.75;
  const prepared = parts.map((p) => {
    const rasters = [...new Set(p.angles.length ? p.angles : [0])].map((a) => rasterOf(p.outline, a, grow, cell)).filter((r): r is Raster => !!r);
    return { p, rasters, size: rasters.length ? Math.min(...rasters.map((r) => r.cells)) : 0 };
  });
  prepared.sort((a, b) => b.size - a.size || a.p.id.localeCompare(b.p.id, "en", { numeric: true }));
  const sheets: { grid: Grid; items: OutlineItem[] }[] = [];
  const out: OutlineSheet[] = [];
  const tooBig: string[] = [];
  const item = (p: OutlinePart, r: Raster, X: number, Y: number): OutlineItem => ({ id: p.id, angle: r.angle, x: ux + X * cell - r.gx, y: uy + Y * cell - r.gy });
  for (const { p, rasters } of prepared) {
    if (!rasters.length) continue;
    if (!rasters.some((r) => r.cw <= gw && r.ch <= gh)) { tooBig.push(p.id); continue; }
    let placed = false;
    for (let si = 0; si <= sheets.length && !placed; si++) {
      if (si === sheets.length) sheets.push({ grid: new Grid(gw, gh), items: [] });
      const sh = sheets[si];
      let best: { r: Raster; X: number; Y: number; score: number } | null = null;
      for (const r of rasters) {
        const at = sh.grid.find(r);
        if (!at) continue;
        const score = (at[1] + r.ch) * gw + at[0];
        if (!best || score < best.score) best = { r, X: at[0], Y: at[1], score };
      }
      if (!best) continue;
      sh.grid.place(best.r, best.X, best.Y);
      sh.items.push(item(p, best.r, best.X, best.Y));
      placed = true;
    }
  }
  for (const sh of sheets) if (sh.items.length) out.push({ w: s.w, h: s.h, oversize: false, items: sh.items });
  for (const id of tooBig) {
    const p = parts.find((q) => q.id === id)!;
    const r = [0, 90].map((a) => rasterOf(p.outline, a, 0, cell)).filter((q): q is Raster => !!q).sort((a, b) => a.bw * a.bh - b.bw * b.bh)[0];
    out.push({ w: r.bw + 2 * s.margin, h: r.bh + 2 * s.margin, oversize: true, items: [{ id, angle: r.angle, x: s.margin - r.bx0, y: s.margin - r.by0 }] });
  }
  return { sheets: out, tooBig };
}
