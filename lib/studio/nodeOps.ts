/**
 * Node editing on selected anchors (Direct Selection): node types, insert, break, join, join with a
 * segment, delete segment, straighten / curve segments and transforms of a node selection. Pure
 * functions over subpaths; selected anchors are carried through each edit as a mark on the anchor.
 */
import { apply, boxCenter, emptyBox, addPoint, insertAnchor, invert, isEmptyBox, mul, nearestOnSubpaths, nodeBasePaths, type Box } from "./geom";
import { expandNodes, findNode, locate, removeNodes } from "./scene";
import type { Anchor, Document, Mat, NodeKind, PathNode, Subpath, Vec } from "./types";

export interface NodeRef { id: string; sub: number; idx: number }

/** An anchor that may carry the selection mark `s`. */
export type MAnchor = Anchor & { s?: true };
export interface MSub { closed: boolean; nodes: MAnchor[] }

const d2 = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const near = (a: Vec, b: Vec) => d2(a, b) < 1e-9;

export function mark(subs: Subpath[], sel: { sub: number; idx: number }[]): MSub[] {
  const on = new Set(sel.map((r) => `${r.sub}:${r.idx}`));
  return subs.map((s, si) => ({ closed: s.closed, nodes: s.nodes.map((a, k) => ({ ...a, ...(on.has(`${si}:${k}`) ? { s: true as const } : {}) })) }));
}

export function unmark(ms: MSub[]): { subs: Subpath[]; sel: { sub: number; idx: number }[] } {
  const sel: { sub: number; idx: number }[] = [];
  const subs = ms.map((s, si) => ({
    closed: s.closed,
    nodes: s.nodes.map((a, k) => { const { s: on, ...rest } = a; if (on) sel.push({ sub: si, idx: k }); return rest as Anchor; }),
  }));
  return { subs, sel };
}

const segCount = (s: MSub) => (s.closed ? s.nodes.length : s.nodes.length - 1);
/** Segments whose two end nodes are both selected. */
const selectedSegments = (s: MSub) => Array.from({ length: Math.max(0, segCount(s)) }, (_, k) => k).filter((k) => s.nodes[k].s && s.nodes[(k + 1) % s.nodes.length].s);

// ---------- node types ----------

/** Auto-smooth handles: along the direction from the previous to the next node, a third of each neighbouring chord long. */
export function autoHandles(s: Subpath, k: number): { i?: Vec; o?: Vec } {
  const n = s.nodes.length, a = s.nodes[k];
  const hasPrev = s.closed ? n > 1 : k > 0, hasNext = s.closed ? n > 1 : k < n - 1;
  const prev = s.nodes[(k - 1 + n) % n], next = s.nodes[(k + 1) % n];
  if (hasPrev && hasNext) {
    const dx = next.x - prev.x, dy = next.y - prev.y, l = Math.hypot(dx, dy);
    if (l < 1e-12) return {};
    const ux = dx / l, uy = dy / l, li = d2(a, prev) / 3, lo = d2(next, a) / 3;
    return { i: { x: a.x - ux * li, y: a.y - uy * li }, o: { x: a.x + ux * lo, y: a.y + uy * lo } };
  }
  if (hasNext) return { o: { x: a.x + (next.x - a.x) / 3, y: a.y + (next.y - a.y) / 3 } };
  if (hasPrev) return { i: { x: a.x + (prev.x - a.x) / 3, y: a.y + (prev.y - a.y) / 3 } };
  return {};
}

/** Recomputes the handles of every auto-smooth node (call after any edit that moves nodes). */
export function refreshAuto<T extends Subpath | MSub>(s: T): T {
  if (!s.nodes.some((a) => a.k === "auto")) return s;
  const nodes = s.nodes.map((a, k) => {
    if (a.k !== "auto") return a;
    const h = autoHandles(s, k);
    const b = { ...a };
    delete b.i; delete b.o;
    return { ...b, ...h };
  });
  return { ...s, nodes } as T;
}

