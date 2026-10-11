/**
 * Measure tool maths: where a measuring line crosses the outlines of the document, the lengths along
 * the line between crossings, the lengths of each crossed outline between its crossings, and turning
 * a measurement into a dimension object on a cut layer that is not sent to the laser.
 */
import { newId } from "./doc";
import { addPoint, emptyBox, flatten, invert, apply, nodePaths, transformSubpaths, type Box } from "./geom";
import { FLAT_TOL } from "./pathfinder";
import { walk, type IdFactory } from "./scene";
import type { DimensionNode, Document, Vec } from "./types";

/** One outline as a world polyline with running length (closed ones repeat their first point at the end). */
export interface MeasureTarget { id: string; pts: Vec[]; cum: number[]; closed: boolean; box: Box }

/** Outlines of visible paths, shapes, text and clones, flattened once per drag. */
export function measureTargets(d: Document): MeasureTarget[] {
  const out: MeasureTarget[] = [];
  walk(d.root, (l) => {
    if (l.node.hidden) return "skip";
    if (!(l.node.type === "path" || l.node.type === "shape" || l.node.type === "text" || l.node.type === "clone")) return;
    for (const s of transformSubpaths(nodePaths(l.node), l.world)) {
      const pts = flatten(s, FLAT_TOL);
      if (pts.length < 2) continue;
      const closed = s.closed && pts.length > 2;
      if (closed) pts.push({ ...pts[0] });
      const cum = [0], box = emptyBox();
      pts.forEach((p, k) => { addPoint(box, p); if (k) cum.push(cum[k - 1] + Math.hypot(p.x - pts[k - 1].x, p.y - pts[k - 1].y)); });
      out.push({ id: l.node.id, pts, cum, closed, box });
    }
  });
  return out;
}

export interface MeasureHit { /** 0–1 along the measuring line. */ t: number; p: Vec; target: number; /** Length along the outline, mm. */ s: number }
export interface MeasureSpan { a: Vec; b: Vec; len: number; mid: Vec }
export interface MeasurePiece { id: string; len: number; mid: Vec }
export interface MeasureResult {
  length: number;
  /** Degrees, counter-clockwise from the x axis as seen on screen. */
  angle: number;
  hits: MeasureHit[];
  /** The measuring line cut at every crossing. */
  spans: MeasureSpan[];
  /** Each crossed outline cut at its crossings (open outlines include the pieces to their ends). */
  pieces: MeasurePiece[];
  /** Number of crossed outlines and their full length. */
  crossed: number;
  crossedLength: number;
}

const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Point at arc length `s` along a target. */
function pointAt(tg: MeasureTarget, s: number): Vec {
  const total = tg.cum[tg.cum.length - 1];
  const at = tg.closed ? ((s % total) + total) % total : Math.max(0, Math.min(total, s));
  let k = 1;
  while (k < tg.cum.length - 1 && tg.cum[k] < at) k++;
  const span = tg.cum[k] - tg.cum[k - 1];
  return lerp(tg.pts[k - 1], tg.pts[k], span > 1e-12 ? (at - tg.cum[k - 1]) / span : 0);
}

