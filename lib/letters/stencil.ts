/**
 * Stencil mode: the text is cut out of a sheet. Counters (the material inside A, B, O, 8, ه …)
 * would fall out, so each gets one or two bridges across the letter stroke to the outside.
 */
import { MIN_PIECE_AREA, bboxOfContours, differenceShapes, dropSpecks, makeShape, offsetShapes, pointInContour, shapeContours, signedArea, unionShapes } from "./polygon";
import { labelPoint } from "./solid";
import type { Bridge, Contour, LetterIssue, LetterParams, Point, Shape, SolidPart } from "./types";

const RAYS = 16;
/** Second bridge of a counter: at least this far (degrees) from the first. */
const MIN_SPREAD = 120;
/** Extra length past each end of a crossing so the cut really severs the stroke, mm. */
const OVERSHOOT = 0.3;

/** Distances along the ray o + t·v (t > 0) where it crosses contour c, ascending. */
function hits(c: Contour, o: Point, v: Point): number[] {
  const out: number[] = [];
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const ax = c[j][0], ay = c[j][1], ex = c[i][0] - ax, ey = c[i][1] - ay;
    const den = v[0] * ey - v[1] * ex;
    if (Math.abs(den) < 1e-12) continue;
    const wx = ax - o[0], wy = ay - o[1];
    const t = (wx * ey - wy * ex) / den;
    const u = (wx * v[1] - wy * v[0]) / den;
    if (t > 1e-6 && u >= 0 && u < 1) out.push(t);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Where a ray from inside counter `h` of letter `s` leaves the counter (t0) and then leaves the
 * letter stroke (t1). Null unless the stroke ends at the letter's outer contour (the open sheet);
 * crossing into another counter would not hold anything.
 */
function crossing(s: Shape, hole: number, o: Point, v: Point): { t0: number; t1: number } | null {
  const t0 = hits(s.holes[hole], o, v)[0];
  if (t0 === undefined) return null;
  let t1 = Infinity, outer = false;
  [s.outer, ...s.holes].forEach((c, k) => {
    const t = hits(c, o, v).find(x => x > t0 + 1e-6);
    if (t !== undefined && t < t1) { t1 = t; outer = k === 0; }
  });
  return outer ? { t0, t1 } : null;
}

/** A point deep inside a contour: the grid point farthest from its edges. */
function deepPoint(c: Contour): Point {
  const { x0, y0, x1, y1 } = bboxOfContours([c]);
  let best: Point = [(x0 + x1) / 2, (y0 + y1) / 2], bestD = -1;
  const N = 24;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const p: Point = [x0 + ((x1 - x0) * (i + 0.5)) / (N + 1), y0 + ((y1 - y0) * (j + 0.5)) / (N + 1)];
    if (!pointInContour(p, c)) continue;
    let d = Infinity;
    for (let a = 0, b = c.length - 1; a < c.length; b = a++) {
      const ex = c[a][0] - c[b][0], ey = c[a][1] - c[b][1], l2 = ex * ex + ey * ey;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - c[b][0]) * ex + (p[1] - c[b][1]) * ey) / l2)) : 0;
      d = Math.min(d, Math.hypot(p[0] - c[b][0] - t * ex, p[1] - c[b][1] - t * ey));
    }
    if (d > bestD) { bestD = d; best = p; }
  }
  return best;
}

interface Candidate { k: number; v: Point; t0: number; t1: number }

/** The ray directions to bridge counter `hole` of `s`: shortest crossing first, then one ≥ 120° away. */
function pickBridges(s: Shape, hole: number, count: 1 | 2): { o: Point; picks: Candidate[] } {
  const o = deepPoint(s.holes[hole]);
  const cands: Candidate[] = [];
  for (let k = 0; k < RAYS; k++) {
    const a = (2 * Math.PI * k) / RAYS;
    const v: Point = [Math.cos(a), Math.sin(a)];
    const c = crossing(s, hole, o, v);
    if (c) cands.push({ k, v, ...c });
  }
  cands.sort((a, b) => a.t1 - a.t0 - (b.t1 - b.t0));
  const picks = cands.slice(0, 1);
  if (count === 2 && picks.length) {
    const spread = (a: number, b: number) => {
      const d = (Math.abs(a - b) * 360) / RAYS;
      return Math.min(d, 360 - d);
    };
    const second = cands.find(c => spread(c.k, picks[0].k) >= MIN_SPREAD - 1e-9);
    if (second) picks.push(second);
  }
  return { o, picks };
}

/**
 * The cut rectangle for one bridge, of width w. Its ends reach past the stroke edges at the
 * rectangle's sides too (a slanted edge is crossed later there), plus `extra`.
 */