/** Sets the node type of an anchor: corner keeps its handles but frees them, smooth lines them up, symmetric also evens their lengths, auto follows the neighbours. */
export function setKind(s: Subpath | MSub, k: number, kind: NodeKind): MAnchor {
  const a: MAnchor = { ...s.nodes[k], k: kind };
  if (kind === "corner") return a;
  const auto = autoHandles(s, k);
  if (kind === "auto") { delete a.i; delete a.o; return { ...a, ...auto }; }
  const i = a.i && !near(a.i, a) ? a.i : auto.i, o = a.o && !near(a.o, a) ? a.o : auto.o;
  if (!i || !o) { if (i) a.i = i; if (o) a.o = o; return a; }
  let ux = o.x - i.x, uy = o.y - i.y;
  const ul = Math.hypot(ux, uy);
  if (ul < 1e-12) return a;
  ux /= ul; uy /= ul;
  let li = d2(i, a), lo = d2(o, a);
  if (kind === "symmetric") li = lo = (li + lo) / 2;
  a.i = { x: a.x - ux * li, y: a.y - uy * li };
  a.o = { x: a.x + ux * lo, y: a.y + uy * lo };
  return a;
}

export function setKinds(ms: MSub[], kind: NodeKind): MSub[] | null {
  if (!ms.some((s) => s.nodes.some((a) => a.s))) return null;
  return ms.map((s) => refreshAuto({ closed: s.closed, nodes: s.nodes.map((a, k) => (a.s ? setKind(s, k, kind) : a)) }));
}

// ---------- insert, break, join, delete segment ----------

/** Inserts a node in the middle of every segment whose two ends are selected; the new nodes are selected too. */
export function insertMidpoints(ms: MSub[]): MSub[] | null {
  let any = false;
  const out = ms.map((s) => {
    let cur: MSub = s;
    for (const k of selectedSegments(s).reverse()) {
      cur = insertAnchor(cur, k, 0.5) as MSub;
      cur.nodes[k + 1] = { ...cur.nodes[k + 1], s: true };
      any = true;
    }
    return cur;
  });
  return any ? out.map(refreshAuto) : null;
}

const strip = (a: MAnchor, side: "i" | "o"): MAnchor => { const c = { ...a }; delete c[side]; return c; };

/** Breaks the path at every selected node: closed subpaths open there, open ones split in two (both new ends stay selected). */
export function breakAt(ms: MSub[]): MSub[] | null {
  let any = false;
  const out: MSub[] = [];
  for (const s of ms) {
    let nodes = s.nodes;
    if (s.closed) {
      const k0 = nodes.findIndex((a) => a.s);
      if (k0 < 0) { out.push(s); continue; }
      const ring = [...nodes.slice(k0), ...nodes.slice(0, k0)];
      nodes = [strip(ring[0], "i"), ...ring.slice(1), strip(ring[0], "o")];
      any = true;
    }
    let start = 0;
    for (let k = 1; k < nodes.length - 1; k++) {
      if (!nodes[k].s) continue;
      out.push({ closed: false, nodes: [...nodes.slice(start, k), strip(nodes[k], "o")] });
      nodes = [...nodes.slice(0, k), strip(nodes[k], "i"), ...nodes.slice(k + 1)];
      start = k;
      any = true;
    }
    out.push(s.closed || start > 0 ? { closed: false, nodes: nodes.slice(start) } : s);
  }
  return any ? out.map(refreshAuto) : null;
}

const reverseM = (s: MSub): MSub => ({
  closed: s.closed,
  nodes: s.nodes.slice().reverse().map((a) => { const b: MAnchor = { ...a }; delete b.i; delete b.o; if (a.o) b.i = a.o; if (a.i) b.o = a.i; return b; }),
});

/** The two selected end nodes of open subpaths, or null. */
function selectedEnds(ms: MSub[]): { sub: number; idx: number }[] | null {
  const sel: { sub: number; idx: number }[] = [];
  ms.forEach((s, si) => s.nodes.forEach((a, k) => { if (a.s) sel.push({ sub: si, idx: k }); }));
  if (sel.length !== 2) return null;
  const end = (r: { sub: number; idx: number }) => !ms[r.sub].closed && (r.idx === 0 || r.idx === ms[r.sub].nodes.length - 1);
  if (!sel.every(end)) return null;
  if (sel[0].sub === sel[1].sub && sel[0].idx === sel[1].idx) return null;
  return sel;
}

