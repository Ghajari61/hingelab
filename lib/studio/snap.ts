/**
 * Snapping and smart guides. Targets come from sheets, guides and other objects; a moving box snaps
 * its edges or centre to the nearest target within the tolerance (screen pixels / zoom), and to equal
 * spacing between neighbours. Results carry the guide lines the canvas draws in magenta.
 */
import { apply, boxCenter, flatten, isEmptyBox, nodeBox, transformSubpaths, nodePaths, type Box } from "./geom";
import { gridKind, gridNode, modularEdges } from "./grids";
import { walk, worldBox } from "./scene";
import type { Anchor, Document, GridSpec, SnapToggles, Vec } from "./types";

export type { SnapToggles } from "./types";

export interface SnapLine { axis: "x" | "y"; at: number; from: number; to: number; kind: "edge" | "center" | "guide" | "grid" | "point" | "spacing" }

export interface SnapTargets {
  /** Vertical lines (x positions) with the y extent of what they come from. */
  xs: { at: number; lo: number; hi: number; kind: SnapLine["kind"] }[];
  ys: { at: number; lo: number; hi: number; kind: SnapLine["kind"] }[];
  points: Vec[];
  boxes: Box[];
  /** Flattened object outlines (only with the "path" toggle on). */
  outlines?: Vec[][];
}

export interface SnapSettings extends SnapToggles { grid: boolean; points: boolean; guides: boolean; smart: boolean; gridSize: number }

type ToggleKey = Exclude<keyof SnapToggles, "mode">;

/** What an absent toggle means. These reproduce the snapping from before the snapping bar. */
export const SNAP_DEFAULTS: Record<ToggleKey, boolean> = {
  enabled: true,
  bboxEdges: true, bboxCorners: false, bboxMidpoints: false, bboxCentres: true,
  nodesCusp: true, nodesSmooth: true, pathOutline: false, pathIntersections: false,
  centres: false, textBaseline: false, pageEdges: true, pageCentre: true,
};

export const snapOn = (s: SnapToggles, k: ToggleKey): boolean => s[k] ?? SNAP_DEFAULTS[k];

/** Every toggle the snapping bar shows: the four original switches plus the per-target ones. */
export type SnapKey = ToggleKey | "points" | "guides" | "smart" | "grid";

/** Simple mode: three switches, each flipping a group of targets together. */
export const SNAP_GROUPS: { id: "boxes" | "nodes" | "alignment"; label: string; keys: SnapKey[] }[] = [
  { id: "boxes", label: "Bounding boxes", keys: ["bboxEdges", "bboxCorners", "bboxMidpoints", "bboxCentres"] },
  { id: "nodes", label: "Nodes & paths", keys: ["points", "nodesCusp", "nodesSmooth", "pathOutline", "pathIntersections", "centres", "textBaseline"] },
  { id: "alignment", label: "Alignment", keys: ["smart", "guides", "grid", "pageEdges", "pageCentre"] },
];

type SnapState = { grid: boolean; points: boolean; guides: boolean; smart: boolean } & SnapToggles;

export const snapValue = (s: SnapState, k: SnapKey): boolean =>
  k === "points" || k === "guides" || k === "smart" || k === "grid" ? s[k] : snapOn(s, k);

/** "on" when every key of the group is on, "off" when none is, else "mixed". */
export function groupState(s: SnapState, keys: SnapKey[]): "on" | "off" | "mixed" {
  const n = keys.filter((k) => snapValue(s, k)).length;
  return n === keys.length ? "on" : n === 0 ? "off" : "mixed";
}

/** Sets one toggle on a (draft) snapping record. */
export function setSnap(s: SnapState, k: SnapKey, on: boolean) {
  s[k] = on;
}

const MAX_POINTS = 4000;
const MAX_OUTLINE = 20000;
const MAX_SEGMENTS = 3000;

/** A node is smooth when it says so, or (no kind recorded) when both handles are collinear through it. */
function isSmooth(a: Anchor): boolean {
  if (a.k) return a.k !== "corner";
  if (!a.i || !a.o) return false;
  const ix = a.i.x - a.x, iy = a.i.y - a.y, ox = a.o.x - a.x, oy = a.o.y - a.y;
  const li = Math.hypot(ix, iy), lo = Math.hypot(ox, oy);
  return li > 1e-9 && lo > 1e-9 && Math.abs(ix * oy - iy * ox) / (li * lo) < 1e-3 && ix * ox + iy * oy < 0;
}

