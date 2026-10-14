/**
 * Geometry behind the cutting and building tools: Scissors, Knife, Eraser, Shape Builder, Lasso and
 * Curvature. Canvas code only collects pointer input and calls these inside one undo step.
 */
import * as ClipperLib from "clipper-lib";
import type { Path, Paths } from "clipper-lib";
import { newId } from "./doc";
import { catmullRom, cubicAt, EPS, flatten, insertAnchor, invert, nearestOnSubpaths, nodePaths, pathD, segments, splitCubic, transformSubpaths } from "./geom";
import {
  areaOfPaths, closedAreas, divideFaces, FLAT_TOL, fromPath, inter, MIN_AREA, minus, pieces, regionOf, replaceWithAreas, toPath, toSubpaths, union,
  UNIT, type AreaOut, type Item,
} from "./pathfinder";
import { isEditable, removeNodes, walk, type IdFactory, type Located } from "./scene";
import type { Anchor, Document, Mat, PathNode, Subpath, Vec } from "./types";

/** Visible, unlocked leaves that have outlines, or only those under `ids` when given. */
function candidates(d: Document, ids: string[] | null): Located[] {
  const scope = ids && ids.length ? new Set(ids) : null;
  const out: Located[] = [];
  const inScope = new Set<string>();
  walk(d.root, (l) => {
    if (l.node.hidden || l.node.locked) return "skip";
    const mine = !scope || scope.has(l.node.id) || inScope.has(l.parent.id);
    if (l.node.type === "group") { if (mine) inScope.add(l.node.id); return; }
    if (mine && (l.node.type === "path" || l.node.type === "shape" || l.node.type === "text")) out.push(l);
  });
  return out;
}

/** Replaces a live shape or text with a path of the same outline (same id, transform and layer); Live Effects are applied. */
function asPath(l: Located): PathNode {
  const n = l.node;
  if (n.type === "path" && !n.effects?.length) return n;
  const p: PathNode = { id: n.id, type: "path", transform: n.transform, layer: n.layer, subpaths: nodePaths(n), ...(n.name ? { name: n.name } : {}) };
  l.parent.children[l.parent.children.indexOf(n)] = p;
  return p;
}

// ---------- Scissors ----------

/**
 * Cuts the path nearest to `p` (world space, within `tol` mm): a closed subpath opens there; an open
 * one splits in two (a separate path when it was the only subpath). Returns the ids involved.
 */
export function scissorsAt(d: Document, p: Vec, tol: number, id: IdFactory = newId): string[] | null {
  let best: { l: Located; sub: number; seg: number; t: number; dist: number } | null = null;
  for (const l of candidates(d, null)) {
    if (l.node.type === "text") continue;
    const near = nearestOnSubpaths(p, transformSubpaths(nodePaths(l.node), l.world));
    if (near && near.dist <= tol && (!best || near.dist < best.dist)) best = { l, ...near };
  }
  if (!best) return null;
  const path = asPath(best.l);
  const s = path.subpaths[best.sub];
  const n = s.nodes.length;
  let cut: number;
  let nodes: Anchor[];
  if (best.t < 1e-4) { cut = best.seg; nodes = s.nodes.map((a) => ({ ...a })); }
  else if (best.t > 1 - 1e-4) { cut = (best.seg + 1) % n; nodes = s.nodes.map((a) => ({ ...a })); }
  else { nodes = insertAnchor(s, best.seg, best.t).nodes; cut = best.seg + 1; }
  const strip = (a: Anchor, side: "i" | "o"): Anchor => { const c = { ...a }; delete c[side]; return c; };
  if (s.closed) {
    const ring = [...nodes.slice(cut), ...nodes.slice(0, cut)];
    path.subpaths[best.sub] = { closed: false, nodes: [strip(ring[0], "i"), ...ring.slice(1), strip(ring[0], "o")] };
    return [path.id];
  }
  if (cut <= 0 || cut >= nodes.length - 1) return null;
  const a: Subpath = { closed: false, nodes: [...nodes.slice(0, cut), strip(nodes[cut], "o")] };
  const b: Subpath = { closed: false, nodes: [strip(nodes[cut], "i"), ...nodes.slice(cut + 1)] };
  if (path.subpaths.length > 1) { path.subpaths.splice(best.sub, 1, a, b); return [path.id]; }
  path.subpaths = [a];
  const twin: PathNode = { id: id(), type: "path", transform: path.transform, layer: path.layer, subpaths: [b] };
  const parent = best.l.parent;
  parent.children.splice(parent.children.indexOf(path) + 1, 0, twin);
  return [path.id, twin.id];
}

