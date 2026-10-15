/**
 * Solid mode: weld groups, optional bridges between the pieces of a group, kerf, and parts.
 */
import type { BBox } from "@/lib/hinge";
import { MIN_PIECE_AREA, bboxOfContours, differenceShapes, dropSpecks, offsetShapes, pointInShape, shapeContours, signedArea, unionShapes } from "./polygon";
import type { TextOutline } from "./shape";
import type { Bridge, Contour, Group, LetterParams, Point, Shape, SolidPart } from "./types";

/** A weld group plus the glyph clusters that feed it (for part names). */
export interface GroupSource extends Group {
  clusters: { cluster: number; text: string; contours: Contour[] }[];
}

/**
 * Split the glyph outlines into weld groups: one per word (split at whitespace) or one per
 * glyph cluster. Groups come out in visual order.
 */
export function groupOutlines(out: TextOutline, rawText: string, weld: LetterParams["weld"]): GroupSource[] {
  const text = rawText.replace(/[\r\n\t]/g, " ");
  const word: number[] = [];
  const wordText: string[] = [];
  let w = -1, inWord = false;
  for (let i = 0; i < text.length; i++) {
    const space = /\s/u.test(text[i]);
    if (!space && !inWord) wordText[++w] = "";
    inWord = !space;
    word[i] = space ? -1 : w;
    if (!space) wordText[w] += text[i];
  }
  const starts = [...new Set(out.shaped.glyphs.map(g => g.cluster))].sort((a, b) => a - b);
  const clusterText = (c: number) => text.slice(c, starts[starts.indexOf(c) + 1] ?? text.length);

  const groups = new Map<string, GroupSource>();
  for (const g of out.glyphs) {
    const key = weld === "word" ? `w${word[g.cluster]}` : `c${g.cluster}`;
    let gr = groups.get(key);
    if (!gr) {
      gr = { text: weld === "word" ? wordText[word[g.cluster]] ?? clusterText(g.cluster) : clusterText(g.cluster), contours: [], clusters: [] };
      groups.set(key, gr);
    }
    gr.contours.push(...g.contours);
    gr.clusters.push({ cluster: g.cluster, text: clusterText(g.cluster), contours: g.contours });
  }
  return [...groups.values()];
}

const contains = (a: BBox, b: BBox, eps = 0.05) => b.x0 >= a.x0 - eps && b.y0 >= a.y0 - eps && b.x1 <= a.x1 + eps && b.y1 <= a.y1 + eps;
const bboxArea = (b: BBox) => (b.x1 - b.x0) * (b.y1 - b.y0);

/** The characters that make up each shape, in logical (typing) order. */
export function shapeLabels(shapes: Shape[], src: GroupSource): string[] {
  const hits = shapes.map(() => new Set<number>());
  for (const cl of src.clusters) for (const c of cl.contours) {
    const bb = bboxOfContours([c]);
    let best = -1;
    shapes.forEach((s, i) => {
      if (contains(s.bbox, bb) && (best < 0 || bboxArea(s.bbox) < bboxArea(shapes[best].bbox))) best = i;
    });
    if (best >= 0) hits[best].add(cl.cluster);
  }
  return hits.map(h => {
    const cs = [...h].sort((a, b) => a - b);
    return cs.map(c => src.clusters.find(x => x.cluster === c)!.text).join("") || src.text;
  });
}

/** Closest point to `p` on segment ab. */
function closestOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return [a[0] + t * dx, a[1] + t * dy];
}

const bboxGap = (a: BBox, b: BBox) => Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.y0 - b.y1, b.y0 - a.y1));

/** Closest pair of points between the boundaries of two shapes (all contours, holes included). */
export function closestPoints(A: Shape, B: Shape): { a: Point; b: Point; d: number } {
  let best = { a: A.outer[0], b: B.outer[0], d: Infinity };
  const ca = [A.outer, ...A.holes], cb = [B.outer, ...B.holes];
  const scan = (P: Contour, Q: Contour, swap: boolean) => {
    const qb = bboxOfContours([Q]);
    for (const p of P) {
      if (bboxGap({ x0: p[0], y0: p[1], x1: p[0], y1: p[1] }, qb) >= best.d) continue;
      for (let i = 0, j = Q.length - 1; i < Q.length; j = i++) {
        const q = closestOnSegment(p, Q[j], Q[i]);
        const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (d < best.d) best = swap ? { a: q, b: p, d } : { a: p, b: q, d };
      }
    }
  };
  for (const P of ca) for (const Q of cb) {
    if (bboxGap(bboxOfContours([P]), bboxOfContours([Q])) >= best.d) continue;
    scan(P, Q, false);
    scan(Q, P, true);
  }
  return best;
}

