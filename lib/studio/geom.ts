/**
 * Studio geometry: affine matrices, cubic Bézier paths, live shapes as paths, bounds, flattening,
 * hit testing. Pure functions over the document model; y points down (SVG), angles in degrees.
 */
import { isDraft } from "immer";
import { applyEffects } from "./effects";
import type { Anchor, Mat, SceneNode, ShapeParams, Subpath, Vec } from "./types";

export const EPS = 1e-9;
const RAD = Math.PI / 180;

// ---------- matrices ----------

export const I: Mat = [1, 0, 0, 1, 0, 0];

/** m · n: apply n first, then m. */
export function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function apply(m: Mat, p: Vec): Vec {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

export function invert(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-12) return [...I];
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

export const translate = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];

export function scaleAt(sx: number, sy: number, cx = 0, cy = 0): Mat {
  return [sx, 0, 0, sy, cx - sx * cx, cy - sy * cy];
}

export function rotateAt(deg: number, cx = 0, cy = 0): Mat {
  const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD);
  return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
}

export function shearAt(degX: number, degY: number, cx = 0, cy = 0): Mat {
  const tx = Math.tan(degX * RAD), ty = Math.tan(degY * RAD);
  return mul(translate(cx, cy), mul([1, ty, tx, 1, 0, 0], translate(-cx, -cy)));
}

export interface Decomposed { x: number; y: number; sx: number; sy: number; rotation: number; skew: number }

/** translate · rotate · skewX · scale. A reflection shows as a negative sy. */
export function decompose(m: Mat): Decomposed {
  const [a, b, c, d, e, f] = m;
  const sx = Math.hypot(a, b) || EPS;
  const rotation = Math.atan2(b, a) / RAD;
  const sy = (a * d - b * c) / sx;
  const skew = Math.atan2(a * c + b * d, sx * sx) / RAD;
  return { x: e, y: f, sx, sy, rotation, skew };
}

export function isIdentity(m: Mat): boolean {
  return m.every((v, i) => Math.abs(v - I[i]) < 1e-12);
}

// ---------- paths ----------

/** Builds subpaths from move/line/cubic/arc commands; closing merges a final point equal to the start. */
export class PathBuilder {
  private subs: Subpath[] = [];
  private cur: Anchor[] | null = null;

  move(x: number, y: number) { this.end(false); this.cur = [{ x, y }]; return this; }
  line(x: number, y: number) {
    if (!this.cur) return this.move(x, y);
    const l = this.cur[this.cur.length - 1];
    if (Math.abs(l.x - x) > EPS || Math.abs(l.y - y) > EPS) this.cur.push({ x, y });
    return this;
  }
  cubic(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) {
    if (!this.cur) this.move(c1x, c1y);
    const l = this.cur![this.cur!.length - 1];
    l.o = { x: c1x, y: c1y };
    this.cur!.push({ x, y, i: { x: c2x, y: c2y } });
    return this;
  }
  /** Elliptical arc around (cx, cy) from angle a0 to a1 (degrees, either direction), in ≤ 90° cubic pieces. */
  arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number) {
    const sx = cx + rx * Math.cos(a0 * RAD), sy = cy + ry * Math.sin(a0 * RAD);
    if (!this.cur) this.move(sx, sy); else this.line(sx, sy);
    const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 90 - 1e-9));
    const step = (a1 - a0) / n;
    for (let k = 0; k < n; k++) {
      const t1 = (a0 + k * step) * RAD, t2 = (a0 + (k + 1) * step) * RAD;
      const al = (4 / 3) * Math.tan((t2 - t1) / 4);
      const p1 = { x: Math.cos(t1), y: Math.sin(t1) }, p2 = { x: Math.cos(t2), y: Math.sin(t2) };
      this.cubic(
        cx + rx * (p1.x - al * p1.y), cy + ry * (p1.y + al * p1.x),
        cx + rx * (p2.x + al * p2.y), cy + ry * (p2.y - al * p2.x),
        cx + rx * p2.x, cy + ry * p2.y,
      );
    }
    return this;
  }
  close() { this.end(true); return this; }
  done(): Subpath[] { this.end(false); return this.subs; }

  private end(closed: boolean) {
    const c = this.cur;
    this.cur = null;
    if (!c || !c.length) return;
    if (closed && c.length > 1) {
      const f = c[0], l = c[c.length - 1];
      if (Math.abs(f.x - l.x) < 1e-7 && Math.abs(f.y - l.y) < 1e-7) {
        if (l.i) f.i = l.i;
        c.pop();
      }
    }
    if (c.length > 1 || closed) this.subs.push({ closed, nodes: c });
  }
}