// ---------- Knife ----------

/** A strip 2 µm wide along a polyline (the knife's cut). */
function strip(line: Vec[], halfWidth: number, round = false): Paths {
  const pts = line.length === 1 ? [line[0], { x: line[0].x + 1e-3, y: line[0].y }] : line;
  const co = new ClipperLib.ClipperOffset(2, FLAT_TOL * UNIT * 0.25);
  co.AddPath(toPath(pts), round ? ClipperLib.JoinType.jtRound : ClipperLib.JoinType.jtMiter, round ? ClipperLib.EndType.etOpenRound : ClipperLib.EndType.etOpenButt);
  const out: Paths = [];
  co.Execute(out, halfWidth * UNIT);
  return out;
}

/**
 * Knife: splits closed shapes that the line crosses completely into separate paths (open paths are
 * not cut). Works on the selection, or on everything when nothing is selected. Returns the new ids.
 */
export function knifeCut(d: Document, ids: string[] | null, line: Vec[], id: IdFactory = newId): string[] {
  if (line.length < 2) return [];
  const cut = strip(line, 0.001);
  const out: string[] = [];
  const scope = candidates(d, ids).map((l) => l.node.id);
  for (const it of closedAreas(d, scope)) {
    if (it.subs.some((s) => !s.closed)) continue;
    const parts = pieces(minus(it.region, cut));
    if (parts.length < 2) continue;
    out.push(...replaceWithAreas(d, [it], parts.map((area) => ({ area, layer: it.l.node.layer })), it.l, null, id));
  }
  return out;
}

// ---------- Eraser ----------

/** Open polylines minus an area (Clipper open-path clipping). */
function clipOpen(lines: Path[], area: Paths): Path[] {
  if (!lines.length) return [];
  const c = new ClipperLib.Clipper();
  c.AddPaths(lines, ClipperLib.PolyType.ptSubject, false);
  c.AddPaths(area, ClipperLib.PolyType.ptClip, true);
  const tree = new ClipperLib.PolyTree();
  c.Execute(ClipperLib.ClipType.ctDifference, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return ClipperLib.Clipper.OpenPathsFromPolyTree(tree) as Path[];
}

const pathsBox = (p: Paths) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const q of p) for (const v of q) { minX = Math.min(minX, v.X); minY = Math.min(minY, v.Y); maxX = Math.max(maxX, v.X); maxY = Math.max(maxY, v.Y); }
  return { minX, minY, maxX, maxY };
};

/**
 * Eraser: removes a round brush `width` mm wide along `stroke` from closed areas and open lines.
 * Objects erased completely are deleted. Returns the ids that changed.
 */
export function eraseAlong(d: Document, ids: string[] | null, stroke: Vec[], width: number): string[] {
  if (!stroke.length || width <= EPS) return [];
  const brush = strip(stroke, width / 2, true);
  const bb = pathsBox(brush);
  const changed: string[] = [];
  const drop: string[] = [];
  for (const l of candidates(d, ids)) {
    const world = transformSubpaths(nodePaths(l.node), l.world);
    const lines = world.filter((s) => !s.closed && s.nodes.length > 1).map((s) => toPath(flatten(s, FLAT_TOL)));
    const region = regionOf(world);
    const ob = pathsBox([...region, ...lines]);
    if (ob.maxX < bb.minX || ob.minX > bb.maxX || ob.maxY < bb.minY || ob.minY > bb.maxY) continue;
    const hitArea = region.length && Math.abs(areaOfPaths(inter(region, brush))) > MIN_AREA;
    const keptLines = clipOpen(lines, brush);
    const linesChanged = lines.length > 0 && (keptLines.length !== lines.length || keptLines.some((q, k) => q.length !== lines[k].length));
    if (!hitArea && !linesChanged) continue;
    const subs: Subpath[] = [
      ...(hitArea ? toSubpaths(minus(region, brush)) : toSubpaths(region)),
      ...keptLines.filter((q) => q.length > 1).map((q) => ({ closed: false, nodes: fromPath(q).map((v) => ({ x: v.x, y: v.y })) })),
    ];
    if (!subs.length) { drop.push(l.node.id); changed.push(l.node.id); continue; }
    const p = asPath(l);
    p.subpaths = transformSubpaths(subs, invert(l.world));
    changed.push(p.id);
  }
  if (drop.length) removeNodes(d, drop);
  return changed;
}

