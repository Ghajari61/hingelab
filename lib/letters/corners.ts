/**
 * Living-hinge walls that keep the letter's corners. A hinge strip cannot bend tighter than the
 * lattice allows, so instead of rounding the whole letter (which also deletes every stroke
 * narrower than twice that radius), the wall is broken at its corners: each stretch tighter than
 * the bend radius becomes a sharp corner (or a few short facets, for a tight curve such as a
 * stroke's round end) where one strip ends and the next begins. Strips meet at a lap joint near
 * 90° (one runs through to the corner, the other stops at its face) and a butt joint otherwise
 * (both stop where their inner faces meet). Kinks under 35° are eased with an arc the hinge can
 * bend instead. Between the corners each strip is an ordinary living-hinge strip: tabs on its
 * flats, hinge columns over its curves.
 */
import { bboxOf, hingeSegments, makeCols, tabCount, wallOutline } from "@/lib/hinge";
import type { HingeCol, Params } from "@/lib/hinge";
import { wallMaxLengthOf } from "./defaults";
import { Loop, turnAt, windowRadius } from "./path";
import { slotAt, verdictOf } from "./strips";
import type { Contour, Joint, LetterIssue, LetterParams, PartMark, Point, StripPart, Wall, Zone } from "./types";

/** Sample spacing along the centerline, mm. */
const DS = 0.5;
/** Kinks turning less than this are eased with an arc instead of a joint, degrees. */
const EASE_TURN = 35;
/** A tight curve long enough to be faceted gets a corner per this much turn at most, degrees. */
const MAX_CORNER_TURN = 120;
/** A short, sharp corner stays one joint up to this turn; only a hairpin needs two, degrees. */
const MAX_SHARP_TURN = 165;
/** Tight runs closer than this are one feature, mm. */
const RUN_GAP = 5;
/** Lap joints within this many degrees of 90°; other corners are butt joints. */
const LAP_TOL = 25;
/** Turning over the 3 mm window below which a strip counts as flat (as curvatureZones). */
const FLAT_TURN = (0.5 * Math.PI) / 180;

