/**
 * Path menu commands on a document draft: reverse, close, join, break apart, add anchor points,
 * compound paths and clipping masks. Objects keep their place on the page.
 */
import { newId } from "./doc";
import { insertAnchor, invert, nodePaths, segments, transformSubpaths } from "./geom";
import { groupNodes, locate, removeNodes, topLevel, ungroupNodes, type IdFactory } from "./scene";
import type { Anchor, Document, PathNode, Subpath, Vec } from "./types";

const near = (a: Vec, b: Vec, tol: number) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export function reverseSubpath(s: Subpath): Subpath {
  const nodes: Anchor[] = s.nodes.slice().reverse().map((a) => {
    const b: Anchor = { x: a.x, y: a.y };
    if (a.o) b.i = { ...a.o };
    if (a.i) b.o = { ...a.i };
    if (a.k) b.k = a.k;
    return b;
  });
  return { closed: s.closed, nodes };
}

/** Closes an open subpath; an end point lying on the start point is merged into it. */
export function closeSubpath(s: Subpath, tol = 1e-3): Subpath {
  if (s.closed || s.nodes.length < 2) return { closed: s.closed || s.nodes.length > 2, nodes: s.nodes.map((n) => ({ ...n })) };
  const nodes = s.nodes.map((n) => ({ ...n }));
  const first = nodes[0], last = nodes[nodes.length - 1];
  if (nodes.length > 2 && near(first, last, tol)) {
    nodes.pop();
    if (last.i) first.i = last.i; else delete first.i;
  }
  return { closed: true, nodes };
}

/** Every segment split in half (Path → Add Anchor Points). */
export function addMidpoints(s: Subpath): Subpath {
  let out = { closed: s.closed, nodes: s.nodes.map((n) => ({ ...n })) };
  const count = segments(s).length;
  for (let k = count - 1; k >= 0; k--) out = insertAnchor(out, k, 0.5);
  return out;
}

/**
 * Joins open subpaths end to end, always taking the nearest pair of free ends (ends closer than `tol`
 * are merged into one anchor, others are bridged with a straight segment). A single open subpath is closed.
 */
export function joinSubpaths(subs: Subpath[], tol = 0.01): Subpath[] {
  const closed = subs.filter((s) => s.closed).map(clone);
  const open = subs.filter((s) => !s.closed && s.nodes.length).map(clone);
  if (open.length === 1) return [...closed, closeSubpath(open[0], tol)];
  while (open.length > 1) {
    let best = { a: 0, b: 1, d: Infinity, ra: false, rb: false };
    for (let a = 0; a < open.length; a++) for (let b = 0; b < open.length; b++) {
      if (a === b) continue;
      const A = open[a].nodes, B = open[b].nodes;
      for (const ra of [false, true]) for (const rb of [false, true]) {
        const end = ra ? A[0] : A[A.length - 1], start = rb ? B[B.length - 1] : B[0];
        const d = Math.hypot(end.x - start.x, end.y - start.y);
        if (d < best.d - 1e-12) best = { a, b, d, ra, rb };
      }
    }
    const A = best.ra ? reverseSubpath(open[best.a]) : open[best.a];
    const B = best.rb ? reverseSubpath(open[best.b]) : open[best.b];
    const nodes = A.nodes.slice();
    const bn = B.nodes.slice();
    if (best.d <= tol) {
      const tail = nodes[nodes.length - 1], head = bn.shift()!;
      nodes[nodes.length - 1] = { ...tail, ...(head.o ? { o: head.o } : {}), k: tail.i && head.o ? "smooth" : "corner" };
      if (!head.o) delete nodes[nodes.length - 1].o;
    }
    const joined: Subpath = { closed: false, nodes: [...nodes, ...bn] };
    open.splice(Math.max(best.a, best.b), 1);
    open.splice(Math.min(best.a, best.b), 1, joined);
  }
  const last = open[0];
  const ends = last && last.nodes.length > 2 && near(last.nodes[0], last.nodes[last.nodes.length - 1], tol);
  return [...closed, ...(last ? [ends ? closeSubpath(last, tol) : last] : [])];
}

// ---------- document commands ----------