/** Open polylines that lie inside an area (Clipper open-path clipping). */
function clipOpenInside(lines: Path[], area: Paths): Path[] {
  if (!lines.length) return [];
  const c = new ClipperLib.Clipper();
  c.AddPaths(lines, ClipperLib.PolyType.ptSubject, false);
  c.AddPaths(area, ClipperLib.PolyType.ptClip, true);
  const tree = new ClipperLib.PolyTree();
  c.Execute(ClipperLib.ClipType.ctIntersection, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return ClipperLib.Clipper.OpenPathsFromPolyTree(tree) as Path[];
}

/**
 * Eraser "Delete objects": every visible, unlocked object (or one under `ids`) whose outline or filled
 * area a round brush `width` mm wide along `stroke` touches. Leaves inside groups count one by one.
 */
export function touchedBy(d: Document, ids: string[] | null, stroke: Vec[], width: number): string[] {
  if (!stroke.length) return [];
  const brush = strip(stroke, Math.max(width, 0.01) / 2, true);
  const bb = pathsBox(brush);
  const scope = ids && ids.length ? new Set(ids) : null;
  const inScope = new Set<string>();
  const out: string[] = [];
  walk(d.root, (l) => {
    if (l.node.hidden || l.node.locked) return "skip";
    const mine = !scope || scope.has(l.node.id) || inScope.has(l.parent.id);
    if (l.node.type === "group") { if (mine) inScope.add(l.node.id); return; }
    if (!mine) return;
    const world = transformSubpaths(nodePaths(l.node), l.world);
    const lines = world.filter((s) => !s.closed && s.nodes.length > 1).map((s) => toPath(flatten(s, FLAT_TOL)));
    const region = regionOf(world);
    const ob = pathsBox([...region, ...lines]);
    if (ob.maxX < bb.minX || ob.minX > bb.maxX || ob.maxY < bb.minY || ob.minY > bb.maxY) return;
    if ((region.length && Math.abs(areaOfPaths(inter(region, brush))) > 0) || clipOpenInside(lines, brush).length) out.push(l.node.id);
  });
  return out;
}

/** Deletes what `touchedBy` finds, and groups left empty. Returns the deleted ids. */
export function eraseTouching(d: Document, ids: string[] | null, stroke: Vec[], width: number): string[] {
  const hit = touchedBy(d, ids, stroke, width);
  if (hit.length) removeEmptied(d, hit);
  return hit;
}

/** Removes nodes and then any group they leave empty. */
export function removeEmptied(d: Document, ids: string[]) {
  removeNodes(d, ids);
  for (let again = true; again;) {
    const empty: string[] = [];
    walk(d.root, (l) => { if (l.node.type === "group" && !l.node.children.length) empty.push(l.node.id); });
    again = empty.length > 0;
    if (again) removeNodes(d, empty);
  }
}

// ---------- Shape Builder ----------

export interface BuilderFace extends AreaOut { d: string }

/** The faces the Shape Builder offers for the selection (world space, with path data for highlighting). */
export function builderFaces(d: Document, ids: string[]): BuilderFace[] {
  const items = closedAreas(d, ids);
  if (!items.length) return [];
  return divideFaces(items).map((f) => ({ ...f, d: pathD(toSubpaths(f.area), 3) }));
}

/** Index of the face under `p` (world), or -1. */
export function faceAt(faces: AreaOut[], p: Vec): number {
  const q = { X: Math.round(p.x * UNIT), Y: Math.round(p.y * UNIT) };
  for (let k = faces.length - 1; k >= 0; k--) {
    let inside = 0;
    for (const ring of faces[k].area) if (ClipperLib.Clipper.PointInPolygon(q, ring) !== 0) inside++;
    if (inside % 2 === 1) return k;
  }
  return -1;
}

/**
 * Shape Builder: faces in `merge` become one path, faces in `remove` are deleted, the rest stay as
 * separate pieces. The selected objects are replaced. Returns the new ids, the merged shape first.
 */
export function buildShapes(d: Document, ids: string[], merge: number[], remove: number[], id: IdFactory = newId): string[] {
  const items = closedAreas(d, ids);
  if (!items.length) return [];
  const faces = divideFaces(items);
  const m = new Set(merge.filter((k) => k >= 0 && k < faces.length)), r = new Set(remove);
  const outs: AreaOut[] = [];
  if (m.size) outs.push({ area: union([...m].map((k) => faces[k].area)), layer: faces[[...m][0]].layer });
  faces.forEach((f, k) => { if (!m.has(k) && !r.has(k)) outs.push(f); });
  return replaceWithAreas(d, items as Item[], outs, items[items.length - 1].l, null, id);
}

// ---------- Lasso ----------

export function pointInPolygon(p: Vec, poly: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || EPS) + a.x) inside = !inside;
  }
  return inside;
}