const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;
const dist = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const norm = (a: number) => { let d = a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

export interface CorneredPath {
  /** The new centerline: the old one with every tight stretch replaced by corners or an easing arc. */
  pts: Contour;
  /** Indices into pts of the corners (joints), in order. */
  joints: number[];
}

/**
 * Where the line leaving a (direction angle ta) meets the line arriving at b (angle tb): the corner
 * between them. Null when they are parallel, or when the corner would lie behind a or past b (the
 * two lines diverge, so no corner joins them going forward).
 */
function meet(a: Point, ta: number, b: Point, tb: number): Point | null {
  const ux = Math.cos(ta), uy = Math.sin(ta), vx = Math.cos(tb), vy = Math.sin(tb);
  const den = ux * vy - uy * vx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((b[0] - a[0]) * vy - (b[1] - a[1]) * vx) / den;
  const q: Point = [a[0] + ux * t, a[1] + uy * t];
  if (t < -1e-6 || (b[0] - q[0]) * vx + (b[1] - q[1]) * vy < -1e-6) return null;
  return q;
}

/** The loop's points from arc length a forward to b (a < b, either may lie past the length; wraps). */
function pathBetween(loop: Loop, a: number, b: number): Point[] {
  const L = loop.length, out: Point[] = [loop.at(a)];
  const base = Math.floor(a / L) * L;
  for (let k = 0; k < 3; k++) for (let i = 0; i < loop.pts.length; i++) {
    const s = base + k * L + loop.cum[i];
    if (s > a + 1e-9 && s < b - 1e-9) out.push(loop.pts[i]);
  }
  out.push(loop.at(b));
  return out;
}

/** Direction of the loop at arc length s, from a chord of ±1 mm. */
const dirAt = (loop: Loop, s: number) => { const a = loop.at(s - 1), b = loop.at(s + 1); return Math.atan2(b[1] - a[1], b[0] - a[0]); };

/**
 * Replace every stretch of `c` tighter than `rLimit` (the hinge's bend limit) by corners at least
 * `minPiece` apart, or by an easing arc of radius `rBend` for a small kink between straight runs.
 * Corners lie on the tangent lines, so the path stays straight into and out of each corner.
 */
export function cornerPath(c: Contour, rLimit: number, minPiece: number, tol: number, rBend = rLimit, maxThin = Infinity): CorneredPath {
  const loop = new Loop(c);
  const L = loop.length;
  const n = Math.max(16, Math.ceil(L / DS));
  const ds = L / n;
  const tight = Array.from({ length: n }, (_, j) => windowRadius(loop, j * ds) < rLimit);
  if (!tight.some(Boolean)) return { pts: c.slice(), joints: [] };
  // a small loop that is tight (nearly) all round, such as a little round counter: a polygon of short sides
  const polygon = (): CorneredPath => {
    const k = Math.max(3, Math.min(8, Math.floor(L / minPiece)));
    const pts: Contour = [];
    for (let j = 0; j < k; j++) {
      const s0 = (L * j) / k, s1 = (L * (j + 1)) / k;
      const q = meet(loop.at(s0), dirAt(loop, s0), loop.at(s1), dirAt(loop, s1));
      pts.push(q ?? loop.at(s1));
    }
    return { pts, joints: pts.map((_, i) => i) };
  };
  if (tight.filter(Boolean).length * ds > L - RUN_GAP) return polygon();

  // tight runs as arc-length intervals, starting the walk at a loose sample
  const j0 = tight.findIndex(t => !t);
  const runs: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const j = (j0 + k) % n;
    if (!tight[j]) continue;
    const s = (j0 + k) * ds;
    const last = runs[runs.length - 1];
    if (last && Math.abs(last[1] - (s - ds / 2)) < 1e-6) last[1] = s + ds / 2;
    else runs.push([s - ds / 2, s + ds / 2]);
  }

  // runs a few millimetres apart that turn the same way are one tight feature (a small curve whose
  // radius wavers over the limit); an S-bend's two turns stay two features
  const segDir0 = (a: Point, b: Point) => Math.atan2(b[1] - a[1], b[0] - a[0]);
  const turnOf = (a: number, b: number) => { const q = pathBetween(loop, a, b); let t = 0; for (let k = 1; k < q.length - 1; k++) t += norm(segDir0(q[k], q[k + 1]) - segDir0(q[k - 1], q[k])); return t; };
  const same = (x: [number, number], y: [number, number]) => Math.sign(turnOf(x[0], x[1])) === Math.sign(turnOf(y[0], y[1]));
  for (let k = runs.length - 1; k > 0; k--) if (runs[k][0] - runs[k - 1][1] < RUN_GAP && same(runs[k - 1], runs[k])) { runs[k - 1][1] = runs[k][1]; runs.splice(k, 1); }
  if (runs.length > 1 && runs[0][0] + L - runs[runs.length - 1][1] < RUN_GAP && same(runs[runs.length - 1], runs[0])) { const last = runs.pop()!; runs[0] = [last[0] - L, runs[0][1]]; }

  if (runs.length === 1 && runs[0][1] - runs[0][0] > L - RUN_GAP) return polygon();

  // plan each run's replacement first: an easing arc may need more of the path than the run covers
  const segDir = (a: Point, b: Point) => Math.atan2(b[1] - a[1], b[0] - a[0]);
  type Plan = { a: number; b: number; pts: Point[]; corners: number[] };
  const plans: Plan[] = [];
  // the walk starts after the last run, so every run lies one length further on
  for (const [ra, rb] of runs) {
    let a = ra + L, b = rb + L;
    const sub = pathBetween(loop, a - 1.5, b + 1.5);
    if (sub.length < 3) continue;
    // total turn across the run: the sum of its vertex turns
    let theta = 0;
    for (let k = 1; k < sub.length - 1; k++) theta += norm(segDir(sub[k], sub[k + 1]) - segDir(sub[k - 1], sub[k]));
    const ta = segDir(sub[0], sub[1]), tb = ta + theta;
    const pa = loop.at(a), pb = loop.at(b);
    const corner0 = Math.abs(deg(theta)) < EASE_TURN ? meet(pa, ta, pb, tb) : null;
    if (corner0) {
      // ease the kink with an arc of radius rBend, tangent to both sides, reaching as far along the
      // path as it needs; where the path is not straight enough for the arc to land on it smoothly
      // (at its place and heading), the kink becomes a joint instead
      const corner = corner0;
      const d = rBend * Math.tan(Math.abs(theta) / 2);
      const ea = a - Math.max(0, d - dist(pa, corner)), eb = b + Math.max(0, d - dist(corner, pb));
      const e0: Point = [corner[0] - Math.cos(ta) * d, corner[1] - Math.sin(ta) * d], e1: Point = [corner[0] + Math.cos(tb) * d, corner[1] + Math.sin(tb) * d];
      const off = (u: number, t: number) => Math.abs(deg(norm(dirAt(loop, u) - t)));
      const lands = dist(e0, loop.at(ea)) <= 0.3 && dist(e1, loop.at(eb)) <= 0.3 && off(ea - 1.5, ta) < 4 && off(eb + 1.5, tb) < 4;
      if (lands) {
      a = ea; b = eb;
      const m = Math.max(3, Math.ceil(Math.abs(theta) / rad(3)));
      const p0: Point = [corner[0] - Math.cos(ta) * d, corner[1] - Math.sin(ta) * d];
      const sgn = Math.sign(theta);
      const cx = p0[0] - Math.sin(ta) * rBend * sgn, cy = p0[1] + Math.cos(ta) * rBend * sgn;
      const arc: Point[] = [];
      for (let k = 0; k <= m; k++) { const t = ta + (theta * k) / m; arc.push([cx + Math.sin(t) * rBend * sgn, cy - Math.cos(t) * rBend * sgn]); }
      plans.push({ a, b, pts: arc, corners: [] });
      continue;
      }
    }
    // corners: as few as the turn allows, more where the tangent polygon strays more than tol
    const len = b - a;
    const rRun = len / Math.abs(theta);
    // a short run is a sharp corner: one joint, unless it doubles back; a long one is faceted
    const sharp = (rRun * Math.abs(theta)) / 2 < minPiece;
    let k = Math.max(1, Math.ceil(Math.abs(deg(theta)) / (sharp ? MAX_SHARP_TURN : MAX_CORNER_TURN)));
    // a concave corner on the tangents sits inside the stroke; no deeper than maxThin
    if (theta < 0) while (k < 4 && rRun * (1 / Math.cos(Math.abs(theta) / (2 * k)) - 1) > maxThin) k++;
    while (k < 8 && rRun * (1 / Math.cos(Math.abs(theta) / (2 * k)) - 1) > tol && (rRun * Math.abs(theta)) / (k + 1) >= minPiece) k++;
    if (theta < 0 && !sharp) {
      // a long concave stretch: corners on the curve itself, its two ends included, so the chords run
      // through the open side and the letter only grows (corners on the tangents would thin the
      // stroke behind them); every vertex is a joint, the ends too, since the chords leave them at an angle
      const pts: Point[] = [pa], corners: number[] = [0];
      let acc = 0, idx = 1;
      for (let j = 1; j < k; j++) {
        const want = (theta * j) / k;
        while (idx < sub.length - 1 && Math.abs(acc) < Math.abs(want)) { acc += norm(segDir(sub[idx], sub[idx + 1]) - segDir(sub[idx - 1], sub[idx])); idx++; }
        corners.push(pts.length);
        pts.push(sub[Math.max(1, Math.min(idx - 1, sub.length - 2))]);
      }
      corners.push(pts.length);
      pts.push(pb);
      plans.push({ a, b, pts, corners });
      continue;
    }
    // a convex stretch: corners where the tangent lines meet, outside the curve
    const lines: { q: Point; t: number }[] = [{ q: pa, t: ta }];
    let acc = 0, idx = 1;
    for (let j = 1; j < k; j++) {
      const want = (theta * j) / k;
      while (idx < sub.length - 1 && Math.abs(acc) < Math.abs(want)) { acc += norm(segDir(sub[idx], sub[idx + 1]) - segDir(sub[idx - 1], sub[idx])); idx++; }
      lines.push({ q: sub[Math.min(idx, sub.length - 1)], t: ta + want });
    }
    lines.push({ q: pb, t: tb });
    const pts: Point[] = [pa], corners: number[] = [];
    for (let j = 0; j + 1 < lines.length; j++) {
      const q = meet(lines[j].q, lines[j].t, lines[j + 1].q, lines[j + 1].t);
      corners.push(pts.length);
      // lines that do not meet going forward: the corner sits on the path, halfway between them
      pts.push(q ?? loop.at(a + ((b - a) * (2 * j + 1)) / (2 * (lines.length - 1))));
    }
    plans.push({ a, b, pts, corners });
  }

  // an easing arc that reaches into its neighbour's stretch is left out (the path stays as it was there)
  for (let k = plans.length - 1; k >= 0; k--) {
    const pl = plans[k], prev = plans[(k - 1 + plans.length) % plans.length], next = plans[(k + 1) % plans.length];
    if (plans.length < 2 || pl.corners.length) continue;
    const prevB = k === 0 ? prev.b - L : prev.b, nextA = k === plans.length - 1 ? next.a + L : next.a;
    if (pl.a < prevB - 1e-6 || pl.b > nextA + 1e-6) plans.splice(k, 1);
  }
  if (!plans.length) return { pts: c.slice(), joints: [] };
  const out: Contour = [];
  const joints: number[] = [];
  // the walk starts where the last replacement ends, and goes once round
  const start = plans[plans.length - 1].b - L;
  let cursor = start;
  for (const pl of plans) {
    const a = Math.max(pl.a, cursor);
    if (a - cursor > 1e-9) for (const q of pathBetween(loop, cursor, a).slice(0, -1)) out.push(q);
    for (let k = 0; k < pl.pts.length; k++) {
      if (pl.corners.includes(k)) joints.push(out.length);
      out.push(pl.pts[k]);
    }
    cursor = Math.max(cursor, pl.b);
  }
  if (start + L - cursor > 1e-9) for (const q of pathBetween(loop, cursor, start + L).slice(0, -1)) out.push(q);
  return mergeClose(dedupe(out, joints), minPiece, maxThin);
}