export interface Segment { p0: Vec; c1: Vec; c2: Vec; p3: Vec; line: boolean }

export function segments(s: Subpath): Segment[] {
  const out: Segment[] = [];
  const n = s.nodes.length;
  const count = s.closed ? n : n - 1;
  for (let k = 0; k < count; k++) {
    const a = s.nodes[k], b = s.nodes[(k + 1) % n];
    out.push({ p0: a, c1: a.o ?? a, c2: b.i ?? b, p3: b, line: !a.o && !b.i });
  }
  return out;
}

export function cubicAt(g: Segment, t: number): Vec {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return { x: a * g.p0.x + b * g.c1.x + c * g.c2.x + d * g.p3.x, y: a * g.p0.y + b * g.c1.y + c * g.c2.y + d * g.p3.y };
}

/** de Casteljau split at t. */
export function splitCubic(g: Segment, t: number): [Segment, Segment] {
  const lerp = (p: Vec, q: Vec): Vec => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  const ab = lerp(g.p0, g.c1), bc = lerp(g.c1, g.c2), cd = lerp(g.c2, g.p3);
  const abc = lerp(ab, bc), bcd = lerp(bc, cd), m = lerp(abc, bcd);
  return [{ p0: g.p0, c1: ab, c2: abc, p3: m, line: g.line }, { p0: m, c1: bcd, c2: cd, p3: g.p3, line: g.line }];
}

function quadRoots(a: number, b: number, c: number): number[] {
  if (Math.abs(a) < 1e-12) return Math.abs(b) < 1e-12 ? [] : [-c / b];
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  const s = Math.sqrt(disc);
  return [(-b + s) / (2 * a), (-b - s) / (2 * a)];
}

export interface Box { minX: number; minY: number; maxX: number; maxY: number }
export const emptyBox = (): Box => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
export const isEmptyBox = (b: Box) => !(b.maxX >= b.minX && b.maxY >= b.minY);

export function addPoint(b: Box, p: Vec) {
  if (p.x < b.minX) b.minX = p.x;
  if (p.y < b.minY) b.minY = p.y;
  if (p.x > b.maxX) b.maxX = p.x;
  if (p.y > b.maxY) b.maxY = p.y;
}

export function unionBox(a: Box, b: Box): Box {
  return { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) };
}

/** Exact bounds of one segment (end points plus derivative roots). */
export function segmentBox(g: Segment, into: Box = emptyBox()): Box {
  addPoint(into, g.p0);
  addPoint(into, g.p3);
  if (g.line) return into;
  for (const ax of ["x", "y"] as const) {
    const p0 = g.p0[ax], p1 = g.c1[ax], p2 = g.c2[ax], p3 = g.p3[ax];
    for (const t of quadRoots(3 * (-p0 + 3 * p1 - 3 * p2 + p3), 6 * (p0 - 2 * p1 + p2), 3 * (p1 - p0))) {
      if (t > 0 && t < 1) addPoint(into, cubicAt(g, t));
    }
  }
  return into;
}

export function subpathsBox(subs: Subpath[]): Box {
  const b = emptyBox();
  for (const s of subs) {
    if (s.nodes.length === 1) addPoint(b, s.nodes[0]);
    for (const g of segments(s)) segmentBox(g, b);
  }
  return b;
}

