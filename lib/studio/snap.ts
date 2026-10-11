/**
 * Snapping and smart guides. Targets come from sheets, guides and other objects; a moving box snaps
 * its edges or centre to the nearest target within the tolerance (screen pixels / zoom), and to equal
 * spacing between neighbours. Results carry the guide lines the canvas draws in magenta.
 */
import { boxCenter, isEmptyBox, segments, transformSubpaths, nodePaths, type Box } from "./geom";
import { gridKind, gridNode, modularEdges } from "./grids";
import { walk, worldBox } from "./scene";
import type { Document, GridSpec, Vec } from "./types";

export interface SnapLine { axis: "x" | "y"; at: number; from: number; to: number; kind: "edge" | "center" | "guide" | "grid" | "point" | "spacing" }

export interface SnapTargets {
  /** Vertical lines (x positions) with the y extent of what they come from. */
  xs: { at: number; lo: number; hi: number; kind: SnapLine["kind"] }[];
  ys: { at: number; lo: number; hi: number; kind: SnapLine["kind"] }[];
  points: Vec[];
  boxes: Box[];
}

export interface SnapSettings { grid: boolean; points: boolean; guides: boolean; smart: boolean; gridSize: number }

const MAX_POINTS = 4000;

export function snapTargets(doc: Document, exclude: Set<string>, s: SnapSettings): SnapTargets {
  const t: SnapTargets = { xs: [], ys: [], points: [], boxes: [] };
  const addBox = (b: Box, kind: "edge" | "center" = "edge") => {
    const c = boxCenter(b);
    t.xs.push({ at: b.minX, lo: b.minY, hi: b.maxY, kind }, { at: b.maxX, lo: b.minY, hi: b.maxY, kind }, { at: c.x, lo: b.minY, hi: b.maxY, kind: "center" });
    t.ys.push({ at: b.minY, lo: b.minX, hi: b.maxX, kind }, { at: b.maxY, lo: b.minX, hi: b.maxX, kind }, { at: c.y, lo: b.minX, hi: b.maxX, kind: "center" });
  };
  for (const sh of doc.sheets) addBox({ minX: sh.x, minY: sh.y, maxX: sh.x + sh.w, maxY: sh.y + sh.h });
  if (s.guides) for (const g of doc.guides) (g.axis === "x" ? t.xs : t.ys).push({ at: g.at, lo: -1e6, hi: 1e6, kind: "guide" });
  walk(doc.root, (l) => {
    if (exclude.has(l.node.id) || l.node.hidden) return "skip";
    if (l.depth === 0 && s.smart) {
      const b = worldBox(doc.root, l.node.id);
      if (!isEmptyBox(b)) { addBox(b); t.boxes.push(b); }
    }
    if (s.points && l.node.type !== "group" && t.points.length < MAX_POINTS) {
      for (const sp of transformSubpaths(nodePaths(l.node), l.world)) {
        for (const g of segments(sp)) t.points.push({ x: g.p0.x, y: g.p0.y });
        if (!sp.closed && sp.nodes.length) t.points.push({ x: sp.nodes[sp.nodes.length - 1].x, y: sp.nodes[sp.nodes.length - 1].y });
      }
    }
  });
  if (t.points.length > MAX_POINTS) t.points.length = MAX_POINTS;
  return t;
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
  const b = { minX: box.minX + dx, minY: box.minY + dy, maxX: box.maxX + dx, maxY: box.maxY + dy };
  const c = boxCenter(b);
  const lines: SnapLine[] = [];
  let sx = 0, sy = 0, gotX = false, gotY = false;
  const hx = best([b.minX, c.x, b.maxX], t.xs, tol);
  const hy = best([b.minY, c.y, b.maxY], t.ys, tol);
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
  if (s.points) {
    let bestP: Vec | null = null, bd = tol;
    for (const q of t.points) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d <= bd) { bd = d; bestP = q; } }
    if (bestP) return { p: { ...bestP }, lines: [{ axis: "x", at: bestP.x, from: bestP.y, to: bestP.y, kind: "point" }] };
  }
  const r = snapMove({ minX: p.x, minY: p.y, maxX: p.x, maxY: p.y }, 0, 0, t, tol, { ...s, smart: false });
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
  if (kind === "rectangular") return snapMove(box, dx, dy, t, tol, s);
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
  if (gridKind(g) === "rectangular") return snapPoint(p, t, tol, s);
  const r = snapPoint(p, t, tol, { ...s, grid: false });
  if (!s.grid || r.p.x !== p.x || r.p.y !== p.y) return r;
  if (gridKind(g) === "modular") {
    const e = modularEdges(p, g);
    return { p: { x: Math.abs(e.x - p.x) <= tol ? e.x : p.x, y: Math.abs(e.y - p.y) <= tol ? e.y : p.y }, lines: r.lines };
  }
  const n = gridNode(p, g);
  return Math.hypot(n.x - p.x, n.y - p.y) <= tol ? { p: n, lines: r.lines } : r;
}
