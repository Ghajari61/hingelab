/**
 * Flip lid: one plate with a living-hinge band across it. The strip between the band and the hinge
 * side is held by the wall's top tabs; the rest (the flap) rests on the walls and swings up as the
 * band bends, like a flip-top case, or a cabinet door when the box stands on its side.
 *
 * The band's cuts run along the hinge line, staggered like the wall's lattice (bridged columns and
 * columns that run off both edges), with the same slit, bridge, spacing and cut style. How far it
 * opens follows from the bend estimate: a band `B` wide bends to radius r over an angle B / r.
 */
import type { Edge, FlipSide, Params, Point } from "./types";
import { cutWidth, hingeSegments, kerfY, slotLike } from "./hinge";
import { kerfAcross } from "@/lib/materials/axes";
import { bendAnalysis } from "./analysis";
import { coreDistance } from "./lidSlot";
import { buildCore } from "./core";

export const FLIP_SIDES: FlipSide[] = ["back", "left", "right", "front"];
/** Unit vector towards each side, in the drawing's coordinates (y down, back at the top). */
export const FLIP_DIR: Record<FlipSide, Point> = { back: [0, -1], front: [0, 1], left: [-1, 0], right: [1, 0] };
export const flipSideOf = (p: Params): FlipSide => (p.flipSide && p.flipSide in FLIP_DIR ? p.flipSide : "back");
/** The angle the automatic band width is sized for, degrees. */
export const FLIP_TARGET = 105;

const dot = (q: Point, a: Point) => q[0] * a[0] + q[1] * a[1];

/** How far the core reaches along `a`. */
export const coreSupport = (edges: Edge[], a: Point) => Math.max(...edges.flatMap((e) => [dot(e.p0, a), dot(e.p1, a)]));

/** Where the line { u·a + v·b } leaves the region within r of the core: [v0, v1], or null. */
export function chordAt(edges: Edge[], r: number, a: Point, u: number): [number, number] | null {
  const b: Point = [-a[1], a[0]];
  const at = (v: number): Point => [a[0] * u + b[0] * v, a[1] * u + b[1] * v];
  // Start from the point of the line nearest the core.
  if (coreDistance(edges, at(0)) > r) return null;
  const reach = (dir: 1 | -1) => {
    let lo = 0, hi = 1;
    while (coreDistance(edges, at(dir * hi)) <= r && hi < 1e5) { lo = hi; hi *= 2; }
    for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (coreDistance(edges, at(dir * m)) <= r) lo = m; else hi = m; }
    return dir * lo;
  };
  return [reach(-1), reach(1)];
}

/** The polygon's part with q·a <= max (Sutherland–Hodgman against one line). */
export function clipHalf(poly: Point[], a: Point, max: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i], Q = poly[(i + 1) % poly.length], dp = dot(P, a) - max, dq = dot(Q, a) - max;
    if (dp <= 0) out.push(P);
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
      const s = dp / (dp - dq);
      out.push([P[0] + (Q[0] - P[0]) * s, P[1] + (Q[1] - P[1]) * s]);
    }
  }
  return out;
}

export interface FlipBand {
  a: Point;
  /** Along `a`: the band runs from `from` (flap side) to `to`; the fixed strip from `to` to the edge. */
  from: number;
  to: number;
  /** The plate's edge along `a`. */
  edge: number;
  /** The width of the lid along `a`, edge to edge. */
  span: number;
  /** Bend limit of the band's lattice, mm. */
  rMin: number;
  angle: number;
}

/**
 * Where the band goes on a lid of outer radius `rOut` (before kerf), or an error. The fixed strip
 * is wide enough for the top tabs and a few millimetres more; the band wide enough to open about 105°.
 */
export function flipBand(p: Params, edges: Edge[], rOut: number): FlipBand | { error: string } {
  const a = FLIP_DIR[flipSideOf(p)];
  const edge = coreSupport(edges, a) + rOut;
  const span = edge + coreSupport(edges, [-a[0], -a[1]]) + rOut;
  const fixed = p.flipFixed && p.flipFixed > 0 ? p.flipFixed : flipFixedAuto(p);
  // The cuts run across the lid, about as long as the lid is wide there.
  const cross = chordAt(edges, rOut, a, edge - fixed);
  const len = cross ? cross[1] - cross[0] : span;
  const bl = bandLattice(p);
  const rMin = bendAnalysis(bl, Math.max(10, len), 1).rMin;
  const auto = Math.max(4 * bl.pitch, Math.ceil((1.25 * rMin * FLIP_TARGET * Math.PI) / 180));
  const B = p.flipBand && p.flipBand > 0 ? p.flipBand : auto;
  if (fixed + B > span - 10) return { error: "The lid is too narrow for a flip hinge this wide. Narrow the hinge band or the fixed strip, or make the box larger." };
  const to = edge - fixed, from = to - B;
  return { a, from, to, edge, span, rMin, angle: Math.min(180, ((B / (1.25 * rMin)) * 180) / Math.PI) };
}