export function measureAcross(targets: MeasureTarget[], a: Vec, b: Vec): MeasureResult {
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
  const angle = length > 1e-12 ? (Math.atan2(-dy, dx) * 180) / Math.PI + 0 : 0;
  const hits: MeasureHit[] = [];
  const lb = { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
  if (length > 1e-12) {
    targets.forEach((tg, ti) => {
      if (tg.box.maxX < lb.minX || tg.box.minX > lb.maxX || tg.box.maxY < lb.minY || tg.box.minY > lb.maxY) return;
      const last = tg.pts.length - 1;
      for (let k = 0; k < last; k++) {
        const p = tg.pts[k], q = tg.pts[k + 1];
        const ex = q.x - p.x, ey = q.y - p.y;
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-12) continue;
        const wx = p.x - a.x, wy = p.y - a.y;
        const t = (wx * ey - wy * ex) / den, u = (wx * dy - wy * dx) / den;
        if (t < -1e-9 || t > 1 + 1e-9 || u < 0 || u > 1 || (u === 1 && (k < last - 1 || tg.closed))) continue;
        const s = tg.cum[k] + u * Math.hypot(ex, ey), prev = hits[hits.length - 1];
        if (prev && prev.target === ti && Math.abs(prev.s - s) < 1e-6) continue;
        hits.push({ t: Math.max(0, Math.min(1, t)), p: lerp(p, q, u), target: ti, s });
      }
    });
  }
  hits.sort((x, y) => x.t - y.t);
  const ts = [0, ...hits.map((h) => h.t), 1].filter((t, k, all) => k === 0 || t - all[k - 1] > 1e-9);
  const spans: MeasureSpan[] = [];
  for (let k = 1; k < ts.length && length > 1e-12; k++) {
    const p = lerp(a, b, ts[k - 1]), q = lerp(a, b, ts[k]);
    spans.push({ a: p, b: q, len: (ts[k] - ts[k - 1]) * length, mid: lerp(p, q, 0.5) });
  }
  const pieces: MeasurePiece[] = [];
  const crossed = [...new Set(hits.map((h) => h.target))];
  for (const ti of crossed) {
    const tg = targets[ti], total = tg.cum[tg.cum.length - 1];
    const ss = hits.filter((h) => h.target === ti).map((h) => h.s).sort((x, y) => x - y).filter((s, k, all) => k === 0 || s - all[k - 1] > 1e-6);
    if (tg.closed && ss.length > 1 && ss[0] + total - ss[ss.length - 1] < 1e-6) ss.pop();
    const cuts: [number, number][] = [];
    for (let k = 1; k < ss.length; k++) cuts.push([ss[k - 1], ss[k]]);
    if (tg.closed) cuts.push([ss[ss.length - 1], ss[0] + total]);
    else { cuts.unshift([0, ss[0]]); cuts.push([ss[ss.length - 1], total]); }
    for (const [s0, s1] of cuts) if (s1 - s0 > 1e-6) pieces.push({ id: tg.id, len: s1 - s0, mid: pointAt(tg, (s0 + s1) / 2) });
  }
  return { length, angle, hits, spans, pieces, crossed: crossed.length, crossedLength: crossed.reduce((s, ti) => s + targets[ti].cum[targets[ti].cum.length - 1], 0) };
}

export const MEASURE_LAYER_NAME = "Measurements";

/**
 * The cut layer for dimensions: the one named "Measurements", else the highest layer nothing is on
 * (renamed and switched off for output), else C29 as it is.
 */
export function ensureMeasureLayer(d: Document): number {
  const named = d.cutLayers.find((l) => l.name === MEASURE_LAYER_NAME);
  if (named) return named.index;
  const used = new Set<number>();
  walk(d.root, (l) => { used.add(l.node.layer); });
  for (let k = d.cutLayers.length - 1; k >= 3; k--) {
    if (used.has(k)) continue;
    const l = d.cutLayers[k];
    l.name = MEASURE_LAYER_NAME; l.output = false; l.show = true;
    return k;
  }
  return d.cutLayers.length - 1;
}

/** Measure ▸ Convert to Item: a linear dimension from `a` to `b` (world) on the measurements layer. Returns its id. */
export function addDimension(d: Document, a: Vec, b: Vec, id: IdFactory = newId): string {
  const layer = ensureMeasureLayer(d);
  const inv = invert(d.root.transform);
  const node: DimensionNode = { id: id(), type: "dimension", name: "Dimension", transform: [1, 0, 0, 1, 0, 0], layer, kind: "linear", points: [apply(inv, a), apply(inv, b)], offset: 0 };
  d.root.children.push(node);
  return node.id;
}