/** Drop points closer than 1 µm, keeping the joint indices pointing at their corners. */
function dedupe(pts: Contour, joints: number[]): CorneredPath {
  const keep: Contour = [];
  const map = new Map<number, number>();
  pts.forEach((q, i) => {
    const l = keep[keep.length - 1];
    if (l && dist(l, q) < 1e-3) { map.set(i, keep.length - 1); return; }
    map.set(i, keep.length);
    keep.push(q);
  });
  while (keep.length > 2 && dist(keep[0], keep[keep.length - 1]) < 1e-3) keep.pop();
  const js = [...new Set(joints.map(j => Math.min(map.get(j)!, keep.length - 1)))].sort((a, b) => a - b);
  return { pts: keep, joints: js };
}

/**
 * Two corners closer than minPiece leave a piece too short to cut; where their turns together
 * stay under MAX_CORNER_TURN they become one corner where the straight runs on either side meet.
 */
function mergeClose(cp: CorneredPath, minPiece: number, maxThin = Infinity): CorneredPath {
  let { pts, joints } = cp;
  const stuck = new Set<string>();
  for (let guard = 0; guard < 64 && joints.length > 1; guard++) {
    const loop = new Loop(pts);
    let best = -1, bestLen = minPiece;
    for (let k = 0; k < joints.length; k++) {
      const a = joints[k], b = joints[(k + 1) % joints.length];
      if (stuck.has(`${pts[a]}|${pts[b]}`)) continue;
      let l = loop.cum[b] - loop.cum[a];
      if (l <= 0) l += loop.length;
      if (l < bestLen) { bestLen = l; best = k; }
    }
    if (best < 0) break;
    const a = joints[best], b = joints[(best + 1) % joints.length];
    const n = pts.length;
    const tin = Math.atan2(pts[a][1] - pts[(a - 1 + n) % n][1], pts[a][0] - pts[(a - 1 + n) % n][0]);
    const tout = Math.atan2(pts[(b + 1) % n][1] - pts[b][1], pts[(b + 1) % n][0] - pts[b][0]);
    let q = Math.abs(deg(norm(tout - tin))) <= MAX_SHARP_TURN ? meet(pts[a], tin, pts[b], tout) : null;
    // merging two concave corners pushes the corner into the stroke: not deeper than maxThin
    if (q && norm(tout - tin) < 0) { const mx = (pts[a][0] + pts[b][0]) / 2, my = (pts[a][1] + pts[b][1]) / 2; if (Math.hypot(q[0] - mx, q[1] - my) > maxThin) q = null; }
    // two corners that turn too far together (the square end of a stroke) stay two corners
    if (!q || dist(q, pts[a]) > 3 * minPiece || dist(q, pts[b]) > 3 * minPiece) { stuck.add(`${pts[a]}|${pts[b]}`); continue; }
    // replace pts a..b (forward, maybe wrapping) by q
    const idx: number[] = [];
    for (let i = a; ; i = (i + 1) % n) { idx.push(i); if (i === b) break; }
    const drop = new Set(idx);
    const next: Contour = [];
    const nextJ: number[] = [];
    let placed = false;
    for (let i = 0; i < n; i++) {
      if (drop.has(i)) {
        if (!placed && (i === a || (a > b && i === 0))) { nextJ.push(next.length); next.push(q); placed = true; }
        continue;
      }
      if (joints.includes(i)) nextJ.push(next.length);
      next.push(pts[i]);
    }
    if (!placed) { nextJ.push(next.length); next.push(q); }
    pts = next;
    joints = [...new Set(nextJ)].sort((x, y) => x - y);
  }
  return { pts, joints };
}

