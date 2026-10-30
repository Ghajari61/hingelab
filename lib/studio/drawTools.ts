/**
 * Geometry for the CorelDRAW-style drawing tools: 3-Point Rectangle, 3-Point Ellipse, 3-Point Curve and
 * Smart Drawing (a freehand stroke recognised as a line, polyline, triangle, polygon, rectangle or
 * ellipse, or else smoothed into a curve).
 */
import { mul, rotateAt, shapeForBox, simplifyPolyline, translate } from "./geom";
import { freehandPath } from "./strokes";
import type { Mat, ShapeParams, Subpath, Vec } from "./types";

const DEG = 180 / Math.PI;
const dist = (a: Vec, b: Vec) => Math.hypot(b.x - a.x, b.y - a.y);

/** A shape placed by a rotation about its centre (shapes are centred on their origin). */
export interface PlacedShape { shape: ShapeParams; transform: Mat }

const place = (shape: ShapeParams, c: Vec, deg: number): PlacedShape => ({ shape, transform: deg ? mul(translate(c.x, c.y), rotateAt(deg)) : translate(c.x, c.y) });

/** The base line a→b and the signed distance of `c` from it. */
function frame(a: Vec, b: Vec, c: Vec) {
  const len = dist(a, b);
  const ux = len ? (b.x - a.x) / len : 1, uy = len ? (b.y - a.y) / len : 0;
  const nx = -uy, ny = ux;
  return { len, nx, ny, h: (c.x - a.x) * nx + (c.y - a.y) * ny, deg: Math.atan2(uy, ux) * DEG };
}

/** 3-Point Rectangle: a→b is one side, `c` sets the height (either side of it). Null when a = b. */
export function threePointRect(a: Vec, b: Vec, c: Vec, prev?: ShapeParams): PlacedShape | null {
  const f = frame(a, b, c);
  if (f.len < 1e-6) return null;
  const centre = { x: (a.x + b.x) / 2 + (f.nx * f.h) / 2, y: (a.y + b.y) / 2 + (f.ny * f.h) / 2 };
  return place(shapeForBox("rect", f.len, Math.abs(f.h), prev), centre, f.deg);
}

/** 3-Point Ellipse: a→b is one axis (centre at its middle), `c`'s distance from it is the other radius. */
export function threePointEllipse(a: Vec, b: Vec, c: Vec, prev?: ShapeParams): PlacedShape | null {
  const f = frame(a, b, c);
  if (f.len < 1e-6) return null;
  return place(shapeForBox("ellipse", f.len, 2 * Math.abs(f.h), prev), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, f.deg);
}

/** 3-Point Curve: from a to b, passing through `c` halfway along (a quadratic arc written as a cubic). */
export function threePointCurve(a: Vec, b: Vec, c: Vec): Subpath {
  const q = { x: 2 * c.x - (a.x + b.x) / 2, y: 2 * c.y - (a.y + b.y) / 2 };
  const k = 2 / 3;
  return {
    closed: false,
    nodes: [
      { x: a.x, y: a.y, o: { x: a.x + k * (q.x - a.x), y: a.y + k * (q.y - a.y) } },
      { x: b.x, y: b.y, i: { x: b.x + k * (q.x - b.x), y: b.y + k * (q.y - b.y) } },
    ],
  };
}

// ---------- Smart Drawing ----------

export type Recognised =
  | { kind: "line" | "polyline" | "triangle" | "polygon" | "curve"; name: string; sub: Subpath }
  | { kind: "rect" | "ellipse"; name: string; placed: PlacedShape };

/** Turn at b on the way a→b→c, degrees (0 = straight on). */
function turn(a: Vec, b: Vec, c: Vec): number {
  const t1 = Math.atan2(b.y - a.y, b.x - a.x), t2 = Math.atan2(c.y - b.y, c.x - b.x);
  let d = Math.abs(t2 - t1) * DEG;
  if (d > 180) d = 360 - d;
  return d;
}

/** Douglas–Peucker corners, then vertices turning less than `minTurn`° dropped (for a ring, the start too). */
function corners(pts: Vec[], eps: number, closed: boolean, minTurn: number): Vec[] {
  const v = closed ? simplifyPolyline([...pts, pts[0]], eps).slice(0, -1) : simplifyPolyline(pts, eps);
  for (;;) {
    const n = v.length;
    if (n <= (closed ? 3 : 2)) return v;
    let best = -1, bestTurn = minTurn;
    for (let k = closed ? 0 : 1; k < (closed ? n : n - 1); k++) {
      const t = turn(v[(k - 1 + n) % n], v[k], v[(k + 1) % n]);
      if (t < bestTurn) { bestTurn = t; best = k; }
    }
    if (best < 0) return v;
    v.splice(best, 1);
  }
}

