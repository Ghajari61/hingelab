/**
 * Pathfinder and path clean-up (Illustrator's Pathfinder panel, CorelDRAW's Shaping docker): boolean
 * operations on the filled areas of paths, live shapes and text, offset path, simplify, smooth, round
 * and chamfer corners, and a clean-up pass for laser output.
 *
 * Areas are computed with Clipper (integers, 1 unit = 0.001 mm) on curves flattened to within
 * FLAT_TOL; results are polylines. Each object's area uses the even-odd rule, as the canvas draws it.
 */
import * as ClipperLib from "clipper-lib";
import type { Path, Paths, PolyNode } from "clipper-lib";
import { newId } from "./doc";
import { catmullRom, EPS, flatten, invert, nodePaths, pathD, polygonArea, simplifyPolyline, smoothStroke, transformSubpaths } from "./geom";
import { locate, removeNodes, topLevel, walk, type IdFactory, type Located } from "./scene";
import type { Anchor, Document, GroupNode, PathNode, Subpath, Vec } from "./types";

export const UNIT = 1000;
export const FLAT_TOL = 0.01;
const FILL = ClipperLib.PolyFillType;

export type BooleanOp = "unite" | "minusFront" | "minusBack" | "intersect" | "exclude" | "divide" | "trim" | "crop";

export const BOOLEAN_LABELS: Record<BooleanOp, string> = {
  unite: "Unite", minusFront: "Minus Front", minusBack: "Minus Back", intersect: "Intersect", exclude: "Exclude",
  divide: "Divide", trim: "Trim", crop: "Crop",
};

export interface Item { l: Located; subs: Subpath[]; z: number }

/** Paths, live shapes and text among the selection (groups are opened), back to front, in world space. */
export function areaItems(d: Document, ids: string[]): Item[] {
  const want = new Set(topLevel(d.root, ids));
  const order = new Map<string, number>();
  let z = 0;
  walk(d.root, (l) => { order.set(l.node.id, z++); });
  const out: Item[] = [];
  const add = (l: Located) => {
    if (l.node.hidden) return;
    if (l.node.type === "group") {
      for (const c of l.node.children) { const cl = locate(d.root, c.id); if (cl) add(cl); }
      return;
    }
    if (l.node.type !== "path" && l.node.type !== "shape" && l.node.type !== "text") return;
    out.push({ l, subs: transformSubpaths(nodePaths(l.node), l.world), z: order.get(l.node.id) ?? 0 });
  };
  for (const id of want) { const l = locate(d.root, id); if (l) add(l); }
  return out.sort((a, b) => a.z - b.z);
}

export const toPath = (pts: Vec[]): Path => pts.map((p) => ({ X: Math.round(p.x * UNIT), Y: Math.round(p.y * UNIT) }));
export const fromPath = (p: Path): Vec[] => p.map((q) => ({ x: q.X / UNIT, y: q.Y / UNIT }));

export function run(type: ClipperLib.ClipType, subject: Paths, clip: Paths, fill = FILL.pftNonZero): Paths {
  const c = new ClipperLib.Clipper();
  c.AddPaths(subject, ClipperLib.PolyType.ptSubject, true);
  if (clip.length) c.AddPaths(clip, ClipperLib.PolyType.ptClip, true);
  const out: Paths = [];
  c.Execute(type, out, fill, fill);
  return out;
}

/** The filled area of one object (closed subpaths, even-odd), as Clipper paths with outers positive. */
export function regionOf(subs: Subpath[]): Paths {
  const rings = subs.filter((s) => s.closed && s.nodes.length > 2).map((s) => toPath(flatten(s, FLAT_TOL))).filter((p) => p.length > 2);
  if (!rings.length) return [];
  return run(ClipperLib.ClipType.ctUnion, rings, [], FILL.pftEvenOdd);
}

export const union = (ps: Paths[]): Paths => (ps.length ? run(ClipperLib.ClipType.ctUnion, ps.flat(), []) : []);
export const minus = (a: Paths, b: Paths): Paths => (b.length ? run(ClipperLib.ClipType.ctDifference, a, b) : a);
export const inter = (a: Paths, b: Paths): Paths => run(ClipperLib.ClipType.ctIntersection, a, b);