/** Top-level visible, unlocked objects with any part of their outline inside the lasso. */
export function lassoHits(d: Document, lasso: Vec[]): string[] {
  if (lasso.length < 3) return [];
  const out: string[] = [];
  walk(d.root, (l) => {
    if (l.depth > 0) return "skip";
    if (l.node.hidden || l.node.locked || !isEditable(d.root, l.node.id)) return "skip";
    const pts = transformSubpaths(nodePaths(l.node), l.world).flatMap((s) => flatten(s, 0.5));
    if (pts.some((q) => pointInPolygon(q, lasso))) out.push(l.node.id);
    return "skip";
  });
  return out;
}

// ---------- Curvature ----------

/** The Curvature tool's path: smooth through every point, sharp at `corners`. */
export function curvaturePath(pts: Vec[], corners: Set<number>, closed: boolean): Subpath {
  if (pts.length < 2) return { closed: false, nodes: pts.map((p) => ({ x: p.x, y: p.y })) };
  const s = catmullRom(pts, closed && pts.length > 2);
  s.nodes.forEach((a, k) => { if (corners.has(k)) { delete a.i; delete a.o; a.k = "corner"; } });
  return s;
}

// ---------- Shear ----------

/** Shear around `c`: horizontal moves x by k·(y − c.y), vertical moves y by k·(x − c.x). */
export function shearAt(k: number, axis: "x" | "y", c: Vec): Mat {
  return axis === "x" ? [1, 0, k, 1, -k * c.y, 0] : [1, k, 0, 1, 0, -k * c.x];
}

// ---------- Crop ----------

/**
 * Crop tool: keeps only what lies inside the box (world mm). Objects wholly inside are untouched,
 * objects wholly outside are deleted, and the rest are clipped to it (areas and open lines alike).
 * Works on the selection, or on everything when nothing is selected. Returns the ids that changed.
 */
export function cropToBox(d: Document, ids: string[] | null, b: { minX: number; minY: number; maxX: number; maxY: number }): string[] {
  if (b.maxX - b.minX <= EPS || b.maxY - b.minY <= EPS) return [];
  const rect: Paths = [toPath([{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY }])];
  const rb = pathsBox(rect);
  const changed: string[] = [];
  const drop: string[] = [];
  for (const l of candidates(d, ids)) {
    const world = transformSubpaths(nodePaths(l.node), l.world);
    const lines = world.filter((s) => !s.closed && s.nodes.length > 1).map((s) => toPath(flatten(s, FLAT_TOL)));
    const region = regionOf(world);
    if (!region.length && !lines.length) continue;
    const ob = pathsBox([...region, ...lines]);
    if (ob.minX >= rb.minX && ob.maxX <= rb.maxX && ob.minY >= rb.minY && ob.maxY <= rb.maxY) continue;
    const subs: Subpath[] = ob.maxX < rb.minX || ob.minX > rb.maxX || ob.maxY < rb.minY || ob.minY > rb.maxY ? [] : [
      ...(region.length ? toSubpaths(inter(region, rect)) : []),
      ...clipOpenInside(lines, rect).filter((q) => q.length > 1).map((q) => ({ closed: false, nodes: fromPath(q).map((v) => ({ x: v.x, y: v.y })) })),
    ];
    changed.push(l.node.id);
    if (!subs.length) { drop.push(l.node.id); continue; }
    asPath(l).subpaths = transformSubpaths(subs, invert(l.world));
  }
  if (drop.length) removeEmptied(d, drop);
  return changed;
}

// ---------- Virtual Segment Delete ----------

