import { markLetters, moveLettering } from "../textOps";
/**
 * Jigsaw puzzle (spec §7.9). A grid over the outline; every shared edge is one seeded Bezier tab
 * curve, generated once and re-rolled until no piece outline crosses itself. The cuts are exported
 * as single lines joined along each grid line (nothing is cut twice) and run a little past the
 * outline so no piece stays attached; closed pieces are kept for counting, checks and the 3D view.
 */
import { intersectShapes, offsetShapes, unionShapes } from "@/lib/letters/polygon";
import { bboxOf, circle, customOutline, distToContour, pointInContour, rect, roundedRect, signedArea } from "../geom";
import { tagItem } from "../items";
import type { BuildContext, Contour, GenImage, GenOutput, GenPart, Pt } from "../types";
import { heartCurve, shapeOutline, starPolygon, type ShapeKind } from "../shapes";
import { HEART_PATH } from "../util";
import { FREE_PIECES, OVERSHOOT, PLATE_PUZZLES, type PuzzleParams, type TabStyle, type WhimsyShape } from "./params";

/** Seeded random numbers in [0, 1) (mulberry32). */
export function rng(seed: number): () => number {
  let a = (Math.floor(seed) * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The puzzle's outline with its bounding box at (0, 0), or null when a custom outline is not valid. */
export function puzzleOutline(p: PuzzleParams): Contour | null {
  const { kind, width: W, height: H, corner } = p.shape;
  if (kind === "rect") return corner > 0 ? roundedRect(0, 0, W, H, corner) : rect(0, 0, W, H);
  if (kind === "circle") return circle(W / 2, W / 2, W / 2, 0.05);
  if ((PLATE_PUZZLES as readonly string[]).includes(kind)) {
    const c = shapeOutline(kind === "oval" ? "circle" : (kind as ShapeKind), W, H, corner);
    return signedArea(c) < 0 ? c.slice().reverse() : c;
  }
  const c = customOutline(kind === "heart" ? HEART_PATH : p.shape.path, W, H);
  if (!c) return null;
  const bb = bboxOf([c]);
  const out = c.map(([x, y]) => [x - bb.x0, y - bb.y0] as Pt);
  return signedArea(out) < 0 ? out.reverse() : out;
}

/**
 * Columns and rows for a piece count, with pieces as square as possible. On a shaped outline the
 * count is the cells whose centre falls inside (the cut-off edge cells join their neighbours).
 */
export function gridFor(p: PuzzleParams, outline: Contour, BW: number, BH: number): { cols: number; rows: number } {
  if (!p.pieces.auto) return { cols: Math.max(1, Math.round(p.pieces.cols)), rows: Math.max(1, Math.round(p.pieces.rows)) };
  const n = Math.max(2, Math.round(p.pieces.count));
  let best = { cols: 1, rows: n, score: Infinity };
  if (p.shape.kind !== "rect") {
    const maxC = Math.ceil(Math.sqrt(n * 4 * (BW / BH))) + 2;
    for (let c = 1; c <= maxC; c++) {
      const r = Math.max(1, Math.round((c * BH) / BW));
      let inside = 0;
      for (let i = 0; i < c; i++) for (let j = 0; j < r; j++) if (pointInContour([((i + 0.5) * BW) / c, ((j + 0.5) * BH) / r], outline)) inside++;
      const score = Math.abs(inside - n) + Math.abs(Math.log(BW / c / (BH / r)));
      if (score < best.score) best = { cols: c, rows: r, score };
    }
    return { cols: best.cols, rows: best.rows };
  }
  for (let c = 1; c <= n; c++) {
    const r = Math.max(1, Math.round(n / c));
    const score = Math.abs(Math.log(BW / c / (BH / r))) + (30 * Math.abs(c * r - n)) / n;
    if (score < best.score) best = { cols: c, rows: r, score };
  }
  return { cols: best.cols, rows: best.rows };
}

const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function cubic(out: Contour, p0: Pt, p1: Pt, p2: Pt, p3: Pt) {
  const l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) + Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
  const n = Math.max(4, Math.min(28, Math.ceil(l / 0.7)));
  for (let k = 1; k <= n; k++) {
    const t = k / n, u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
}

export interface TabShape {
  style: TabStyle;
  /** Tab size as a fraction of the piece (tab size % / 200). */
  t: number;
  /** Jitter as a fraction. */
  j: number;
}

/** Knob width at its narrowest (the neck), as a multiple of the piece size. */
export const neckOf = (s: TabShape) => (s.style === "kids" ? 2.4 : s.style === "dovetail" ? 1.8 : 2) * s.t;

/**
 * One edge from A to B. `s` is the piece size the tab scales with (the smaller of the edge and the
 * piece across it); `flip` puts the knob on the other side.
 */
export function tabEdge(A: Pt, B: Pt, s: number, shape: TabShape, flip: boolean, rand: () => number): Contour {
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
  if (shape.style === "straight" || L < 1e-6) return [A, B];
  const ux = (B[0] - A[0]) / L, uy = (B[1] - A[1]) / L, sg = flip ? -1 : 1;
  const nx = -uy * sg, ny = ux * sg;
  /** u along the edge (0..1), v across it (fraction of s); knob points keep their width in s. */
  const at = (u: number, v: number, knob = true): Pt => {
    const x = knob ? L / 2 + (u - 0.5) * s : u * L;
    return [A[0] + ux * x + nx * v * s, A[1] + uy * x + ny * v * s];
  };
  const out: Contour = [A];
  const J = () => (rand() * 2 - 1) * shape.j;
  if (shape.style === "wavy") {
    const w = 2 * shape.t * (1 + J());
    cubic(out, A, at(1 / 3, w, false), at(2 / 3, -w, false), B);
    return out;
  }
  const t = shape.t;
  if (shape.style === "dovetail") {
    // a flared, straight-sided knob (the wooden puzzle maker's dovetail), its corners eased
    const [b, c, d] = [J(), J(), J()];
    const nb = 0.9 * t, hb = 1.5 * t + d, high = 2.6 * t + c;
    const corners: Pt[] = [at(0.5 - nb + b, 0), at(0.5 - hb + b, high), at(0.5 + hb + b, high), at(0.5 + nb + b, 0)];
    const ease = 0.3 * t * s;
    for (let k = 0; k < 4; k++) {
      const q = corners[k], prev = k ? corners[k - 1] : A, next = k < 3 ? corners[k + 1] : B;
      const toward = (o: Pt) => { const l = Math.hypot(o[0] - q[0], o[1] - q[1]); return lerp(q, o, Math.min(0.4, ease / Math.max(l, 1e-9))); };
      const a = toward(prev), b = toward(next);
      out.push(a);
      cubic(out, a, lerp(a, q, 0.55), lerp(b, q, 0.55), b);
    }
    out.push(B);
    return out;
  }
  const kids = shape.style === "kids";
  const [a, b, c, d, e] = kids ? [0, 0, 0, 0, 0] : [J(), J(), J(), J(), J()];
  const neck = kids ? 1.2 * t : t, head = kids ? 2.3 * t : 2 * t, high = kids ? 3.2 * t : 3 * t;
  const p1 = at(0.2, a, false), p2 = at(0.5 + b + d, -t + c), p3 = at(0.5 - neck + b, t + c);
  const p4 = at(0.5 - head + b - d, high + c), p5 = at(0.5 + head + b - d, high + c), p6 = at(0.5 + neck + b, t + c);
  const p7 = at(0.5 + b + d, -t + c), p8 = at(0.8, e, false);
  cubic(out, A, p1, p2, p3);
  cubic(out, p3, p4, p5, p6);
  cubic(out, p6, p7, p8, B);
  return out;
}

/* ---------- intersections ---------- */

function segX(a: Pt, b: Pt, c: Pt, d: Pt): number | null {
  const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qx = c[0] - a[0], qy = c[1] - a[1];
  const t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9 ? t : null;
}

/** True when a closed polygon's edges cross (sweep over x). */
export function selfIntersects(poly: Contour): boolean {
  const n = poly.length;
  const segs = poly.map((p, i) => {
    const q = poly[(i + 1) % n];
    return { i, a: p, b: q, x0: Math.min(p[0], q[0]), x1: Math.max(p[0], q[0]), y0: Math.min(p[1], q[1]), y1: Math.max(p[1], q[1]) };
  }).sort((s, t) => s.x0 - t.x0);
  for (let k = 0; k < segs.length; k++) {
    const s = segs[k];
    for (let m = k + 1; m < segs.length && segs[m].x0 <= s.x1; m++) {
      const t = segs[m];
      if (t.y0 > s.y1 || t.y1 < s.y0) continue;
      const di = Math.abs(s.i - t.i);
      if (di <= 1 || di === n - 1) continue;
      if (segX(s.a, s.b, t.a, t.b) !== null) return true;
    }
  }
  return false;
}

/** The parts of an open polyline inside a closed polygon. */
export function clipPolyline(pl: Contour, poly: Contour): Contour[] {
  const edges = poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length];
    return { a: p, b: q, x0: Math.min(p[0], q[0]), x1: Math.max(p[0], q[0]), y0: Math.min(p[1], q[1]), y1: Math.max(p[1], q[1]) };
  });
  const runs: Contour[] = [];
  let cur: Contour = [pl[0]];
  for (let k = 1; k < pl.length; k++) {
    const a = pl[k - 1], b = pl[k];
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    const ts: number[] = [];
    for (const e of edges) {
      if (e.x0 > x1 || e.x1 < x0 || e.y0 > y1 || e.y1 < y0) continue;
      const t = segX(a, b, e.a, e.b);
      if (t !== null) ts.push(t);
    }
    ts.sort((s, t) => s - t);
    for (const t of ts) {
      const q = lerp(a, b, t);
      cur.push(q);
      runs.push(cur);
      cur = [q];
    }
    cur.push(b);
  }
  runs.push(cur);
  return runs.filter((r) => {
    if (r.length < 2) return false;
    return pointInContour(lerp(r[0], r[1], 0.5), poly);
  });
}

