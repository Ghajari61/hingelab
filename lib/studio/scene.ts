/**
 * Scene tree queries and edits. Queries are pure; edits mutate a draft document (they run inside
 * the history's immer recipes) and keep every object where it was on the page unless the edit is
 * meant to move it.
 */
import { newId } from "./doc";
import {
  apply, boxCenter, boxContains, boxesTouch, emptyBox, hitPaths, I, invert, isEmptyBox, mul, nodeBasePaths, nodeBox, nodePaths,
  transformSubpaths, translate, unionBox, type Box,
} from "./geom";
import type { Document, GroupNode, Mat, PathNode, SceneNode, Vec } from "./types";

export type IdFactory = () => string;

export interface Located { node: SceneNode; parent: GroupNode; index: number; world: Mat; parentWorld: Mat; depth: number }

/** Every node with its parent and world matrix, top-level first, in drawing order (back to front). */
export function walk(root: GroupNode, fn: (l: Located) => void | "skip") {
  const rec = (g: GroupNode, gw: Mat, depth: number) => {
    g.children.forEach((node, index) => {
      const world = mul(gw, node.transform);
      const r = fn({ node, parent: g, index, world, parentWorld: gw, depth });
      if (r !== "skip" && node.type === "group") rec(node, world, depth + 1);
    });
  };
  rec(root, root.transform, 0);
}

export function locate(root: GroupNode, id: string): Located | null {
  let hit: Located | null = null;
  walk(root, (l) => { if (!hit && l.node.id === id) hit = l; });
  return hit;
}

export function findNode(root: GroupNode, id: string): SceneNode | null {
  return locate(root, id)?.node ?? null;
}

/** Ids of all ancestors of a node, nearest first. */
export function ancestors(root: GroupNode, id: string): string[] {
  const path: string[] = [];
  const rec = (g: GroupNode, trail: string[]): boolean => {
    for (const c of g.children) {
      if (c.id === id) { path.push(...trail.slice().reverse()); return true; }
      if (c.type === "group" && rec(c, [...trail, c.id])) return true;
    }
    return false;
  };
  rec(root, []);
  return path;
}

/** Drops ids whose ancestor is also in the list (moving a group already moves its children). */
export function topLevel(root: GroupNode, ids: string[]): string[] {
  const set = new Set(ids);
  return ids.filter((id) => !ancestors(root, id).some((a) => set.has(a)));
}

export function isEditable(root: GroupNode, id: string): boolean {
  const l = locate(root, id);
  if (!l || l.node.locked || l.node.hidden) return false;
  return !ancestors(root, id).some((a) => { const n = findNode(root, a); return n?.locked || n?.hidden; });
}

export function worldBox(root: GroupNode, id: string): Box {
  const l = locate(root, id);
  return l ? nodeBox(l.node, l.world) : emptyBox();
}

export function selectionBox(doc: Document, ids: string[]): Box {
  return ids.reduce((b, id) => { const nb = worldBox(doc.root, id); return isEmptyBox(nb) ? b : unionBox(b, nb); }, emptyBox());
}

export interface HitOptions {
  /** Return the deepest object (Direct Selection) instead of the top-level one. */
  deep?: boolean;
  /** Ignore these ids (for example the objects being dragged). */
  exclude?: Set<string>;
}

/**
 * The object under a point (world mm). Outlines within `tol` win, topmost first; otherwise the
 * smallest closed area containing the point. Hidden and locked objects are skipped.
 */
export function hitTest(doc: Document, p: Vec, tol: number, o: HitOptions = {}): string | null {
  const leaves: { id: string; top: string; order: number; stroke: number; inside: boolean; area: number }[] = [];
  let order = 0;
  walk(doc.root, (l) => {
    if (l.node.hidden || l.node.locked || o.exclude?.has(l.node.id)) return "skip";
    if (l.node.type === "group") return;
    const box = nodeBox(l.node, l.world);
    order++;
    if (isEmptyBox(box) || p.x < box.minX - tol || p.x > box.maxX + tol || p.y < box.minY - tol || p.y > box.maxY + tol) return;
    const h = hitPaths(p, transformSubpaths(nodePaths(l.node), l.world), tol);
    const top = l.depth === 0 ? l.node.id : ancestors(doc.root, l.node.id).slice(-1)[0];
    if (h.stroke <= tol || h.inside || l.node.type === "image" || l.node.type === "text") {
      const insideBox = l.node.type === "image" || l.node.type === "text";
      leaves.push({ id: l.node.id, top, order, stroke: h.stroke, inside: h.inside || insideBox, area: h.area || (box.maxX - box.minX) * (box.maxY - box.minY) });
    }
  });
  const onStroke = leaves.filter((h) => h.stroke <= tol).sort((a, b) => b.order - a.order);
  const pick = onStroke[0] ?? leaves.filter((h) => h.inside).sort((a, b) => a.area - b.area || b.order - a.order)[0];
  if (!pick) return null;
  return o.deep ? pick.id : pick.top;
}

