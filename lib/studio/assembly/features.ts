/**
 * What a flat part offers for joining, read from its outline alone. Each part gets its own frame: the
 * smallest rectangle around it, turned square to its longest straight edges, origin at a corner. Every
 * side of that rectangle gets a depth profile (how far in the outline is, along the side), which shows
 * finger joints and tabs (two depths), and notches (narrow cuts much deeper than their width). Holes
 * that are thin rectangles are slots.
 */
import { signedArea, type P, type RawPart, type RingSource } from "./parts";

export interface Frame {
  /** Radians: document = origin + R(angle)·local. */
  angle: number;
  ox: number;
  oy: number;
  w: number;
  h: number;
}

export const toLocal = (f: Frame, p: P): P => {
  const c = Math.cos(f.angle), s = Math.sin(f.angle), dx = p[0] - f.ox, dy = p[1] - f.oy;
  return [c * dx + s * dy, -s * dx + c * dy];
};
export const toDoc = (f: Frame, p: P): P => {
  const c = Math.cos(f.angle), s = Math.sin(f.angle);
  return [f.ox + c * p[0] - s * p[1], f.oy + s * p[0] + c * p[1]];
};
export const dirToDoc = (f: Frame, v: P): P => {
  const c = Math.cos(f.angle), s = Math.sin(f.angle);
  return [c * v[0] - s * v[1], s * v[0] + c * v[1]];
};

/** A ring in the part's frame without repeated or collinear points; `first`/`last` are the source vertices at each corner. */
export interface Poly {
  pts: P[];
  first: number[];
  last: number[];
  /** Vertex count of the source ring. */
  n: number;
  src: RingSource;
}

export interface EdgeRef { ring: number; edge: number }

/** Along-side interval [a, b] and how far in the outline is there (Infinity: not straight there). */
export interface Span { a: number; b: number; d: number; edge: number }

export interface Notch {
  side: number;
  /** Centre along the side, in the side's own direction (see orient). */
  at: number;
  /** The centre on the side line, in the part's frame. */
  pt: P;
  w: number;
  depth: number;
  /** The two cut walls, the one nearer the side's start first. */
  flanks: [EdgeRef, EdgeRef];
}

export type SideKind = "straight" | "jointed" | "other";

export interface Side {
  k: number;
  /** Side length and the part's size across it. */
  L: number;
  across: number;
  kind: SideKind;
  /** Joint depth (jointed sides). */
  d: number;
  /** Where the outline reaches the side (fingers or tabs), along the side. */
  tabs: [number, number][];
  /** The outline edges at the joint depth. */
  deep: EdgeRef[];
  notches: Notch[];
}

export interface Slot {
  hole: number;
  c: P;
  /** Unit vector along the slot. */
  axis: P;
  len: number;
  w: number;
  /** The long walls, and the short ends. */
  long: [EdgeRef, EdgeRef];
  ends: [EdgeRef, EdgeRef];
}

export interface Features {
  frame: Frame;
  outer: Poly;
  holes: Poly[];
  sides: Side[];
  slots: Slot[];
  /** Four straight or jointed sides, at least two jointed. */
  panel: boolean;
  /** A plain rectangle. */
  rect: boolean;
}

/** Turns side k into the bottom: u along it (left to right seen from outside), v down; the part is L × H there. */
export interface Orient { k: number; L: number; H: number; m: [number, number, number, number, number, number] }

export function orient(k: number, w: number, h: number): Orient {
  switch (((k % 4) + 4) % 4) {
    case 0: return { k: 0, L: w, H: h, m: [-1, 0, w, 0, -1, h] };
    case 1: return { k: 1, L: h, H: w, m: [0, -1, h, 1, 0, 0] };
    case 2: return { k: 2, L: w, H: h, m: [1, 0, 0, 0, 1, 0] };
    default: return { k: 3, L: h, H: w, m: [0, 1, 0, -1, 0, w] };
  }
}
export const orientPt = (o: Orient, p: P): P => [o.m[0] * p[0] + o.m[1] * p[1] + o.m[2], o.m[3] * p[0] + o.m[4] * p[1] + o.m[5]];

// ---------- frame ----------

