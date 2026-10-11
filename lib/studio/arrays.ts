/**
 * Repeats and per-object transforms: CorelDRAW's Step and Repeat, grid / circular / along-path
 * arrays, Illustrator's Transform Each and Distribute Spacing. All work in world space on top-level
 * objects and return the ids of the copies they make.
 */
import { newId } from "./doc";
import { boxCenter, flatten, isEmptyBox, mul, nodePaths, rotateAt, scaleAt, transformSubpaths, translate } from "./geom";
import { duplicateNodes, locate, selectionBox, topLevel, transformNodes, transformNodesEach, worldBox, type IdFactory } from "./scene";
import type { Document, Mat, Vec } from "./types";

export interface StepRepeat { copies: number; dx: number; dy: number; rotate: number; scale: number }

/** Each copy k is moved k·(dx, dy), turned k·rotate° and scaled scale^k around the selection's centre. */
export function stepAndRepeat(d: Document, ids: string[], o: StepRepeat, id: IdFactory = newId): string[] {
  const top = topLevel(d.root, ids);
  const b = selectionBox(d, top);
  if (isEmptyBox(b) || o.copies < 1) return [];
  const c = boxCenter(b);
  const out: string[] = [];
  const n = Math.min(500, Math.round(o.copies));
  for (let k = 1; k <= n; k++) {
    const s = o.scale ** k;
    const m = mul(translate(o.dx * k, o.dy * k), mul(rotateAt(o.rotate * k, c.x, c.y), scaleAt(s, s, c.x, c.y)));
    const copies = duplicateNodes(d, top, { x: 0, y: 0 }, id);
    transformNodes(d, copies, m);
    out.push(...copies);
  }
  return out;
}

export interface GridArray { rows: number; cols: number; gapX: number; gapY: number }

/** Rows × columns of the selection, `gap` mm apart (edge to edge). The original is the top-left cell. */
export function gridArray(d: Document, ids: string[], o: GridArray, id: IdFactory = newId): string[] {
  const top = topLevel(d.root, ids);
  const b = selectionBox(d, top);
  if (isEmptyBox(b)) return [];
  const px = b.maxX - b.minX + o.gapX, py = b.maxY - b.minY + o.gapY;
  const rows = Math.max(1, Math.min(100, Math.round(o.rows))), cols = Math.max(1, Math.min(100, Math.round(o.cols)));
  const out: string[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!r && !c) continue;
    const copies = duplicateNodes(d, top, { x: 0, y: 0 }, id);
    transformNodes(d, copies, translate(c * px, r * py));
    out.push(...copies);
  }
  return out;
}

export interface CircularArray { count: number; radius: number; angle: number; rotateCopies: boolean }

/**
 * `count` items spread over `angle` degrees on a circle of `radius` mm whose centre is below the
 * selection (the original is at the top). Copies turn with the circle unless `rotateCopies` is off.
 */
export function circularArray(d: Document, ids: string[], o: CircularArray, id: IdFactory = newId): string[] {
  const top = topLevel(d.root, ids);
  const b = selectionBox(d, top);
  if (isEmptyBox(b) || o.count < 2) return [];
  const sc = boxCenter(b);
  const c = { x: sc.x, y: sc.y + o.radius };
  const n = Math.min(500, Math.round(o.count));
  const full = Math.abs(Math.abs(o.angle) - 360) < 1e-9;
  const step = o.angle / (full ? n : n - 1);
  const out: string[] = [];
  for (let k = 1; k < n; k++) {
    const a = step * k;
    let m: Mat = rotateAt(a, c.x, c.y);
    if (!o.rotateCopies) {
      const rad = (a * Math.PI) / 180;
      const p = { x: c.x + (sc.x - c.x) * Math.cos(rad) - (sc.y - c.y) * Math.sin(rad), y: c.y + (sc.x - c.x) * Math.sin(rad) + (sc.y - c.y) * Math.cos(rad) };
      m = translate(p.x - sc.x, p.y - sc.y);
    }
    const copies = duplicateNodes(d, top, { x: 0, y: 0 }, id);
    transformNodes(d, copies, m);
    out.push(...copies);
  }
  return out;
}

export interface PathArray { count: number; rotate: boolean }