/** Splits an area into its separate pieces (each outer with its holes). */
export function pieces(p: Paths): Paths[] {
  if (!p.length) return [];
  const c = new ClipperLib.Clipper();
  c.AddPaths(p, ClipperLib.PolyType.ptSubject, true);
  const tree = new ClipperLib.PolyTree();
  c.Execute(ClipperLib.ClipType.ctUnion, tree, FILL.pftNonZero, FILL.pftNonZero);
  const out: Paths[] = [];
  const visit = (nodes: PolyNode[]) => {
    for (const o of nodes) {
      out.push([o.Contour(), ...o.Childs().map((h) => h.Contour())]);
      for (const h of o.Childs()) visit(h.Childs());
    }
  };
  visit(tree.Childs());
  return out;
}

export const MIN_AREA = 1e-4 * UNIT * UNIT;
export const areaOfPaths = (p: Paths) => p.reduce((a, q) => a + ClipperLib.Clipper.Area(q), 0);

/** Clipper paths back to closed polyline subpaths (collinear points removed). */
export function toSubpaths(p: Paths): Subpath[] {
  const clean = ClipperLib.Clipper.CleanPolygons(p, 0.0015 * UNIT) as Paths;
  return clean.filter((q) => q.length > 2 && Math.abs(ClipperLib.Clipper.Area(q)) > MIN_AREA)
    .map((q) => ({ closed: true, nodes: fromPath(q).map((v) => ({ x: v.x, y: v.y })) }));
}

export interface BooleanResult { ids: string[]; error?: string }

/**
 * Runs a Pathfinder operation on the selection. Unite, Minus Front/Back, Intersect and Exclude give one
 * (compound) path; Divide, Trim and Crop give a group of pieces that keep their source's cut layer.
 */
export type AreaItem = Item & { region: Paths };
export interface AreaOut { area: Paths; layer: number }

/** The selection's closed areas, back to front. */
export const closedAreas = (d: Document, ids: string[]): AreaItem[] =>
  areaItems(d, ids).map((it) => ({ ...it, region: regionOf(it.subs) })).filter((it) => it.region.length);

/** Every separate face of the overlapping areas (Divide); each face takes the layer of the top area covering it. */
export function divideFaces(items: AreaItem[]): AreaOut[] {
  let faces: AreaOut[] = [];
  for (const it of items) {
    const next: AreaOut[] = [];
    for (const f of faces) {
      const i = inter(f.area, it.region), m = minus(f.area, it.region);
      if (Math.abs(areaOfPaths(i)) > MIN_AREA) next.push({ area: i, layer: it.l.node.layer });
      if (Math.abs(areaOfPaths(m)) > MIN_AREA) next.push({ area: m, layer: f.layer });
    }
    const rest = minus(it.region, union(faces.map((f) => f.area)));
    if (Math.abs(areaOfPaths(rest)) > MIN_AREA) next.push({ area: rest, layer: it.l.node.layer });
    faces = next;
  }
  return faces.flatMap((f) => pieces(f.area).map((area) => ({ area, layer: f.layer })));
}

/**
 * Replaces `items` with paths for `outs`, placed above `anchor` in its parent; `group` wraps several
 * results in a named group. Groups emptied by the removal are removed too. Returns the new top-level ids.
 */
export function replaceWithAreas(d: Document, items: Item[], outs: AreaOut[], anchor: Located, group: string | null, id: IdFactory = newId): string[] {
  const parentInv = invert(anchor.parentWorld);
  const mk = (o: AreaOut): PathNode => ({ id: id(), type: "path", transform: [1, 0, 0, 1, 0, 0], layer: o.layer, subpaths: transformSubpaths(toSubpaths(o.area), parentInv) });
  const nodes = outs.filter((o) => Math.abs(areaOfPaths(o.area)) > MIN_AREA).map(mk).filter((n) => n.subpaths.length);
  const result = group && nodes.length > 1
    ? [{ id: id(), type: "group", transform: [1, 0, 0, 1, 0, 0], layer: nodes[nodes.length - 1].layer, children: nodes, name: group } as GroupNode]
    : nodes;
  anchor.parent.children.splice(anchor.parent.children.indexOf(anchor.node) + 1, 0, ...result);
  removeNodes(d, items.map((i) => i.l.node.id));
  const emptied = [...new Set(items.map((i) => i.l.parent))].filter((g) => g !== d.root && !g.children.length).map((g) => g.id);
  if (emptied.length) removeNodes(d, emptied);
  return result.map((n) => n.id);
}