/** Path-like nodes (paths, shapes, text) of the selection with their outlines in world space. */
function worldOutlines(d: Document, ids: string[]) {
  return topLevel(d.root, ids).map((id) => locate(d.root, id)!).filter((l) => l && (l.node.type === "path" || l.node.type === "shape" || l.node.type === "text"))
    .map((l) => ({ l, subs: transformSubpaths(nodePaths(l.node), l.world) }));
}

/** Replaces the selection with one path holding `subs` (world space), placed where the first object was. */
function replaceWithPath(d: Document, items: ReturnType<typeof worldOutlines>, subs: Subpath[], id: string): string {
  const first = items[0].l;
  const path: PathNode = { id, type: "path", transform: first.node.transform, layer: first.node.layer, subpaths: transformSubpaths(subs, invert(first.world)) };
  const parent = first.parent, at = first.index;
  parent.children.splice(at, 1, path);
  removeNodes(d, items.slice(1).map((i) => i.l.node.id));
  return id;
}

export function reverseNodes(d: Document, ids: string[]) {
  for (const id of ids) {
    const n = locate(d.root, id)?.node;
    if (n?.type === "path") n.subpaths = n.subpaths.map(reverseSubpath);
  }
}

export function closeNodes(d: Document, ids: string[]) {
  for (const id of ids) {
    const n = locate(d.root, id)?.node;
    if (n?.type === "path") n.subpaths = n.subpaths.map((s) => closeSubpath(s));
  }
}

export function addAnchorNodes(d: Document, ids: string[]) {
  for (const id of ids) {
    const n = locate(d.root, id)?.node;
    if (n?.type === "path") n.subpaths = n.subpaths.map(addMidpoints);
  }
}

/** Path → Join. Returns the id of the joined path, or null when there is nothing to join. */
export function joinNodes(d: Document, ids: string[], tol = 0.01): string | null {
  const items = worldOutlines(d, ids).filter((i) => i.l.node.type === "path");
  if (!items.length || !items.some((i) => i.subs.some((s) => !s.closed))) return null;
  return replaceWithPath(d, items, joinSubpaths(items.flatMap((i) => i.subs), tol), items[0].l.node.id);
}

/** Object → Compound Path → Make: the outlines become one path (holes by even-odd). */
export function makeCompound(d: Document, ids: string[]): string | null {
  const items = worldOutlines(d, ids);
  if (items.length < 2) return null;
  return replaceWithPath(d, items, items.flatMap((i) => i.subs), items[0].l.node.id);
}

/** Path → Break Apart / Release Compound Path: one path per subpath. Returns all resulting ids. */
export function breakApartNodes(d: Document, ids: string[], id: IdFactory = newId): string[] {
  const out: string[] = [];
  for (const nid of topLevel(d.root, ids)) {
    const l = locate(d.root, nid);
    if (!l || l.node.type !== "path") continue;
    const node = l.node;
    if (node.subpaths.length < 2) { out.push(node.id); continue; }
    const parts: PathNode[] = node.subpaths.map((s, k) => ({ ...node, id: k === 0 ? node.id : id(), subpaths: [clone(s)] }));
    l.parent.children.splice(l.index, 1, ...parts);
    out.push(...parts.map((p) => p.id));
  }
  return out;
}

/** Object → Clipping Mask → Make: the topmost selected object clips the others. */
export function makeClip(d: Document, ids: string[], id: IdFactory = newId): string | null {
  if (topLevel(d.root, ids).length < 2) return null;
  const gid = groupNodes(d, ids, id, "clip");
  const g = gid ? locate(d.root, gid)?.node : null;
  if (!g || g.type !== "group") return null;
  g.children.unshift(g.children.pop()!);
  return gid;
}

export function releaseClip(d: Document, ids: string[]): string[] {
  const clips = ids.filter((i) => { const n = locate(d.root, i)?.node; return n?.type === "group" && n.role === "clip"; });
  return ungroupNodes(d, clips);
}

/** Object → Reset Bounding Box: keeps the outline where it is but makes the transform a plain move. */
export function resetBoxNodes(d: Document, ids: string[]) {
  for (const nid of ids) {
    const l = locate(d.root, nid);
    if (!l || l.node.type !== "path") continue;
    const t = l.node.transform;
    const lin: typeof t = [t[0], t[1], t[2], t[3], 0, 0];
    l.node.subpaths = transformSubpaths(l.node.subpaths, lin);
    l.node.transform = [1, 0, 0, 1, t[4], t[5]];
  }
}