/** Points `count` evenly spaced along a polyline by length, with the direction at each. */
export function samplePolyline(pts: Vec[], count: number, closed: boolean): { p: Vec; angle: number }[] {
  const ring = closed ? [...pts, pts[0]] : pts;
  const lens = [0];
  for (let k = 1; k < ring.length; k++) lens.push(lens[k - 1] + Math.hypot(ring[k].x - ring[k - 1].x, ring[k].y - ring[k - 1].y));
  const total = lens[lens.length - 1];
  if (total < 1e-9 || count < 1) return [];
  const out: { p: Vec; angle: number }[] = [];
  let seg = 1;
  for (let k = 0; k < count; k++) {
    const at = count === 1 ? 0 : closed ? (total * k) / count : (total * k) / (count - 1);
    while (seg < ring.length - 1 && lens[seg] < at) seg++;
    const a = ring[seg - 1], b = ring[seg], l = lens[seg] - lens[seg - 1];
    const t = l > 1e-12 ? Math.min(1, Math.max(0, (at - lens[seg - 1]) / l)) : 0;
    out.push({ p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI });
  }
  return out;
}

/**
 * Places `count` copies of the other selected objects along the top-most selected path (the guide),
 * centred on it and optionally turned to follow it. The originals become the first copy.
 */
export function pathArray(d: Document, ids: string[], o: PathArray, id: IdFactory = newId): { ids: string[]; error?: string } {
  const top = topLevel(d.root, ids);
  if (top.length < 2) return { ids: [], error: "Select the objects and, on top, the path to follow" };
  const guideId = top[top.length - 1];
  const gl = locate(d.root, guideId)!;
  const subs = transformSubpaths(nodePaths(gl.node), gl.world).filter((s) => s.nodes.length > 1);
  if (!subs.length) return { ids: [], error: "The top object has no path to follow" };
  const guide = subs[0];
  const items = top.slice(0, -1);
  const b = selectionBox(d, items);
  if (isEmptyBox(b)) return { ids: [], error: "Nothing to repeat" };
  const c = boxCenter(b);
  const spots = samplePolyline(flatten(guide, 0.05), Math.max(1, Math.min(500, Math.round(o.count))), guide.closed);
  const sets = spots.map((_, k) => (k === 0 ? items : duplicateNodes(d, items, { x: 0, y: 0 }, id)));
  spots.forEach((s, k) => {
    const m = mul(translate(s.p.x - c.x, s.p.y - c.y), o.rotate ? rotateAt(s.angle, c.x, c.y) : [1, 0, 0, 1, 0, 0]);
    transformNodes(d, sets[k], m);
  });
  return { ids: sets.slice(1).flat() };
}

export interface TransformEach { scaleX: number; scaleY: number; dx: number; dy: number; rotate: number; random: boolean; seed: number }

/** Mulberry32: a small seeded random generator, so a preview and its result match. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Scales, moves and turns every object around its own centre. Random gives each a value between none and the full amount. */
export function transformEach(d: Document, ids: string[], o: TransformEach): void {
  const rnd = seeded(o.seed);
  const moves: [string, Mat][] = [];
  for (const nid of topLevel(d.root, ids)) {
    const b = worldBox(d.root, nid);
    if (isEmptyBox(b)) continue;
    const c = boxCenter(b);
    const f = o.random ? [rnd(), rnd(), rnd(), rnd()] : [1, 1, 1, 1];
    const sx = 1 + (o.scaleX - 1) * f[0], sy = 1 + (o.scaleY - 1) * f[0];
    moves.push([nid, mul(translate(o.dx * f[1], o.dy * f[2]), mul(rotateAt(o.rotate * f[3], c.x, c.y), scaleAt(sx || 1e-6, sy || 1e-6, c.x, c.y)))]);
  }
  transformNodesEach(d, moves);
}

/** Distribute Spacing: objects `gap` mm apart along an axis, starting from the first; equal gaps between the outer two when `gap` is null. */
export function distributeSpacing(d: Document, ids: string[], axis: "x" | "y", gap: number | null): void {
  const items = topLevel(d.root, ids).map((nid) => ({ id: nid, b: worldBox(d.root, nid) })).filter((i) => !isEmptyBox(i.b));
  if (items.length < 2) return;
  const lo = axis === "x" ? "minX" : "minY", hi = axis === "x" ? "maxX" : "maxY";
  items.sort((a, b) => a.b[lo] - b.b[lo]);
  let g = gap;
  if (g === null) {
    if (items.length < 3) return;
    const span = items[items.length - 1].b[hi] - items[0].b[lo];
    g = (span - items.reduce((s, i) => s + (i.b[hi] - i.b[lo]), 0)) / (items.length - 1);
  }
  let at = items[0].b[hi] + g;
  const moves: [string, Mat][] = [];
  for (const i of items.slice(1)) {
    const delta = at - i.b[lo];
    if (Math.abs(delta) > 1e-12) moves.push([i.id, axis === "x" ? translate(delta, 0) : translate(0, delta)]);
    at += i.b[hi] - i.b[lo] + g;
  }
  transformNodesEach(d, moves);
}