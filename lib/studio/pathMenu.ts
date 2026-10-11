/**
 * Path menu operations added for parity with other vector editors: Stroke to Path, Cut Path, Split
 * Path, Fracture, Flatten, Inset / Outset by a step, Remove Duplicate Nodes and Join Nearby Endpoints.
 * Areas use the Clipper helpers of pathfinder.ts (1 unit = 0.001 mm); everything else keeps curves.
 */
import * as ClipperLib from "clipper-lib";
import type { Paths } from "clipper-lib";
import { newId } from "./doc";
import { cubicAt, EPS, flatten, insertAnchor, invert, nodePaths, pointInRings, polygonArea, segmentBox, segments, transformSubpaths, type Segment } from "./geom";
import { closeSubpath, joinSubpaths } from "./pathOps";
import {
  areaItems, areaOfPaths, closedAreas, divideFaces, FLAT_TOL, inter, MIN_AREA, minus, replaceWithAreas, toPath, toSubpaths, union, UNIT,
  type BooleanResult, type Item, type JoinKind,
} from "./pathfinder";
import { locate, removeNodes, topLevel, type IdFactory, type Located } from "./scene";
import type { Anchor, Document, Mat, PathNode, Subpath, Vec } from "./types";

const I: Mat = [1, 0, 0, 1, 0, 0];
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

/** Replaces a scene node with a path of `subs` (in its parent's space), keeping id, layer and name. */
function replaceInPlace(l: Located, subs: Subpath[], transform: Mat = I): PathNode {
  const n = l.node;
  const p: PathNode = { id: n.id, type: "path", transform, layer: n.layer, subpaths: subs, ...(n.name ? { name: n.name } : {}) };
  l.parent.children[l.parent.children.indexOf(n)] = p;
  return p;
}

// ---------- Stroke to Path ----------

export type CapKind = "butt" | "round" | "square";

/** The filled outline of the stroke of `subs` (open and closed), `width` mm wide. */
export function strokeOutline(subs: Subpath[], width: number, join: JoinKind = "miter", cap: CapKind = "butt", miterLimit = 4): Subpath[] {
  if (width <= EPS) return [];
  const jt = join === "round" ? ClipperLib.JoinType.jtRound : join === "miter" ? ClipperLib.JoinType.jtMiter : ClipperLib.JoinType.jtSquare;
  const et = cap === "round" ? ClipperLib.EndType.etOpenRound : cap === "square" ? ClipperLib.EndType.etOpenSquare : ClipperLib.EndType.etOpenButt;
  const co = new ClipperLib.ClipperOffset(Math.max(1, miterLimit), FLAT_TOL * UNIT * 0.5);
  for (const s of subs) {
    const pts = toPath(flatten(s, FLAT_TOL));
    if (pts.length < 2) continue;
    co.AddPath(pts, jt, s.closed && pts.length > 2 ? ClipperLib.EndType.etClosedLine : et);
  }
  const res: Paths = [];
  co.Execute(res, (width / 2) * UNIT);
  return toSubpaths(res);
}

/** Path → Stroke to Path: each selected outline is replaced by the filled outline of its stroke. */
export function strokeToPathNodes(d: Document, ids: string[], width: number, join: JoinKind = "miter", cap: CapKind = "butt", miterLimit = 4): string[] {
  const out: string[] = [];
  for (const it of areaItems(d, ids)) {
    const subs = strokeOutline(it.subs, width, join, cap, miterLimit);
    if (!subs.length) continue;
    out.push(replaceInPlace(it.l, transformSubpaths(subs, invert(it.l.parentWorld))).id);
  }
  return out;
}

// ---------- Cut Path ----------

function segCross(p: Vec, q: Vec, a: Vec, b: Vec): { u: number; v: number } | null {
  const rx = q.x - p.x, ry = q.y - p.y, sx = b.x - a.x, sy = b.y - a.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-15) return null;
  const wx = a.x - p.x, wy = a.y - p.y;
  const u = (wx * sy - wy * sx) / den, v = (wx * ry - wy * rx) / den;
  return u >= -1e-12 && u <= 1 + 1e-12 && v >= -1e-12 && v <= 1 + 1e-12 ? { u, v } : null;
}