/** Top-level objects inside (or touching) a marquee. */
export function idsInBox(doc: Document, box: Box, mode: "contain" | "touch" = "touch", deep = false): string[] {
  const out: string[] = [];
  walk(doc.root, (l) => {
    if (l.node.hidden || l.node.locked) return "skip";
    if (deep && l.node.type === "group") return;
    const b = nodeBox(l.node, l.world);
    if (isEmptyBox(b)) return deep ? undefined : "skip";
    if (mode === "contain" ? boxContains(box, b) : boxesTouch(box, b)) out.push(l.node.id);
    if (!deep) return "skip";
  });
  return out;
}

// ---------- edits (mutate a draft) ----------

export function addNode(d: Document, node: SceneNode, parentId = "root", index?: number) {
  const parent = parentId === "root" ? d.root : (findNode(d.root, parentId) as GroupNode | null);
  if (!parent || parent.type !== "group") throw new Error("No such group");
  parent.children.splice(index ?? parent.children.length, 0, node);
}

export function removeNodes(d: Document, ids: string[]) {
  const set = new Set(ids);
  const rec = (g: GroupNode) => {
    g.children = g.children.filter((c) => !set.has(c.id));
    g.children.forEach((c) => { if (c.type === "group") rec(c); });
  };
  rec(d.root);
}

function cloneWithIds<T extends SceneNode>(n: T, id: IdFactory): T {
  const copy = JSON.parse(JSON.stringify(n)) as T;
  const rec = (x: SceneNode) => { x.id = id(); if (x.type === "group") x.children.forEach(rec); };
  rec(copy);
  return copy;
}

/** Copies placed right above their originals, moved by `offset` mm. Returns the new ids. */
export function duplicateNodes(d: Document, ids: string[], offset: Vec = { x: 0, y: 0 }, id: IdFactory = newId): string[] {
  const out: string[] = [];
  for (const nid of topLevel(d.root, ids)) {
    const l = locate(d.root, nid);
    if (!l) continue;
    const copy = cloneWithIds(l.node, id);
    const pw = l.parentWorld;
    copy.transform = mul(invert(pw), mul(translate(offset.x, offset.y), mul(pw, copy.transform)));
    l.parent.children.splice(l.parent.children.indexOf(l.node) + 1, 0, copy);
    out.push(copy.id);
  }
  return out;
}

/** Inserts copies of nodes (from the clipboard) at the top of the root, keeping their world position. */
export function pasteNodes(d: Document, nodes: SceneNode[], offset: Vec, id: IdFactory = newId, where: "front" | "back" = "front"): string[] {
  const copies = nodes.map((n) => { const c = cloneWithIds(n, id); c.transform = mul(translate(offset.x, offset.y), c.transform); return c; });
  if (where === "back") d.root.children.unshift(...copies); else d.root.children.push(...copies);
  return copies.map((c) => c.id);
}

/** A group in place of the selection. Objects keep their position on the page. */
export function groupNodes(d: Document, ids: string[], id: IdFactory = newId, role?: GroupNode["role"]): string | null {
  const top = topLevel(d.root, ids).map((i) => locate(d.root, i)!).filter(Boolean);
  if (!top.length) return null;
  const sameParent = top.every((l) => l.parent === top[0].parent);
  const parent = sameParent ? top[0].parent : d.root;
  const parentWorld = sameParent ? top[0].parentWorld : d.root.transform;
  const inv = invert(parentWorld);
  const ordered = [...top].sort((a, b) => order(d.root, a.node.id) - order(d.root, b.node.id));
  const insertAt = sameParent ? Math.max(...ordered.map((l) => l.parent.children.indexOf(l.node))) - ordered.length + 1 : d.root.children.length;
  const children = ordered.map((l) => ({ ...l.node, transform: sameParent ? l.node.transform : mul(inv, l.world) }) as SceneNode);
  removeNodes(d, ordered.map((l) => l.node.id));
  const group: GroupNode = { id: id(), type: "group", transform: [...I], layer: children[0].layer, children, ...(role ? { role } : {}) };
  parent.children.splice(Math.max(0, Math.min(insertAt, parent.children.length)), 0, group);
  return group.id;
}