/**
 * Joins two selected end nodes: `merge` puts them together as one node halfway between them; otherwise
 * a straight segment connects them. Two ends of one subpath close it.
 */
export function joinEnds(ms: MSub[], merge: boolean): MSub[] | null {
  const sel = selectedEnds(ms);
  if (!sel) return null;
  const shift = (a: MAnchor, to: Vec): MAnchor => {
    const dx = to.x - a.x, dy = to.y - a.y;
    return { ...a, x: to.x, y: to.y, ...(a.i ? { i: { x: a.i.x + dx, y: a.i.y + dy } } : {}), ...(a.o ? { o: { x: a.o.x + dx, y: a.o.y + dy } } : {}) };
  };
  if (sel[0].sub === sel[1].sub) {
    const s = ms[sel[0].sub];
    if (s.nodes.length < 2) return null;
    let nodes = s.nodes.slice();
    if (merge && s.nodes.length > 2) {
      const f = nodes[0], l = nodes[nodes.length - 1], mid = { x: (f.x + l.x) / 2, y: (f.y + l.y) / 2 };
      const fm = shift(f, mid), lm = shift(l, mid);
      const j: MAnchor = { ...fm, k: lm.i && fm.o ? "smooth" : "corner", s: true };
      delete j.i;
      if (lm.i) j.i = lm.i;
      nodes = [j, ...nodes.slice(1, -1)];
    }
    return ms.map((x, k) => (k === sel[0].sub ? refreshAuto({ closed: true, nodes }) : x));
  }
  let A = ms[sel[0].sub], B = ms[sel[1].sub];
  if (sel[0].idx === 0 && A.nodes.length > 1) A = reverseM(A);
  if (sel[1].idx !== 0 && B.nodes.length > 1) B = reverseM(B);
  let nodes: MAnchor[];
  if (merge) {
    const a = A.nodes[A.nodes.length - 1], b = B.nodes[0], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const am = shift(a, mid), bm = shift(b, mid);
    const j: MAnchor = { ...am, k: am.i && bm.o ? "smooth" : "corner", s: true };
    delete j.o;
    if (bm.o) j.o = bm.o;
    nodes = [...A.nodes.slice(0, -1), j, ...B.nodes.slice(1)];
  } else nodes = [...A.nodes, ...B.nodes];
  const joined = refreshAuto({ closed: false, nodes });
  return ms.flatMap((x, k) => (k === sel[0].sub ? [joined] : k === sel[1].sub ? [] : [x]));
}

/** Deletes every segment whose two end nodes are selected: a closed subpath opens there, an open one splits. */
export function deleteSegments(ms: MSub[]): MSub[] | null {
  let any = false;
  const out: MSub[] = [];
  for (const s of ms) {
    const segs = selectedSegments(s);
    if (!segs.length) { out.push(s); continue; }
    any = true;
    let nodes = s.nodes;
    let cuts = segs;
    if (s.closed) {
      const k0 = segs[0], n = nodes.length, from = (k0 + 1) % n;
      nodes = [...nodes.slice(from), ...nodes.slice(0, from)];
      nodes = [strip(nodes[0], "i"), ...nodes.slice(1, -1), ...(nodes.length > 1 ? [strip(nodes[nodes.length - 1], "o")] : [])];
      cuts = segs.slice(1).map((k) => (k - from + n) % n);
    }
    let start = 0;
    for (const k of cuts.sort((a, b) => a - b)) {
      const piece = [...nodes.slice(start, k), strip(nodes[k], "o")];
      if (piece.length > 1) out.push({ closed: false, nodes: piece });
      nodes = [...nodes.slice(0, k + 1), strip(nodes[k + 1], "i"), ...nodes.slice(k + 2)];
      start = k + 1;
    }
    const rest = nodes.slice(start);
    if (rest.length > 1) out.push({ closed: false, nodes: rest });
  }
  return any ? out.map(refreshAuto) : null;
}