/** Curve parameters where segment `g` crosses any of the cutter edges (lines exact, curves refined by bisection). */
export function segmentCrossings(g: Segment, edges: [Vec, Vec][]): number[] {
  const out: number[] = [];
  const b = segmentBox(g);
  const near = edges.filter(([p, q]) => Math.max(p.x, q.x) >= b.minX - 1e-9 && Math.min(p.x, q.x) <= b.maxX + 1e-9 && Math.max(p.y, q.y) >= b.minY - 1e-9 && Math.min(p.y, q.y) <= b.maxY + 1e-9);
  if (!near.length) return out;
  if (g.line) {
    for (const [p, q] of near) { const x = segCross(g.p0, g.p3, p, q); if (x) out.push(Math.max(0, Math.min(1, x.u))); }
    return out;
  }
  const N = 48;
  const pts = Array.from({ length: N + 1 }, (_, k) => cubicAt(g, k / N));
  for (const [p, q] of near) {
    const f = (t: number) => { const c = cubicAt(g, t); return (q.x - p.x) * (c.y - p.y) - (q.y - p.y) * (c.x - p.x); };
    for (let k = 0; k < N; k++) {
      if (!segCross(pts[k], pts[k + 1], p, q)) continue;
      let lo = k / N, hi = (k + 1) / N, flo = f(lo);
      const fhi = f(hi);
      if (flo === 0 || fhi === 0) { out.push(flo === 0 ? lo : hi); continue; }
      if ((flo < 0) === (fhi < 0)) continue;
      for (let it = 0; it < 50; it++) {
        const mid = (lo + hi) / 2, fm = f(mid);
        if ((fm <= 0) === (flo <= 0)) { lo = mid; flo = fm; } else hi = mid;
      }
      out.push((lo + hi) / 2);
    }
  }
  return out;
}

/** Splits a subpath at curve positions (segment index, parameter) into open pieces. */
export function cutSubpath(s: Subpath, cuts: { seg: number; t: number }[]): Subpath[] {
  const n = s.nodes.length;
  let cs = cuts.map((c) => (c.t >= 1 - 1e-7 ? { seg: c.seg + 1, t: 0 } : c.t <= 1e-7 ? { seg: c.seg, t: 0 } : c))
    .map((c) => (s.closed ? { seg: c.seg % n, t: c.t } : c))
    .sort((a, b) => a.seg - b.seg || a.t - b.t)
    .filter((c, k, a) => k === 0 || c.seg !== a[k - 1].seg || Math.abs(c.t - a[k - 1].t) > 1e-7);
  if (!s.closed) cs = cs.filter((c) => !(c.t === 0 && (c.seg <= 0 || c.seg >= n - 1)));
  if (!cs.length) return [s];
  let cur: Subpath = { closed: s.closed, nodes: s.nodes.map((a) => ({ ...a })) };
  for (let j = cs.length - 1; j >= 0; j--) {
    const c = cs[j];
    if (c.t === 0) continue;
    const nx = cs[j + 1];
    cur = insertAnchor(cur, c.seg, c.t / (nx && nx.seg === c.seg && nx.t > 0 ? nx.t : 1));
  }
  const idx: number[] = [];
  let inserted = 0;
  for (const c of cs) { if (c.t === 0) idx.push(c.seg + inserted); else idx.push(c.seg + 1 + inserted++); }
  const nodes = cur.nodes, m = nodes.length;
  const piece = (from: number, count: number): Subpath => {
    const arr: Anchor[] = Array.from({ length: count + 1 }, (_, k) => ({ ...nodes[(from + k) % m] }));
    delete arr[0].i;
    delete arr[arr.length - 1].o;
    return { closed: false, nodes: arr };
  };
  if (cur.closed) return idx.map((a, k) => piece(a, k + 1 < idx.length ? idx[k + 1] - a : idx[0] + m - a));
  const bounds = [0, ...idx, m - 1];
  return bounds.slice(0, -1).map((a, k) => piece(a, bounds[k + 1] - a)).filter((p) => p.nodes.length > 1);
}

