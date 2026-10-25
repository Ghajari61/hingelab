/**
 * Faceted walls for Letter Box: the centerline becomes a polygon, every side a flat panel.
 *
 * Corners near 90° get finger joints (the incoming panel owns the even bands, the outgoing panel
 * the odd ones); other corners are butt joints, where both panels stop short so their inner
 * faces just meet.
 */
import { halfKerf } from "./kerf";
import { bboxOf, offsetRect, simplify, tabCount } from "@/lib/hinge";
import { Loop, turnAt } from "./path";
import { slotAt } from "./strips";
import type { Contour, Joint, LetterIssue, LetterParams, PanelPart, PartMark, Point, Wall } from "./types";

/** Corners within this many degrees of 90° get finger joints. */
const FINGER_TOL = 10;
/** Turns below this many degrees are straightened out. */
const MIN_TURN = 2;
/** Butt joints beyond this turn leave a visible gap. */
const SHARP_TURN = 120;

const deg = (r: number) => (r * 180) / Math.PI;
const segLen = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Douglas–Peucker on an open polyline; returns the kept indices (both ends included). */
function dpIndices(pts: Point[], tol: number): number[] {
  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    const a = pts[i], b = pts[j], l = segLen(a, b);
    let best = -1, bestD = tol;
    for (let k = i + 1; k < j; k++) {
      const p = pts[k];
      const d = l > 1e-12 ? Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / l : segLen(a, p);
      if (d > bestD) { bestD = d; best = k; }
    }
    if (best >= 0) {
      keep[best] = true;
      stack.push([i, best], [best, j]);
    }
  }
  return keep.flatMap((k, i) => (k ? [i] : []));
}

/**
 * Approximate a closed contour by a polygon within `tol`, with no side shorter than `minLen`
 * (relaxed to a sixth of the perimeter on small loops) and no turn under MIN_TURN.
 */
export function facetContour(c: Contour, tol: number, minLen: number): Contour {
  const n = c.length;
  if (n <= 3) return c.slice();
  let far = 0;
  c.forEach((p, i) => { if (segLen(c[0], p) > segLen(c[0], c[far])) far = i; });
  const A = dpIndices(c.slice(0, far + 1), tol);
  const B = dpIndices([...c.slice(far), c[0]], tol).map(i => i + far);
  const q: Point[] = [...A, ...B.slice(1, -1)].map(i => c[i]);

  const perim = q.reduce((s, p, i) => s + segLen(p, q[(i + 1) % q.length]), 0);
  const minEff = Math.min(minLen, perim / 6);
  const turn = (i: number) => Math.abs(deg(turnAt(q, i)));
  const dropFlat = () => {
    for (;;) {
      if (q.length <= 3) return;
      let k = -1;
      for (let i = 0; i < q.length; i++) if (turn(i) < MIN_TURN && (k < 0 || turn(i) < turn(k))) k = i;
      if (k < 0) return;
      q.splice(k, 1);
    }
  };
  // a too-short side collapses onto the contour point nearest its middle, so both neighbours share its length
  const nearest = (m: Point) => c.reduce((best, p) => (segLen(p, m) < segLen(best, m) ? p : best), c[0]);
  dropFlat();
  while (q.length > 3) {
    let k = 0;
    for (let i = 1; i < q.length; i++) if (segLen(q[i], q[(i + 1) % q.length]) < segLen(q[k], q[(k + 1) % q.length])) k = i;
    if (segLen(q[k], q[(k + 1) % q.length]) >= minEff) break;
    const j = (k + 1) % q.length;
    const mid = nearest([(q[k][0] + q[j][0]) / 2, (q[k][1] + q[j][1]) / 2]);
    q[k] = mid;
    q.splice(j, 1);
    dropFlat();
  }
  return q;
}

export interface FacetOptions {
  letter: string;
  contour: string;
  p: LetterParams;
  hBody: number;
  topTabs: boolean;
  /** Number of the first panel of this wall (panels are numbered per letter). */
  panelNo: number;
}

export interface FacetResult {
  wall: Wall;
  parts: PanelPart[];
  /** Panel numbers to engrave on the base, next to each panel's slot line. */
  marks: PartMark[];
  issues: LetterIssue[];
}