const polyLen = (c: Contour) => c.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - c[i - 1][0], p[1] - c[i - 1][1]) : 0), 0);

/** A whimsy figure of diameter about `d`, centred on (cx, cy). */
export function whimsyOutline(kind: WhimsyShape, d: number, cx = 0, cy = 0): Contour {
  const r = d / 2;
  const fit = (c: Contour) => {
    const b = bboxOf([c]), k = d / Math.max(b.x1 - b.x0, b.y1 - b.y0);
    const ox = (b.x0 + b.x1) / 2, oy = (b.y0 + b.y1) / 2;
    const out = c.map(([x, y]) => [cx + (x - ox) * k, cy + (y - oy) * k] as Pt);
    return signedArea(out) < 0 ? out.reverse() : out;
  };
  switch (kind) {
    case "heart": return fit(heartCurve(96));
    case "star": {
      // eased tips, so the points do not burn away
      const st = starPolygon(5, r, 0.5);
      const pts: Contour = [];
      st.forEach((q, i) => {
        const prev = st[(i + st.length - 1) % st.length], next = st[(i + 1) % st.length];
        if (i % 2) { pts.push(q); return; }
        pts.push(lerp(q, prev, 0.12));
        cubic(pts, lerp(q, prev, 0.12), q, q, lerp(q, next, 0.12));
      });
      return fit(pts);
    }
    case "flower": {
      const u = unionShapes([circle(0, 0, 0.5, 0.01), ...[0, 1, 2, 3, 4, 5].map((k) => circle(0.55 * Math.cos((k * Math.PI) / 3), 0.55 * Math.sin((k * Math.PI) / 3), 0.38, 0.01))]);
      return fit(u.reduce((a, b) => (b.area > a.area ? b : a)).outer);
    }
    case "house": return fit(roundedCornersPoly([[0, -0.5], [0.5, -0.05], [0.4, -0.05], [0.4, 0.5], [-0.4, 0.5], [-0.4, -0.05], [-0.5, -0.05]]));
    default: return circle(cx, cy, r, 0.02);
  }
}