function order(root: GroupNode, id: string): number {
  let k = 0, found = -1;
  walk(root, (l) => { if (l.node.id === id) found = k; k++; });
  return found;
}

/** Children take the group's transform and replace it. Returns the ids of the released children. */
export function ungroupNodes(d: Document, ids: string[]): string[] {
  const out: string[] = [];
  for (const gid of ids) {
    const l = locate(d.root, gid);
    if (!l || l.node.type !== "group") continue;
    const g = l.node;
    const kids = g.children.map((c) => ({ ...c, transform: mul(g.transform, c.transform) }) as SceneNode);
    const at = l.parent.children.indexOf(g);
    l.parent.children.splice(at, 1, ...kids);
    out.push(...kids.map((c) => c.id));
  }
  return out;
}

export type Arrange = "front" | "forward" | "backward" | "back";

export function arrangeNodes(d: Document, ids: string[], how: Arrange) {
  const groups = new Map<GroupNode, SceneNode[]>();
  for (const id of topLevel(d.root, ids)) {
    const l = locate(d.root, id);
    if (l) groups.set(l.parent, [...(groups.get(l.parent) ?? []), l.node]);
  }
  for (const [parent, nodes] of groups) {
    const set = new Set(nodes.map((n) => n.id));
    const kids = parent.children;
    if (how === "front" || how === "back") {
      const moving = kids.filter((c) => set.has(c.id)), rest = kids.filter((c) => !set.has(c.id));
      parent.children = how === "front" ? [...rest, ...moving] : [...moving, ...rest];
    } else if (how === "forward") {
      for (let k = kids.length - 2; k >= 0; k--) if (set.has(kids[k].id) && !set.has(kids[k + 1].id)) [kids[k], kids[k + 1]] = [kids[k + 1], kids[k]];
    } else {
      for (let k = 1; k < kids.length; k++) if (set.has(kids[k].id) && !set.has(kids[k - 1].id)) [kids[k], kids[k - 1]] = [kids[k - 1], kids[k]];
    }
  }
}

/** Moves a node to another group (layers panel drag). Keeps its position on the page. */
export function moveNode(d: Document, id: string, parentId: string, index: number) {
  const l = locate(d.root, id);
  const target = parentId === "root" ? d.root : (findNode(d.root, parentId) as GroupNode | null);
  if (!l || !target || target.type !== "group" || id === parentId || ancestors(d.root, parentId).includes(id)) return;
  const tw = parentId === "root" ? d.root.transform : locate(d.root, parentId)!.world;
  const node = { ...l.node, transform: mul(invert(tw), l.world) } as SceneNode;
  const sameParent = l.parent === target;
  const from = l.parent.children.indexOf(l.node);
  l.parent.children.splice(from, 1);
  const at = sameParent && from < index ? index - 1 : index;
  target.children.splice(Math.max(0, Math.min(at, target.children.length)), 0, node);
}

/** Applies a world-space transform to objects (move, scale, rotate…), whatever group they are in. */
export function transformNodes(d: Document, ids: string[], m: Mat) {
  transformNodesEach(d, ids.map((id) => [id, m]));
}

/** A separate world-space transform per object, applied as one step so clones moved with their source move once. */
export function transformNodesEach(d: Document, moves: [string, Mat][]) {
  const byId = new Map(moves);
  const moved = new Map<string, { local: Mat; node: SceneNode }>();
  for (const id of topLevel(d.root, moves.map(([id]) => id))) {
    const l = locate(d.root, id);
    if (!l) continue;
    const m = byId.get(id)!;
    l.node.transform = mul(invert(l.parentWorld), mul(m, l.world));
    moved.set(id, { local: mul(invert(l.parentWorld), mul(m, l.parentWorld)), node: l.node });
  }
  compensateClones(moved);
}