export function transformSubpaths(subs: Subpath[], m: Mat): Subpath[] {
  if (isIdentity(m)) return subs;
  const t = (p: Vec) => apply(m, p);
  return subs.map((s) => ({ closed: s.closed, nodes: s.nodes.map((a) => ({ ...t(a), ...(a.i ? { i: t(a.i) } : {}), ...(a.o ? { o: t(a.o) } : {}), ...(a.k ? { k: a.k } : {}) })) }));
}

function flatEnough(g: Segment, tol: number): boolean {
  const dx = g.p3.x - g.p0.x, dy = g.p3.y - g.p0.y;
  const len = Math.hypot(dx, dy);
  const dist = (p: Vec) => len < EPS ? Math.hypot(p.x - g.p0.x, p.y - g.p0.y) : Math.abs((p.x - g.p0.x) * dy - (p.y - g.p0.y) * dx) / len;
  return Math.max(dist(g.c1), dist(g.c2)) <= tol;
}

/** Polyline approximation of a subpath, within `tol` mm of the curve. Closed paths do not repeat the start. */
export function flatten(s: Subpath, tol = 0.05): Vec[] {
  if (!s.nodes.length) return [];
  const pts: Vec[] = [{ x: s.nodes[0].x, y: s.nodes[0].y }];
  const rec = (g: Segment, depth: number) => {
    if (g.line || depth > 16 || flatEnough(g, tol)) { pts.push({ x: g.p3.x, y: g.p3.y }); return; }
    const [l, r] = splitCubic(g, 0.5);
    rec(l, depth + 1);
    rec(r, depth + 1);
  };
  for (const g of segments(s)) rec(g, 0);
  if (s.closed && pts.length > 1) pts.pop();
  return pts;
}

const fmt = (v: number, dp: number) => {
  const r = +v.toFixed(dp);
  return Object.is(r, -0) ? "0" : String(r);
};

export function pathD(subs: Subpath[], dp = 3): string {
  const f = (v: number) => fmt(v, dp);
  const parts: string[] = [];
  for (const s of subs) {
    if (!s.nodes.length) continue;
    parts.push(`M${f(s.nodes[0].x)} ${f(s.nodes[0].y)}`);
    for (const g of segments(s)) {
      if (g.line) parts.push(`L${f(g.p3.x)} ${f(g.p3.y)}`);
      else parts.push(`C${f(g.c1.x)} ${f(g.c1.y)} ${f(g.c2.x)} ${f(g.c2.y)} ${f(g.p3.x)} ${f(g.p3.y)}`);
    }
    if (s.closed) parts.push("Z");
  }
  return parts.join("");
}

