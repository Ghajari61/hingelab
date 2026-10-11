/**
 * Clones: live copies that show another object's geometry. A clone stores its source's geometry
 * (after the source's Live Effects, in the source's parent space) in `cache`, so `nodePaths` stays a
 * pure function of the node; `syncLinks` brings every cache up to date after each edit. A clone whose
 * source is gone becomes a plain path, and clones that feed into each other in a loop are unlinked.
 */
import { produce } from "immer";
import { newId } from "./doc";
import { I, invert, mul, nodePaths, transformSubpaths } from "./geom";
import { findNode, locate, removeNodes, topLevel, type IdFactory } from "./scene";
import type { CloneNode, Document, GroupNode, Mat, PathNode, SceneNode, Subpath } from "./types";

/** What a clone of `src` shows before its own transform: the source's paths in the source's parent space. */
export function sourceGeometry(src: SceneNode): Subpath[] {
  return copySubs(transformSubpaths(nodePaths(src), src.transform));
}

const copySubs = (subs: Subpath[]): Subpath[] => subs.map((s) => ({
  closed: s.closed,
  nodes: s.nodes.map((a) => ({ x: a.x, y: a.y, ...(a.i ? { i: { x: a.i.x, y: a.i.y } } : {}), ...(a.o ? { o: { x: a.o.x, y: a.o.y } } : {}), ...(a.k ? { k: a.k } : {}) })),
}));

function sameSubs(a: Subpath[], b: Subpath[]): boolean {
  if (a.length !== b.length) return false;
  const pt = (p?: { x: number; y: number }, q?: { x: number; y: number }) => (!p && !q) || (!!p && !!q && Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9);
  return a.every((s, k) => {
    const t = b[k];
    return s.closed === t.closed && s.nodes.length === t.nodes.length && s.nodes.every((n, j) => pt(n, t.nodes[j]) && pt(n.i, t.nodes[j].i) && pt(n.o, t.nodes[j].o) && n.k === t.nodes[j].k);
  });
}

/** cache array → the source node object it was computed from (immer keeps unchanged nodes identical). */
const made = new WeakMap<object, object>();

interface Index { byId: Map<string, SceneNode>; clones: CloneNode[] }

function indexDoc(root: GroupNode): Index {
  const byId = new Map<string, SceneNode>();
  const clones: CloneNode[] = [];
  const rec = (n: SceneNode) => {
    byId.set(n.id, n);
    if (n.type === "clone") clones.push(n);
    else if (n.type === "group") n.children.forEach(rec);
  };
  root.children.forEach(rec);
  return { byId, clones };
}

/** Clones whose geometry feeds into clone `c`: its source if that is a clone, or every clone inside a group source. */
function deps(c: CloneNode, ix: Index): string[] {
  const src = ix.byId.get(c.source);
  if (!src) return [];
  if (src.type === "clone") return [src.id];
  const out: string[] = [];
  const rec = (n: SceneNode) => { if (n.type === "clone") out.push(n.id); else if (n.type === "group") n.children.forEach(rec); };
  if (src.type === "group") rec(src);
  return out;
}

/** Ids of clones that sit on a dependency loop (a clone of itself, of its own group, or clones of each other). */
function cyclic(ix: Index): Set<string> {
  const state = new Map<string, 1 | 2>();
  const out = new Set<string>();
  const graph = new Map(ix.clones.map((c) => [c.id, deps(c, ix)]));
  const visit = (id: string, stack: string[]) => {
    const s = state.get(id);
    if (s === 2) return;
    if (s === 1) { for (const x of stack.slice(stack.indexOf(id))) out.add(x); return; }
    state.set(id, 1);
    stack.push(id);
    for (const next of graph.get(id) ?? []) visit(next, stack);
    stack.pop();
    state.set(id, 2);
  };
  for (const c of ix.clones) visit(c.id, []);
  return out;
}

type Action = { id: string; cache: Subpath[] } | { id: string; unlink: true };

/** One pass of updates for `doc`, or null when every clone is current. */
function plan(doc: Document): Action[] | null {
  const ix = indexDoc(doc.root);
  if (!ix.clones.length) return null;
  const loops = cyclic(ix);
  const out: Action[] = [];
  for (const c of ix.clones) {
    const src = ix.byId.get(c.source);
    if (!src || loops.has(c.id)) { out.push({ id: c.id, unlink: true }); continue; }
    if (c.cache && made.get(c.cache) === src) continue;
    const geo = sourceGeometry(src);
    if (c.cache && sameSubs(c.cache, geo)) { made.set(c.cache, src); continue; }
    made.set(geo, src);
    out.push({ id: c.id, cache: geo });
  }
  return out.length ? out : null;
}

function applyPlan(d: Document, actions: Action[]) {
  const want = new Map(actions.map((a) => [a.id, a]));
  const rec = (g: GroupNode) => {
    g.children.forEach((n, k) => {
      if (n.type === "group") { rec(n); return; }
      const a = want.get(n.id);
      if (!a || n.type !== "clone") return;
      if ("unlink" in a) g.children[k] = toPath(n);
      else n.cache = a.cache;
    });
  };
  rec(d.root);
}