/** A subpath sampled finely; `us` holds each point's position as segment index + t. */
interface Sampled { pts: Vec[]; us: number[]; closed: boolean; minX: number; minY: number; maxX: number; maxY: number }

function sampleSubpath(s: Subpath): Sampled {
  const pts: Vec[] = [], us: number[] = [];
  segments(s).forEach((g, k) => {
    const n = g.line ? 1 : 48;
    for (let j = k ? 1 : 0; j <= n; j++) { pts.push(g.line ? (j ? g.p3 : g.p0) : cubicAt(g, j / n)); us.push(k + j / n); }
  });
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  return { pts, us, closed: s.closed, minX, minY, maxX, maxY };
}

/** Parameters `u` on `a` where it crosses or touches `b` (or itself, when `b` is `a`). */
function crossings(a: Sampled, b: Sampled, out: number[]) {
  if (a.maxX < b.minX - 1e-6 || a.minX > b.maxX + 1e-6 || a.maxY < b.minY - 1e-6 || a.minY > b.maxY + 1e-6) return;
  const self = a === b, na = a.pts.length - 1, nb = b.pts.length - 1;
  for (let i = 0; i < na; i++) {
    const p = a.pts[i], p2 = a.pts[i + 1];
    const rx = p2.x - p.x, ry = p2.y - p.y;
    const lx = Math.min(p.x, p2.x), hx = Math.max(p.x, p2.x), ly = Math.min(p.y, p2.y), hy = Math.max(p.y, p2.y);
    for (let j = self ? i + 2 : 0; j < nb; j++) {
      if (self && a.closed && i === 0 && j === nb - 1) continue;
      const q = b.pts[j], q2 = b.pts[j + 1];
      if (Math.max(q.x, q2.x) < lx - 1e-9 || Math.min(q.x, q2.x) > hx + 1e-9 || Math.max(q.y, q2.y) < ly - 1e-9 || Math.min(q.y, q2.y) > hy + 1e-9) continue;
      const sx = q2.x - q.x, sy = q2.y - q.y;
      const den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-14) continue;
      const t = ((q.x - p.x) * sy - (q.y - p.y) * sx) / den, w = ((q.x - p.x) * ry - (q.y - p.y) * rx) / den;
      if (t < -1e-9 || t > 1 + 1e-9 || w < -1e-9 || w > 1 + 1e-9) continue;
      const u = a.us[i] + Math.max(0, Math.min(1, t)) * (a.us[i + 1] - a.us[i]);
      out.push(u);
      if (self) out.push(a.us[j] + Math.max(0, Math.min(1, w)) * (a.us[j + 1] - a.us[j]));
    }
  }
}

/** The part of `s` from u1 to u2 (segment index + t) as an open subpath; on a closed one it may wrap. */
export function subpathPiece(s: Subpath, u1: number, u2: number): Subpath {
  const segs = segments(s);
  const n = segs.length, count = s.nodes.length;
  if (s.closed && u2 <= u1 + 1e-12) u2 += n;
  const nodes: Anchor[] = [];
  let u = u1;
  while (u < u2 - 1e-9) {
    const k = Math.floor(u + 1e-9);
    const g = segs[((k % n) + n) % n];
    const t0 = Math.max(0, u - k), end = Math.min(u2, k + 1), t1 = Math.min(1, end - k);
    const lerp = (t: number): Vec => ({ x: g.p0.x + (g.p3.x - g.p0.x) * t, y: g.p0.y + (g.p3.y - g.p0.y) * t });
    let part = g.line ? { ...g, p0: lerp(t0), p3: lerp(t1) } : t1 < 1 ? splitCubic(g, t1)[0] : g;
    if (!g.line && t0 > 1e-12) part = splitCubic(part, t0 / t1)[1];
    if (!nodes.length) {
      const kind = t0 <= 1e-12 ? s.nodes[((k % count) + count) % count].k : undefined;
      nodes.push({ x: part.p0.x, y: part.p0.y, ...(kind ? { k: kind } : {}) });
    }
    if (!g.line) nodes[nodes.length - 1].o = { x: part.c1.x, y: part.c1.y };
    const kind = t1 >= 1 ? s.nodes[(((k + 1) % count) + count) % count].k : undefined;
    nodes.push({ x: part.p3.x, y: part.p3.y, ...(g.line ? {} : { i: { x: part.c2.x, y: part.c2.y } }), ...(kind ? { k: kind } : {}) });
    u = end;
  }
  return { closed: false, nodes };
}