/**
 * Path → Cut Path: the top-most selected object's outline cuts the outlines of the others into open
 * pieces where it crosses them (no fill semantics). The cutter is removed. Returns the cut objects.
 */
export function cutPathNodes(d: Document, ids: string[]): BooleanResult {
  const items = areaItems(d, ids);
  if (items.length < 2) return { ids: [], error: "Select a path on top of the paths to cut" };
  const cutter = items[items.length - 1];
  const out: string[] = [];
  for (const it of items.slice(0, -1)) {
    const toLocal = invert(it.l.world);
    const edges: [Vec, Vec][] = [];
    for (const s of transformSubpaths(cutter.subs, toLocal)) {
      const pts = flatten(s, FLAT_TOL / 4);
      if (s.closed && pts.length > 1) pts.push(pts[0]);
      for (let k = 1; k < pts.length; k++) edges.push([pts[k - 1], pts[k]]);
    }
    const local = nodePaths(it.l.node);
    let any = false;
    const next = local.flatMap((s) => {
      const cuts = segments(s).flatMap((g, seg) => segmentCrossings(g, edges).map((t) => ({ seg, t })));
      if (!cuts.length) return [s];
      const parts = cutSubpath(s, cuts);
      if (parts.length === 1 && parts[0] === s) return [s];
      any = true;
      return parts;
    });
    if (!any) continue;
    if (it.l.node.type === "path" && !it.l.node.effects?.length) it.l.node.subpaths = next;
    else replaceInPlace(it.l, next, it.l.node.transform);
    out.push(it.l.node.id);
  }
  if (!out.length) return { ids: [], error: "The top path does not cross the others" };
  removeNodes(d, [cutter.l.node.id]);
  return { ids: out };
}

// ---------- Split Path ----------

/** Groups subpaths into separate objects: each outer contour keeps the holes directly inside it (even-odd nesting). */
export function splitGroups(subs: Subpath[]): Subpath[][] {
  const rings = subs.map((s) => (s.closed && s.nodes.length > 1 ? flatten(s, FLAT_TOL) : null));
  const area = rings.map((r) => (r && r.length > 2 ? Math.abs(polygonArea(r)) : 0));
  const inside = (outer: number, inner: number) => {
    const r = rings[inner]!, sample = r.slice(0, Math.min(5, r.length));
    return sample.filter((p) => pointInRings(p, [rings[outer]!])).length * 2 > sample.length;
  };
  const ok = (k: number) => area[k] > 0;
  const containers = subs.map((_, b) => (ok(b) ? subs.map((_, a) => a).filter((a) => a !== b && ok(a) && area[a] > area[b] && inside(a, b)) : []));
  const depth = containers.map((c) => c.length);
  const groups = new Map<number, number[]>();
  subs.forEach((_, k) => {
    if (!ok(k) || depth[k] % 2 === 0) { groups.set(k, [k]); return; }
    const parent = containers[k].filter((a) => depth[a] === depth[k] - 1).sort((a, b) => area[a] - area[b])[0];
    if (parent === undefined || !groups.has(parent)) groups.set(k, [k]);
    else groups.get(parent)!.push(k);
  });
  return [...groups.values()].map((g) => g.map((k) => subs[k]));
}

