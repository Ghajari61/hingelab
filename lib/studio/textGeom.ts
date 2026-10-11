/**
 * Geometry for text on a path and flowed text: an arc-length walker that returns exact points and
 * tangents on the curve, and the horizontal spans of a region that a whole line band fits inside.
 */
import { cubicAt, segments } from "./geom";
import type { Anchor, Subpath, Vec } from "./types";

/** The same subpath drawn the other way round (closed paths keep their first node). */
export function reverseSubpath(s: Subpath): Subpath {
  const flip = (a: Anchor): Anchor => ({ x: a.x, y: a.y, ...(a.o ? { i: { ...a.o } } : {}), ...(a.i ? { o: { ...a.i } } : {}), ...(a.k ? { k: a.k } : {}) });
  const nodes = [...s.nodes].reverse().map(flip);
  if (s.closed && nodes.length) nodes.unshift(nodes.pop()!);
  return { closed: s.closed, nodes };
}

export interface PathWalker {
  length: number;
  closed: boolean;
  /** Point at arc length `s` (clamped to the path) and the direction of travel there (radians, y down). */
  at(s: number): { p: Vec; angle: number };
}

interface Piece { s0: number; s1: number; seg: number; t0: number; t1: number }

/** Arc length is tabulated on 48 chords per curve; points and tangents are evaluated on the curve itself. */
export function pathWalker(sub: Subpath, reverse = false): PathWalker {
  const segs = segments(reverse ? reverseSubpath(sub) : sub);
  const pieces: Piece[] = [];
  let acc = 0;
  segs.forEach((g, i) => {
    const n = g.line ? 1 : 48;
    let prev = g.p0;
    for (let k = 1; k <= n; k++) {
      const q = g.line ? g.p3 : cubicAt(g, k / n);
      const l = Math.hypot(q.x - prev.x, q.y - prev.y);
      if (l > 0) pieces.push({ s0: acc, s1: acc + l, seg: i, t0: (k - 1) / n, t1: k / n });
      acc += l;
      prev = q;
    }
  });
  const length = acc;
  const at = (s: number) => {
    if (!pieces.length) { const a = sub.nodes[0] ?? { x: 0, y: 0 }; return { p: { x: a.x, y: a.y }, angle: 0 }; }
    const x = Math.max(0, Math.min(length, s));
    let lo = 0, hi = pieces.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (pieces[mid].s1 < x) lo = mid + 1; else hi = mid; }
    const pc = pieces[lo], g = segs[pc.seg];
    const t = pc.t0 + ((pc.t1 - pc.t0) * (x - pc.s0)) / (pc.s1 - pc.s0);
    if (g.line) return { p: { x: g.p0.x + (g.p3.x - g.p0.x) * t, y: g.p0.y + (g.p3.y - g.p0.y) * t }, angle: Math.atan2(g.p3.y - g.p0.y, g.p3.x - g.p0.x) };
    const u = 1 - t;
    let dx = 3 * u * u * (g.c1.x - g.p0.x) + 6 * u * t * (g.c2.x - g.c1.x) + 3 * t * t * (g.p3.x - g.c2.x);
    let dy = 3 * u * u * (g.c1.y - g.p0.y) + 6 * u * t * (g.c2.y - g.c1.y) + 3 * t * t * (g.p3.y - g.c2.y);
    if (Math.hypot(dx, dy) < 1e-12) { const a = cubicAt(g, pc.t0), b = cubicAt(g, pc.t1); dx = b.x - a.x; dy = b.y - a.y; }
    return { p: cubicAt(g, t), angle: Math.atan2(dy, dx) };
  };
  return { length, closed: sub.closed, at };
}

type Span = [number, number];

/** Inside intervals of an even-odd region along the horizontal line at y. */
function scanline(rings: Vec[][], y: number): Span[] {
  const xs: number[] = [];
  for (const r of rings) {
    for (let k = 0, j = r.length - 1; k < r.length; j = k++) {
      const a = r[j], b = r[k];
      if ((a.y > y) !== (b.y > y)) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
  }
  xs.sort((a, b) => a - b);
  const out: Span[] = [];
  for (let k = 0; k + 1 < xs.length; k += 2) if (xs[k + 1] > xs[k]) out.push([xs[k], xs[k + 1]]);
  return out;
}

function intersect(a: Span[], b: Span[]): Span[] {
  const out: Span[] = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i][0], b[j][0]), hi = Math.min(a[i][1], b[j][1]);
    if (hi > lo) out.push([lo, hi]);
    if (a[i][1] < b[j][1]) i++; else j++;
  }
  return out;
}

/**
 * The x intervals inside the region (closed polygons, even-odd) for every y of the band [y0, y1],
 * left to right. Interval ends move linearly between vertex heights, so testing the band edges and
 * just either side of every vertex inside the band is exact for polygons.
 */
export function bandSpans(rings: Vec[][], y0: number, y1: number): Span[] {
  const eps = 1e-7 * Math.max(1, Math.abs(y1 - y0));
  const ys = [y0 + eps, y1 - eps];
  for (const r of rings) for (const p of r) if (p.y > y0 && p.y < y1) ys.push(p.y - eps, p.y + eps);
  let acc: Span[] | null = null;
  for (const y of ys) {
    const iv = scanline(rings, y);
    acc = acc ? intersect(acc, iv) : iv;
    if (!acc.length) return [];
  }
  return (acc ?? []).filter(([a, b]) => b - a > 1e-6);
}