/** Crossing points between polylines (each other and themselves), on at most MAX_SEGMENTS segments. */
export function pathIntersections(lines: Vec[][]): Vec[] {
  type Seg = { a: Vec; b: Vec; line: number; k: number; n: number; minX: number; maxX: number; minY: number; maxY: number };
  const segs: Seg[] = [];
  lines.forEach((pl, line) => {
    for (let k = 1; k < pl.length && segs.length < MAX_SEGMENTS; k++) {
      const a = pl[k - 1], b = pl[k];
      segs.push({ a, b, line, k, n: pl.length - 1, minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y) });
    }
  });
  segs.sort((p, q) => p.minX - q.minX);
  const out: Vec[] = [];
  for (let i = 0; i < segs.length && out.length < MAX_POINTS; i++) {
    const s = segs[i];
    for (let j = i + 1; j < segs.length && segs[j].minX <= s.maxX; j++) {
      const t = segs[j];
      if (t.minY > s.maxY || t.maxY < s.minY) continue;
      if (s.line === t.line && (Math.abs(s.k - t.k) <= 1 || Math.abs(s.k - t.k) === s.n - 1)) continue;
      const rx = s.b.x - s.a.x, ry = s.b.y - s.a.y, qx = t.b.x - t.a.x, qy = t.b.y - t.a.y;
      const den = rx * qy - ry * qx;
      if (Math.abs(den) < 1e-12) continue;
      const wx = t.a.x - s.a.x, wy = t.a.y - s.a.y;
      const u = (wx * qy - wy * qx) / den, v = (wx * ry - wy * rx) / den;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      out.push({ x: s.a.x + u * rx, y: s.a.y + u * ry });
    }
  }
  return out;
}

export function snapTargets(doc: Document, exclude: Set<string>, s: SnapSettings): SnapTargets {
  const t: SnapTargets = { xs: [], ys: [], points: [], boxes: [] };
  if (!snapOn(s, "enabled")) return t;
  // Per axis: edge, edge, centre (tie-breaking in `best` depends on this order).
  const addOrdered = (b: Box, edges: boolean, centre: boolean) => {
    const c = boxCenter(b);
    if (edges) {
      t.xs.push({ at: b.minX, lo: b.minY, hi: b.maxY, kind: "edge" }, { at: b.maxX, lo: b.minY, hi: b.maxY, kind: "edge" });
      t.ys.push({ at: b.minY, lo: b.minX, hi: b.maxX, kind: "edge" }, { at: b.maxY, lo: b.minX, hi: b.maxX, kind: "edge" });
    }
    if (centre) {
      t.xs.push({ at: c.x, lo: b.minY, hi: b.maxY, kind: "center" });
      t.ys.push({ at: c.y, lo: b.minX, hi: b.maxX, kind: "center" });
    }
  };
  for (const sh of doc.sheets) addOrdered({ minX: sh.x, minY: sh.y, maxX: sh.x + sh.w, maxY: sh.y + sh.h }, snapOn(s, "pageEdges"), snapOn(s, "pageCentre"));
  if (s.guides) for (const g of doc.guides) (g.axis === "x" ? t.xs : t.ys).push({ at: g.at, lo: -1e6, hi: 1e6, kind: "guide" });
  const corners = snapOn(s, "bboxCorners"), mids = snapOn(s, "bboxMidpoints"), centres = snapOn(s, "centres");
  const cusp = snapOn(s, "nodesCusp"), smooth = snapOn(s, "nodesSmooth");
  const outline = snapOn(s, "pathOutline"), crossings = snapOn(s, "pathIntersections"), baseline = snapOn(s, "textBaseline");
  const lines: Vec[][] = [];
  let outlinePts = 0;
  const extra: Vec[] = [];
  walk(doc.root, (l) => {
    if (exclude.has(l.node.id) || l.node.hidden) return "skip";
    if (l.depth === 0 && (s.smart || corners || mids || centres)) {
      const b = worldBox(doc.root, l.node.id);
      if (!isEmptyBox(b)) {
        if (s.smart) { addOrdered(b, snapOn(s, "bboxEdges"), snapOn(s, "bboxCentres")); t.boxes.push(b); }
        const c = boxCenter(b);
        if (corners) extra.push({ x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY });
        if (mids) extra.push({ x: c.x, y: b.minY }, { x: b.maxX, y: c.y }, { x: c.x, y: b.maxY }, { x: b.minX, y: c.y });
        if (centres) extra.push(c);
      }
    }
    if (l.node.type === "group") return;
    if (baseline && l.node.type === "text") {
      const o = apply(l.world, { x: 0, y: 0 });
      extra.push(o);
      if (Math.abs(l.world[1]) < 1e-9) {
        const b = nodeBox(l.node, l.world);
        if (!isEmptyBox(b)) t.ys.push({ at: o.y, lo: b.minX, hi: b.maxX, kind: "edge" });
      }
    }
    const wantNodes = s.points && (cusp || smooth) && t.points.length < MAX_POINTS;
    const wantLines = (outline || crossings) && outlinePts < MAX_OUTLINE;
    if (!wantNodes && !wantLines) return;
    for (const sp of transformSubpaths(nodePaths(l.node), l.world)) {
      if (wantNodes) for (const a of sp.nodes) if (smooth && cusp ? true : isSmooth(a) ? smooth : cusp) t.points.push({ x: a.x, y: a.y });
      if (wantLines) {
        const pl = flatten(sp, 0.05);
        if (sp.closed && pl.length > 2) pl.push(pl[0]);
        if (pl.length > 1) { lines.push(pl); outlinePts += pl.length; }
      }
    }
  });
  if (crossings) t.points.push(...pathIntersections(lines));
  t.points.push(...extra);
  if (outline) t.outlines = lines;
  if (t.points.length > MAX_POINTS) t.points.length = MAX_POINTS;
  return t;
}