/** Path → Split Path: like Break Apart, but holes stay with their outer contour. Returns every resulting id. */
export function splitPathNodes(d: Document, ids: string[], id: IdFactory = newId): string[] {
  const out: string[] = [];
  for (const nid of topLevel(d.root, ids)) {
    const l = locate(d.root, nid);
    if (!l || (l.node.type !== "path" && l.node.type !== "shape" && l.node.type !== "text")) continue;
    const node = l.node;
    const groups = splitGroups(nodePaths(node));
    if (groups.length < 2) { out.push(node.id); continue; }
    const parts: PathNode[] = groups.map((g, k) => ({
      id: k === 0 ? node.id : id(), type: "path", transform: node.transform, layer: node.layer, subpaths: JSON.parse(JSON.stringify(g)) as Subpath[],
      ...(k === 0 && node.name ? { name: node.name } : {}),
    }));
    l.parent.children.splice(l.index, 1, ...parts);
    out.push(...parts.map((p) => p.id));
  }
  return out;
}

// ---------- Fracture, Flatten ----------

/** Path → Fracture: every non-overlapping piece of the overlapping shapes as its own path; each piece takes the cut layer of the top-most shape covering it. */
export function fractureNodes(d: Document, ids: string[], id: IdFactory = newId): BooleanResult {
  const items = closedAreas(d, ids);
  if (!items.length) return { ids: [], error: "Select closed shapes" };
  const outs = divideFaces(items);
  if (!outs.length) return { ids: [], error: "Nothing is left" };
  return { ids: replaceWithAreas(d, items, outs, items[items.length - 1].l, null, id) };
}

/** Path → Flatten: removes the hidden parts of each shape (minus everything above it in the selection); shapes hidden completely are deleted. */
export function flattenNodes(d: Document, ids: string[]): BooleanResult {
  const items = closedAreas(d, ids);
  if (items.length < 2) return { ids: [], error: "Select two or more closed shapes" };
  const kept: string[] = [], drop: string[] = [];
  let changed = false;
  items.forEach((it, k) => {
    const above = union(items.slice(k + 1).map((i) => i.region));
    if (!above.length || Math.abs(areaOfPaths(inter(it.region, above))) <= MIN_AREA) { kept.push(it.l.node.id); return; }
    changed = true;
    const rest = minus(it.region, above);
    const subs = Math.abs(areaOfPaths(rest)) > MIN_AREA ? toSubpaths(rest) : [];
    if (!subs.length) { drop.push(it.l.node.id); return; }
    kept.push(replaceInPlace(it.l, transformSubpaths(subs, invert(it.l.parentWorld))).id);
  });
  if (!changed) return { ids: [], error: "Nothing is hidden" };
  if (drop.length) removeNodes(d, drop);
  return { ids: kept };
}

// ---------- Inset / Outset ----------