export function booleanOp(d: Document, ids: string[], op: BooleanOp, id: IdFactory = newId): BooleanResult {
  const items = closedAreas(d, ids);
  const need = op === "divide" || op === "trim" ? 1 : 2;
  if (items.length < need) return { ids: [], error: need === 2 ? "Select two or more closed shapes" : "Select closed shapes" };
  const bottom = items[0], top = items[items.length - 1];
  type Out = AreaOut;
  let outs: Out[] = [];
  let grouped = false;
  switch (op) {
    case "unite": outs = [{ area: union(items.map((i) => i.region)), layer: top.l.node.layer }]; break;
    case "minusFront": outs = [{ area: minus(bottom.region, union(items.slice(1).map((i) => i.region))), layer: bottom.l.node.layer }]; break;
    case "minusBack": outs = [{ area: minus(top.region, union(items.slice(0, -1).map((i) => i.region))), layer: top.l.node.layer }]; break;
    case "intersect": {
      let a = items[0].region;
      for (const it of items.slice(1)) a = inter(a, it.region);
      outs = [{ area: a, layer: top.l.node.layer }];
      break;
    }
    case "exclude": outs = [{ area: run(ClipperLib.ClipType.ctUnion, items.flatMap((i) => i.region), [], FILL.pftEvenOdd), layer: top.l.node.layer }]; break;
    case "divide": outs = divideFaces(items); grouped = true; break;
    case "trim": {
      outs = items.map((it, k) => ({ area: minus(it.region, union(items.slice(k + 1).map((i) => i.region))), layer: it.l.node.layer }));
      grouped = true;
      break;
    }
    case "crop": {
      outs = items.slice(0, -1).map((it) => ({ area: inter(it.region, top.region), layer: it.l.node.layer }));
      grouped = true;
      break;
    }
  }
  outs = outs.filter((o) => Math.abs(areaOfPaths(o.area)) > MIN_AREA && toSubpaths(o.area).length);
  if (!outs.length) return { ids: [], error: op === "intersect" || op === "crop" ? "The shapes do not overlap" : "Nothing is left" };
  const anchor = op === "minusFront" ? bottom.l : top.l;
  return { ids: replaceWithAreas(d, items, outs, anchor, grouped ? BOOLEAN_LABELS[op] : null, id) };
}

// ---------- offset ----------

export type JoinKind = "round" | "miter" | "bevel";

/**
 * Offset Path: closed areas grow (positive) or shrink (negative); open paths become a closed outline
 * `|delta|` either side (round or square ends). Returns the new path ids; originals are kept.
 */
export function offsetNodes(d: Document, ids: string[], delta: number, join: JoinKind = "round", miterLimit = 4, id: IdFactory = newId): string[] {
  const out: string[] = [];
  const jt = join === "round" ? ClipperLib.JoinType.jtRound : join === "miter" ? ClipperLib.JoinType.jtMiter : ClipperLib.JoinType.jtSquare;
  for (const it of areaItems(d, ids)) {
    const co = new ClipperLib.ClipperOffset(Math.max(1, miterLimit), FLAT_TOL * UNIT * 0.5);
    const region = regionOf(it.subs);
    if (region.length) co.AddPaths(region, jt, ClipperLib.EndType.etClosedPolygon);
    const open = it.subs.filter((s) => !s.closed && s.nodes.length > 1).map((s) => toPath(flatten(s, FLAT_TOL)));
    if (open.length && Math.abs(delta) > 0) co.AddPaths(open, jt, join === "round" ? ClipperLib.EndType.etOpenRound : ClipperLib.EndType.etOpenButt);
    const res: Paths = [];
    co.Execute(res, (open.length && !region.length ? Math.abs(delta) : delta) * UNIT);
    const subs = transformSubpaths(toSubpaths(res), invert(it.l.parentWorld));
    if (!subs.length) continue;
    const n: PathNode = { id: id(), type: "path", transform: [1, 0, 0, 1, 0, 0], layer: it.l.node.layer, subpaths: subs };
    const at = it.l.parent.children.indexOf(it.l.node);
    it.l.parent.children.splice(at + 1, 0, n);
    out.push(n.id);
  }
  return out;
}

/** Most outlines Contour makes in one go. */
export const MAX_CONTOUR_STEPS = 200;