/** Signed area of a polygon (positive = clockwise on screen, y down). */
export function polygonArea(pts: Vec[]): number {
  let a = 0;
  for (let k = 0, n = pts.length; k < n; k++) {
    const p = pts[k], q = pts[(k + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function pathLength(subs: Subpath[], tol = 0.02): number {
  let len = 0;
  for (const s of subs) {
    const pts = flatten(s, tol);
    if (s.closed && pts.length) pts.push(pts[0]);
    for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
  }
  return len;
}

// ---------- live shapes ----------

/**
 * Corner rounding for a closed polygon: radius per vertex (0 = sharp), each fillet clamped so it fits
 * in half of both neighbouring edges. Works for convex and reflex corners.
 */
export function roundedPolygon(pts: Vec[], radii: number | number[]): Subpath {
  const n = pts.length;
  const pb = new PathBuilder();
  const corners = pts.map((v, k) => {
    const r = Array.isArray(radii) ? radii[k] ?? 0 : radii;
    const prev = pts[(k - 1 + n) % n], next = pts[(k + 1) % n];
    const l1 = Math.hypot(v.x - prev.x, v.y - prev.y), l2 = Math.hypot(next.x - v.x, next.y - v.y);
    if (r <= EPS || l1 < EPS || l2 < EPS) return { v, a: v, b: v, c1: v, c2: v, round: false };
    const u1 = { x: (v.x - prev.x) / l1, y: (v.y - prev.y) / l1 }, u2 = { x: (next.x - v.x) / l2, y: (next.y - v.y) / l2 };
    const cos = Math.max(-1, Math.min(1, -(u1.x * u2.x + u1.y * u2.y)));
    const theta = Math.acos(cos);
    if (theta < 1e-6 || Math.PI - theta < 1e-6) return { v, a: v, b: v, c1: v, c2: v, round: false };
    let t = r / Math.tan(theta / 2);
    t = Math.min(t, l1 / 2, l2 / 2);
    const rr = t * Math.tan(theta / 2);
    const h = (4 / 3) * Math.tan((Math.PI - theta) / 4) * rr;
    const a = { x: v.x - u1.x * t, y: v.y - u1.y * t }, b = { x: v.x + u2.x * t, y: v.y + u2.y * t };
    return { v, a, b, c1: { x: a.x + u1.x * h, y: a.y + u1.y * h }, c2: { x: b.x - u2.x * h, y: b.y - u2.y * h }, round: true };
  });
  pb.move(corners[0].b.x, corners[0].b.y);
  for (let k = 1; k <= n; k++) {
    const c = corners[k % n];
    pb.line(c.a.x, c.a.y);
    if (c.round) pb.cubic(c.c1.x, c.c1.y, c.c2.x, c.c2.y, c.b.x, c.b.y);
  }
  pb.close();
  return pb.done()[0];
}

export function regularPoints(sides: number, r: number, startDeg = -90): Vec[] {
  return Array.from({ length: sides }, (_, k) => {
    const a = (startDeg + (360 * k) / sides) * RAD;
    return { x: r * Math.cos(a), y: r * Math.sin(a) };
  });
}

function rectPath(w: number, h: number, radii: [number, number, number, number], corner: "round" | "chamfer" | "inverted"): Subpath[] {
  const hw = w / 2, hh = h / 2;
  const r = radii.map((v) => Math.max(0, v || 0));
  const f = Math.min(1, ...[[0, 1, w], [1, 2, h], [2, 3, w], [3, 0, h]].map(([a, b, side]) => (r[a] + r[b] > side ? side / (r[a] + r[b]) : 1)));
  const [rtl, rtr, rbr, rbl] = r.map((v) => v * f);
  const pb = new PathBuilder().move(-hw + rtl, -hh);
  const corner1 = (rad: number, entry: Vec, exit: Vec, rc: Vec, ra: [number, number], C: Vec, ia: [number, number]) => {
    pb.line(entry.x, entry.y);
    if (rad <= EPS) return;
    if (corner === "chamfer") pb.line(exit.x, exit.y);
    else if (corner === "inverted") pb.arc(C.x, C.y, rad, rad, ia[0], ia[1]);
    else pb.arc(rc.x, rc.y, rad, rad, ra[0], ra[1]);
  };
  corner1(rtr, { x: hw - rtr, y: -hh }, { x: hw, y: -hh + rtr }, { x: hw - rtr, y: -hh + rtr }, [-90, 0], { x: hw, y: -hh }, [180, 90]);
  corner1(rbr, { x: hw, y: hh - rbr }, { x: hw - rbr, y: hh }, { x: hw - rbr, y: hh - rbr }, [0, 90], { x: hw, y: hh }, [270, 180]);
  corner1(rbl, { x: -hw + rbl, y: hh }, { x: -hw, y: hh - rbl }, { x: -hw + rbl, y: hh - rbl }, [90, 180], { x: -hw, y: hh }, [0, -90]);
  corner1(rtl, { x: -hw, y: -hh + rtl }, { x: -hw + rtl, y: -hh }, { x: -hw + rtl, y: -hh + rtl }, [180, 270], { x: -hw, y: -hh }, [90, 0]);
  return pb.close().done();
}

function gearPath(teeth: number, module: number, pressureDeg: number, bore: number): Subpath[] {
  const z = Math.max(4, Math.round(teeth));
  const m = Math.max(0.1, module);
  const rp = (m * z) / 2, ra = rp + m, rf = Math.max(rp - 1.25 * m, m * 0.5);
  const alpha = Math.max(10, Math.min(30, pressureDeg)) * RAD;
  const rb = rp * Math.cos(alpha);
  const inv = (r: number) => { const b = Math.acos(Math.min(1, rb / r)); return Math.tan(b) - b; };
  const half = Math.PI / (2 * z) + inv(rp);
  const pts: Vec[] = [];
  const polar = (r: number, a: number) => ({ x: r * Math.cos(a), y: r * Math.sin(a) });
  const r0 = Math.max(rb, rf);
  const N = 6;
  for (let k = 0; k < z; k++) {
    const phi = (2 * Math.PI * k) / z - Math.PI / 2;
    pts.push(polar(rf, phi - half));
    for (let j = 0; j <= N; j++) { const r = r0 + ((ra - r0) * j) / N; pts.push(polar(r, phi - half + inv(r))); }
    for (let j = N; j >= 0; j--) { const r = r0 + ((ra - r0) * j) / N; pts.push(polar(r, phi + half - inv(r))); }
    pts.push(polar(rf, phi + half));
  }
  const clean = pts.filter((p, k) => k === 0 || Math.hypot(p.x - pts[k - 1].x, p.y - pts[k - 1].y) > 1e-6);
  const out: Subpath[] = [{ closed: true, nodes: clean.map((p) => ({ x: p.x, y: p.y })) }];
  if (bore > 0 && bore / 2 < rf - 0.1) out.push(...new PathBuilder().arc(0, 0, bore / 2, bore / 2, 0, -360).close().done());
  return out;
}

/** The closest point on a set of subpaths: which subpath and segment, the curve parameter and distance. */
export function nearestOnSubpaths(p: Vec, subs: Subpath[]): { sub: number; seg: number; t: number; dist: number; point: Vec } | null {
  let best: { sub: number; seg: number; t: number; dist: number; point: Vec } | null = null;
  subs.forEach((s, si) => segments(s).forEach((g, gi) => {
    const N = g.line ? 1 : 48;
    let bt = 0, bd = Infinity;
    if (g.line) {
      const dx = g.p3.x - g.p0.x, dy = g.p3.y - g.p0.y, l2 = dx * dx + dy * dy;
      bt = l2 < EPS ? 0 : Math.max(0, Math.min(1, ((p.x - g.p0.x) * dx + (p.y - g.p0.y) * dy) / l2));
      const q = { x: g.p0.x + bt * dx, y: g.p0.y + bt * dy };
      bd = Math.hypot(p.x - q.x, p.y - q.y);
    } else {
      for (let k = 0; k <= N; k++) { const q = cubicAt(g, k / N), d = Math.hypot(p.x - q.x, p.y - q.y); if (d < bd) { bd = d; bt = k / N; } }
      for (let step = 1 / N / 2; step > 1e-6; step /= 2) {
        for (const t of [bt - step, bt + step]) {
          if (t < 0 || t > 1) continue;
          const q = cubicAt(g, t), d = Math.hypot(p.x - q.x, p.y - q.y);
          if (d < bd) { bd = d; bt = t; }
        }
      }
    }
    if (!best || bd < best.dist) best = { sub: si, seg: gi, t: bt, dist: bd, point: cubicAt(g, bt) };
  }));
  return best;
}

/** Inserts an anchor on segment `seg` at parameter t without changing the shape of the curve. */
export function insertAnchor(s: Subpath, seg: number, t: number): Subpath {
  const n = s.nodes.length;
  const a = s.nodes[seg], b = s.nodes[(seg + 1) % n];
  const g = segments(s)[seg];
  const nodes = s.nodes.map((x) => ({ ...x }));
  if (g.line) {
    nodes.splice(seg + 1, 0, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    return { closed: s.closed, nodes };
  }
  const [l, r] = splitCubic(g, t);
  nodes[seg] = { ...nodes[seg], o: l.c1 };
  const bi = (seg + 1) % n;
  nodes[bi] = { ...nodes[bi], i: r.c2 };
  nodes.splice(seg + 1, 0, { x: l.p3.x, y: l.p3.y, i: l.c2, o: r.c1, k: "smooth" });
  return { closed: s.closed, nodes };
}

/** Ramer–Douglas–Peucker: drops points closer than `tol` to the simplified line. */
export function simplifyPolyline(pts: Vec[], tol: number): Vec[] {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = -1, wd = tol;
    for (let k = a + 1; k < b; k++) { const d = distToSegment(pts[k], pts[a], pts[b]); if (d > wd) { wd = d; worst = k; } }
    if (worst >= 0) { keep[worst] = 1; stack.push([a, worst], [worst, b]); }
  }
  return pts.filter((_, k) => keep[k]);
}

/** A freehand stroke as a smooth Bézier path (Pencil tool). */
export function smoothStroke(pts: Vec[], tol: number, closed: boolean): Subpath {
  const simple = simplifyPolyline(pts, tol);
  if (closed && simple.length > 3) simple.pop();
  return catmullRom(simple, closed && simple.length > 2);
}

export function catmullRom(points: Vec[], closed: boolean): Subpath {
  const n = points.length;
  const at = (k: number) => points[closed ? (k + n) % n : Math.max(0, Math.min(n - 1, k))];
  const nodes: Anchor[] = points.map((p, k) => {
    const a = at(k - 1), b = at(k + 1);
    const tx = (b.x - a.x) / 6, ty = (b.y - a.y) / 6;
    const node: Anchor = { x: p.x, y: p.y, k: "smooth" };
    if (closed || k > 0) node.i = { x: p.x - tx, y: p.y - ty };
    if (closed || k < n - 1) node.o = { x: p.x + tx, y: p.y + ty };
    return node;
  });
  return { closed, nodes };
}

/** A live shape as paths in its own space, centred on the origin. */
export function shapePaths(p: ShapeParams): Subpath[] {
  switch (p.kind) {
    case "rect": return rectPath(Math.max(p.w, EPS), Math.max(p.h, EPS), p.r, p.corner);
    case "ellipse": return new PathBuilder().arc(0, 0, Math.abs(p.rx), Math.abs(p.ry), 0, 360).close().done();
    case "polygon": return [roundedPolygon(regularPoints(Math.max(3, Math.round(p.sides)), p.r), p.round)];
    case "star": {
      const n = Math.max(3, Math.round(p.points));
      const inner = Math.max(0.02, Math.min(0.98, p.inner));
      const pts = Array.from({ length: n * 2 }, (_, k) => {
        const r = k % 2 ? p.r * inner : p.r, a = (-90 + (180 * k) / n) * RAD;
        return { x: r * Math.cos(a), y: r * Math.sin(a) };
      });
      return [roundedPolygon(pts, p.round)];
    }
    case "arc": {
      const sweep = Math.max(-360, Math.min(360, p.sweep));
      const pb = new PathBuilder();
      if (p.pie && Math.abs(sweep) < 360) pb.move(0, 0);
      pb.arc(0, 0, p.r, p.r, p.start, p.start + sweep);
      if (p.pie || Math.abs(sweep) >= 360) pb.close();
      return pb.done();
    }
    case "slot": { const r = Math.min(p.w, p.h) / 2; return rectPath(p.w, p.h, [r, r, r, r], "round"); }
    case "gear": return gearPath(p.teeth, p.module, p.pressure, p.bore);
    case "arrow": {
      const hw = p.w / 2, hh = p.h / 2, head = Math.min(p.head, p.w), s = Math.min(p.shaft, p.h) / 2;
      return [{ closed: true, nodes: [[-hw, -s], [hw - head, -s], [hw - head, -hh], [hw, 0], [hw - head, hh], [hw - head, s], [-hw, s]].map(([x, y]) => ({ x, y })) }];
    }
    case "bubble": {
      const hw = p.w / 2, hh = p.h / 2, r = Math.min(p.r, hw, hh);
      const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw + p.w * 0.4, hh], [-hw + p.w * 0.15, hh + p.tail], [-hw + p.w * 0.22, hh], [-hw, hh]].map(([x, y]) => ({ x, y }));
      return [roundedPolygon(pts, [r, r, r, 0, 0, 0, r])];
    }
    case "heart": {
      const X = (v: number) => v * p.w, Y = (v: number) => v * p.h;
      return new PathBuilder().move(0, Y(-0.25))
        .cubic(X(0), Y(-0.5), X(0.5), Y(-0.56), X(0.5), Y(-0.18))
        .cubic(X(0.5), Y(0.12), X(0.12), Y(0.28), X(0), Y(0.5))
        .cubic(X(-0.12), Y(0.28), X(-0.5), Y(0.12), X(-0.5), Y(-0.18))
        .cubic(X(-0.5), Y(-0.56), X(0), Y(-0.5), X(0), Y(-0.25))
        .close().done();
    }
    case "grid": {
      const hw = p.w / 2, hh = p.h / 2;
      const out = rectPath(p.w, p.h, [0, 0, 0, 0], "round");
      const cols = Math.max(1, Math.round(p.cols)), rows = Math.max(1, Math.round(p.rows));
      for (let c = 1; c < cols; c++) { const x = -hw + (p.w * c) / cols; out.push({ closed: false, nodes: [{ x, y: -hh }, { x, y: hh }] }); }
      for (let r = 1; r < rows; r++) { const y = -hh + (p.h * r) / rows; out.push({ closed: false, nodes: [{ x: -hw, y }, { x: hw, y }] }); }
      return out;
    }
    case "spiral": {
      const turns = Math.max(0.25, p.turns), steps = Math.max(8, Math.ceil(turns * 24));
      const pts = Array.from({ length: steps + 1 }, (_, k) => {
        const t = k / steps, a = t * turns * 2 * Math.PI, r = p.inner + (p.r - p.inner) * t;
        return { x: r * Math.cos(a), y: r * Math.sin(a) };
      });
      return [catmullRom(pts, false)];
    }
  }
}

/** Default parameters for a shape drawn at w × h (the drag box of the shape tools). */
export function shapeForBox(kind: ShapeParams["kind"], w: number, h: number, prev?: ShapeParams): ShapeParams {
  const W = Math.max(Math.abs(w), 0.01), H = Math.max(Math.abs(h), 0.01), R = Math.min(W, H) / 2;
  const same = prev && prev.kind === kind ? prev : undefined;
  switch (kind) {
    case "rect": return { kind, w: W, h: H, r: same?.kind === "rect" ? same.r : [0, 0, 0, 0], corner: same?.kind === "rect" ? same.corner : "round" };
    case "ellipse": return { kind, rx: W / 2, ry: H / 2 };
    case "polygon": return { kind, sides: same?.kind === "polygon" ? same.sides : 6, r: R, round: same?.kind === "polygon" ? same.round : 0 };
    case "star": return { kind, points: same?.kind === "star" ? same.points : 5, r: R, inner: same?.kind === "star" ? same.inner : 0.5, round: same?.kind === "star" ? same.round : 0 };
    case "arc": return { kind, r: R, start: -90, sweep: same?.kind === "arc" ? same.sweep : 270, pie: same?.kind === "arc" ? same.pie : true };
    case "slot": return { kind, w: W, h: H };
    case "gear": return { kind, teeth: same?.kind === "gear" ? same.teeth : 20, module: Math.max(0.2, (2 * R) / ((same?.kind === "gear" ? same.teeth : 20) + 2)), pressure: 20, bore: R * 0.3 };
    case "arrow": return { kind, w: W, h: H, head: Math.min(W * 0.35, H * 1.2), shaft: H * 0.4 };
    case "bubble": return { kind, w: W, h: H * 0.8, r: Math.min(W, H) * 0.12, tail: H * 0.2 };
    case "heart": return { kind, w: W, h: H };
    case "grid": return { kind, w: W, h: H, cols: same?.kind === "grid" ? same.cols : 4, rows: same?.kind === "grid" ? same.rows : 3 };
    case "spiral": return { kind, turns: same?.kind === "spiral" ? same.turns : 4, r: R, inner: 0 };
  }
}

// ---------- scene nodes ----------

/**
 * Paths of a node in its own space (before its transform), after its Live Effects. Groups return
 * their children's paths. Everything that draws, hits, measures or exports geometry uses this.
 */
export function nodePaths(n: SceneNode): Subpath[] {
  if ((n.type === "path" || n.type === "shape" || n.type === "text" || n.type === "clone") && n.effects?.some((e) => e.enabled)) return effectPaths(n);
  return nodeBasePaths(n);
}

type EffectNode = Extract<SceneNode, { type: "path" | "shape" | "text" | "clone" }>;
/**
 * Effect output per node object. Immer gives a changed node a new object, so the node is the key; the
 * base geometry and the effects array are compared as well, for plain objects edited in place.
 * Drafts (inside an edit recipe) are never cached.
 */
const fxCache = new WeakMap<object, { base: unknown; fx: unknown; out: Subpath[] }>();
function effectPaths(n: EffectNode): Subpath[] {
  const base = n.type === "path" ? n.subpaths : n.type === "shape" ? n.shape : n.type === "clone" ? n.cache : n.outline;
  const hit = fxCache.get(n);
  if (hit && hit.base === base && hit.fx === n.effects) return hit.out;
  const out = applyEffects(nodeBasePaths(n), n.effects ?? [], n);
  if (!isDraft(n)) fxCache.set(n, { base, fx: n.effects, out });
  return out;
}

/** The node's own geometry without Live Effects: what the node editor edits and what the effects start from. */
export function nodeBasePaths(n: SceneNode): Subpath[] {
  switch (n.type) {
    case "path": return n.subpaths;
    case "shape": return shapePaths(n.shape);
    case "text": return n.outline ?? [];
    case "image": return rectPath(n.w, n.h, [0, 0, 0, 0], "round");
    case "group": return n.children.filter((c) => !c.hidden).flatMap((c) => transformSubpaths(nodePaths(c), c.transform));
    case "dimension": return n.points.length > 1 ? [{ closed: false, nodes: n.points.map((p) => ({ x: p.x, y: p.y })) }] : [];
    case "generator": return generatorPaths(n);
    case "clone": return n.cache ?? [];
  }
}

type GeneratorPathsFn = (n: Extract<SceneNode, { type: "generator" }>) => Subpath[];
let generatorPaths: GeneratorPathsFn = () => [];
/** The generator framework (S5) provides the paths of live generator objects. */
export function setGeneratorPaths(fn: GeneratorPathsFn) { generatorPaths = fn; }

/** Bounds of a node in its parent's space (or world space when `m` is the world matrix). */
export function nodeBox(n: SceneNode, m: Mat = n.transform): Box {
  return subpathsBox(transformSubpaths(nodePaths(n), m));
}

/** Even-odd point-in-polygon test over several rings. */
export function pointInRings(p: Vec, rings: Vec[][]): boolean {
  let inside = false;
  for (const r of rings) {
    for (let k = 0, j = r.length - 1; k < r.length; j = k++) {
      const a = r[k], b = r[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
  }
  return inside;
}

export function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 < EPS ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export interface PathHit { stroke: number; inside: boolean; area: number }

/** How a point relates to world-space paths: distance to the outline, inside a closed area, and that area. */
export function hitPaths(p: Vec, subs: Subpath[], tol: number): PathHit {
  let stroke = Infinity, area = 0;
  const rings: Vec[][] = [];
  for (const s of subs) {
    const pts = flatten(s, Math.max(tol / 4, 0.01));
    const loop = s.closed ? [...pts, pts[0]] : pts;
    for (let k = 1; k < loop.length; k++) stroke = Math.min(stroke, distToSegment(p, loop[k - 1], loop[k]));
    if (loop.length === 1) stroke = Math.min(stroke, Math.hypot(p.x - loop[0].x, p.y - loop[0].y));
    if (s.closed && pts.length > 2) { rings.push(pts); area += Math.abs(polygonArea(pts)); }
  }
  return { stroke, inside: rings.length > 0 && pointInRings(p, rings), area };
}

export function boxContains(outer: Box, inner: Box): boolean {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY;
}

export function boxesTouch(a: Box, b: Box): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function boxCenter(b: Box): Vec { return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }; }

export function normBox(a: Vec, b: Vec): Box {
  return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
}