/** Path → Inset / Outset: grows (positive) or shrinks (negative) each closed area in place by `delta` mm, keeping sharp corners. Areas that vanish are deleted. */
export function insetOutsetNodes(d: Document, ids: string[], delta: number): string[] {
  const out: string[] = [], drop: string[] = [];
  for (const it of closedAreas(d, ids)) {
    const co = new ClipperLib.ClipperOffset(4, FLAT_TOL * UNIT * 0.5);
    co.AddPaths(it.region, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
    const res: Paths = [];
    co.Execute(res, delta * UNIT);
    const subs = [...toSubpaths(res), ...it.subs.filter((s) => !s.closed)];
    if (!subs.length) { drop.push(it.l.node.id); continue; }
    out.push(replaceInPlace(it.l, transformSubpaths(subs, invert(it.l.parentWorld))).id);
  }
  if (drop.length) removeNodes(d, drop);
  return out;
}

// ---------- Remove Duplicate Nodes ----------

/** Merges consecutive nodes closer than `tol` mm whose segment between them has no length. */
export function removeDuplicateNodes(s: Subpath, tol = 0.01): { sub: Subpath; removed: number } {
  const zero = (a: Anchor, b: Anchor) => dist(a, b) <= tol && (!a.o || dist(a.o, a) <= tol) && (!b.i || dist(b.i, b) <= tol);
  const nodes: Anchor[] = [];
  let removed = 0;
  for (const a of s.nodes) {
    const last = nodes[nodes.length - 1];
    if (last && zero(last, a)) {
      const m: Anchor = { ...last };
      if (a.o) m.o = { ...a.o }; else delete m.o;
      nodes[nodes.length - 1] = m;
      removed++;
      continue;
    }
    nodes.push({ ...a });
  }
  if (s.closed && nodes.length > 1 && zero(nodes[nodes.length - 1], nodes[0])) {
    const l = nodes.pop()!;
    const f: Anchor = { ...nodes[0] };
    if (l.i) f.i = { ...l.i }; else delete f.i;
    nodes[0] = f;
    removed++;
  }
  return { sub: { closed: s.closed, nodes }, removed };
}

/** Removes duplicate nodes from the selected paths; returns how many were removed. */
export function removeDuplicateNodesIn(d: Document, ids: string[], tol = 0.01): number {
  let total = 0;
  for (const it of areaItems(d, ids)) {
    const node = it.l.node;
    if (node.type !== "path") continue;
    const res = node.subpaths.map((s) => removeDuplicateNodes(s, tol));
    const n = res.reduce((a, r) => a + r.removed, 0);
    if (!n) continue;
    node.subpaths = res.map((r) => r.sub);
    total += n;
  }
  return total;
}

// ---------- Join Nearby Endpoints ----------

/**
 * Joins open ends of the selected paths that lie within `tol` mm of each other (nearest pairs first;
 * a subpath whose own ends meet is closed). Paths whose pieces join another path merge into it.
 * Returns the number of joins.
 */
export function joinNearbyEndpoints(d: Document, ids: string[], tol: number): number {
  const items: Item[] = areaItems(d, ids).filter((it) => it.l.node.type === "path");
  type E = { s: Subpath; owner: number; local: Subpath | null };
  const list: E[] = items.flatMap((it, k) => (it.l.node as PathNode).subpaths.map((local) => ({ s: transformSubpaths([local], it.l.world)[0], owner: k, local })));
  const touched = new Set<number>();
  let joined = 0;
  for (;;) {
    let best: { a: number; b: number; d: number } | null = null;
    for (let a = 0; a < list.length; a++) {
      const A = list[a].s;
      if (A.closed || A.nodes.length < 2) continue;
      const a0 = A.nodes[0], a1 = A.nodes[A.nodes.length - 1];
      if (A.nodes.length > 2) { const dd = dist(a0, a1); if (dd <= tol && (!best || dd < best.d)) best = { a, b: a, d: dd }; }
      for (let b = a + 1; b < list.length; b++) {
        const B = list[b].s;
        if (B.closed || B.nodes.length < 2) continue;
        const b0 = B.nodes[0], b1 = B.nodes[B.nodes.length - 1];
        const dd = Math.min(dist(a0, b0), dist(a0, b1), dist(a1, b0), dist(a1, b1));
        if (dd <= tol && (!best || dd < best.d)) best = { a, b, d: dd };
      }
    }
    if (!best) break;
    const A = list[best.a];
    touched.add(A.owner);
    if (best.a === best.b) list[best.a] = { s: closeSubpath(A.s, tol), owner: A.owner, local: null };
    else {
      const B = list[best.b];
      touched.add(B.owner);
      list[best.a] = { s: joinSubpaths([A.s, B.s], tol)[0], owner: A.owner, local: null };
      list.splice(best.b, 1);
    }
    joined++;
  }
  if (!joined) return 0;
  const drop: string[] = [];
  items.forEach((it, k) => {
    if (!touched.has(k)) return;
    const mine = list.filter((e) => e.owner === k);
    if (!mine.length) { drop.push(it.l.node.id); return; }
    const inv = invert(it.l.world);
    (it.l.node as PathNode).subpaths = mine.map((e) => e.local ?? transformSubpaths([e.s], inv)[0]);
  });
  if (drop.length) removeNodes(d, drop);
  return joined;
}