/**
 * Contour: `steps` outlines `step` mm apart (each offset from the original, so spacing never drifts);
 * negative steps go inwards. `toCentre` keeps going inwards until each closed shape is used up.
 * Returns the new path ids; originals are kept.
 */
export function contourNodes(d: Document, ids: string[], step: number, steps: number, toCentre: boolean, join: JoinKind = "round", miterLimit = 4, id: IdFactory = newId): string[] {
  const delta = toCentre ? -Math.abs(step) : step;
  if (Math.abs(delta) < 1e-3) return [];
  const scope = toCentre ? areaItems(d, ids).filter((it) => regionOf(it.subs).length).map((it) => it.l.node.id) : ids;
  const n = toCentre ? MAX_CONTOUR_STEPS : Math.max(1, Math.min(MAX_CONTOUR_STEPS, Math.round(steps)));
  const out: string[] = [];
  for (let k = 1; k <= n && scope.length; k++) {
    const got = offsetNodes(d, scope, delta * k, join, miterLimit, id);
    if (!got.length) break;
    out.push(...got);
  }
  return out;
}

/**
 * Create Boundary: one new path around the outside of the selected shapes' combined area (holes and
 * inner edges left out), above the top-most of them; the originals stay. Null when nothing is closed.
 */
export function createBoundary(d: Document, ids: string[], layer: number, id: IdFactory = newId): string | null {
  const items = closedAreas(d, ids);
  if (!items.length) return null;
  const outer = union(items.map((i) => i.region)).filter((q) => ClipperLib.Clipper.Area(q) > 0);
  const top = items[items.length - 1];
  const subs = transformSubpaths(toSubpaths(outer), invert(top.l.parentWorld));
  if (!subs.length) return null;
  const n: PathNode = { id: id(), type: "path", name: "Boundary", transform: [1, 0, 0, 1, 0, 0], layer, subpaths: subs };
  top.l.parent.children.splice(top.l.parent.children.indexOf(top.l.node) + 1, 0, n);
  return n.id;
}

// ---------- simplify, smooth, corners ----------

/** Fewer anchors within `tol` mm of the original; curves are refitted unless `straight`. */
export function simplifySubpath(s: Subpath, tol: number, straight = false): Subpath {
  const pts = flatten(s, Math.min(0.01, tol / 4));
  if (pts.length < 3) return s;
  if (straight) {
    const ring = s.closed ? [...pts, pts[0]] : pts;
    const simple = simplifyPolyline(ring, tol);
    if (s.closed && simple.length > 3) simple.pop();
    return { closed: s.closed, nodes: simple.map((p) => ({ x: p.x, y: p.y })) };
  }
  return smoothStroke(s.closed ? [...pts, pts[0]] : pts, tol, s.closed);
}

/** Every anchor becomes a smooth one (curves through the same anchors). */
export function smoothSubpath(s: Subpath): Subpath {
  if (s.nodes.length < 3) return s;
  return catmullRom(s.nodes.map((n) => ({ x: n.x, y: n.y })), s.closed);
}

/**
 * Rounds (or chamfers) corners between two straight segments, `r` mm, each corner limited to half of
 * both segments. Curved corners and open ends are left alone.
 */
export function roundCorners(s: Subpath, r: number, kind: "round" | "chamfer" = "round"): Subpath {
  const n = s.nodes.length;
  if (n < 3 || r <= EPS) return s;
  const nodes: Anchor[] = [];
  for (let k = 0; k < n; k++) {
    const v = s.nodes[k];
    const hasPrev = s.closed || k > 0, hasNext = s.closed || k < n - 1;
    const prev = s.nodes[(k - 1 + n) % n], next = s.nodes[(k + 1) % n];
    const straight = hasPrev && hasNext && !prev.o && !v.i && !v.o && !next.i;
    if (!straight) { nodes.push(v); continue; }
    const l1 = Math.hypot(v.x - prev.x, v.y - prev.y), l2 = Math.hypot(next.x - v.x, next.y - v.y);
    if (l1 < EPS || l2 < EPS) { nodes.push(v); continue; }
    const u1 = { x: (v.x - prev.x) / l1, y: (v.y - prev.y) / l1 }, u2 = { x: (next.x - v.x) / l2, y: (next.y - v.y) / l2 };
    const theta = Math.acos(Math.max(-1, Math.min(1, -(u1.x * u2.x + u1.y * u2.y))));
    if (theta < 1e-4 || Math.PI - theta < 1e-4) { nodes.push(v); continue; }
    const t = Math.min(r / Math.tan(theta / 2), l1 / 2, l2 / 2);
    const a = { x: v.x - u1.x * t, y: v.y - u1.y * t }, b = { x: v.x + u2.x * t, y: v.y + u2.y * t };
    if (kind === "chamfer") { nodes.push({ x: a.x, y: a.y }, { x: b.x, y: b.y }); continue; }
    const h = (4 / 3) * Math.tan((Math.PI - theta) / 4) * t * Math.tan(theta / 2);
    nodes.push({ x: a.x, y: a.y, o: { x: a.x + u1.x * h, y: a.y + u1.y * h } }, { x: b.x, y: b.y, i: { x: b.x - u2.x * h, y: b.y - u2.y * h } });
  }
  return { closed: s.closed, nodes };
}