/** A small polygon with its corners eased by short curves (no sharp points to snap off). */
function roundedCornersPoly(poly: Contour): Contour {
  const out: Contour = [];
  poly.forEach((q, i) => {
    const prev = poly[(i + poly.length - 1) % poly.length], next = poly[(i + 1) % poly.length];
    const a = lerp(q, prev, 0.1), b = lerp(q, next, 0.1);
    out.push(a);
    cubic(out, a, q, q, b);
  });
  return out;
}

/**
 * A point well inside a polygon (best of a coarse grid), and its distance to the edge; with
 * `avoid`, also outside that contour and as far from it as from the edge.
 */
export function innerPoint(c: Contour, avoid?: Contour): { at: Pt; r: number } {
  const bb = bboxOf([c]);
  let best = { at: [(bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2] as Pt, r: -1 };
  const N = 9;
  let span = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) / N, cx = best.at[0], cy = best.at[1];
  for (let pass = 0; pass < 3; pass++) {
    for (let i = -N / 2; i <= N / 2; i++) for (let j = -N / 2; j <= N / 2; j++) {
      const q: Pt = [cx + i * span, cy + j * span];
      if (!pointInContour(q, c) || (avoid && pointInContour(q, avoid))) continue;
      const r = avoid ? Math.min(distToContour(q, c), distToContour(q, avoid)) : distToContour(q, c);
      if (r > best.r) best = { at: q, r };
    }
    cx = best.at[0]; cy = best.at[1]; span /= 3;
  }
  return best;
}

