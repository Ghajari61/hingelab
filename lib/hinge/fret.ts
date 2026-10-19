/**
 * Cut-out patterns on a Hinge Box (the same lattice, floral, quatrefoil and other patterns as the
 * Boxes generator): through the lid, and through the wall's flat stretches between the hinge zones,
 * for a lantern or a pierced jewellery box. Holes stay a bar clear of the tab slots, the lid's own
 * opening, the hinge cuts, the wall's edges and its label.
 */
import { fretHoles, isFretKind, type FretSpec, type KeepOut } from "@/lib/generators/fretwork";
import { coreDistance } from "./lidSlot";
import { offsetPolyXY } from "./polygon";
import type { Edge, Params, Point, WallPart } from "./types";

export const hasFret = (p: Params) => isFretKind(p.fret);
export const fretOnLid = (p: Params) => hasFret(p) && p.fretOn !== "walls";
export const fretOnWalls = (p: Params) => hasFret(p) && p.fretOn !== "lid";
export const FRET_CELL = 16;
export const FRET_BAR = 3;

const spec = (p: Params): FretSpec => ({ kind: isFretKind(p.fret) ? p.fret : "none", cell: Math.max(6, p.fretCell ?? FRET_CELL), bar: Math.max(1, p.fretBar ?? FRET_BAR) });

/** A hole shrunk by half the kerf all round, so it comes out at its drawn size. */
function inset(pts: Point[], kx: number, ky: number): Point[] {
  if (!kx && !ky) return pts;
  const out = offsetPolyXY(pts, kx, ky);
  return pts.map((q, i) => [2 * q[0] - out[i][0], 2 * q[1] - out[i][1]] as Point);
}

const boxOf = (pts: Point[]): KeepOut => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
};

/** Holes for a lid plate: inside `rad` of the core, clear of the plate's existing cuts. */
export function lidFret(p: Params, edges: Edge[], rad: number, existing: Point[][]): Point[][] {
  const s = spec(p), clear = rad - s.bar - 1;
  if (clear <= 0) return [];
  const xs = edges.flatMap((e) => [e.p0[0], e.p1[0]]), ys = edges.flatMap((e) => [e.p0[1], e.p1[1]]);
  const x0 = Math.min(...xs) - rad, x1 = Math.max(...xs) + rad, y0 = Math.min(...ys) - rad, y1 = Math.max(...ys) + rad;
  const holes = fretHoles(s, x0, y0, x1, y1, existing.map(boxOf), (q) => coreDistance(edges, q) <= clear);
  return holes.map((c) => inset(c, p.K, p.Ky ?? p.K));
}

/**
 * Holes in a wall strip's flat stretches: between hinge zones (columns closer than two pitches are
 * one zone), clear of the ends (seam fingers), the top and bottom edges and the label.
 */
export function wallFret(p: Params, w: WallPart): Point[][] {
  const s = spec(p), t = p.T, gapY = Math.max(4, t + 1), gapX = Math.max(3, p.slotW + 1);
  const xs = w.cols.map((c) => c.x).sort((a, b) => a - b);
  const zones: [number, number][] = [];
  for (const x of xs) {
    const z = zones[zones.length - 1];
    if (z && x - z[1] <= 2 * p.pitch + 1e-6) z[1] = x; else zones.push([x, x]);
  }
  const flats: [number, number][] = [];
  let from = t + 2;
  for (const [a, b] of zones) { flats.push([from, a - gapX]); from = b + gapX; }
  flats.push([from, w.w - t - 2]);
  const keep: KeepOut[] = [];
  if (w.label) {
    const size = Math.min(7, Math.max(3, w.hBody / 7)), half = (w.name.length * size * 0.62) / 2 + 2;
    keep.push({ x0: w.label.x - half, y0: w.label.y - size, x1: w.label.x + half, y1: w.label.y + size });
  }
  const out: Point[][] = [];
  for (const [a, b] of flats) if (b - a > s.cell) out.push(...fretHoles(s, a, gapY, b, w.hBody - gapY, keep));
  return out.map((c) => inset(c, p.K, p.Ky ?? p.K));
}