/** Applies a subpath edit to paths (live shapes and text are expanded to paths first). */
export function editPaths(d: Document, ids: string[], fn: (s: Subpath) => Subpath): string[] {
  const out: string[] = [];
  for (const it of areaItems(d, ids)) {
    const node = it.l.node;
    const local = node.type === "path" ? node.subpaths : nodePaths(node);
    const subs = local.map(fn);
    if (node.type === "path") node.subpaths = subs;
    else {
      const p: PathNode = { id: node.id, type: "path", transform: node.transform, layer: node.layer, subpaths: subs, ...(node.name ? { name: node.name } : {}) };
      it.l.parent.children[it.l.parent.children.indexOf(node)] = p;
    }
    out.push(node.id);
  }
  return out;
}

// ---------- clean up for laser ----------

export interface CleanupReport { points: number; closed: number; removed: number; duplicates: number }

/**
 * Laser clean-up over the selection (or everything): drops repeated points and zero-length bits, closes
 * paths whose ends meet within `gap` mm, removes empty paths and exact duplicates on the same cut
 * layer (the laser would cut them twice).
 */
export function cleanupForLaser(d: Document, ids: string[] | null, gap = 0.05): CleanupReport {
  const report: CleanupReport = { points: 0, closed: 0, removed: 0, duplicates: 0 };
  const scope = ids ? new Set(areaItems(d, ids).map((i) => i.l.node.id)) : null;
  const seen = new Map<string, string>();
  const drop: string[] = [];
  walk(d.root, (l) => {
    const node = l.node;
    if (node.type !== "path" || (scope && !scope.has(node.id))) return;
    const subs: Subpath[] = [];
    for (const s of node.subpaths) {
      const nodes: Anchor[] = [];
      for (const a of s.nodes) {
        const last = nodes[nodes.length - 1];
        if (last && Math.hypot(a.x - last.x, a.y - last.y) < 1e-3 && !last.o && !a.i) { report.points++; if (a.o) last.o = a.o; continue; }
        nodes.push(a);
      }
      let closed = s.closed;
      if (closed && nodes.length > 1) {
        const f = nodes[0], e = nodes[nodes.length - 1];
        if (Math.hypot(f.x - e.x, f.y - e.y) < 1e-3 && !e.o && !f.i) { nodes.pop(); report.points++; }
      }
      if (!closed && nodes.length > 2) {
        const f = nodes[0], e = nodes[nodes.length - 1];
        if (Math.hypot(f.x - e.x, f.y - e.y) <= gap) {
          closed = true; report.closed++;
          if (e.i) f.i = e.i;
          nodes.pop();
        }
      }
      const tooSmall = nodes.length < 2 || (nodes.length === 2 && !closed && Math.hypot(nodes[1].x - nodes[0].x, nodes[1].y - nodes[0].y) < 1e-3 && !nodes[0].o && !nodes[1].i);
      if (tooSmall) { report.points += nodes.length; continue; }
      subs.push({ closed, nodes });
    }
    node.subpaths = subs;
    if (!subs.length) { drop.push(node.id); report.removed++; return; }
    const key = `${node.layer}|${pathD(transformSubpaths(subs, l.world), 2)}`;
    if (seen.has(key)) { drop.push(node.id); report.duplicates++; } else seen.set(key, node.id);
  });
  if (drop.length) removeNodes(d, drop);
  return report;
}

/** Enclosed area of a closed subpath, mm². */
export const ringArea = (s: Subpath) => Math.abs(polygonArea(flatten(s, FLAT_TOL)));