/** Distance from `o` along unit direction `v` to the first boundary crossing of the shape. */
function rayDepth(s: Shape, o: Point, v: Point) {
  let t = Infinity;
  for (const c of [s.outer, ...s.holes]) for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const ax = c[j][0], ay = c[j][1], ex = c[i][0] - ax, ey = c[i][1] - ay;
    const den = v[0] * ey - v[1] * ex;
    if (Math.abs(den) < 1e-12) continue;
    const wx = ax - o[0], wy = ay - o[1];
    const tt = (wx * ey - wy * ex) / den;
    const u = (wx * v[1] - wy * v[0]) / den;
    if (tt > 1e-3 && u >= 0 && u <= 1) t = Math.min(t, tt);
  }
  return t;
}

/**
 * A bridge rectangle of width `w` from a (on A) to b (on B). Its ends reach into both shapes so the
 * union really connects them, but never more than half the local stroke depth (no poke-through).
 */
export function bridgeBetween(A: Shape, B: Shape, a: Point, b: Point, w: number): Bridge | null {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 1e-6) return null;
  const u: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const n: Point = [-u[1], u[0]];
  const dA = Math.min(w, 0.5 * rayDepth(A, a, [-u[0], -u[1]]));
  const dB = Math.min(w, 0.5 * rayDepth(B, b, u));
  const s: Point = [a[0] - u[0] * dA, a[1] - u[1] * dA];
  const e: Point = [b[0] + u[0] * dB, b[1] + u[1] * dB];
  const h = w / 2;
  let poly: Contour = [
    [s[0] + n[0] * h, s[1] + n[1] * h],
    [e[0] + n[0] * h, e[1] + n[1] * h],
    [e[0] - n[0] * h, e[1] - n[1] * h],
    [s[0] - n[0] * h, s[1] - n[1] * h],
  ];
  if (signedArea(poly) < 0) poly = poly.reverse();
  return { a, b, poly };
}

/**
 * Join every piece of a group into one: a minimum spanning tree over the closest gaps between
 * pieces, each edge becoming a bridge of width `w`.
 */
export function weldPieces(shapes: Shape[], w: number): { shapes: Shape[]; bridges: Bridge[] } {
  if (shapes.length < 2) return { shapes, bridges: [] };
  const n = shapes.length;
  const start = shapes.reduce((bi, s, i) => (s.area > shapes[bi].area ? i : bi), 0);
  const inTree = new Array<boolean>(n).fill(false);
  inTree[start] = true;
  const cache = new Map<string, ReturnType<typeof closestPoints>>();
  const pair = (i: number, j: number) => {
    const k = `${i},${j}`;
    let r = cache.get(k);
    if (!r) cache.set(k, (r = closestPoints(shapes[i], shapes[j])));
    return r;
  };
  const bridges: Bridge[] = [];
  for (let added = 1; added < n; added++) {
    let best: { i: number; j: number; d: number } | null = null;
    for (let i = 0; i < n; i++) if (inTree[i]) for (let j = 0; j < n; j++) {
      if (inTree[j] || (best && bboxGap(shapes[i].bbox, shapes[j].bbox) >= best.d)) continue;
      const d = pair(i, j).d;
      if (!best || d < best.d) best = { i, j, d };
    }
    if (!best) break;
    inTree[best.j] = true;
    const c = pair(best.i, best.j);
    const br = bridgeBetween(shapes[best.i], shapes[best.j], c.a, c.b, w);
    if (br) bridges.push(br);
  }
  const merged = dropSpecks(unionShapes([...shapeContours(shapes), ...bridges.map(b => b.poly)]), MIN_PIECE_AREA);
  return { shapes: merged, bridges };
}