/** A polyline measured by arc length, clamped at its ends (not closed). */
class Open {
  readonly cum: number[];
  readonly length: number;
  constructor(readonly pts: Point[]) {
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + dist(pts[i - 1], pts[i]));
    this.length = this.cum[this.cum.length - 1];
  }
  at(s: number): Point {
    const u = Math.max(0, Math.min(this.length, s));
    let i = 1;
    while (i < this.pts.length - 1 && this.cum[i] < u) i++;
    const l = this.cum[i] - this.cum[i - 1], t = l > 0 ? (u - this.cum[i - 1]) / l : 0;
    const a = this.pts[i - 1], b = this.pts[i];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  /** Turning between the directions at s ∓ 1.5 mm (each from a ±1 mm chord), clamped to the piece. */
  turn(s: number, half = 1.5): number {
    const d = (u: number) => { const a = this.at(u - 1), b = this.at(u + 1); return Math.atan2(b[1] - a[1], b[0] - a[0]); };
    return Math.abs(norm(d(Math.min(this.length - 1, s + half)) - d(Math.max(1, s - half))));
  }
}

export interface JointedWallOptions {
  letter: string;
  contour: string;
  p: LetterParams;
  hp: Params;
  hBody: number;
  topTabs: boolean;
  rMin: number;
  /** Number of the first joint mark of this wall (numbered per letter). */
  seamNo: number;
}