/** The clone as a plain path with the geometry it shows now; its Live Effects stay live. */
function toPath(n: CloneNode): PathNode {
  const p: PathNode = { id: n.id, type: "path", transform: [...n.transform] as PathNode["transform"], layer: n.layer, subpaths: copySubs(n.cache ?? []) };
  if (n.name) p.name = n.name;
  if (n.hidden) p.hidden = true;
  if (n.locked) p.locked = true;
  if (n.effects?.length) p.effects = JSON.parse(JSON.stringify(n.effects));
  return p;
}

const MAX_PASSES = 32;

/**
 * Recipes that bring the clones of `doc` up to date, one per pass (a clone of a clone updates one pass
 * after its source). Returns null when nothing needs to change. For history, each recipe runs on the
 * result of the previous one.
 */
export function* linkPasses(doc: Document): Generator<(d: Document) => void, void, Document> {
  let cur = doc;
  for (let k = 0; k < MAX_PASSES; k++) {
    const actions = plan(cur);
    if (!actions) return;
    cur = yield (d: Document) => { applyPlan(d, actions); };
  }
}

/** The document with every clone's cache current (the same object when nothing changed). */
export function syncLinks(doc: Document): Document {
  const it = linkPasses(doc);
  let cur = doc;
  for (let r = it.next(cur); !r.done; r = it.next(cur)) cur = produce(cur, r.value);
  return cur;
}

// ---------- commands (mutate a draft) ----------

/** True when `cloneId` showing `sourceId` would make a loop (the source is the clone, contains it, or shows it). */
export function wouldCycle(d: Document, cloneId: string, sourceId: string): boolean {
  const ix = indexDoc(d.root);
  const seen = new Set<string>();
  const stack = [sourceId];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === cloneId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const n = ix.byId.get(id);
    if (!n) continue;
    if (n.type === "clone") stack.push(n.source);
    else if (n.type === "group") {
      const rec = (x: SceneNode) => { if (x.id === cloneId) stack.push(x.id); if (x.type === "clone") stack.push(x.source); else if (x.type === "group") x.children.forEach(rec); };
      n.children.forEach(rec);
    }
  }
  return false;
}

/** A clone of each top-level object, right above it and exactly on it. Returns the clones' ids. */
export function cloneNodes(d: Document, ids: string[], id: IdFactory = newId): string[] {
  const out: string[] = [];
  for (const nid of topLevel(d.root, ids)) {
    const l = locate(d.root, nid);
    if (!l) continue;
    const c: CloneNode = { id: id(), type: "clone", source: nid, transform: [...I], layer: l.node.layer, cache: sourceGeometry(l.node) };
    l.parent.children.splice(l.parent.children.indexOf(l.node) + 1, 0, c);
    out.push(c.id);
  }
  return out;
}

/** Clones become plain paths (same id, place and layer). Returns the ids that were unlinked. */
export function unlinkClones(d: Document, ids: string[]): string[] {
  const out: string[] = [];
  for (const nid of ids) {
    const l = locate(d.root, nid);
    if (!l || l.node.type !== "clone") continue;
    l.parent.children[l.index] = toPath(l.node);
    out.push(nid);
  }
  return out;
}

/** The sources of the selected clones (existing ones only, without repeats). */
export function originalsOf(d: Document, ids: string[]): string[] {
  const out: string[] = [];
  for (const nid of ids) {
    const n = findNode(d.root, nid);
    if (n?.type === "clone" && findNode(d.root, n.source) && !out.includes(n.source)) out.push(n.source);
  }
  return out;
}

/** Points the selected clones at another source; clones that would loop are left alone. Returns the relinked ids. */
export function relinkClones(d: Document, ids: string[], sourceId: string): string[] {
  if (!findNode(d.root, sourceId)) return [];
  const out: string[] = [];
  for (const nid of ids) {
    const n = findNode(d.root, nid);
    if (n?.type !== "clone" || n.source === sourceId || wouldCycle(d, nid, sourceId)) continue;
    n.source = sourceId;
    delete n.cache;
    out.push(nid);
  }
  return out;
}

/** Every clone (anywhere) whose source is one of `ids`. */
export function clonesOf(d: Document, ids: string[]): string[] {
  const set = new Set(ids);
  return indexDoc(d.root).clones.filter((c) => set.has(c.source)).map((c) => c.id);
}

/** Deletes the clones of the selected originals and any group left empty by that. Returns how many clones went. */
export function removeClonesOf(d: Document, ids: string[]): number {
  const gone = clonesOf(d, ids);
  if (!gone.length) return 0;
  const wasEmpty = new Set<string>();
  const mark = (g: GroupNode) => g.children.forEach((c) => { if (c.type === "group") { if (!c.children.length) wasEmpty.add(c.id); mark(c); } });
  mark(d.root);
  removeNodes(d, gone);
  const prune = (g: GroupNode) => {
    g.children.forEach((c) => { if (c.type === "group") prune(c); });
    g.children = g.children.filter((c) => c.type !== "group" || c.children.length > 0 || wasEmpty.has(c.id));
  };
  prune(d.root);
  return gone.length;
}

/** The transform that places a copy made by world matrix `m` from a node in parent space `pw`: pw⁻¹ · m · pw. */
export const inParent = (pw: Mat, m: Mat): Mat => mul(invert(pw), mul(m, pw));