function bridgeRect(s: Shape, hole: number, o: Point, c: Candidate, w: number, extra: number): Bridge {
  const n: Point = [-c.v[1], c.v[0]];
  let lo = c.t0, hi = c.t1;
  for (const off of [-w / 2, w / 2]) {
    const side = crossing(s, hole, [o[0] + n[0] * off, o[1] + n[1] * off], c.v);
    if (side) { lo = Math.min(lo, side.t0); hi = Math.max(hi, side.t1); }
    else { lo -= w / 2; hi += w / 2; }
  }
  lo = Math.max(0, lo - OVERSHOOT - extra);
  hi += OVERSHOOT + extra;
  const at = (t: number, off: number): Point => [o[0] + c.v[0] * t + n[0] * off, o[1] + c.v[1] * t + n[1] * off];
  let poly: Contour = [at(lo, w / 2), at(hi, w / 2), at(hi, -w / 2), at(lo, -w / 2)];
  if (signedArea(poly) < 0) poly = poly.reverse();
  return { a: at(c.t0, 0), b: at(c.t1, 0), poly };
}

export interface StencilSheet {
  /** The sheet before kerf: border rectangle minus the letters, bridges kept. */
  sheet: Shape[];
  part: SolidPart;
  bridges: Bridge[];
  counters: number;
  issues: LetterIssue[];
}

/** Build the stencil sheet for the letter shapes (already welded and thickened). */
export function stencilSheet(shapes: Shape[], p: LetterParams, w: number): StencilSheet {
  // Counters smaller than a bridge can hold (font overlap slivers, tiny ink traps) are cut away as scrap.
  const minCounter = (2 * w) ** 2;
  const letters = unionShapes(shapeContours(shapes)).map(s => makeShape(s.outer, s.holes.filter(h => -signedArea(h) >= minCounter)));
  const bb = bboxOfContours(letters.map(s => s.outer));
  const m = Math.max(0, p.sheetMargin);
  let border: Contour = [[bb.x0 - m, bb.y0 - m], [bb.x1 + m, bb.y0 - m], [bb.x1 + m, bb.y1 + m], [bb.x0 - m, bb.y1 + m]];
  if (signedArea(border) < 0) border = border.reverse();

  const plan: { s: Shape; hole: number; o: Point; picks: Candidate[] }[] = [];
  const issues: LetterIssue[] = [];
  let unbridged = 0;
  for (const s of letters) {
    s.holes.forEach((_, hole) => {
      const { o, picks } = pickBridges(s, hole, p.bridgesPerIsland);
      if (!picks.length) unbridged++;
      else plan.push({ s, hole, o, picks });
    });
  }

  // A bridge whose rectangle does not quite sever a stroke leaves the counter loose; lengthen and retry.
  let bridges: Bridge[] = [];
  let sheet: Shape[] = [];
  let loose = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    bridges = plan.flatMap(b => b.picks.map(c => bridgeRect(b.s, b.hole, b.o, c, w, attempt * w)));
    const cut = differenceShapes(shapeContours(letters), bridges.map(b => b.poly));
    sheet = dropSpecks(differenceShapes([border], shapeContours(cut)), MIN_PIECE_AREA).sort((a, b) => b.area - a.area);
    loose = sheet.length - 1;
    if (!loose) break;
  }

  if (unbridged || loose) {
    issues.push({ lvl: "warn", msg: `${unbridged + loose} piece${unbridged + loose > 1 ? "s" : ""} inside the letters could not be bridged and would fall out. Try a wider bridge or a bolder font.` });
  }
  if (plan.length) {
    issues.push({ lvl: "info", msg: `${bridges.length} bridge${bridges.length > 1 ? "s" : ""} of ${w} mm hold ${plan.length} letter centre${plan.length > 1 ? "s" : ""} in place.` });
  }

  const main = sheet[0] ?? makeShape(border, []);
  const kerfed = dropSpecks(offsetShapes([main], p.K / 2), MIN_PIECE_AREA).sort((a, b) => b.area - a.area)[0] ?? main;
  const lp = m >= 8 ? [(bb.x0 + bb.x1) / 2, bb.y1 + m / 2] as Point : labelPoint(kerfed);
  const part: SolidPart = {
    kind: "solid",
    name: "Stencil",
    outer: kerfed.outer,
    holes: kerfed.holes,
    bbox: kerfed.bbox,
    label: { x: lp[0], y: lp[1], size: Math.max(2.5, Math.min(6, m / 3)) },
  };
  return { sheet, part, bridges, counters: plan.length, issues };
}