/** True when `snapPoint` should look at point targets: nodes, or any of the extra point kinds. */
const pointSnapping = (s: SnapSettings) =>
  s.points || snapOn(s, "bboxCorners") || snapOn(s, "bboxMidpoints") || snapOn(s, "pathIntersections") || snapOn(s, "centres") || snapOn(s, "textBaseline");

function nearestOnOutline(p: Vec, outlines: Vec[][], tol: number): Vec | null {
  let best: Vec | null = null, bd = tol;
  for (const pl of outlines) for (let k = 1; k < pl.length; k++) {
    const a = pl[k - 1], b = pl[k], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    if (Math.min(a.x, b.x) - bd > p.x || Math.max(a.x, b.x) + bd < p.x || Math.min(a.y, b.y) - bd > p.y || Math.max(a.y, b.y) + bd < p.y) continue;
    const u = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    const q = { x: a.x + u * dx, y: a.y + u * dy }, d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= bd) { bd = d; best = q; }
  }
  return best;
}

export interface SnapResult { dx: number; dy: number; lines: SnapLine[] }

function best(values: number[], targets: SnapTargets["xs"], tol: number) {
  let hit: { delta: number; value: number; target: SnapTargets["xs"][number] } | null = null;
  for (const v of values) for (const t of targets) {
    const delta = t.at - v;
    if (Math.abs(delta) <= tol && (!hit || Math.abs(delta) < Math.abs(hit.delta) - 1e-9)) hit = { delta, value: v, target: t };
  }
  return hit;
}

const snapGrid = (v: number, size: number) => Math.round(v / size) * size;

/** Snaps a box that has been moved by (dx, dy). */
export function snapMove(box: Box, dx: number, dy: number, t: SnapTargets, tol: number, s: SnapSettings): SnapResult {
  return moveSnap(box, dx, dy, t, tol, s, false);
}