export function facetedWall(poly: Contour, o: FacetOptions): FacetResult {
  const { p, hBody } = o;
  const T = p.T, a = p.tabW, n = poly.length;
  const issues: LetterIssue[] = [];
  const loop = new Loop(poly);
  const turns = poly.map((_, i) => deg(turnAt(poly, i)));
  const finger = turns.map(t => Math.abs(Math.abs(t) - 90) <= FINGER_TOL);
  const len = poly.map((q, i) => segLen(q, poly[(i + 1) % n]));
  const nf = (() => { let k = Math.max(3, Math.round(hBody / a)); if (k % 2 === 0) k -= 1; return Math.max(3, k); })();
  const ys = Array.from({ length: nf + 1 }, (_, k) => (hBody * k) / nf);
  const butt = (i: number, l: number) => Math.min((T / 2) * Math.tan((Math.abs(turns[i]) * Math.PI) / 360), Math.max(0, l / 2 - 1));
  if (turns.some((t, i) => !finger[i] && Math.abs(t) > SHARP_TURN)) {
    issues.push({ lvl: "info", msg: `“${o.letter}” (${o.contour}) has corners sharper than ${180 - SHARP_TURN}°, where flat panels leave a gap. Fill it with glue${p.wallStyle === "hinge" ? "" : ", or use living-hinge walls"}.` });
  }

  const parts: PanelPart[] = [];
  const marks: PartMark[] = [];
  const tabs: number[] = [];
  const joints: Joint[] = poly.map((_, i) => ({ s: loop.cum[i], turn: turns[i], kind: finger[i] ? "finger" : "butt" }));

  for (let j = 0; j < n; j++) {
    const l = len[j], jEnd = (j + 1) % n;
    // panel ends per band, in x measured from corner j along the panel
    const startX = ys.slice(0, -1).map((_, k) => (finger[j] ? (k % 2 === 1 ? -T / 2 : T / 2) : butt(j, l)));
    const endX = ys.slice(0, -1).map((_, k) => (finger[jEnd] ? (k % 2 === 0 ? l + T / 2 : l - T / 2) : l - butt(jEnd, l)));
    const s0 = Math.max(...startX), s1 = Math.min(...endX);
    const nt = tabCount(s1 - s0, a, false);
    const tx = Array.from({ length: nt }, (_, k) => s0 + ((s1 - s0) * (k + 0.5)) / nt);
    tabs.push(...tx.map(x => loop.cum[j] + x));

    const pts: Point[] = [[startX[0], 0]];
    if (o.topTabs) for (const x of tx) pts.push([x - a / 2, 0], [x - a / 2, -T], [x + a / 2, -T], [x + a / 2, 0]);
    for (let k = 0; k < nf; k++) pts.push([endX[k], ys[k]], [endX[k], ys[k + 1]]);
    for (const x of [...tx].reverse()) pts.push([x + a / 2, hBody], [x + a / 2, hBody + T], [x - a / 2, hBody + T], [x - a / 2, hBody]);
    for (let k = nf - 1; k >= 0; k--) pts.push([startX[k], ys[k + 1]], [startX[k], ys[k]]);
    const x0 = Math.min(...startX);
    const outline = offsetRect(simplify(pts.map(([x, y]) => [x - x0, y] as Point)), halfKerf(p));
    const w = Math.max(...endX) - x0;
    const name = `${o.letter}${o.panelNo + j}`;
    parts.push({
      kind: "panel",
      name,
      outline,
      hBody,
      w,
      tabs: tx.map(x => x - x0),
      label: w >= 12 ? { x: w / 2, y: hBody / 2 } : null,
      bbox: bboxOf(outline),
    });

    // number on the base, beside the panel, on the material side of the centerline
    const mid = loop.at(loop.cum[j] + l / 2), d = loop.tangent(loop.cum[j] + l / 2);
    const off = T / 2 + 2.5;
    marks.push({ x: mid[0] - d[1] * off, y: mid[1] + d[0] * off, text: name, size: 3 });
  }

  const wall: Wall = {
    letter: o.letter,
    contour: o.contour,
    style: "faceted",
    centerline: poly,
    length: loop.length,
    zones: [],
    seams: [],
    tabs,
    joints,
    slots: tabs.map(s => slotAt(loop, s, p)),
    pieceLengths: parts.map(pt => pt.w),
  };
  return { wall, parts, marks, issues };
}