function segDist(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
}

function polyDist(p: Vec, v: Vec[], closed: boolean): number {
  let d = Infinity;
  const n = v.length;
  for (let k = 0; k < (closed ? n : n - 1); k++) d = Math.min(d, segDist(p, v[k], v[(k + 1) % n]));
  return d;
}

/** `n` points evenly spaced along the polyline (ring when closed). */
function resample(pts: Vec[], n: number, closed: boolean): Vec[] {
  const ring = closed ? [...pts, pts[0]] : pts;
  const acc = [0];
  for (let k = 1; k < ring.length; k++) acc.push(acc[k - 1] + dist(ring[k - 1], ring[k]));
  const total = acc[acc.length - 1];
  if (total <= 0) return [ring[0]];
  const out: Vec[] = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const s = (total * k) / (closed ? n : n - 1);
    while (j < ring.length - 1 && acc[j] < s) j++;
    const seg = acc[j] - acc[j - 1], t = seg > 0 ? (s - acc[j - 1]) / seg : 0;
    out.push({ x: ring[j - 1].x + t * (ring[j].x - ring[j - 1].x), y: ring[j - 1].y + t * (ring[j].y - ring[j - 1].y) });
  }
  return out;
}

/** Angles within `within`° of the axes snap to them (most rectangles and ellipses are drawn level). */
function snapLevel(deg: number, within: number): number {
  const q = Math.round(deg / 90) * 90;
  return Math.abs(deg - q) <= within ? q : deg;
}

/** The ring's extent along an axis at `deg`, centred: width, height and centre. */
function extentAt(ring: Vec[], deg: number) {
  const c = Math.cos(deg / DEG), s = Math.sin(deg / DEG);
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const p of ring) {
    const u = p.x * c + p.y * s, v = -p.x * s + p.y * c;
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  const mu = (u0 + u1) / 2, mv = (v0 + v1) / 2;
  return { w: u1 - u0, h: v1 - v0, c: { x: mu * c - mv * s, y: mu * s + mv * c } };
}

/** Principal-axis ellipse fit; `err` is the mean relative distance of the stroke from it. */
function fitEllipse(ring: Vec[]) {
  const pts = resample(ring, 96, true);
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p.x, 0) / n, my = pts.reduce((a, p) => a + p.y, 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) { sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; sxy += (p.x - mx) * (p.y - my); }
  const deg = snapLevel(0.5 * Math.atan2(2 * sxy, sxx - syy) * DEG, 6);
  const e = extentAt(pts, deg);
  let rx = e.w / 2, ry = e.h / 2;
  if (rx < 1e-9 || ry < 1e-9) return null;
  const round = Math.abs(rx - ry) / Math.max(rx, ry) < 0.12;
  if (round) rx = ry = (rx + ry) / 2;
  const c = Math.cos(deg / DEG), s = Math.sin(deg / DEG);
  let err = 0;
  for (const p of pts) {
    const dx = p.x - e.c.x, dy = p.y - e.c.y;
    const u = dx * c + dy * s, v = -dx * s + dy * c;
    err += Math.abs(Math.hypot(u / rx, v / ry) - 1);
  }
  return { rx, ry, deg: round ? 0 : deg, c: e.c, err: err / n };
}

export interface RecogniseOptions {
  /** mm: how far a stroke may wander from a straight side and still count as straight (about 8 screen px). */
  tol: number;
  /** mm: smoothing for strokes that stay freehand (the pencil's tolerance). */
  smooth: number;
  rect?: ShapeParams;
  ellipse?: ShapeParams;
}

/**
 * Smart Drawing: recognises a freehand stroke (document mm) as a basic shape. Rectangles and ellipses
 * come back as live shapes; anything else becomes a path. Null for a stroke too small to use.
 */