/* ---------- the puzzle ---------- */

interface Edge {
  pts: Contour;
  /** The two cells it separates (row-major index). */
  c0: number;
  c1: number;
  removed: boolean;
}

export interface PuzzleInfo {
  cols: number;
  rows: number;
  /** Nominal piece size, mm. */
  cw: number;
  ch: number;
  tab: TabShape;
  pieces: number;
  /** Edge pieces joined to a neighbour because they were too small. */
  merged: number;
  /** Edges that had to be drawn without a tab. */
  flattened: number;
  /** Area of the smallest piece, mm². */
  smallest: number;
  textWidth: number;
  outlineW: number;
  outlineH: number;
  /** Whimsy pieces placed, and how many were asked for but found no piece big enough. */
  whimsy: number;
  whimsyMissed: number;
  /** Grip knobs (discs, counting both of a stack). */
  knobs: number;
  /** Room for hanging holes on the frame (false when the border is too narrow at the top). */
  hangFits: boolean;
}

export interface PuzzleOutput extends GenOutput {
  info?: PuzzleInfo;
}

const MAX_CELLS = 2500;
/** Wood left round a whimsy piece, mm. */
export const WHIMSY_WALL = 3;
/** Hanging holes and the wood each side of them, mm. */
const HANG_D = 4.5, HANG_WALL = 2.5;

