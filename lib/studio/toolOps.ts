/**
 * Geometry behind the cutting and building tools: Scissors, Knife, Eraser, Shape Builder, Lasso and
 * Curvature. Canvas code only collects pointer input and calls these inside one undo step.
 */
import * as ClipperLib from "clipper-lib";
import type { Path, Paths } from "clipper-lib";
import { newId } from "./doc";
import { catmullRom, EPS, flatten, insertAnchor, invert, nearestOnSubpaths, nodePaths, pathD, transformSubpaths } from "./geom";
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

/** Replaces a live shape or text with a path of the same outline (same id, transform and layer). */
function asPath(l: Located): PathNode {
  const n = l.node;
  if (n.type === "path") return n;
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