function moveSnap(box: Box, dx: number, dy: number, t: SnapTargets, tol: number, s: SnapSettings, asPoint: boolean): SnapResult {
  if (!snapOn(s, "enabled")) return { dx, dy, lines: [] };
  const b = { minX: box.minX + dx, minY: box.minY + dy, maxX: box.maxX + dx, maxY: box.maxY + dy };
  const c = boxCenter(b);
  const lines: SnapLine[] = [];
  if (!asPoint && t.points.length) {
    const own: Vec[] = [];
    if (snapOn(s, "bboxCorners")) own.push({ x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY });
    if (snapOn(s, "bboxMidpoints")) own.push({ x: c.x, y: b.minY }, { x: b.maxX, y: c.y }, { x: c.x, y: b.maxY }, { x: b.minX, y: c.y });
    if (snapOn(s, "centres")) own.push(c);
    let hit: { q: Vec; d: Vec } | null = null, bd = tol;
    for (const o of own) for (const q of t.points) {
      const d = Math.hypot(q.x - o.x, q.y - o.y);
      if (d <= bd) { bd = d; hit = { q, d: { x: q.x - o.x, y: q.y - o.y } }; }
    }
    if (hit) return { dx: dx + hit.d.x, dy: dy + hit.d.y, lines: [{ axis: "x", at: hit.q.x, from: hit.q.y, to: hit.q.y, kind: "point" }] };
  }
  const edges = asPoint || snapOn(s, "bboxEdges"), centre = asPoint || snapOn(s, "bboxCentres");
  const xv = edges && centre ? [b.minX, c.x, b.maxX] : edges ? [b.minX, b.maxX] : centre ? [c.x] : [];
  const yv = edges && centre ? [b.minY, c.y, b.maxY] : edges ? [b.minY, b.maxY] : centre ? [c.y] : [];
  let sx = 0, sy = 0, gotX = false, gotY = false;
  const hx = best(xv, t.xs, tol);
  const hy = best(yv, t.ys, tol);
  if (hx) { sx = hx.delta; gotX = true; }
  if (hy) { sy = hy.delta; gotY = true; }
  if (s.smart) {
    const sp = spacing(b, t.boxes, tol);
    if (!gotX && sp.x) { sx = sp.x.delta; gotX = true; lines.push(...sp.x.lines); }
    if (!gotY && sp.y) { sy = sp.y.delta; gotY = true; lines.push(...sp.y.lines); }
  }
  if (s.grid && s.gridSize > 0) {
    if (!gotX) { sx = snapGrid(b.minX, s.gridSize) - b.minX; gotX = Math.abs(sx) <= tol; if (!gotX) sx = 0; }
    if (!gotY) { sy = snapGrid(b.minY, s.gridSize) - b.minY; gotY = Math.abs(sy) <= tol; if (!gotY) sy = 0; }
  }
  const fb = { minX: b.minX + sx, minY: b.minY + sy, maxX: b.maxX + sx, maxY: b.maxY + sy };
  if (hx && Math.abs(sx - hx.delta) < 1e-9) lines.push({ axis: "x", at: hx.target.at, from: Math.min(hx.target.lo, fb.minY), to: Math.max(hx.target.hi, fb.maxY), kind: hx.target.kind });
  if (hy && Math.abs(sy - hy.delta) < 1e-9) lines.push({ axis: "y", at: hy.target.at, from: Math.min(hy.target.lo, fb.minX), to: Math.max(hy.target.hi, fb.maxX), kind: hy.target.kind });
  return { dx: dx + sx, dy: dy + sy, lines };
}

/** Equal gaps: centred between the nearest neighbours on each side, along each axis. */
function spacing(b: Box, boxes: Box[], tol: number) {
  const axis = (ax: "x" | "y") => {
    const lo = ax === "x" ? "minX" : "minY", hi = ax === "x" ? "maxX" : "maxY";
    const olo = ax === "x" ? "minY" : "minX", ohi = ax === "x" ? "maxY" : "maxX";
    const overlap = boxes.filter((o) => o[olo] < b[ohi] && o[ohi] > b[olo]);
    const before = overlap.filter((o) => o[hi] <= b[lo] + tol).sort((p, q) => q[hi] - p[hi])[0];
    const after = overlap.filter((o) => o[lo] >= b[hi] - tol).sort((p, q) => p[lo] - q[lo])[0];
    if (!before || !after) return null;
    const size = b[hi] - b[lo];
    const target = (before[hi] + after[lo] - size) / 2;
    const delta = target - b[lo];
    if (Math.abs(delta) > tol || target < before[hi]) return null;
    const gap = target - before[hi];
    const mid = (Math.max(before[olo], after[olo], b[olo]) + Math.min(before[ohi], after[ohi], b[ohi])) / 2;
    const other: "x" | "y" = ax === "x" ? "y" : "x";
    return {
      delta,
      lines: [
        { axis: other, at: mid, from: before[hi], to: before[hi] + gap, kind: "spacing" as const },
        { axis: other, at: mid, from: target + size, to: after[lo], kind: "spacing" as const },
      ],
    };
  };
  return { x: axis("x"), y: axis("y") };
}