function hull(pts: P[]): P[] {
  const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (s.length < 3) return s;
  const crossO = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: P[] = [], upper: P[] = [];
  for (const p of s) { while (lower.length >= 2 && crossO(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (let i = s.length - 1; i >= 0; i--) { const p = s[i]; while (upper.length >= 2 && crossO(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function boundsAt(pts: P[], a: number) {
  const c = Math.cos(a), s = Math.sin(a);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    const u = c * x + s * y, v = -s * x + c * y;
    if (u < x0) x0 = u; if (u > x1) x1 = u; if (v < y0) y0 = v; if (v > y1) y1 = v;
  }
  return { x0, y0, x1, y1, area: (x1 - x0) * (y1 - y0) };
}

/** The smallest rectangle around the outline; square to the page when that is nearly as small. */
export function partFrame(pts: P[]): Frame {
  const hp = hull(pts);
  let best = 0, area = boundsAt(hp, 0).area;
  const zero = area;
  for (let i = 0; i < hp.length; i++) {
    const a = hp[i], b = hp[(i + 1) % hp.length];
    let ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    ang = ((ang % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
    if (ang > Math.PI / 4) ang -= Math.PI / 2;
    const r = boundsAt(hp, ang).area;
    if (r < area - 1e-9) { area = r; best = ang; }
  }
  if (zero <= area * 1.005 || Math.abs(best) < (0.3 * Math.PI) / 180) best = 0;
  const b = boundsAt(hp, best);
  const c = Math.cos(best), s = Math.sin(best);
  return { angle: best, ox: c * b.x0 - s * b.y0, oy: s * b.x0 + c * b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 };
}

// ---------- polygons ----------

export function cleanPoly(raw: P[], src: RingSource, tol = 0.02): Poly {
  const n = raw.length;
  // Clusters of repeated points.
  let pts: P[] = [], first: number[] = [], last: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = raw[i], q = pts[pts.length - 1];
    if (q && Math.hypot(p[0] - q[0], p[1] - q[1]) < tol) { last[last.length - 1] = i; continue; }
    pts.push(p); first.push(i); last.push(i);
  }
  if (pts.length > 1) {
    const a = pts[0], z = pts[pts.length - 1];
    if (Math.hypot(a[0] - z[0], a[1] - z[1]) < tol) { first[0] = first[first.length - 1]; pts.pop(); first.pop(); last.pop(); }
  }
  // Collinear points.
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length && pts.length > 3; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
      const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
      if (Math.abs(ux * vy - uy * vx) / Math.max(lu, lv, 1e-9) < tol * 0.5 && ux * vx + uy * vy > 0) {
        pts = pts.filter((_, j) => j !== i); first = first.filter((_, j) => j !== i); last = last.filter((_, j) => j !== i);
        changed = true;
        i--;
      }
    }
  }
  return { pts, first, last, n, src };
}

/** Source vertices on edge e (from its start corner to its end corner, wrapping). */
export function edgeVertices(poly: Poly, e: number): number[] {
  const m = poly.pts.length;
  const a = poly.first[e], b = poly.last[(e + 1) % m];
  const out: number[] = [];
  for (let i = a, guard = 0; guard <= poly.n; i = (i + 1) % poly.n, guard++) {
    out.push(i);
    if (i === b) break;
  }
  return out;
}

const rightAngles = (pts: P[]) => pts.length === 4 && pts.every((b, i) => {
  const a = pts[(i + 3) % 4], c = pts[(i + 1) % 4];
  const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
  return Math.abs(ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1) < 0.01;
});

// ---------- sides ----------

function profile(poly: Poly, o: Orient): Span[] {
  const pts = poly.pts.map((p) => orientPt(o, p));
  const ccw = signedArea(poly.pts) > 0;
  const band = Math.max(0.75 * o.H, 1);
  const cand: Span[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (Math.abs(a[1] - b[1]) > 0.02) continue;
    const du = b[0] - a[0];
    if (Math.abs(du) < 1e-6 || (ccw ? du > 0 : du < 0)) continue;
    const d = o.H - (a[1] + b[1]) / 2;
    if (d < -0.05 || d > band) continue;
    cand.push({ a: Math.max(0, Math.min(a[0], b[0])), b: Math.min(o.L, Math.max(a[0], b[0])), d: Math.max(0, d), edge: i });
  }
  const cuts = [...new Set([0, o.L, ...cand.flatMap((c) => [c.a, c.b])])].filter((x) => x >= 0 && x <= o.L).sort((x, y) => x - y);
  const spans: Span[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i], b = cuts[i + 1];
    if (b - a < 1e-6) continue;
    const mid = (a + b) / 2;
    let d = Infinity, edge = -1;
    for (const c of cand) if (c.a <= mid && c.b >= mid && c.d < d) { d = c.d; edge = c.edge; }
    const last = spans[spans.length - 1];
    if (last && Math.abs(last.d - d) < 0.02 && (last.edge === edge || !Number.isFinite(d))) last.b = b;
    else spans.push({ a, b, d, edge });
  }
  // Kerf-compensated outlines bevel each outer corner: a sliver with no level edge between two spans
  // belongs to the shallower one (the bevel sits on the outer corner of a finger or tab).
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i];
    if (Number.isFinite(s.d) || s.b - s.a > BEVEL) continue;
    const prev = spans[i - 1], next = spans[i + 1];
    const fp = prev && Number.isFinite(prev.d), fn = next && Number.isFinite(next.d);
    if (!fp && !fn) continue;
    const to = fp && fn ? (prev.d <= next.d ? prev : next) : fp ? prev : next;
    to.a = Math.min(to.a, s.a); to.b = Math.max(to.b, s.b);
    spans.splice(i, 1);
    i--;
  }
  for (let i = 1; i < spans.length; i++) {
    const a = spans[i - 1], b = spans[i];
    if (a.edge === b.edge && Number.isFinite(a.d) && Math.abs(a.d - b.d) < 0.02) { a.b = b.b; spans.splice(i, 1); i--; }
  }
  return spans;
}

/** Widest corner bevel a kerf offset leaves (0.4 mm kerf), mm. */
const BEVEL = 0.3;

function side(poly: Poly, w: number, h: number, k: number, T: number): Side {
  const o = orient(k, w, h);
  const spans = profile(poly, o);
  const tol = Math.max(0.3, 0.1 * T);
  const notches: Notch[] = [];
  const isNotch = spans.map((s, i) => {
    const wd = s.b - s.a, prev = spans[i - 1], next = spans[i + 1];
    if (!Number.isFinite(s.d) || !prev || !next || !Number.isFinite(prev.d) || !Number.isFinite(next.d)) return false;
    return wd >= Math.max(0.8, 0.4 * T) && wd <= 2.5 * T + tol && s.d >= Math.max(3, 1.5 * wd) && prev.d <= s.d - 2 && next.d <= s.d - 2;
  });
  const m = poly.pts.length;
  // Orientation from the part frame to this side's frame is a rotation: u runs along o's x.
  const inv = (u: number): P => {
    const [a, b, c, d, e, f] = o.m, det = a * e - b * d;
    const x = u - c, y = o.H - f;
    return [(e * x - b * y) / det, (-d * x + a * y) / det];
  };
  spans.forEach((s, i) => {
    if (!isNotch[i]) return;
    const e = s.edge;
    notches.push({ side: k, at: (s.a + s.b) / 2, pt: inv((s.a + s.b) / 2), w: s.b - s.a, depth: s.d, flanks: [{ ring: 0, edge: (e + 1) % m }, { ring: 0, edge: (e - 1 + m) % m }] });
  });
  // Fix flank order: the flank nearer the side's start (smaller u) first.
  for (const n of notches) {
    const mu = (r: EdgeRef) => { const p = orientPt(o, poly.pts[r.edge]), q = orientPt(o, poly.pts[(r.edge + 1) % m]); return (p[0] + q[0]) / 2; };
    if (mu(n.flanks[0]) > mu(n.flanks[1])) n.flanks = [n.flanks[1], n.flanks[0]];
  }
  // A short step at either end is the corner left for the neighbouring panel, not part of this side's joint.
  // It is as wide as the joint is deep, which is the material the joints were cut for (maybe not this sheet's).
  const pre = spans.filter((s, i) => !isNotch[i] && Number.isFinite(s.d) && s.d > tol).map((s) => s.d).sort((a, b) => a - b);
  const cornerW = Math.max(1.5 * T, 1.25 * (pre[Math.floor(pre.length / 2)] ?? 0)) + tol;
  const corner = spans.map((s, i) => {
    if (isNotch[i] || (i !== 0 && i !== spans.length - 1) || spans.length < 2) return false;
    const next = spans[i === 0 ? 1 : spans.length - 2];
    return s.b - s.a <= cornerW && Number.isFinite(next.d) && (!Number.isFinite(s.d) || s.d > next.d + tol);
  });
  const rest = spans.filter((_, i) => !isNotch[i] && !corner[i]);
  const finite = rest.filter((s) => Number.isFinite(s.d));
  const covered = spans.filter((s, i) => Number.isFinite(s.d) || corner[i]).reduce((t, s) => t + s.b - s.a, 0);
  const inner = rest.slice(1, -1).filter((s) => !Number.isFinite(s.d)).reduce((t, s) => t + s.b - s.a, 0);
  const zero = finite.filter((s) => s.d <= tol);
  const deepSpans = finite.filter((s) => s.d > tol);
  const ds = deepSpans.map((s) => s.d).sort((a, b) => a - b);
  const dm = ds.length ? ds[Math.floor(ds.length / 2)] : 0;
  const tabs = mergeSpans(zero);
  const base = { k, L: o.L, across: o.H, notches, tabs, d: 0, deep: [] as EdgeRef[] };
  if (!deepSpans.length) {
    const kind: SideKind = covered >= 0.85 * o.L ? "straight" : "other";
    return { ...base, kind };
  }
  const consistent = ds.every((d) => Math.abs(d - dm) <= tol);
  // Rounded corners: a curve at either end of an otherwise jointed side.
  const ends = [rest[0], rest[rest.length - 1]].filter((s, i, a) => s && !Number.isFinite(s.d) && a.indexOf(s) === i);
  const rounded = ends.reduce((t, s) => t + Math.min(s.b - s.a, 0.2 * o.L), 0);
  const jointed = consistent && dm >= 0.6 && dm <= Math.min(25, 0.45 * o.H) && tabs.length >= 1 && zero.length + deepSpans.length >= 3
    && inner <= 0.5 && covered + rounded >= o.L - 2 * (dm + tol) - 0.5;
  if (!jointed) return { ...base, kind: "other" };
  const cornerDeep = spans.filter((s, i) => corner[i] && Number.isFinite(s.d) && Math.abs(s.d - dm) <= tol);
  return { ...base, kind: "jointed", d: dm, deep: [...new Set([...deepSpans, ...cornerDeep].map((s) => s.edge))].map((edge) => ({ ring: 0, edge })) };
}

function mergeSpans(spans: Span[]): [number, number][] {
  const out: [number, number][] = [];
  for (const s of [...spans].sort((a, b) => a.a - b.a)) {
    const last = out[out.length - 1];
    if (last && s.a - last[1] < 0.05) last[1] = Math.max(last[1], s.b);
    else out.push([s.a, s.b]);
  }
  return out;
}

// ---------- slots ----------

function slotOf(poly: Poly, hole: number, T: number): Slot | null {
  const p = poly.pts;
  if (!rightAngles(p)) return null;
  const l0 = Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]), l1 = Math.hypot(p[2][0] - p[1][0], p[2][1] - p[1][1]);
  const long = l0 >= l1 ? 0 : 1, len = Math.max(l0, l1), w = Math.min(l0, l1);
  if (w < 0.5 || len < 1.2 * w || w > 4 * T + 1) return null;
  const a = p[long], b = p[long + 1];
  return {
    hole, c: [(p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2], axis: [(b[0] - a[0]) / len, (b[1] - a[1]) / len], len, w,
    long: [{ ring: hole + 1, edge: long }, { ring: hole + 1, edge: long + 2 }], ends: [{ ring: hole + 1, edge: 1 - long }, { ring: hole + 1, edge: 3 - long }],
  };
}

export function partFeatures(part: RawPart, T: number): Features {
  const frame = partFrame(part.outer.pts);
  const local = (pts: P[]) => pts.map((p) => toLocal(frame, p));
  const outer = cleanPoly(local(part.outer.pts), part.outer.src);
  const holes = part.holes.map((h) => cleanPoly(local(h.pts), h.src));
  const sides = [0, 1, 2, 3].map((k) => side(outer, frame.w, frame.h, k, T));
  const slots = holes.map((h, i) => slotOf(h, i, T)).filter((s): s is Slot => !!s);
  const panel = sides.every((s) => s.kind !== "other") && sides.filter((s) => s.kind === "jointed").length >= 2;
  return { frame, outer, holes, sides, slots, panel, rect: outer.pts.length === 4 && rightAngles(outer.pts) };
}

/** The ring a reference points into (0 = the outline). */
export const ringOf = (f: Features, r: EdgeRef): Poly => (r.ring === 0 ? f.outer : f.holes[r.ring - 1]);

/** An edge's two ends in the part frame. */
export function edgeEnds(f: Features, r: EdgeRef): [P, P] {
  const poly = ringOf(f, r), m = poly.pts.length;
  return [poly.pts[r.edge % m], poly.pts[(r.edge + 1) % m]];
}
