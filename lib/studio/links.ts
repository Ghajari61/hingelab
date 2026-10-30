/**
 * Clones: live copies that show another object's geometry. A clone stores its source's geometry
 * (after the source's Live Effects, in the source's parent space) in `cache`, so `nodePaths` stays a
 * pure function of the node; `syncLinks` brings every cache up to date after each edit. A clone whose
 * source is gone becomes a plain path, and clones that feed into each other in a loop are unlinked.
 * Live Effects that read another object (LinkedParams) get the same treatment: their `linkCache` is
 * refreshed in the same passes; a deleted source or a loop clears the cache and records `linkError`.
 * Text on a path / flowed text keeps the linked object's geometry in its `frame` (kept as it was when
 * that object is deleted or in a loop), and connectors are rerouted between their two objects (a
 * connector that loses an object, or sits in a loop, becomes a plain path).
 */
import { produce } from "immer";
import { newId } from "./doc";
import { I, invert, mul, nodePaths, transformSubpaths } from "./geom";
import { LINK_SPACE } from "./effects/meta";
import { connectorRoute, roundedRoute } from "./connectors";
import { findNode, locate, removeNodes, topLevel, type IdFactory } from "./scene";
import type { CloneNode, Document, GroupNode, LinkedParams, LiveEffect, Mat, PathNode, SceneNode, Subpath, TextNode } from "./types";

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
/** Linked-effect cache array → the source node object and the placement it was computed for. */
const madeFx = new WeakMap<object, { src: object; key: string }>();
/** Text frame / connector route array → the node object(s) and placements it was computed from. */
const madeFrame = new WeakMap<object, { src: object; key: string }>();
const madeRoute = new WeakMap<object, { a: object; b: object; key: string }>();

type FxNode = Extract<SceneNode, { type: "path" | "shape" | "text" | "clone" }>;
/** An effect that reads another object (Pattern Along Path, Interpolate, Live Boolean). */
interface FxLink { node: FxNode; world: Mat; effect: LiveEffect; params: LinkedParams; space: "page" | "local" }

interface Index { byId: Map<string, SceneNode>; world: Map<string, Mat>; clones: CloneNode[]; links: FxLink[]; framed: TextNode[]; connectors: PathNode[] }

/** The object a text is on or flowed into. */
const frameRef = (t: TextNode) => t.onPath || t.flowInto || "";

function indexDoc(root: GroupNode): Index {
  const byId = new Map<string, SceneNode>();
  const world = new Map<string, Mat>();
  const clones: CloneNode[] = [];
  const links: FxLink[] = [];
  const framed: TextNode[] = [];
  const connectors: PathNode[] = [];
  const rec = (n: SceneNode, pw: Mat) => {
    const w = mul(pw, n.transform);
    byId.set(n.id, n);
    world.set(n.id, w);
    if (n.type === "clone") clones.push(n);
    if (n.type === "text" && frameRef(n)) framed.push(n);
    if (n.type === "path" && n.connector) connectors.push(n);
    if ((n.type === "path" || n.type === "shape" || n.type === "text" || n.type === "clone") && n.effects) {
      for (const e of n.effects) {
        const space = LINK_SPACE[e.kind];
        const params = e.params as LinkedParams;
        if (space && typeof params.link === "string" && params.link) links.push({ node: n, world: w, effect: e, params, space });
      }
    }
    if (n.type === "group") n.children.forEach((c) => rec(c, w));
  };
  root.children.forEach((c) => rec(c, root.transform));
  return { byId, world, clones, links, framed, connectors };
}

/** Ids a node reads its geometry from: a clone's source, the objects its linked effects use, a text's path or frame, a connector's ends. */
function refsOf(n: SceneNode): string[] {
  const out: string[] = n.type === "clone" ? [n.source] : n.type === "text" && frameRef(n) ? [frameRef(n)] : n.type === "path" && n.connector ? [n.connector.from, n.connector.to] : [];
  if ((n.type === "path" || n.type === "shape" || n.type === "text" || n.type === "clone") && n.effects) {
    for (const e of n.effects) { const l = (e.params as LinkedParams).link; if (LINK_SPACE[e.kind] && typeof l === "string" && l) out.push(l); }
  }
  return out;
}

/** Nodes with links that feed into `targetId`: the target itself if it has links, or every such node inside a group target. */
function linkedWithin(targetId: string, ix: Index): string[] {
  const src = ix.byId.get(targetId);
  if (!src) return [];
  const out: string[] = [];
  const rec = (n: SceneNode) => { if (refsOf(n).length) out.push(n.id); if (n.type === "group") n.children.forEach(rec); };
  rec(src);
  return out;
}

/** Ids of linking nodes that sit on a dependency loop (a clone of itself or of its own group, objects reading each other…). */
function cyclic(ix: Index): Set<string> {
  const state = new Map<string, 1 | 2>();
  const out = new Set<string>();
  const nodes = [...new Set([...ix.clones.map((c) => c.id), ...ix.links.map((l) => l.node.id), ...ix.framed.map((t) => t.id), ...ix.connectors.map((p) => p.id)])];
  const graph = new Map(nodes.map((id) => [id, refsOf(ix.byId.get(id)!).flatMap((r) => linkedWithin(r, ix))]));
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
  for (const id of nodes) visit(id, []);
  return out;
}

type Action = { id: string; cache: Subpath[] } | { id: string; unlink: true }
  | { id: string; fx: string; linkCache?: Subpath[]; linkError?: LinkedParams["linkError"] }
  | { id: string; frame: Subpath[] } | { id: string; route: Subpath[] } | { id: string; unplug: true };

