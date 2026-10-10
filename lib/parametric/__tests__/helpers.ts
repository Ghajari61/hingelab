import Module, { type ManifoldToplevel } from "manifold-3d";
import type { Contour, Shape } from "../types";

let cached: Promise<ManifoldToplevel> | null = null;
export function manifold() {
  if (!cached) cached = Module().then(w => { w.setup(); return w; });
  return cached;
}

function segmentsCross(a: number[], b: number[], c: number[], d: number[]) {
  const o = (p: number[], q: number[], r: number[]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Proper crossings between edges of the contours (shared endpoints do not count). */
export function crossings(contours: Contour[]): number {
  const edges: [number[], number[]][] = [];
  for (const c of contours) for (let i = 0; i < c.length; i++) edges.push([c[i], c[(i + 1) % c.length]]);
  const sorted = edges.map(e => ({ e, x0: Math.min(e[0][0], e[1][0]), x1: Math.max(e[0][0], e[1][0]) })).sort((a, b) => a.x0 - b.x0);
  let n = 0;
  for (let i = 0; i < sorted.length; i++) {
    const A = sorted[i];
    for (let j = i + 1; j < sorted.length && sorted[j].x0 <= A.x1; j++) {
      const B = sorted[j];
      if (segmentsCross(A.e[0], A.e[1], B.e[0], B.e[1])) n++;
    }
  }
  return n;
}

/**
 * Rasterise a shape (even-odd scanlines at `ppm` pixels per mm) and count 4-connected components
 * of the filled pixels, by joining overlapping runs of neighbouring rows.
 */
export function rasterComponents(s: Shape, ppm = 10): number {
  const contours = [s.outer, ...s.holes];
  const { y0, y1 } = s.bbox;
  const rows = Math.ceil((y1 - y0) * ppm) + 1;
  const parent: number[] = [];
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  let prev: { a: number; b: number; id: number }[] = [];
  for (let r = 0; r < rows; r++) {
    const y = y0 + (r + 0.5) / ppm;
    const xs: number[] = [];
    for (const c of contours) for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
      const [xi, yi] = c[i], [xj, yj] = c[j];
      if ((yi > y) !== (yj > y)) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    const cur: { a: number; b: number; id: number }[] = [];
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.ceil(xs[k] * ppm - 0.5), b = Math.floor(xs[k + 1] * ppm - 0.5);
      if (b < a) continue;
      const id = parent.length;
      parent.push(id);
      cur.push({ a, b, id });
      for (const p of prev) if (p.a <= b && a <= p.b) union(id, p.id);
    }
    prev = cur;
  }
  const roots = new Set<number>();
  for (let i = 0; i < parent.length; i++) roots.add(find(i));
  return roots.size;
}