export interface VirtualSegment {
  id: string;
  sub: number;
  /** Segment index + t where the piece starts and ends; `whole` when it is the entire subpath. */
  from: number;
  to: number;
  whole: boolean;
  /** The piece in world space, for highlighting. */
  world: Subpath;
}

const sampleCache = new WeakMap<object, { key: string; subs: Sampled[] }>();

function sampledWorld(l: Located): { world: Subpath[]; subs: Sampled[] } {
  const world = transformSubpaths(nodePaths(l.node), l.world);
  const key = l.world.join(",");
  const hit = sampleCache.get(l.node);
  if (hit && hit.key === key) return { world, subs: hit.subs };
  const subs = world.map(sampleSubpath);
  sampleCache.set(l.node, { key, subs });
  return { world, subs };
}

/**
 * Virtual Segment Delete: the piece of the path nearest to `p` (within `tol` mm) that lies between the
 * neighbouring points where it crosses or touches any path (itself included). A subpath that crosses
 * nothing is the piece entire. Text is skipped.
 */
export function virtualSegmentAt(d: Document, p: Vec, tol: number): VirtualSegment | null {
  const all = candidates(d, null).filter((l) => l.node.type !== "text");
  let best: { l: Located; sub: number; u: number; dist: number } | null = null;
  for (const l of all) {
    const near = nearestOnSubpaths(p, transformSubpaths(nodePaths(l.node), l.world));
    if (near && near.dist <= tol && (!best || near.dist < best.dist)) best = { l, sub: near.sub, u: near.seg + near.t, dist: near.dist };
  }
  if (!best) return null;
  const { world, subs } = sampledWorld(best.l);
  const target = subs[best.sub], ws = world[best.sub];
  const n = segments(ws).length;
  const raw: number[] = [];
  for (const l of all) for (const other of l === best.l ? subs : sampledWorld(l).subs) crossings(target, other, raw);
  const cuts = raw.filter((u) => ws.closed || (u > 1e-6 && u < n - 1e-6)).map((u) => (ws.closed ? ((u % n) + n) % n : u)).sort((a, b) => a - b);
  const uniq = cuts.filter((u, k) => !k || u - cuts[k - 1] > 1e-6);
  if (ws.closed && uniq.length > 1 && uniq[0] + n - uniq[uniq.length - 1] <= 1e-6) uniq.pop();
  const id = best.l.node.id, sub = best.sub, u0 = best.u;
  const whole = (): VirtualSegment => ({ id, sub, from: 0, to: n, whole: true, world: ws });
  if (ws.closed) {
    if (uniq.length < 2) return whole();
    const lo = [...uniq].reverse().find((u) => u <= u0) ?? uniq[uniq.length - 1];
    const hi = uniq.find((u) => u > u0) ?? uniq[0];
    return { id, sub, from: lo, to: hi, whole: false, world: subpathPiece(ws, lo, hi) };
  }
  if (!uniq.length) return whole();
  const lo = [...uniq].reverse().find((u) => u <= u0) ?? 0;
  const hi = uniq.find((u) => u > u0) ?? n;
  return { id, sub, from: lo, to: hi, whole: false, world: subpathPiece(ws, lo, hi) };
}

/** Deletes the piece found by `virtualSegmentAt`. Returns the id that changed (or was deleted). */
export function deleteVirtualSegment(d: Document, p: Vec, tol: number): string[] | null {
  const v = virtualSegmentAt(d, p, tol);
  if (!v) return null;
  const l = candidates(d, null).find((c) => c.node.id === v.id);
  if (!l) return null;
  const path = asPath(l);
  const s = path.subpaths[v.sub];
  const n = segments(s).length;
  const keep: Subpath[] = v.whole ? [] : s.closed ? [subpathPiece(s, v.to, v.from)] : [
    ...(v.from > 1e-9 ? [subpathPiece(s, 0, v.from)] : []),
    ...(v.to < n - 1e-9 ? [subpathPiece(s, v.to, n)] : []),
  ];
  path.subpaths.splice(v.sub, 1, ...keep.filter((q) => q.nodes.length > 1));
  if (!path.subpaths.length) removeEmptied(d, [path.id]);
  return [path.id];
}