const matKey = (m: Mat) => m.map((v) => v.toPrecision(12)).join(",");

/** A linked effect's view of its source: in page space, or in the coordinates of the node carrying the effect. */
export function linkGeometry(src: SceneNode, srcWorld: Mat, nodeWorld: Mat, space: "page" | "local"): Subpath[] {
  return copySubs(transformSubpaths(nodePaths(src), space === "page" ? srcWorld : mul(invert(nodeWorld), srcWorld)));
}

/** One pass of updates for `doc`, or null when every clone and linked effect is current. */
function plan(doc: Document): Action[] | null {
  const ix = indexDoc(doc.root);
  if (!ix.clones.length && !ix.links.length && !ix.framed.length && !ix.connectors.length) return null;
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
  for (const l of ix.links) {
    const p = l.params, src = ix.byId.get(p.link!);
    const off = (err: "missing" | "cycle") => { if (p.linkCache || p.linkError !== err) out.push({ id: l.node.id, fx: l.effect.id, linkError: err }); };
    if (!src) { off("missing"); continue; }
    if (src.id === l.node.id || (loops.has(l.node.id) && linkedWithin(src.id, ix).some((id) => loops.has(id)))) { off("cycle"); continue; }
    const srcWorld = ix.world.get(src.id)!;
    const key = l.space === "page" ? matKey(srcWorld) : `${matKey(srcWorld)}|${matKey(l.world)}`;
    const seen = p.linkCache && madeFx.get(p.linkCache);
    if (seen && seen.src === src && seen.key === key && !p.linkError) continue;
    const geo = linkGeometry(src, srcWorld, l.world, l.space);
    if (p.linkCache && !p.linkError && sameSubs(p.linkCache, geo)) { madeFx.set(p.linkCache, { src, key }); continue; }
    madeFx.set(geo, { src, key });
    out.push({ id: l.node.id, fx: l.effect.id, linkCache: geo });
  }
  for (const t of ix.framed) {
    const src = ix.byId.get(frameRef(t));
    if (!src || src.id === t.id || loops.has(t.id)) continue;
    const srcWorld = ix.world.get(src.id)!, tw = ix.world.get(t.id)!;
    const key = `${matKey(srcWorld)}|${matKey(tw)}`;
    const seen = t.frame && madeFrame.get(t.frame);
    if (seen && seen.src === src && seen.key === key) continue;
    const geo = linkGeometry(src, srcWorld, tw, "local");
    if (t.frame && sameSubs(t.frame, geo)) { madeFrame.set(t.frame, { src, key }); continue; }
    madeFrame.set(geo, { src, key });
    out.push({ id: t.id, frame: geo });
  }
  for (const c of ix.connectors) {
    const { from, to, mode } = c.connector!;
    const a = ix.byId.get(from), b = ix.byId.get(to);
    if (!a || !b || from === to || loops.has(c.id)) { out.push({ id: c.id, unplug: true }); continue; }
    const aw = ix.world.get(a.id)!, bw = ix.world.get(b.id)!, cw = ix.world.get(c.id)!;
    const key = `${matKey(aw)}|${matKey(bw)}|${matKey(cw)}|${mode}`;
    const seen = madeRoute.get(c.subpaths);
    if (seen && seen.a === a && seen.b === b && seen.key === key) continue;
    const pts = connectorRoute(transformSubpaths(nodePaths(a), aw), transformSubpaths(nodePaths(b), bw), mode);
    if (!pts) continue;
    const inv = invert(cw);
    const local = pts.map((p) => ({ x: inv[0] * p.x + inv[2] * p.y + inv[4], y: inv[1] * p.x + inv[3] * p.y + inv[5] }));
    const geo: Subpath[] = [mode === "rounded" ? roundedRoute(local, 4) : { closed: false, nodes: local }];
    if (sameSubs(c.subpaths, geo)) { madeRoute.set(c.subpaths, { a, b, key }); continue; }
    madeRoute.set(geo, { a, b, key });
    out.push({ id: c.id, route: geo });
  }
  return out.length ? out : null;
}

function applyPlan(d: Document, actions: Action[]) {
  const want = new Map<string, Action[]>();
  for (const a of actions) want.set(a.id, [...(want.get(a.id) ?? []), a]);
  const rec = (g: GroupNode) => {
    g.children.forEach((n, k) => {
      if (n.type === "group") { rec(n); return; }
      for (const a of want.get(n.id) ?? []) {
        if ("fx" in a) {
          const node = g.children[k];
          const e = (node.type === "path" || node.type === "shape" || node.type === "text" || node.type === "clone") ? node.effects?.find((x) => x.id === a.fx) : undefined;
          if (!e) continue;
          const params = e.params as LinkedParams;
          if (a.linkCache) { params.linkCache = a.linkCache; delete params.linkError; } else { delete params.linkCache; params.linkError = a.linkError; }
        } else if ("frame" in a) { if (n.type === "text") n.frame = a.frame; }
        else if ("route" in a) { if (n.type === "path") n.subpaths = a.route; }
        else if ("unplug" in a) { if (n.type === "path") delete n.connector; }
        else if (n.type === "clone") {
          if ("unlink" in a) g.children[k] = toPath(n);
          else n.cache = a.cache;
        }
      }
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

/**
 * True when `cloneId` showing `sourceId` would make a loop (the source is the clone, contains it, or
 * shows it). Also used for linked effects: `cloneId` is then the object carrying the effect.
 */
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
    stack.push(...refsOf(n));
    if (n.type === "group") {
      const rec = (x: SceneNode) => { if (x.id === cloneId) stack.push(x.id); stack.push(...refsOf(x)); if (x.type === "group") x.children.forEach(rec); };
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
