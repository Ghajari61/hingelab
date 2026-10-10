/**
 * Section clean-up: union, clip to the wall side, simplify, smooth, minimum feature, islands.
 * Works in the plane frame (u, w) with outers counter-clockwise (positive signed area).
 */
import { differenceShapes, dropSpecks, intersectShapes, makeShape, offsetShapes, shapeContours, signedArea, unionShapes } from "@/lib/letters/polygon";
import type { Contour, Point, Shape } from "../types";

export interface CleanOptions {
  /** Loops from manifold are oriented (nonzero); fallback loops may not be (even-odd). */
  evenOdd: boolean;
  /** Keep only w ≥ 0 (the wall side). */
  clipToWall: boolean;
  chordTolerance: number;
  smoothing: number;
  minFeature: number;
  minIslandArea: number;
}

export interface CleanResult {
  shapes: Shape[];
  /** Pieces of at least minFeature² that the minimum-feature opening removed. */
  featuresRemoved: number;
  /** Islands and holes under the minimum area. */
  islandsDropped: number;
}

const BIG = 1e5;
const WALL_SIDE: Contour = [[-BIG, 0], [BIG, 0], [BIG, BIG], [-BIG, BIG]];

function perpDist(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  if (L < 1e-12) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dx * (a[1] - p[1]) - dy * (a[0] - p[0])) / L;
}

function rdpOpen(pts: Point[], tol: number): Point[] {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let best = -1, dmax = tol;
    for (let k = i + 1; k < j; k++) {
      const d = perpDist(pts[k], pts[i], pts[j]);
      if (d > dmax) { dmax = d; best = k; }
    }
    if (best >= 0) { keep[best] = 1; stack.push([i, best], [best, j]); }
  }
  return pts.filter((_, k) => keep[k]);
}

/** Ramer–Douglas–Peucker on a closed contour, anchored at the two points farthest apart. */
export function simplifyClosed(c: Contour, tol: number): Contour {
  if (c.length <= 4 || tol <= 0) return c;
  let i0 = 0, i1 = 0, best = -1;
  for (let k = 0; k < c.length; k++) {
    const d = Math.hypot(c[k][0] - c[0][0], c[k][1] - c[0][1]);
    if (d > best) { best = d; i1 = k; }
  }
  best = -1;
  for (let k = 0; k < c.length; k++) {
    const d = Math.hypot(c[k][0] - c[i1][0], c[k][1] - c[i1][1]);
    if (d > best) { best = d; i0 = k; }
  }
  const [a, b] = i0 < i1 ? [i0, i1] : [i1, i0];
  const first = rdpOpen(c.slice(a, b + 1), tol);
  const second = rdpOpen([...c.slice(b), ...c.slice(0, a + 1)], tol);
  const out = [...first.slice(0, -1), ...second.slice(0, -1)];
  return out.length >= 3 ? out : c;
}

/** Longest edge fed to Chaikin, mm: each pass then cuts at most a quarter of it off a corner. */
const SMOOTH_SPAN = 2;

/** Split edges longer than `maxLen` (closed contours wrap round; open runs keep their end). */
export function densify(c: Point[], maxLen: number, closed: boolean): Point[] {
  const out: Point[] = [];
  const n = closed ? c.length : c.length - 1;
  for (let i = 0; i < n; i++) {
    const p = c[i], q = c[(i + 1) % c.length];
    const k = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / maxLen));
    for (let j = 0; j < k; j++) out.push([p[0] + ((q[0] - p[0]) * j) / k, p[1] + ((q[1] - p[1]) * j) / k]);
  }
  if (!closed) out.push(c[c.length - 1]);
  return out;
}

/** Chaikin corner cutting on a closed contour. */
export function chaikin(c: Contour, iterations: number): Contour {
  let cur = c;
  for (let it = 0; it < iterations; it++) {
    const next: Contour = [];
    for (let i = 0; i < cur.length; i++) {
      const p = cur[i], q = cur[(i + 1) % cur.length];
      next.push([0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]], [0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]]);
    }
    cur = next;
  }
  return cur;
}

/** Chaikin on an open polyline; the end points stay. */
function chaikinOpen(c: Point[], iterations: number): Point[] {
  let cur = c;
  for (let it = 0; it < iterations && cur.length > 2; it++) {
    const next: Point[] = [cur[0]];
    for (let i = 0; i + 1 < cur.length; i++) {
      const p = cur[i], q = cur[i + 1];
      if (i > 0) next.push([0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]]);
      if (i + 2 < cur.length) next.push([0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]]);
    }
    next.push(cur[cur.length - 1]);
    cur = next;
  }
  return cur;
}

/**
 * Simplify, then smooth and simplify again. Pinned points (on the wall) are kept exactly: the
 * contour is split at them and every open run between two pins is processed on its own.
 */
export function tidyContour(c: Contour, tol: number, iterations: number, pinned: (p: Point) => boolean): Contour {
  const pins: number[] = [];
  c.forEach((q, i) => { if (pinned(q)) pins.push(i); });
  if (pins.length < 2) {
    let r = simplifyClosed(c, tol);
    if (iterations > 0) r = simplifyClosed(chaikin(densify(r, SMOOTH_SPAN, true), iterations), tol);
    return r;
  }
  const out: Contour = [];
  for (let k = 0; k < pins.length; k++) {
    const a = pins[k], b = pins[(k + 1) % pins.length];
    const run = b > a ? c.slice(a, b + 1) : [...c.slice(a), ...c.slice(0, b + 1)];
    let r = tol > 0 ? rdpOpen(run, tol) : run;
    if (iterations > 0 && r.length > 2) { const d = chaikinOpen(densify(r, SMOOTH_SPAN, false), iterations); r = tol > 0 ? rdpOpen(d, tol) : d; }
    out.push(...r.slice(0, -1));
  }
  return out;
}

export function cleanSection(loops: Contour[], o: CleanOptions): CleanResult {
  let shapes = unionShapes(loops, [], o.evenOdd);
  if (o.clipToWall && shapes.length) shapes = intersectShapes(shapeContours(shapes), [WALL_SIDE]);

  const iters = Math.round(Math.max(0, o.smoothing) * 3);
  if (o.chordTolerance > 0 || iters > 0) {
    const onWall = (q: Point) => o.clipToWall && Math.abs(q[1]) < 1e-9;
    const contours = shapeContours(shapes).map(c => tidyContour(c, o.chordTolerance, iters, onWall)).filter(c => c.length >= 3 && Math.abs(signedArea(c)) > 1e-6);
    shapes = unionShapes(contours);
  }

  let featuresRemoved = 0;
  if (o.minFeature > 0 && shapes.length) {
    const r = o.minFeature / 2;
    // Grow back a hair past r and clip to the input, so straight edges (the wall edge) stay exact.
    // Miter joins keep convex corners sharp; round joins would round every corner by r.
    const eroded = offsetShapes(shapes, -r, "miter");
    const opened = eroded.length ? intersectShapes(shapeContours(offsetShapes(eroded, r + 0.01, "miter")), shapeContours(shapes)) : [];
    const lost = differenceShapes(shapeContours(shapes), shapeContours(opened));
    featuresRemoved = lost.filter(s => s.area >= o.minFeature * o.minFeature).length;
    shapes = opened;
  }

  const before = shapes.length + shapes.reduce((a, s) => a + s.holes.length, 0);
  shapes = dropSpecks(shapes, o.minIslandArea);
  const after = shapes.length + shapes.reduce((a, s) => a + s.holes.length, 0);
  return { shapes: shapes.map(s => makeShape(s.outer, s.holes)), featuresRemoved, islandsDropped: before - after };
}
