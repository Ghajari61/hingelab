/**
 * Pen and Pencil curve modes and brush outlines: a smooth spline through points (centripetal
 * Catmull–Rom), a uniform cubic B-spline with the points as control points, paraxial (horizontal /
 * vertical) polylines, and the filled outline of a brush of varying width along a path (engraving art).
 */
import { EPS, flatten, simplifyPolyline, smoothStroke } from "./geom";
import { FLAT_TOL, run, toPath, toSubpaths } from "./pathfinder";
import * as ClipperLib from "clipper-lib";
import type { Anchor, Subpath, Vec } from "./types";

export type PenMode = "bezier" | "smooth" | "bspline" | "paraxial";
export type BrushShape = "none" | "triangleIn" | "triangleOut" | "ellipse";
export type CurveMode = "bezier" | "smooth" | "bspline";

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: Vec) => Math.hypot(v.x, v.y);
const same = (a: Vec, b: Vec) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;

/** Smooth curve through every point: centripetal Catmull–Rom (α = ½) as cubic Béziers; open ends continue their first and last chords. */
export function smoothThrough(pts: Vec[], closed: boolean): Subpath {
  const n = pts.length;
  const nodes: Anchor[] = pts.map((p) => ({ x: p.x, y: p.y, k: "smooth" }));
  if (n < 2 || (n === 2 && !closed)) return { closed: closed && n > 2, nodes: pts.map((p) => ({ x: p.x, y: p.y })) };
  const P = (k: number): Vec => {
    if (closed) return pts[((k % n) + n) % n];
    if (k < 0) return { x: 2 * pts[0].x - pts[1].x, y: 2 * pts[0].y - pts[1].y };
    if (k >= n) return { x: 2 * pts[n - 1].x - pts[n - 2].x, y: 2 * pts[n - 1].y - pts[n - 2].y };
    return pts[k];
  };
  const count = closed ? n : n - 1;
  for (let k = 0; k < count; k++) {
    const p0 = P(k - 1), p1 = P(k), p2 = P(k + 1), p3 = P(k + 2);
    const d0 = Math.max(Math.sqrt(len(sub(p1, p0))), 1e-6), d1 = Math.max(Math.sqrt(len(sub(p2, p1))), 1e-6), d2 = Math.max(Math.sqrt(len(sub(p3, p2))), 1e-6);
    const m1 = { x: (p1.x - p0.x) / d0 - (p2.x - p0.x) / (d0 + d1) + (p2.x - p1.x) / d1, y: (p1.y - p0.y) / d0 - (p2.y - p0.y) / (d0 + d1) + (p2.y - p1.y) / d1 };
    const m2 = { x: (p2.x - p1.x) / d1 - (p3.x - p1.x) / (d1 + d2) + (p3.x - p2.x) / d2, y: (p2.y - p1.y) / d1 - (p3.y - p1.y) / (d1 + d2) + (p3.y - p2.y) / d2 };
    const o = { x: p1.x + (m1.x * d1) / 3, y: p1.y + (m1.y * d1) / 3 }, i = { x: p2.x - (m2.x * d1) / 3, y: p2.y - (m2.y * d1) / 3 };
    if (!same(o, p1)) nodes[k].o = o;
    if (!same(i, p2)) nodes[(k + 1) % n].i = i;
  }
  return { closed, nodes };
}

/** Uniform cubic B-spline with `pts` as control points; an open spline is clamped so it starts and ends on the first and last point. */
export function bsplinePath(pts: Vec[], closed: boolean): Subpath {
  const n = pts.length;
  if (n < 3) return { closed: false, nodes: pts.map((p) => ({ x: p.x, y: p.y })) };
  const Q = closed ? pts : [pts[0], pts[0], ...pts, pts[n - 1], pts[n - 1]];
  const m = Q.length, count = closed ? n : m - 3;
  const q = (k: number) => Q[k % m];
  const nodes: Anchor[] = [];
  for (let j = 0; j < count; j++) {
    const P0 = q(j), P1 = q(j + 1), P2 = q(j + 2), P3 = q(j + 3);
    const b0 = { x: (P0.x + 4 * P1.x + P2.x) / 6, y: (P0.y + 4 * P1.y + P2.y) / 6 };
    const b1 = { x: (2 * P1.x + P2.x) / 3, y: (2 * P1.y + P2.y) / 3 };
    const b2 = { x: (P1.x + 2 * P2.x) / 3, y: (P1.y + 2 * P2.y) / 3 };
    const b3 = { x: (P1.x + 4 * P2.x + P3.x) / 6, y: (P1.y + 4 * P2.y + P3.y) / 6 };
    if (!nodes.length) nodes.push({ x: b0.x, y: b0.y, k: "smooth" });
    const a = nodes[nodes.length - 1];
    if (!same(b1, a)) a.o = b1;
    const closing = closed && j === count - 1;
    const b = closing ? nodes[0] : { x: b3.x, y: b3.y, k: "smooth" as const };
    if (!same(b2, b)) b.i = b2;
    if (!closing) nodes.push(b);
  }
  return { closed, nodes };
}