/**
 * The lattice the band is cut with: the wall's slit, bridge, spacing and cut style, always as straight
 * cuts. A honeycomb's cells are far wider than a slot, so its band uses the standard slot lattice.
 */
export function bandLattice(p: Params): Params {
  if (p.pattern === "honeycomb") return { ...p, pattern: "straight", slotW: 0.8, pitch: 2.5, slit: 28, bridge: 3 };
  return { ...p, pattern: "straight" };
}

/** The fixed strip's width when the design leaves it out: room for the tab slots and 3 mm more. */
export const flipFixedAuto = (p: Params) => Math.max(0, p.lidOver ?? 0) + 2 * p.T + 3;

/** The band's automatic width for this design (what the Hinge band field shows while it is left out). */
export function flipBandAuto(p: Params): number {
  const c = buildCore(p);
  if ("error" in c) return 30;
  const q: Params = { ...p, flipBand: undefined };
  const b = flipBand(q, c.edges, c.R + Math.max(0, p.lidOver ?? 0));
  return "error" in b ? 30 : Math.round((b.to - b.from) * 10) / 10;
}

/** The wall's top tabs that reach the fixed strip (with 1 mm to spare). */
export function flipKeepsTab(p: Params, band: FlipBand, rN: number) {
  const a = band.a, half = (p.tabW + p.slotClr) / 2, deep = (p.T + p.slotClr) / 2;
  return (e: Edge, u: number) => {
    const c: Point = [e.p0[0] + e.t[0] * u + e.n[0] * rN, e.p0[1] + e.t[1] * u + e.n[1] * rN];
    const ext = Math.abs(dot(e.t, a)) * half + Math.abs(dot(e.n, a)) * deep;
    return dot(c, a) - ext >= band.to + 1;
  };
}

/**
 * The band's cuts on a lid of outer radius `rOut`: closed slots for the slot style, centre lines for
 * single-line cuts. Columns alternate between slits bridged at both edges and slits that run off them.
 */
export function flipCuts(user: Params, edges: Edge[], rOut: number, band: FlipBand): { slots: Point[][]; lines: Point[][] } {
  const p = bandLattice(user);
  const a = band.a, b: Point = [-a[1], a[0]], g = p.bridge, B = band.to - band.from;
  const slots: Point[][] = [], lines: Point[][] = [];
  let nc = Math.max(1, Math.floor(B / p.pitch));
  if (nc % 2 === 0) nc -= 1;
  const start = band.from + (B - (nc - 1) * p.pitch) / 2;
  // The slots run along b: the kerf across their sides is the one across a, across their ends the one across b.
  const ky = kerfY(p), slot = slotLike(p), rr = cutWidth(p) / 2 - kerfAcross(a, p.K, ky), k2 = kerfAcross(b, p.K, ky), run = slot ? p.slotW + 0.5 : 0.4;
  const pt = (u: number, v: number): Point => [a[0] * u + b[0] * v, a[1] * u + b[1] * v];
  for (let j = 0; j < nc; j++) {
    const u = start + j * p.pitch, ch = chordAt(edges, rOut, a, u);
    if (!ch) continue;
    const len = ch[1] - ch[0];
    if (len < 2 * g + 4) continue;
    const hs = hingeSegments(len, p.slit, g);
    const segs = j % 2 === 0 ? hs.closed : hs.open.map(([y1, y2], i, all) => [i === 0 ? -run : y1, i === all.length - 1 ? len + run : y2] as [number, number]);
    for (const [y1, y2] of segs) {
      if (y2 - y1 < 0.5) continue;
      const v1 = ch[0] + y1, v2 = ch[0] + y2;
      if (!slot) { lines.push([pt(u, v1), pt(u, v2)]); continue; }
      // A round-ended slot `slotW` wide, inset by half the kerf so the cut comes out at its size.
      const s0 = v1 + k2 + rr, s1 = v2 - k2 - rr;
      if (s1 < s0) continue;
      const poly: Point[] = [];
      const n = 8;
      for (let i = 0; i <= n; i++) { const t = Math.PI * (i / n); poly.push(pt(u - rr * Math.cos(t), s1 + rr * Math.sin(t))); }
      for (let i = 0; i <= n; i++) { const t = Math.PI * (i / n); poly.push(pt(u + rr * Math.cos(t), s0 - rr * Math.sin(t))); }
      slots.push(poly);
    }
  }
  return { slots, lines };
}

/** True when every point of `poly` stays on the flap, `gap` mm clear of the band. */
export const onFlap = (poly: Point[], band: FlipBand, gap = 2) => poly.every((q) => dot(q, band.a) <= band.from - gap);