export function buildPuzzle(p: PuzzleParams, ctx: BuildContext): PuzzleOutput {
  const outline = puzzleOutline(p);
  if (!outline) return { parts: [], stats: [], error: "The custom outline is not a closed path. Paste the d attribute of one closed shape." };
  const bb = bboxOf([outline]);
  const BW = bb.x1, BH = bb.y1;
  const { cols, rows } = gridFor(p, outline, BW, BH);
  if (cols * rows > MAX_CELLS) return { parts: [], stats: [], error: `That is ${cols * rows} pieces; the most is ${MAX_CELLS}.` };
  const cw = BW / cols, ch = BH / rows;
  const rand = rng(p.tabs.seed);
  const style = p.tabs.style;
  const tab: TabShape = { style, t: Math.max(0.05, Math.min(0.16, p.tabs.size / 200)), j: style === "kids" ? 0 : Math.max(0, Math.min(0.15, p.tabs.jitter / 100)) };
  const isRect = p.shape.kind === "rect";
  const ov = OVERSHOOT + Math.max(0, p.K) / 2;
  /** Grid lines on the border reach past the outline, so the cuts cross it cleanly. */
  const E = ov + 2;

  // Vertices, the inner ones moved by the jitter.
  const shift = (style === "kids" ? 0.3 : 0.8) * tab.j;
  const V: Pt[][] = [];
  for (let i = 0; i <= cols; i++) {
    V.push([]);
    for (let j = 0; j <= rows; j++) {
      let x = i === 0 ? -E : i === cols ? BW + E : cw * i, y = j === 0 ? -E : j === rows ? BH + E : ch * j;
      if (i > 0 && i < cols) x += (rand() * 2 - 1) * shift * cw;
      if (j > 0 && j < rows) y += (rand() * 2 - 1) * shift * ch;
      V[i].push([x, y]);
    }
  }
  const cell = (i: number, j: number) => j * cols + i;

  // Knob points must sit inside the outline, well clear of it; otherwise the edge stays plain.
  const margin = 0.12 * Math.min(cw, ch);
  const knobFits = (pts: Contour) => {
    if (pts.length === 2 || (isRect && p.shape.corner <= 0)) return true;
    const A = pts[0], B = pts[pts.length - 1], dx = B[0] - A[0], dy = B[1] - A[1], l2 = dx * dx + dy * dy;
    return pts.every((q) => {
      const u = ((q[0] - A[0]) * dx + (q[1] - A[1]) * dy) / l2;
      return u < 0.2 || u > 0.8 || (pointInContour(q, outline) && distToContour(q, outline) >= margin);
    });
  };
  let flattened = 0;
  /** A tab that does not fit near the outline tries the other side, then smaller, then none. */
  const makeEdge = (A: Pt, B: Pt, s: number, shrink: number): Contour => {
    const flip = rand() < 0.5;
    for (const [f, k] of [[flip, 1], [!flip, 1], [flip, 0.7], [!flip, 0.7]] as const) {
      const e = tabEdge(A, B, s, { ...tab, t: tab.t * shrink * k }, f, rand);
      if (knobFits(e)) return e;
    }
    if (pointInContour(lerp(A, B, 0.5), outline)) flattened++;
    return [A, B];
  };
  const H: Edge[][] = [], Vt: Edge[][] = [];
  for (let j = 1; j < rows; j++) {
    H[j] = [];
    for (let i = 0; i < cols; i++) H[j][i] = { pts: makeEdge(V[i][j], V[i + 1][j], Math.min(cw, ch), 1), c0: cell(i, j - 1), c1: cell(i, j), removed: false };
  }
  for (let i = 1; i < cols; i++) {
    Vt[i] = [];
    for (let j = 0; j < rows; j++) Vt[i][j] = { pts: makeEdge(V[i][j], V[i][j + 1], Math.min(cw, ch), 1), c0: cell(i - 1, j), c1: cell(i, j), removed: false };
  }

  const side = (e: Edge | undefined, A: Pt, B: Pt, rev: boolean): Contour => {
    const pts = e ? e.pts : [A, B];
    return rev ? pts.slice().reverse() : pts;
  };
  const cellPoly = (i: number, j: number): Contour => {
    const a = V[i][j], b = V[i + 1][j], c = V[i + 1][j + 1], d = V[i][j + 1];
    const sides = [
      side(H[j]?.[i], a, b, false),
      side(Vt[i + 1]?.[j], b, c, false),
      side(H[j + 1]?.[i], d, c, true),
      side(Vt[i]?.[j], a, d, true),
    ];
    return sides.flatMap((s) => s.slice(0, -1));
  };
  const cellEdges = (i: number, j: number) => [H[j]?.[i], Vt[i + 1]?.[j], H[j + 1]?.[i], Vt[i]?.[j]].filter((e): e is Edge => !!e);
  const reroll = (e: Edge, shrink: number) => {
    const A = e.pts[0], B = e.pts[e.pts.length - 1];
    e.pts = shrink < 0.3 ? [A, B] : makeEdge(A, B, Math.min(cw, ch), shrink);
  };

  // Re-roll the edges of any piece whose outline crosses itself, with smaller tabs each round.
  if (style !== "straight") {
    let shrink = 1;
    for (let round = 0; round < 8; round++) {
      const bad = new Set<Edge>();
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        if (selfIntersects(cellPoly(i, j))) for (const e of cellEdges(i, j)) if (e.pts.length > 2) bad.add(e);
      }
      if (!bad.size) break;
      shrink *= 0.82;
      for (const e of bad) reroll(e, round >= 6 ? 0 : shrink);
    }
  }

  // Pieces: each cell clipped to the outline; tiny edge pieces join their best neighbour.
  const nominal = cw * ch;
  const frags: Contour[][] = [], areas: number[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const shapes = isRect && p.shape.corner <= 0 && i > 0 && j > 0 && i < cols - 1 && j < rows - 1
      ? [{ outer: cellPoly(i, j), area: Math.abs(signedArea(cellPoly(i, j))) }]
      : intersectShapes([cellPoly(i, j)], [outline]);
    frags.push(shapes.map((s) => s.outer));
    areas.push(shapes.reduce((s, x) => s + x.area, 0));
  }
  const parent = areas.map((_, k) => k);
  const find = (k: number): number => (parent[k] === k ? k : (parent[k] = find(parent[k])));
  const groupArea = new Map<number, number>(areas.map((a, k) => [k, a]));
  const allEdges = [...H.flat(), ...Vt.flat()].filter(Boolean) as Edge[];
  const insideLen = new Map<Edge, number>();
  const lenIn = (e: Edge) => {
    let v = insideLen.get(e);
    if (v === undefined) { v = clipPolyline(e.pts, outline).reduce((s, c) => s + polyLen(c), 0); insideLen.set(e, v); }
    return v;
  };
  let merged = 0;
  if (!isRect || p.shape.corner > 0) {
    const thr = 0.42 * nominal;
    for (let guard = 0; guard < areas.length; guard++) {
      let target = -1, ta = Infinity;
      for (const [g, a] of groupArea) if (a > 0 && a < thr && a < ta) {
        const hasN = allEdges.some((e) => !e.removed && (find(e.c0) === g) !== (find(e.c1) === g) && areas[e.c0] > 0 && areas[e.c1] > 0 && lenIn(e) > 0.15 * Math.min(cw, ch));
        if (hasN) { target = g; ta = a; }
      }
      if (target < 0) break;
      let best: Edge | null = null, bl = 0;
      for (const e of allEdges) {
        if (e.removed || (find(e.c0) === target) === (find(e.c1) === target)) continue;
        if (areas[e.c0] <= 0 || areas[e.c1] <= 0) continue;
        const l = lenIn(e);
        if (l > bl) { bl = l; best = e; }
      }
      if (!best) break;
      const g0 = find(best.c0), g1 = find(best.c1);
      // Every edge between the two groups goes, not only the longest.
      for (const e of allEdges) if (!e.removed && ((find(e.c0) === g0 && find(e.c1) === g1) || (find(e.c0) === g1 && find(e.c1) === g0))) e.removed = true;
      parent[g1] = g0;
      groupArea.set(g0, (groupArea.get(g0) ?? 0) + (groupArea.get(g1) ?? 0));
      groupArea.delete(g1);
      merged++;
    }
  }

  const groups = new Map<number, Contour[]>();
  frags.forEach((fs, k) => { if (areas[k] > 0) { const g = find(k); groups.set(g, [...(groups.get(g) ?? []), ...fs]); } });
  const pieces: Contour[] = [];
  for (const fs of groups.values()) {
    const shapes = fs.length === 1 ? [{ outer: fs[0], area: Math.abs(signedArea(fs[0])) }] : unionShapes(fs);
    for (const s of shapes) if (s.area > 0.5) pieces.push(s.outer);
  }
  const pieceAreas = pieces.map((c) => Math.abs(signedArea(c)));
  const smallest = pieceAreas.length ? Math.min(...pieceAreas) : 0;

  // Whimsy pieces: a figure cut inside some pieces (chosen by the layout number, from those with room),
  // as a closed cut line of its own; at least WHIMSY_WALL mm of wood stays round it.
  const whimsies: { host: number; c: Contour }[] = [];
  let whimsyMissed = 0;
  if (p.whimsy.count > 0) {
    const d = (p.whimsy.size / 100) * Math.min(cw, ch);
    const wr = rng(p.tabs.seed * 31 + 7);
    const order = pieces.map((c, k) => ({ k, ...innerPoint(c), key: wr() })).sort((a, b) => a.key - b.key);
    for (const o of order) {
      if (whimsies.length >= p.whimsy.count) break;
      if (o.r < d / 2 + WHIMSY_WALL) continue;
      whimsies.push({ host: o.k, c: whimsyOutline(p.whimsy.shape, d, o.at[0], o.at[1]) });
    }
    whimsyMissed = p.whimsy.count - whimsies.length;
  }
  const hostOf = new Map(whimsies.map((w) => [w.host, w.c]));
  const allPieces = [...pieces.map((c, k) => ({ c, avoid: hostOf.get(k) })), ...whimsies.map((w) => ({ c: w.c, avoid: undefined }))];
  const centres = allPieces.map((x) => innerPoint(x.c, x.avoid));

  // Cuts: kept edges joined along each grid line, clipped just past the outline.
  const clipTo = offsetShapes(unionShapes([outline]), ov)[0]?.outer ?? outline;
  const chains: Contour[] = [];
  const pushChain = (c: Contour) => { if (c.length >= 2) chains.push(...clipPolyline(c, clipTo)); };
  const joinLine = (edges: Edge[]) => {
    let cur: Contour = [];
    for (const e of edges) {
      if (e.removed) { pushChain(cur); cur = []; continue; }
      cur = cur.length ? [...cur, ...e.pts.slice(1)] : e.pts.slice();
    }
    pushChain(cur);
  };
  for (let j = 1; j < rows; j++) joinLine(H[j]);
  for (let i = 1; i < cols; i++) joinLine(Vt[i]);
  const cuts = [...chains.filter((c) => polyLen(c) > 0.05), ...whimsies.map((w) => [...w.c, w.c[0]])];

  // Engraving.
  const T = p.T;
  const engrave: Contour[] = [];
  const score: Contour[] = [];
  const images: GenImage[] = [];
  const missing: string[] = [];
  let loading = false, textWidth = 0;
  const E2 = p.engrave;
  if (E2.kind === "image" && E2.image) {
    const z = Math.max(0.2, E2.zoom / 100), a = E2.aspect > 0 ? E2.aspect : 1;
    let w: number, h: number;
    if (a > BW / BH) { h = BH * z; w = h * a; } else { w = BW * z; h = w / a; }
    images.push(...tagItem([{ href: E2.image, x: BW / 2 - w / 2, y: BH / 2 - h / 2, w, h, clip: outline }], "Picture"));
  }
  if (E2.kind === "text" && E2.text.trim()) {
    if (!ctx.text) loading = true;
    else {
      const lines = E2.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const gap = E2.size * 1.35;
      lines.forEach((line, k) => {
        const s = ctx.text!(line, E2.fontId, E2.size);
        if (!s) { loading = true; return; }
        for (const c of s.missing) if (!missing.includes(c)) missing.push(c);
        textWidth = Math.max(textWidth, s.width);
        const cy = BH / 2 + (k - (lines.length - 1) / 2) * gap;
        const at = (c: Contour) => c.map(([x, y]) => [x + BW / 2, y + cy] as Pt);
        if (E2.mark === "score") score.push(...tagItem(markLetters(moveLettering(s, at), "score", E2.noWeld).score ?? [], "Text"));
        else for (const c of s.contours) engrave.push(...tagItem([at(c)], "Text"));
      });
    }
  }
  if (E2.kind === "numbers") {
    if (!ctx.text) loading = true;
    else {
      const order = allPieces.map((x, k) => {
        const b = bboxOf([x.c]);
        return { row: Math.floor((b.y0 + b.y1) / 2 / ch), x: (b.x0 + b.x1) / 2, ...centres[k] };
      }).sort((a, b) => a.row - b.row || a.x - b.x);
      order.forEach((o, n) => {
        const s = ctx.text!(String(n + 1), E2.fontId, E2.numberSize);
        if (!s) { loading = true; return; }
        for (const c of s.missing) if (!missing.includes(c)) missing.push(c);
        const at = (c: Contour) => c.map(([x, y]) => [x + o.at[0], y + o.at[1]] as Pt);
        if (E2.mark === "score") score.push(...tagItem(markLetters(moveLettering(s, at), "score", E2.noWeld).score ?? [], "Numbers"));
        else for (const c of s.contours) engrave.push(...tagItem([at(c)], "Numbers"));
      });
    }
  }

  // Parts.
  const tray = p.frame.kind === "tray", framed = p.frame.kind !== "none";
  // Grip knobs: a disc at each piece's roomiest point, with a scored ring to glue it on.
  const knobParts: GenPart[] = [];
  if (p.knobs.on) {
    const r = p.knobs.diameter / 2, guides: Contour[] = [];
    centres.forEach((o, k) => {
      guides.push([...circle(o.at[0], o.at[1], r, 0.05), circle(o.at[0], o.at[1], r, 0.05)[0]]);
      for (let s2 = 0; s2 < p.knobs.stack; s2++) {
        knobParts.push({ id: `knob-${k + 1}${p.knobs.stack > 1 ? `-${s2 + 1}` : ""}`, name: `Knob ${k + 1}${p.knobs.stack > 1 ? `, disc ${s2 + 1}` : ""}`, outer: circle(0, 0, r, 0.03), holes: [], place: { x: o.at[0], y: o.at[1], z: (tray ? 2 * T : T) + s2 * T } });
      }
    });
    score.push(...tagItem(guides, "Knob guides"));
  }

  const parts: GenPart[] = [{
    id: "puzzle", name: "Puzzle", outer: outline, holes: [], cuts, engrave, ...(score.length ? { score } : {}), images, pieces,
    place: { x: 0, y: 0, z: tray ? T : 0 },
  }];
  let hangFits = true;
  if (framed) {
    const b = p.frame.border;
    const outer = p.shape.kind === "rect"
      ? roundedRect(-b, -b, BW + 2 * b, BH + 2 * b, Math.max(p.frame.corner, p.shape.corner > 0 ? p.shape.corner + b : 0))
      : offsetShapes(unionShapes([outline]), b)[0].outer;
    const hole = offsetShapes(unionShapes([outline]), Math.max(0, p.frame.clearance))[0].outer;
    // Hanging: two holes in the top border, midway between the frame's edge and its opening.
    const hang: Contour[] = [];
    if (p.frame.hang) {
      const topAt = (c: Contour, x: number) => {
        let y = Infinity;
        for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
          const [x0, y0] = c[j], [x1, y1] = c[i];
          if ((x0 <= x && x < x1) || (x1 <= x && x < x0)) y = Math.min(y, y0 + ((x - x0) * (y1 - y0)) / (x1 - x0));
        }
        return y;
      };
      for (const x of [BW * 0.3, BW * 0.7]) {
        const yo = topAt(outer, x), yi = topAt(hole, x);
        if (!Number.isFinite(yo) || !Number.isFinite(yi) || yi - yo < HANG_D + 2 * HANG_WALL) hangFits = false;
        else hang.push(circle(x, (yo + yi) / 2, HANG_D / 2, 0.02));
      }
      if (!hangFits) hang.length = 0;
    }
    parts.push({ id: "frame", name: "Frame", outer, holes: [hole, ...hang], place: { x: 0, y: 0, z: tray ? T : 0 } });
    if (tray) {
      const guide = p.frame.guide ? tagItem(cuts.flatMap((c) => clipPolyline(c, outline)).filter((c) => polyLen(c) > 0.5), "Piece guide") : [];
      parts.push({ id: "base", name: "Tray base", outer, holes: [...hang], ...(guide.length ? { score: guide } : {}), place: { x: 0, y: 0, z: 0 } });
    }
  }
  parts.push(...knobParts);

  const cutLen = cuts.reduce((s, c) => s + polyLen(c), 0) + polyLen([...outline, outline[0]]);
  const info: PuzzleInfo = {
    cols, rows, cw, ch, tab, pieces: pieces.length + whimsies.length, merged, flattened, smallest, textWidth, outlineW: BW, outlineH: BH,
    whimsy: whimsies.length, whimsyMissed, knobs: knobParts.length, hangFits,
  };
  const total = pieces.length + whimsies.length;
  return {
    parts,
    stats: [
      { label: "Pieces", value: `${total}${whimsies.length ? ` (${whimsies.length} whimsy)` : ""}${total > FREE_PIECES ? " (Pro)" : ""}` },
      { label: "Grid", value: `${cols} × ${rows}` },
      { label: "Piece size", value: `about ${Math.round(cw)} × ${Math.round(ch)} mm` },
      { label: "Cut length", value: `${(cutLen / 1000).toFixed(2)} m` },
      ...(merged ? [{ label: "Joined edge pieces", value: String(merged) }] : []),
      ...(knobParts.length ? [{ label: "Grip knobs", value: `${knobParts.length} discs, ${p.knobs.diameter} mm` }] : []),
    ],
    assembly: [
      ...(E2.kind === "image" ? ["Engrave the picture first (it is on the Engrave layer), then run the cuts without moving the sheet."] : []),
      "Cut the inner lines before the outline, so the pieces cannot shift while they are cut.",
      ...(framed ? [`Cut the frame${tray ? " and the tray base; glue the frame onto the base" : ""}. The puzzle drops into it with ${p.frame.clearance} mm to spare.`] : []),
      ...(tray && p.frame.guide ? ["The piece outlines are scored on the tray base, so each piece has a place to match."] : []),
      ...(whimsies.length ? [`${whimsies.length} whimsy piece${whimsies.length === 1 ? "" : "s"} pop out of the pieces they sit in.`] : []),
      ...(knobParts.length ? [`Glue a knob${p.knobs.stack > 1 ? " (two discs stacked)" : ""} onto each scored ring; a short dowel through a hole works too.`] : []),
      ...(framed && p.frame.hang && hangFits ? ["Hang the finished puzzle on two screws or a cord through the holes in the top of the frame; glue the pieces down first if it hangs."] : []),
    ],
    notice: loading ? "Loading the font." : undefined,
    missing,
    info,
  };
}
