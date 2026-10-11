/**
 * Interpolate: shapes in between two outlines (the object's first two subpaths, or its first subpath and
 * a linked object). Both ends are resampled to the same number of points evenly spaced by length, lined up
 * (same direction, closest starting point) and blended linearly; straight runs are merged again.
 */
import { EPS, flatten, polygonArea } from "../geom";
import { FLAT_TOL } from "../pathfinder";
import type { InterpolateParams, Subpath, Vec } from "../types";

/** `m` points evenly spaced by length (closed: around the ring, first not repeated; open: both ends included). */
export function resample(pts: Vec[], closed: boolean, m: number): Vec[] {
  const ring = closed ? [...pts, pts[0]] : pts;
  const cum = [0];
  for (let k = 1; k < ring.length; k++) cum.push(cum[k - 1] + Math.hypot(ring[k].x - ring[k - 1].x, ring[k].y - ring[k - 1].y));
  const total = cum[cum.length - 1];
  const count = closed ? m : m + 1;
  const out: Vec[] = [];
  let k = 1;
  for (let j = 0; j < count; j++) {
    const at = total * (j / m);
    while (k < ring.length - 1 && cum[k] < at) k++;
    const span = cum[k] - cum[k - 1], u = span > 1e-15 ? Math.min(1, Math.max(0, (at - cum[k - 1]) / span)) : 0;
    out.push({ x: ring[k - 1].x + (ring[k].x - ring[k - 1].x) * u, y: ring[k - 1].y + (ring[k].y - ring[k - 1].y) * u });
  }
  return out;
}

/** Drops points that sit on the straight line through their neighbours. */
export function mergeStraight(pts: Vec[], closed: boolean): Vec[] {
  if (pts.length < 3) return pts;
  const n = pts.length, keep: Vec[] = [];
  for (let k = 0; k < n; k++) {
    if (!closed && (k === 0 || k === n - 1)) { keep.push(pts[k]); continue; }
    const a = pts[(k - 1 + n) % n], b = pts[k], c = pts[(k + 1) % n];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    const scale = Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - b.x, c.y - b.y);
    const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
    if (Math.abs(cross) <= 1e-9 * Math.max(scale, 1e-12) && dot >= 0) continue;
    keep.push(b);
  }
  return keep;
}

const lerpPts = (a: Vec[], b: Vec[], t: number) => a.map((p, k) => ({ x: p.x + (b[k].x - p.x) * t, y: p.y + (b[k].y - p.y) * t }));

/** The two ends as point lists with matching count, direction and start. */
export function matchEnds(A: Subpath, B: Subpath): { a: Vec[]; b: Vec[]; closed: boolean } | null {
  let pa = flatten(A, FLAT_TOL), pb = flatten(B, FLAT_TOL);
  if (pa.length < 2 || pb.length < 2) return null;
  const closed = A.closed && B.closed && pa.length > 2 && pb.length > 2;
  const d = (p: Vec, q: Vec) => Math.hypot(p.x - q.x, p.y - q.y);
  if (closed) {
    if (Math.sign(polygonArea(pa)) !== Math.sign(polygonArea(pb))) pb = [pb[0], ...pb.slice(1).reverse()];
    let best = 0;
    pb.forEach((q, k) => { if (d(q, pa[0]) < d(pb[best], pa[0]) - 1e-12) best = k; });
    pb = [...pb.slice(best), ...pb.slice(0, best)];
  } else {
    if (!A.closed && A.closed === B.closed && d(pa[0], pb[0]) + d(pa[pa.length - 1], pb[pb.length - 1]) > d(pa[0], pb[pb.length - 1]) + d(pa[pa.length - 1], pb[0]) + 1e-12) pb = pb.slice().reverse();
    if (A.closed) pa = [...pa, pa[0]];
    if (B.closed) pb = [...pb, pb[0]];
  }
  const m = 4 * Math.ceil(Math.min(4000, Math.max(64, pa.length * 4, pb.length * 4)) / 4);
  return { a: resample(pa, closed, m), b: resample(pb, closed, m), closed };
}

/** Blend positions 0 < t < 1 of the steps: equal steps of t, or equal steps of enclosed area ("size", closed ends only). */
export function blendTimes(steps: number, spacing: InterpolateParams["spacing"], a?: Vec[], b?: Vec[]): number[] {
  const ts = Array.from({ length: steps }, (_, k) => (k + 1) / (steps + 1));
  if (spacing !== "size" || !a || !b) return ts;
  const area = (t: number) => Math.abs(polygonArea(lerpPts(a, b, t)));
  const a0 = area(0), a1 = area(1);
  if (Math.abs(a1 - a0) < EPS) return ts;
  return ts.map((f) => {
    const want = a0 + (a1 - a0) * f;
    let lo = 0, hi = 1;
    for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if ((area(mid) - want) * (a1 - a0) < 0) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  });
}

export function applyInterpolate(subs: Subpath[], p: InterpolateParams): Subpath[] {
  const linked = !!p.link;
  const A = subs[0], B = linked ? p.linkCache?.[0] : subs[1];
  if (!A || !B) return subs;
  const ends = matchEnds(A, B);
  if (!ends) return subs;
  const steps = Math.max(1, Math.min(500, Math.round(p.steps)));
  const ts = blendTimes(steps, p.spacing, ends.closed ? ends.a : undefined, ends.closed ? ends.b : undefined);
  const between = ts.map((t): Subpath => ({ closed: ends.closed, nodes: mergeStraight(lerpPts(ends.a, ends.b, t), ends.closed).map((q) => ({ x: q.x, y: q.y })) }));
  return [...subs, ...between];
}