// ---------- segments ----------

/** Removes the handles of segments between selected nodes (straight lines). */
export function straightenSegments(ms: MSub[]): MSub[] | null {
  let any = false;
  const out = ms.map((s) => {
    const segs = selectedSegments(s);
    if (!segs.length) return s;
    const nodes = s.nodes.map((a) => ({ ...a }));
    const n = nodes.length;
    for (const k of segs) {
      const a = nodes[k], b = nodes[(k + 1) % n];
      if (!a.o && !b.i) continue;
      delete a.o; delete b.i;
      any = true;
    }
    for (const a of nodes) if (a.k === "auto" || (!a.i && !a.o)) a.k = "corner";
    return { closed: s.closed, nodes };
  });
  return any ? out.map(refreshAuto) : null;
}

/** Gives straight segments between selected nodes curve handles a third of the way along. */
export function curveSegments(ms: MSub[]): MSub[] | null {
  let any = false;
  const out = ms.map((s) => {
    const segs = selectedSegments(s);
    if (!segs.length) return s;
    const nodes = s.nodes.map((a) => ({ ...a }));
    const n = nodes.length;
    for (const k of segs) {
      const a = nodes[k], b = nodes[(k + 1) % n];
      if (a.o && b.i) continue;
      const dx = (b.x - a.x) / 3, dy = (b.y - a.y) / 3;
      if (!a.o) a.o = { x: a.x + dx, y: a.y + dy };
      if (!b.i) b.i = { x: b.x - dx, y: b.y - dy };
      any = true;
    }
    return { closed: s.closed, nodes };
  });
  return any ? out : null;
}

/** Applies `m` to the selected nodes and their handles. */
export function transformSelected(ms: MSub[], m: Mat): MSub[] | null {
  let any = false;
  const t = (p: Vec) => apply(m, p);
  const out = ms.map((s) => ({
    closed: s.closed,
    nodes: s.nodes.map((a) => {
      if (!a.s) return a;
      any = true;
      return { ...a, ...t(a), ...(a.i ? { i: t(a.i) } : {}), ...(a.o ? { o: t(a.o) } : {}) };
    }),
  }));
  return any ? out.map(refreshAuto) : null;
}

// ---------- document level ----------

/** World-space bounds of the referenced anchors. */
export function anchorsBox(d: Document, refs: NodeRef[]): Box {
  const b = emptyBox();
  for (const r of refs) {
    const l = locate(d.root, r.id);
    if (!l || (l.node.type !== "path" && l.node.type !== "shape")) continue;
    const a = nodeBasePaths(l.node)[r.sub]?.nodes[r.idx];
    if (a) addPoint(b, apply(l.world, a));
  }
  return b;
}

export const anchorsCenter = (d: Document, refs: NodeRef[]): Vec | null => { const b = anchorsBox(d, refs); return isEmptyBox(b) ? null : boxCenter(b); };

/**
 * Runs a node edit on the anchors `refs` (live shapes are expanded to paths first). `fn` gets the
 * marked subpaths of one object and the object's world matrix and returns new ones, or null for no
 * change. Objects left without subpaths are deleted. Returns the selected anchors afterwards.
 */
export function editAnchors(d: Document, refs: NodeRef[], fn: (ms: MSub[], world: Mat) => MSub[] | null): NodeRef[] {
  const byId = new Map<string, NodeRef[]>();
  for (const r of refs) byId.set(r.id, [...(byId.get(r.id) ?? []), r]);
  const out: NodeRef[] = [];
  const drop: string[] = [];
  for (const [id, rs] of byId) {
    const l = locate(d.root, id);
    if (!l || (l.node.type !== "path" && l.node.type !== "shape")) continue;
    const res = fn(mark(nodeBasePaths(l.node), rs), l.world);
    if (!res) { out.push(...rs); continue; }
    if (l.node.type === "shape") expandNodes(d, [id], true);
    const n = findNode(d.root, id) as PathNode;
    const u = unmark(res.filter((s) => s.nodes.length > 0));
    n.subpaths = u.subs;
    if (!u.subs.length) drop.push(id);
    else out.push(...u.sel.map((r) => ({ id, ...r })));
  }
  if (drop.length) removeNodes(d, drop);
  return out;
}