/**
 * A clone follows its source, so when both move in one transform the clone would move twice. Clones
 * inside the moved objects whose source was moved too undo the source's share (the source's move in
 * its parent space, applied before the clone's own transform).
 */
function compensateClones(moved: Map<string, { local: Mat; node: SceneNode }>) {
  if (moved.size < 2) return;
  const rec = (n: SceneNode) => {
    if (n.type === "clone") { const src = moved.get(n.source); if (src && src.node !== n) n.transform = mul(n.transform, invert(src.local)); }
    else if (n.type === "group") n.children.forEach(rec);
  };
  for (const { node } of moved.values()) rec(node);
}

export type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

/** Aligns objects to the selection bounds, or to `to` (a sheet or a key object) when given. */
export function alignNodes(d: Document, ids: string[], mode: AlignMode, to?: Box) {
  const top = topLevel(d.root, ids);
  const target = to ?? selectionBox(d, top);
  if (isEmptyBox(target)) return;
  const moves: [string, Mat][] = [];
  for (const id of top) {
    const b = worldBox(d.root, id);
    if (isEmptyBox(b)) continue;
    const c = boxCenter(b), tc = boxCenter(target);
    const dx = mode === "left" ? target.minX - b.minX : mode === "right" ? target.maxX - b.maxX : mode === "hcenter" ? tc.x - c.x : 0;
    const dy = mode === "top" ? target.minY - b.minY : mode === "bottom" ? target.maxY - b.maxY : mode === "vcenter" ? tc.y - c.y : 0;
    if (dx || dy) moves.push([id, translate(dx, dy)]);
  }
  transformNodesEach(d, moves);
}

/** Equal gaps between objects along an axis (the outermost two stay put). */
export function distributeNodes(d: Document, ids: string[], axis: "x" | "y") {
  const items = topLevel(d.root, ids).map((id) => ({ id, b: worldBox(d.root, id) })).filter((i) => !isEmptyBox(i.b));
  if (items.length < 3) return;
  const lo = axis === "x" ? "minX" : "minY", hi = axis === "x" ? "maxX" : "maxY";
  items.sort((a, b) => a.b[lo] - b.b[lo]);
  const span = items[items.length - 1].b[hi] - items[0].b[lo];
  const sizes = items.reduce((s, i) => s + (i.b[hi] - i.b[lo]), 0);
  const gap = (span - sizes) / (items.length - 1);
  let at = items[0].b[hi] + gap;
  const moves: [string, Mat][] = [];
  for (const i of items.slice(1, -1)) {
    const delta = at - i.b[lo];
    moves.push([i.id, axis === "x" ? translate(delta, 0) : translate(0, delta)]);
    at += i.b[hi] - i.b[lo] + gap;
  }
  transformNodesEach(d, moves);
}

/**
 * Live shapes and text become plain paths (same id, transform and layer), and Live Effects are applied
 * (baked into the path). With `keepEffects` the node's own geometry becomes the path and its effects
 * stay live (used before editing nodes); paths are then left alone.
 */
export function expandNodes(d: Document, ids: string[], keepEffects = false): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const l = locate(d.root, id);
    if (!l) continue;
    const n = l.node;
    const baked = !keepEffects && (n.type === "path" || n.type === "shape" || n.type === "text") && !!n.effects?.length;
    if (!(n.type === "shape" || n.type === "text" || n.type === "generator" || n.type === "clone" || baked)) continue;
    const subpaths = keepEffects ? nodeBasePaths(n) : nodePaths(n);
    if (!subpaths.length) continue;
    const effects = keepEffects && (n.type === "shape" || n.type === "text" || n.type === "clone") && n.effects?.length ? { effects: JSON.parse(JSON.stringify(n.effects)) } : {};
    const path: PathNode = { id: n.id, type: "path", transform: n.transform, layer: n.layer, subpaths: JSON.parse(JSON.stringify(subpaths)), ...(n.name ? { name: n.name } : {}), ...effects };
    l.parent.children[l.index] = path;
    out.push(id);
  }
  return out;
}

/** The point in an object's own space under a world point (for editing nodes of a transformed path). */
export function toLocal(root: GroupNode, id: string, p: Vec): Vec {
  const l = locate(root, id);
  return l ? apply(invert(l.world), p) : p;
}

export function allIds(root: GroupNode): string[] {
  const out: string[] = [];
  walk(root, (l) => { out.push(l.node.id); });
  return out;
}