/** Share of a shape's area an opening may remove before the whole shape counts as too thin. */
const THIN_SHARE = 0.1;

/**
 * Regions that an opening of width `m` (inset by m/2, then outset by m/2) removes: strokes
 * thinner than `m`. Rounding a sharp corner also removes a little, so a lost piece only counts
 * when it is larger than m², or when the opening removes more than THIN_SHARE of the shape
 * (a letter that is thin everywhere breaks into many small fragments).
 */
export function thinFeatures(shapes: Shape[], m: number): Shape[] {
  if (m <= 0) return [];
  const thin: Shape[] = [];
  for (const s of shapes) {
    const opened = offsetShapes(offsetShapes([s], -m / 2), m / 2);
    const lost = dropSpecks(differenceShapes(shapeContours([s]), shapeContours(opened)), MIN_PIECE_AREA);
    const lostArea = lost.reduce((a, l) => a + l.area, 0);
    thin.push(...(lostArea > THIN_SHARE * s.area ? lost : lost.filter(l => l.area > m * m)));
  }
  return thin;
}

/** A point well inside the material, for the engraved label. */
const labelPoints = new WeakMap<Shape, Point>();

export function labelPoint(s: Shape): Point {
  const { x0, y0, x1, y1 } = s.bbox;
  const hit = labelPoints.get(s);
  if (hit) return [hit[0], hit[1]];
  // The vertices in a grid: the nearest one is searched ring by ring around the candidate, and the
  // search stops once a ring is surely farther than the nearest found, which gives the same
  // minimum as comparing every vertex.
  const pts = [s.outer, ...s.holes].flat();
  const G = 48, cw = Math.max(x1 - x0, y1 - y0, 1e-9) / G;
  const cell = (v: number, o: number) => Math.min(G - 1, Math.max(0, Math.floor((v - o) / cw)));
  const grid: Point[][] = Array.from({ length: G * G }, () => []);
  for (const q of pts) grid[cell(q[1], y0) * G + cell(q[0], x0)].push(q);
  let best: Point = [(x0 + x1) / 2, (y0 + y1) / 2], bestD = -1;
  const N = 16;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const p: Point = [x0 + ((x1 - x0) * (i + 0.5)) / (N + 1), y0 + ((y1 - y0) * (j + 0.5)) / (N + 1)];
    if (!pointInShape(p, s)) continue;
    const cx = cell(p[0], x0), cy = cell(p[1], y0);
    let d = Infinity;
    for (let k = 0; k < G && d > bestD; k++) {
      // Every vertex in ring k is at least (k - 1) cells away; the margin covers rounding.
      const lb = Math.max(0, k - 1) * cw;
      if (lb * lb > d * (1 + 1e-9) + 1e-12) break;
      for (let gy = cy - k; gy <= cy + k; gy++) {
        if (gy < 0 || gy >= G) continue;
        const edge = gy === cy - k || gy === cy + k;
        for (let gx = cx - k; gx <= cx + k; gx += edge || k === 0 ? 1 : 2 * k) {
          if (gx < 0 || gx >= G) continue;
          for (const q of grid[gy * G + gx]) d = Math.min(d, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2);
        }
      }
    }
    if (d > bestD) { bestD = d; best = p; }
  }
  labelPoints.set(s, best);
  return [best[0], best[1]];
}

/** Kerf-compensated solid parts: outers grow by K/2, holes shrink by K/2. */
export function solidParts(shapes: Shape[], names: string[], K: number): SolidPart[] {
  const parts: SolidPart[] = [];
  const used = new Map<string, number>();
  shapes.forEach((s, i) => {
    for (const o of dropSpecks(offsetShapes([s], K / 2), MIN_PIECE_AREA)) {
      const base = names[i] || "Part";
      const k = (used.get(base) ?? 0) + 1;
      used.set(base, k);
      const lp = labelPoint(o);
      const size = Math.max(2.5, Math.min(6, Math.sqrt(o.area) / 10));
      parts.push({ kind: "solid", name: k > 1 ? `${base} ${k}` : base, outer: o.outer, holes: o.holes, bbox: o.bbox, label: { x: lp[0], y: lp[1], size } });
    }
  });
  return parts;
}