function refSubs(d: Document, refs: NodeRef[]): Map<string, Subpath[]> {
  const out = new Map<string, Subpath[]>();
  for (const r of refs) {
    if (out.has(r.id)) continue;
    const n = findNode(d.root, r.id);
    if (n && (n.type === "path" || n.type === "shape")) out.set(r.id, nodeBasePaths(n));
  }
  return out;
}

/** True when two selected anchors are the ends of one segment. */
export function hasSelectedSegment(d: Document, refs: NodeRef[]): boolean {
  const subs = refSubs(d, refs);
  const on = new Set(refs.map((r) => `${r.id}:${r.sub}:${r.idx}`));
  return refs.some((r) => {
    const s = subs.get(r.id)?.[r.sub];
    if (!s) return false;
    const n = s.nodes.length, j = r.idx + 1;
    return (j < n || (s.closed && n > 1)) && on.has(`${r.id}:${r.sub}:${j % n}`);
  });
}

/** True when exactly two end nodes of open subpaths are selected. */
export function canJoinEnds(d: Document, refs: NodeRef[]): boolean {
  if (refs.length !== 2 || (refs[0].id === refs[1].id && refs[0].sub === refs[1].sub && refs[0].idx === refs[1].idx)) return false;
  const subs = refSubs(d, refs);
  return refs.every((r) => { const s = subs.get(r.id)?.[r.sub]; return !!s && !s.closed && (r.idx === 0 || r.idx === s.nodes.length - 1); });
}

/** Moves every subpath of the path `from` into the path `into` (same place on the page) and deletes `from`; returns the subpath offset. */
export function mergePathInto(d: Document, into: string, from: string): number | null {
  for (const id of [into, from]) if (findNode(d.root, id)?.type === "shape") expandNodes(d, [id], true);
  const a = locate(d.root, into), b = locate(d.root, from);
  if (!a || !b || a.node.type !== "path" || b.node.type !== "path") return null;
  const m = mul(invert(a.world), b.world);
  const offset = a.node.subpaths.length;
  a.node.subpaths.push(...b.node.subpaths.map((s) => ({ closed: s.closed, nodes: s.nodes.map((x) => ({ ...x, ...apply(m, x), ...(x.i ? { i: apply(m, x.i) } : {}), ...(x.o ? { o: apply(m, x.o) } : {}) })) })));
  removeNodes(d, [from]);
  return offset;
}

/** Join commands across two objects: both selected ends' paths become one first. */
export function joinAnchors(d: Document, refs: NodeRef[], merge: boolean): NodeRef[] | null {
  if (refs.length !== 2) return null;
  let rs = refs;
  if (rs[0].id !== rs[1].id) {
    const off = mergePathInto(d, rs[0].id, rs[1].id);
    if (off === null) return null;
    rs = [rs[0], { id: rs[0].id, sub: rs[1].sub + off, idx: rs[1].idx }];
  }
  let ok = false;
  const out = editAnchors(d, rs, (ms) => { const r = joinEnds(ms, merge); ok = !!r; return r; });
  return ok ? out : null;
}

/** Snaps `p` onto the nearest outline within `tol` (world space), for node dragging. */
export function snapToOutlines(p: Vec, outlines: { subs: Subpath[]; box: Box }[], tol: number): Vec | null {
  let best: Vec | null = null, bd = tol;
  for (const o of outlines) {
    if (p.x < o.box.minX - tol || p.x > o.box.maxX + tol || p.y < o.box.minY - tol || p.y > o.box.maxY + tol) continue;
    const r = nearestOnSubpaths(p, o.subs);
    if (r && r.dist <= bd) { bd = r.dist; best = r.point; }
  }
  return best;
}