/** Paraxial mode: a click adds an L of a horizontal and a vertical segment, turning the other way from the last segment. */
export function paraxialAppend(nodes: Vec[], c: Vec): Vec[] {
  const n = nodes.length;
  if (!n) return [{ x: c.x, y: c.y }];
  const last = nodes[n - 1];
  const lastHorizontal = n >= 2 && Math.abs(nodes[n - 1].y - nodes[n - 2].y) < 1e-9 && Math.abs(nodes[n - 1].x - nodes[n - 2].x) > 1e-9;
  const corner = lastHorizontal ? { x: last.x, y: c.y } : { x: c.x, y: last.y };
  const out = nodes.slice();
  if (len(sub(corner, last)) > 1e-9) out.push(corner);
  if (len(sub(c, corner)) > 1e-9) out.push({ x: c.x, y: c.y });
  return out;
}

/** The path a Pen click sequence makes in each mode (Bézier and paraxial nodes are used as they are). */
export function penSubpath(mode: PenMode, nodes: Anchor[], closed: boolean): Subpath {
  const pts = nodes.map((a) => ({ x: a.x, y: a.y }));
  if (mode === "smooth") return smoothThrough(pts, closed && pts.length > 2);
  if (mode === "bspline") return bsplinePath(pts, closed && pts.length > 2);
  return { closed, nodes };
}

/** A freehand stroke as a curve: Bézier fit (the classic Pencil), smooth through the kept points, or a B-spline over them. */
export function freehandPath(pts: Vec[], tol: number, closed: boolean, mode: CurveMode): Subpath {
  if (mode === "bezier") return smoothStroke(pts, tol, closed);
  const simple = simplifyPolyline(pts, tol);
  if (closed && simple.length > 3) simple.pop();
  const c = closed && simple.length > 2;
  return mode === "smooth" ? smoothThrough(simple, c) : bsplinePath(simple, c);
}

/** Width along the stroke (u = 0 at the start, 1 at the end) for each brush shape, `w` mm at its widest. */
export function brushProfile(shape: BrushShape, w: number): (u: number) => number {
  switch (shape) {
    case "triangleIn": return (u) => w * u;
    case "triangleOut": return (u) => w * (1 - u);
    case "ellipse": return (u) => w * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));
    case "none": return () => w;
  }
}

/**
 * The filled outline of a brush dragged along `s`: points offset left and right by half the width at
 * each place (miter-corrected at bends), joined into one polygon and cleaned with a non-zero union.
 */
export function brushOutline(s: Subpath, widthAt: (u: number) => number): Subpath[] {
  const base = flatten(s, FLAT_TOL);
  if (s.closed && base.length > 1) base.push({ ...base[0] });
  if (base.length < 2) return [];
  let total = 0;
  for (let k = 1; k < base.length; k++) total += len(sub(base[k], base[k - 1]));
  if (total < EPS) return [];
  const step = Math.min(0.5, total / 200);
  const pts: Vec[] = [base[0]];
  for (let k = 1; k < base.length; k++) {
    const a = base[k - 1], b = base[k], l = len(sub(b, a));
    if (l < 1e-9) continue;
    const parts = Math.max(1, Math.ceil(l / step));
    for (let j = 1; j <= parts; j++) pts.push({ x: a.x + ((b.x - a.x) * j) / parts, y: a.y + ((b.y - a.y) * j) / parts });
  }
  const n = pts.length;
  const cum = [0];
  for (let k = 1; k < n; k++) cum.push(cum[k - 1] + len(sub(pts[k], pts[k - 1])));
  const normal = (a: Vec, b: Vec): Vec => { const l = len(sub(b, a)) || 1; return { x: -(b.y - a.y) / l, y: (b.x - a.x) / l }; };
  const ring = s.closed && n > 2;
  const left: Vec[] = [], right: Vec[] = [];
  for (let k = 0; k < n; k++) {
    const prev = k > 0 ? normal(pts[k - 1], pts[k]) : ring ? normal(pts[n - 2], pts[0]) : null;
    const next = k < n - 1 ? normal(pts[k], pts[k + 1]) : ring ? normal(pts[0], pts[1]) : null;
    const e = prev ?? next!, f = next ?? prev!;
    let nx = e.x + f.x, ny = e.y + f.y;
    const nl = Math.hypot(nx, ny);
    if (nl < 1e-9) { nx = f.x; ny = f.y; } else { nx /= nl; ny /= nl; }
    const miter = Math.min(2, 1 / Math.max(0.5, nx * f.x + ny * f.y));
    const h = (Math.max(0, widthAt(cum[k] / total)) / 2) * miter;
    left.push({ x: pts[k].x + nx * h, y: pts[k].y + ny * h });
    right.push({ x: pts[k].x - nx * h, y: pts[k].y - ny * h });
  }
  const polys = ring ? [toPath(left), toPath(right.reverse())] : [toPath([...left, ...right.reverse()])];
  return toSubpaths(run(ClipperLib.ClipType.ctUnion, polys, [], ClipperLib.PolyFillType.pftNonZero));
}
