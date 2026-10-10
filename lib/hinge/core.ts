import type { Edge, Params, Point } from "./types";
import { TAU, r3 } from "./util";

/**
 * Convex core whose Minkowski sum with a disk of radius R is the plate outline.
 * Formulas are copied from the prototype; do not retune them.
 */
export function buildCore(p: Params): { edges: Edge[]; R: number } | { error: string } {
  const t = p.T;
  let edges: Edge[] = [];
  let R: number;
  const mk = (cx: number, cy: number, nx: number, ny: number, len: number): Edge => ({
    c: [cx, cy], n: [nx, ny], len: Math.max(0, len),
    t: [0, 0], p0: [0, 0], p1: [0, 0], sweep: 0, seam: false, tabs: [],
  });
  if (p.shape === "rect" || p.shape === "pill") {
    R = p.shape === "pill" ? Math.min(p.W, p.D) / 2 : p.R;
    const hw = p.W / 2 - R, hd = p.D / 2 - R;
    if (hw < -1e-9 || hd < -1e-9) return { error: "Corner radius is larger than half the width or depth. Lower the radius or enlarge the box." };
    edges = [mk(0, -hd, 0, -1, 2 * hw), mk(hw, 0, 1, 0, 2 * hd), mk(0, hd, 0, 1, 2 * hw), mk(-hw, 0, -1, 0, 2 * hd)];
  } else if (p.shape === "poly") {
    const N = Math.round(p.sides);
    if (N < 3 || N > 12) return { error: "Polygon needs 3 to 12 sides." };
    R = p.R;
    const a = p.W / 2 - R;
    if (a <= 0) return { error: "Corner radius is too large for this polygon size." };
    const q = 2 * a * Math.tan(Math.PI / N);
    for (let i = 0; i < N; i++) { const f = -Math.PI / 2 + i * TAU / N, n = [Math.cos(f), Math.sin(f)]; edges.push(mk(a * n[0], a * n[1], n[0], n[1], q)); }
  } else {
    const N = Math.round(p.cylFlats);
    if (N < 3 || N > 16) return { error: "Cylinder needs 3 to 16 tab flats." };
    const q = p.tabW + 4;
    const a = q / (2 * Math.tan(Math.PI / N));
    R = p.dia / 2 - a;
    if (R < t + 2) return { error: "Diameter is too small for this many tab flats. Increase the diameter or reduce the flats." };
    for (let i = 0; i < N; i++) { const f = -Math.PI / 2 + i * TAU / N, n = [Math.cos(f), Math.sin(f)]; edges.push(mk(a * n[0], a * n[1], n[0], n[1], q)); }
  }
  for (const e of edges) {
    e.t = [-e.n[1], e.n[0]];
    e.p0 = [e.c[0] - e.t[0] * e.len / 2, e.c[1] - e.t[1] * e.len / 2];
    e.p1 = [e.c[0] + e.t[0] * e.len / 2, e.c[1] + e.t[1] * e.len / 2];
  }
  for (let i = 0; i < edges.length; i++) {
    const a1 = Math.atan2(edges[i].n[1], edges[i].n[0]), a2 = Math.atan2(edges[(i + 1) % edges.length].n[1], edges[(i + 1) % edges.length].n[0]);
    let d = a2 - a1; while (d <= 1e-9) d += TAU; edges[i].sweep = d;
  }
  return { edges, R };
}

/** SVG path of the rounded core, offset by r along each edge normal. */
export function roundedPath(edges: Edge[], r: number, ox = 0, oy = 0) {
  const pt = (p: Point, n: Point) => `${r3(p[0] + n[0] * r + ox)},${r3(p[1] + n[1] * r + oy)}`;
  let d = `M${pt(edges[0].p0, edges[0].n)}`;
  edges.forEach((e, i) => {
    const nx = edges[(i + 1) % edges.length];
    d += ` L${pt(e.p1, e.n)} A${r3(r)},${r3(r)} 0 ${e.sweep > Math.PI ? 1 : 0} 1 ${pt(nx.p0, nx.n)}`;
  });
  return d + " Z";
}

/** Axis-aligned extent of the rounded outline, sampled along each corner arc. */
export function plateExtent(edges: Edge[], r: number) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const e of edges) for (const q of [e.p0, e.p1]) { x0 = Math.min(x0, q[0] - r); x1 = Math.max(x1, q[0] + r); y0 = Math.min(y0, q[1] - r); y1 = Math.max(y1, q[1] + r); }
  // tighter for polygons: sample arcs
  x0 = Infinity; y0 = Infinity; x1 = -Infinity; y1 = -Infinity;
  edges.forEach(e => { const a1 = Math.atan2(e.n[1], e.n[0]); for (let s = 0; s <= 16; s++) { const a = a1 + e.sweep * s / 16, q = [e.p1[0] + Math.cos(a) * r, e.p1[1] + Math.sin(a) * r]; x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); } });
  return { x0, y0, x1, y1 };
}