/** Snaps a single point (drawing, pen, node dragging): object points first, then lines, then the grid. */
export function snapPoint(p: Vec, t: SnapTargets, tol: number, s: SnapSettings): { p: Vec; lines: SnapLine[] } {
  if (!snapOn(s, "enabled")) return { p, lines: [] };
  if (pointSnapping(s)) {
    let bestP: Vec | null = null, bd = tol;
    for (const q of t.points) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d <= bd) { bd = d; bestP = q; } }
    if (bestP) return { p: { ...bestP }, lines: [{ axis: "x", at: bestP.x, from: bestP.y, to: bestP.y, kind: "point" }] };
  }
  if (t.outlines && snapOn(s, "pathOutline")) {
    const q = nearestOnOutline(p, t.outlines, tol);
    if (q) return { p: q, lines: [{ axis: "x", at: q.x, from: q.y, to: q.y, kind: "point" }] };
  }
  const r = moveSnap({ minX: p.x, minY: p.y, maxX: p.x, maxY: p.y }, 0, 0, t, tol, { ...s, smart: false }, true);
  return { p: { x: p.x + r.dx, y: p.y + r.dy }, lines: r.lines };
}

export const noTargets = (): SnapTargets => ({ xs: [], ys: [], points: [], boxes: [] });

// ---------- other grid kinds (Document Setup ▸ Grid) ----------

/**
 * `snapMove` for any grid kind. Rectangular grids (and documents without a kind) go straight to
 * `snapMove`. Otherwise objects, guides and smart guides snap first; when nothing caught the box, a
 * modular grid snaps its edges to module edges per axis, and axonometric and polar grids move the
 * nearest of its corners or centre onto a grid node.
 */
export function snapMoveGrid(box: Box, dx: number, dy: number, t: SnapTargets, tol: number, s: SnapSettings, g: GridSpec): SnapResult {
  const kind = gridKind(g);
  if (kind === "rectangular" || !snapOn(s, "enabled")) return snapMove(box, dx, dy, t, tol, s);
  const r = snapMove(box, dx, dy, t, tol, { ...s, grid: false });
  if (!s.grid) return r;
  const b = { minX: box.minX + r.dx, minY: box.minY + r.dy, maxX: box.maxX + r.dx, maxY: box.maxY + r.dy };
  const c = boxCenter(b);
  const freeX = r.dx === dx, freeY = r.dy === dy;
  if (kind === "modular") {
    let sx = 0, sy = 0;
    if (freeX) for (const v of [b.minX, b.maxX]) { const e = modularEdges({ x: v, y: 0 }, g).x - v; if (Math.abs(e) <= tol && (!sx || Math.abs(e) < Math.abs(sx))) sx = e; }
    if (freeY) for (const v of [b.minY, b.maxY]) { const e = modularEdges({ x: 0, y: v }, g).y - v; if (Math.abs(e) <= tol && (!sy || Math.abs(e) < Math.abs(sy))) sy = e; }
    return { dx: r.dx + sx, dy: r.dy + sy, lines: r.lines };
  }
  if (!freeX || !freeY) return r;
  let best: Vec | null = null, bd = tol;
  for (const p of [{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.minX, y: b.maxY }, { x: b.maxX, y: b.maxY }, c]) {
    const n = gridNode(p, g), d = Math.hypot(n.x - p.x, n.y - p.y);
    if (d <= bd) { bd = d; best = { x: n.x - p.x, y: n.y - p.y }; }
  }
  return best ? { dx: r.dx + best.x, dy: r.dy + best.y, lines: r.lines } : r;
}

/** `snapPoint` for any grid kind: object points and lines first, then the nearest grid node within the tolerance. */
export function snapPointGrid(p: Vec, t: SnapTargets, tol: number, s: SnapSettings, g: GridSpec): { p: Vec; lines: SnapLine[] } {
  if (gridKind(g) === "rectangular" || !snapOn(s, "enabled")) return snapPoint(p, t, tol, s);
  const r = snapPoint(p, t, tol, { ...s, grid: false });
  if (!s.grid || r.p.x !== p.x || r.p.y !== p.y) return r;
  if (gridKind(g) === "modular") {
    const e = modularEdges(p, g);
    return { p: { x: Math.abs(e.x - p.x) <= tol ? e.x : p.x, y: Math.abs(e.y - p.y) <= tol ? e.y : p.y }, lines: r.lines };
  }
  const n = gridNode(p, g);
  return Math.hypot(n.x - p.x, n.y - p.y) <= tol ? { p: n, lines: r.lines } : r;
}