export function recognise(raw: Vec[], o: RecogniseOptions): Recognised | null {
  const pts: Vec[] = [];
  for (const p of raw) if (!pts.length || dist(pts[pts.length - 1], p) > o.tol * 0.05) pts.push({ x: p.x, y: p.y });
  if (pts.length < 2) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, len = 0;
  pts.forEach((p, k) => {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    if (k) len += dist(pts[k - 1], p);
  });
  const size = Math.hypot(maxX - minX, maxY - minY);
  if (size < o.tol) return null;
  const first = pts[0], last = pts[pts.length - 1];
  const closed = pts.length > 8 && dist(first, last) < Math.max(2 * o.tol, 0.2 * size) && len > 1.5 * size;
  const eps = Math.max(o.tol, 0.04 * size), fine = Math.max(o.tol * 0.5, eps / 2.5);

  if (!closed) {
    const dev = Math.max(...pts.map((p) => segDist(p, first, last)));
    if (dev <= Math.max(o.tol, 0.04 * dist(first, last))) return { kind: "line", name: "Line", sub: { closed: false, nodes: [{ ...first }, { ...last }] } };
    const v = corners(pts, eps, false, 20);
    const straight = v.length <= 8 && corners(pts, fine, false, 8).length <= v.length + 1 && pts.every((p) => polyDist(p, v, false) <= eps * 1.5);
    if (straight) return { kind: "polyline", name: "Polyline", sub: { closed: false, nodes: v.map((p) => ({ x: p.x, y: p.y })) } };
    return { kind: "curve", name: "Curve", sub: freehandPath(pts, o.smooth, false, "bezier") };
  }

  const ring = dist(first, last) < o.tol * 0.05 ? pts.slice(0, -1) : pts;
  const ell = fitEllipse(ring);
  if (ell && ell.err < 0.05) return ellipseOf(ell, o);
  const v = corners(ring, eps, true, 22);
  const straight = v.length <= 8 && corners(ring, fine, true, 8).length <= v.length + 1 && ring.every((p) => polyDist(p, v, true) <= eps * 1.5);
  if (straight && v.length === 4 && v.every((p, k) => Math.abs(turn(v[(k + 3) % 4], p, v[(k + 1) % 4]) - 90) <= 18)) {
    // The rectangle's direction: the mean of its four sides, folded onto one quarter turn.
    let sx = 0, sy = 0;
    for (let k = 0; k < 4; k++) {
      const a = Math.atan2(v[(k + 1) % 4].y - v[k].y, v[(k + 1) % 4].x - v[k].x) * 4;
      sx += Math.cos(a); sy += Math.sin(a);
    }
    const deg = snapLevel((Math.atan2(sy, sx) * DEG) / 4, 6);
    const e = extentAt(ring, deg);
    return { kind: "rect", name: "Rectangle", placed: place(shapeForBox("rect", e.w, e.h, o.rect), e.c, deg) };
  }
  if (straight && v.length === 3) return { kind: "triangle", name: "Triangle", sub: { closed: true, nodes: v.map((p) => ({ x: p.x, y: p.y })) } };
  if (straight && v.length >= 4) return { kind: "polygon", name: "Polygon", sub: { closed: true, nodes: v.map((p) => ({ x: p.x, y: p.y })) } };
  if (ell && ell.err < 0.1) return ellipseOf(ell, o);
  return { kind: "curve", name: "Curve", sub: freehandPath(ring, o.smooth, true, "bezier") };
}

function ellipseOf(e: { rx: number; ry: number; deg: number; c: Vec }, o: RecogniseOptions): Recognised {
  return { kind: "ellipse", name: e.rx === e.ry ? "Circle" : "Ellipse", placed: place(shapeForBox("ellipse", 2 * e.rx, 2 * e.ry, o.ellipse), e.c, e.deg) };
}

/**
 * A uniform cubic B-spline over control points, as Bézier segments (the Spline tool). Open
 * splines start and end on their first and last points; closed ones loop through every point.
 */
export function bSpline(ctrl: Vec[], closed: boolean): Subpath {
  const P = closed ? ctrl : [ctrl[0], ctrl[0], ...ctrl, ctrl[ctrl.length - 1], ctrl[ctrl.length - 1]];
  const n = P.length;
  if (ctrl.length < 2) return { closed: false, nodes: ctrl.map((p) => ({ x: p.x, y: p.y })) };
  const at = (k: number) => P[closed ? ((k % n) + n) % n : k];
  const segs = closed ? n : n - 3;
  const nodes: Subpath["nodes"] = [];
  for (let s = 0; s < segs; s++) {
    const p0 = at(s), p1 = at(s + 1), p2 = at(s + 2), p3 = at(s + 3);
    const b0 = { x: (p0.x + 4 * p1.x + p2.x) / 6, y: (p0.y + 4 * p1.y + p2.y) / 6 };
    const b1 = { x: (2 * p1.x + p2.x) / 3, y: (2 * p1.y + p2.y) / 3 };
    const b2 = { x: (p1.x + 2 * p2.x) / 3, y: (p1.y + 2 * p2.y) / 3 };
    const b3 = { x: (p1.x + 4 * p2.x + p3.x) / 6, y: (p1.y + 4 * p2.y + p3.y) / 6 };
    if (s === 0) nodes.push({ x: b0.x, y: b0.y, o: b1 });
    else nodes[nodes.length - 1].o = b1;
    if (closed && s === segs - 1) nodes[0].i = b2;
    else nodes.push({ x: b3.x, y: b3.y, i: b2 });
  }
  return { closed, nodes };
}