export interface JointedWallResult {
  wall: Wall;
  parts: StripPart[];
  /** Joint numbers to engrave on the base beside each corner. */
  marks: PartMark[];
  issues: LetterIssue[];
  seamCount: number;
}

/** A wall broken at the corners of `cp` (at least one), one living-hinge strip per stretch between corners. */
export function jointedWall(cp: CorneredPath, o: JointedWallOptions): JointedWallResult {
  const { p, hp, hBody } = o;
  const T = p.T, a = p.tabW;
  const issues: LetterIssue[] = [];
  const f = 1 + (p.stretch || 0) / 100;
  // start the loop at the first corner
  const n0 = cp.pts.length;
  const rot = cp.joints[0];
  const pts = [...cp.pts.slice(rot), ...cp.pts.slice(0, rot)];
  const jIdx = cp.joints.map(j => (j - rot + n0) % n0).sort((x, y) => x - y);
  const loop = new Loop(pts);
  const L = loop.length;
  const js = jIdx.map(j => loop.cum[j]);
  const turns = jIdx.map(j => deg(turnAt(pts, j)));
  const lap = turns.map(t => Math.abs(Math.abs(t) - 90) <= LAP_TOL);
  const butt = (t: number) => (T / 2) * Math.tan(rad(Math.abs(t)) / 2);
  const hs = hingeSegments(hBody, p.slit, p.bridge);
  const maxLen = wallMaxLengthOf(p);
  const edgeMargin = p.cutStyle === "slot" ? Math.max(0.4, p.slotW) : 0.4;

  const parts: StripPart[] = [];
  const zones: Zone[] = [];
  const tabs: number[] = [];
  const pieceLengths: number[] = [];
  const marks: PartMark[] = [];
  const m = js.length;
  for (let k = 0; k < m; k++) {
    const s0 = js[k], s1 = k + 1 < m ? js[k + 1] : L;
    const piecePts = loop.slice(s0, s1);
    const path = new Open(piecePts);
    const len = path.length;
    // ends: a lap joint's incoming strip runs on to the outer face, the outgoing one stops at its inner face
    const e0 = lap[k] ? -T / 2 : -butt(turns[k]);
    const kEnd = (k + 1) % m;
    const e1 = lap[kEnd] ? T / 2 : -butt(turns[kEnd]);

    // flat and curve zones inside the piece
    const ns = Math.max(4, Math.ceil(len / DS));
    const flat = Array.from({ length: ns }, (_, j) => path.turn(((j + 0.5) * len) / ns) < FLAT_TURN);
    const pz: { a: number; b: number; kind: "flat" | "curve" }[] = [];
    flat.forEach((fl, j) => {
      const kind = fl ? "flat" : "curve", za = (j * len) / ns, zb = ((j + 1) * len) / ns;
      const last = pz[pz.length - 1];
      if (last && last.kind === kind) last.b = zb; else pz.push({ a: za, b: zb, kind });
    });
    // flats too short for a tab between two curves bend with them
    for (let i = 1; i + 1 < pz.length; i++) if (pz[i].kind === "flat" && pz[i].b - pz[i].a < a + 6 && pz[i - 1].kind === "curve" && pz[i + 1].kind === "curve") pz[i].kind = "curve";
    const joined: typeof pz = [];
    for (const z of pz) { const l = joined[joined.length - 1]; if (l && l.kind === z.kind) l.b = z.b; else joined.push({ ...z }); }

    // strip coordinate: flats keep their length, curves shrink by the stretch; the start adjustment shifts it
    const xAt = (s: number) => joined.reduce((x, z) => x + Math.max(0, Math.min(s, z.b) - z.a) / (z.kind === "curve" ? f : 1), 0) - e0;
    const w = xAt(len) + e1;

    // tabs on the flats, clear of the ends; lo..hi is the range of tab centres, so a whole tab stays on its flat
    const endKeep = a / 2 + 1.5 + T;
    const tabS: number[] = [];
    for (const z of joined) {
      if (z.kind !== "flat") continue;
      const lo = Math.max(z.a + a / 2, endKeep), hi = Math.min(z.b - a / 2, len - endKeep);
      if (hi < lo) continue;
      const nt = tabCount(hi - lo + a, a, false);
      for (let j = 0; j < nt; j++) tabS.push(lo - a / 2 + ((hi - lo + a) * (j + 0.5)) / nt);
    }
    const tabX = tabS.map(xAt);

    // hinge columns over the curves, running on into the flats as far as the tabs and ends allow
    const ivals: [number, number][] = [];
    for (const z of joined) {
      if (z.kind !== "curve") continue;
      const near = (x: number) => Math.min(...tabX.map(t => Math.abs(t - x) - a / 2 - 1.5), Infinity);
      const x0 = Math.max(edgeMargin + 1, xAt(z.a) - Math.min(p.overrun, Math.max(0, near(xAt(z.a)))));
      const x1 = Math.min(w - edgeMargin - 1, xAt(z.b) + Math.min(p.overrun, Math.max(0, near(xAt(z.b)))));
      if (x1 > x0) ivals.push([x0, x1]);
    }
    ivals.sort((u, v) => u[0] - v[0]);
    const merged: [number, number][] = [];
    for (const iv of ivals) { const l = merged[merged.length - 1]; if (l && iv[0] <= l[1] + p.pitch) l[1] = Math.max(l[1], iv[1]); else merged.push([...iv]); }
    const cols: HingeCol[] = [];
    for (const [x0, x1] of merged) cols.push(...makeCols(x0, x1, hp).filter(c => c.x > edgeMargin && c.x < w - edgeMargin && tabX.every(t => Math.abs(c.x - t) - a / 2 >= 1.5)));

    // split a piece longer than the bed at the middle of its longest flat (or its middle)
    const cutsX = [0];
    if (w > maxLen) {
      const parts = Math.ceil(w / maxLen);
      for (let q = 1; q < parts; q++) {
        const want = (w * q) / parts;
        const fl = joined.filter(z => z.kind === "flat").map(z => ({ x: xAt((z.a + z.b) / 2) })).sort((u, v) => Math.abs(u.x - want) - Math.abs(v.x - want))[0];
        cutsX.push(fl && Math.abs(fl.x - want) < maxLen / 3 ? fl.x : want);
      }
      issues.push({ lvl: "info", msg: `A stretch of the “${o.letter}” (${o.contour}) wall is longer than ${Math.round(maxLen)} mm, so it is cut in ${cutsX.length} strips. Glue a backing strip behind each extra seam.` });
    }
    cutsX.push(w);
    for (let q = 0; q + 1 < cutsX.length; q++) {
      const x0 = cutsX[q], x1 = cutsX[q + 1], pw = x1 - x0;
      const myTabs = tabX.filter(t => t - a / 2 > x0 + 1 && t + a / 2 < x1 - 1).map(t => t - x0);
      const myCols = cols.filter(c => c.x > x0 + edgeMargin && c.x < x1 - edgeMargin).map(c => ({ x: c.x - x0, kind: c.kind }));
      const wo = wallOutline(pw, hBody, o.topTabs ? myTabs : [], myTabs, myCols, hp, hs);
      const no = o.seamNo + k;
      const idA = q === 0 ? `${o.letter}${no}` : `${o.letter}${no}.${q}`;
      const idB = q + 2 === cutsX.length ? `${o.letter}${o.seamNo + kEnd}` : `${o.letter}${no}.${q + 1}`;
      const mark = (x: number, text: string): PartMark => ({ x, y: hBody / 2, text, size: 3, rot: -90 });
      const name = `${o.letter} · ${o.contour} ${parts.length + 1}`;
      parts.push({
        kind: "strip", name, outline: wo.outline, caps: wo.caps, cols: myCols, hBody, w: pw, tabs: myTabs,
        label: pw > 30 ? { x: pw / 2, y: hBody / 2 } : null,
        marks: pw > 14 ? [mark(2.5, `◂ ${idA}`), mark(pw - 2.5, `${idB} ▸`)] : [],
        bbox: bboxOf(wo.outline),
      });
      pieceLengths.push(pw);
    }

    for (const z of joined) {
      const zz: Zone = { s0: s0 + z.a, s1: s0 + z.b, kind: z.kind, rTight: Infinity, verdict: null, splice: false };
      if (z.kind === "curve") {
        // the corner finder's measure on the whole loop; near a corner, only this piece's side of it
        let r = Infinity;
        for (let s = z.a; s <= z.b; s += DS) r = Math.min(r, s > 3 && s < len - 3 ? windowRadius(loop, s0 + s) : 3 / Math.max(1e-9, path.turn(s)));
        zz.rTight = r;
        zz.verdict = verdictOf(r, o.rMin);
      }
      zones.push(zz);
    }
    tabs.push(...tabS.map(s => s0 + s));

    // the joint number on the base, beside the corner on the material side
    const c = loop.at(s0), d = loop.tangent(s0 + 0.01);
    marks.push({ x: c[0] - d[1] * (T / 2 + 2.5), y: c[1] + d[0] * (T / 2 + 2.5), text: `${o.letter}${o.seamNo + k}`, size: 3 });
  }
  if (turns.some(t => !lap[turns.indexOf(t)] && Math.abs(t) > MAX_CORNER_TURN - 1)) {
    issues.push({ lvl: "info", msg: `“${o.letter}” (${o.contour}) has very sharp corners; fill the small gap where the strips meet with glue.` });
  }

  const joints: Joint[] = js.map((s, k) => ({ s, turn: turns[k], kind: lap[k] ? "lap" : "butt" }));
  const wall: Wall = {
    letter: o.letter, contour: o.contour, style: "hinge", centerline: loop.pts, length: L, zones, seams: js, tabs, joints,
    slots: tabs.map(s => slotAt(loop, s, p)), pieceLengths,
  };
  return { wall, parts, marks, issues, seamCount: m };
}
