/**
 * Tweak tool: a round brush that nudges objects (move, attract/repel, jitter, scale, rotate) or the
 * nodes of paths (push, shrink/grow, attract/repel, roughen) under it. The effect is strongest at the
 * centre and fades smoothly to nothing at the rim. Each pointer move is one small step; the canvas
 * collects a drag into one undo step.
 */
import { boxCenter, flatten, insertAnchor, invert, isEmptyBox, nodeBasePaths, nodeBox, polygonArea, rotateAt, scaleAt, segments, transformSubpaths, translate } from "./geom";
import { expandNodes, isEditable, locate, topLevel, transformNodesEach, walk } from "./scene";
import type { Document, Mat, PathNode, Subpath, Vec } from "./types";

export type TweakMode = "move" | "moveInOut" | "jitter" | "scale" | "rotate" | "push" | "shrinkGrow" | "attract" | "roughen";

export const TWEAK_MODES: { id: TweakMode; label: string; nodes: boolean; hint: string }[] = [
  { id: "move", label: "Move objects", nodes: false, hint: "Drag to move objects under the brush." },
  { id: "moveInOut", label: "Move in / out", nodes: false, hint: "Objects drift towards the brush; Alt pushes them away." },
  { id: "jitter", label: "Move jitter", nodes: false, hint: "Objects under the brush move randomly." },
  { id: "scale", label: "Scale objects", nodes: false, hint: "Objects under the brush shrink; Alt grows them." },
  { id: "rotate", label: "Rotate objects", nodes: false, hint: "Objects under the brush turn clockwise; Alt turns them the other way." },
  { id: "push", label: "Push paths", nodes: true, hint: "Drag to push the outline under the brush." },
  { id: "shrinkGrow", label: "Shrink / grow paths", nodes: true, hint: "Outlines under the brush move inwards; Alt moves them out." },
  { id: "attract", label: "Attract / repel nodes", nodes: true, hint: "Nodes under the brush gather to its centre; Alt spreads them out." },
  { id: "roughen", label: "Roughen paths", nodes: true, hint: "Outlines under the brush get rough and organic." },
];

export interface TweakParams { mode: TweakMode; /** mm */ radius: number; /** 0–100 */ force: number; /** 0–100: more nodes are added under the brush so path edits stay smooth */ fidelity: number }

export const TWEAK_DEFAULTS: TweakParams = { mode: "push", radius: 10, force: 30, fidelity: 50 };

export interface TweakBrush {
  c: Vec;
  r: number;
  /** 0–100 */
  force: number;
  /** Pointer movement since the previous step, mm. */
  delta: Vec;
  /** Alt: repel instead of attract, grow instead of shrink, enlarge instead of shrink, turn the other way. */
  invert: boolean;
  fidelity: number;
  rnd: () => number;
}

/** Brush weight at distance `d`: 1 at the centre, easing to 0 at the rim (and 0 beyond). */
export const falloff = (d: number, r: number) => (r <= 0 || d >= r ? 0 : (1 - (d / r) ** 2) ** 2);

const weight = (q: Vec, b: TweakBrush) => (Math.max(0, Math.min(100, b.force)) / 100) * falloff(Math.hypot(q.x - b.c.x, q.y - b.c.y), b.r);

/** How far one node moves in a path mode (world mm). `out` is the outline's outward normal there. */
export function nodeShift(mode: TweakMode, q: Vec, out: Vec, b: TweakBrush): Vec {
  const w = weight(q, b);
  if (w <= 0) return { x: 0, y: 0 };
  const sgn = b.invert ? -1 : 1;
  switch (mode) {
    case "push": return { x: b.delta.x * w, y: b.delta.y * w };
    case "shrinkGrow": return { x: -sgn * out.x * w * b.r * 0.04, y: -sgn * out.y * w * b.r * 0.04 };
    case "attract": return { x: sgn * (b.c.x - q.x) * w * 0.15, y: sgn * (b.c.y - q.y) * w * 0.15 };
    case "roughen": { const a = b.rnd() * Math.PI * 2, m = b.rnd() * w * b.r * 0.06; return { x: Math.cos(a) * m, y: Math.sin(a) * m }; }
    default: return { x: 0, y: 0 };
  }
}

/** Segments near the brush longer than the fidelity allows are split (the curve keeps its exact shape). */
function refine(s: Subpath, b: TweakBrush): Subpath {
  const maxLen = b.r * (0.05 + 0.6 * (1 - Math.max(0, Math.min(100, b.fidelity)) / 100));
  let out = s;
  const segs = segments(s);
  for (let k = segs.length - 1; k >= 0; k--) {
    if (out.nodes.length > 4000) break;
    const g = segs[k];
    const pts = flatten({ closed: false, nodes: [{ ...g.p0, o: g.c1 }, { ...g.p3, i: g.c2 }] }, 0.05);
    let len = 0, near = false;
    for (let j = 1; j < pts.length; j++) {
      len += Math.hypot(pts[j].x - pts[j - 1].x, pts[j].y - pts[j - 1].y);
      if (!near && segDist(pts[j - 1], pts[j], b.c) < b.r * 1.2) near = true;
    }
    if (!near || len <= maxLen) continue;
    const m = Math.min(64, Math.ceil(len / maxLen));
    for (let j = m - 1; j >= 1; j--) out = insertAnchor(out, k, j / (j + 1));
  }
  return out;
}

/** Path modes on world subpaths: refines near the brush, then moves each node (and its handles) by `nodeShift`. */
export function tweakSubpaths(subs: Subpath[], mode: TweakMode, b: TweakBrush): { subs: Subpath[]; changed: boolean } {
  let changed = false;
  const res = subs.map((s0) => {
    if (!s0.nodes.some((a) => Math.hypot(a.x - b.c.x, a.y - b.c.y) < b.r) && !segments(s0).some((g) => near(g.p0, g.p3, b))) return s0;
    const s = mode === "push" && Math.hypot(b.delta.x, b.delta.y) < 1e-12 ? s0 : refine(s0, b);
    const n = s.nodes.length;
    const orient = s.closed ? Math.sign(polygonArea(s.nodes)) || 1 : 1;
    const nodes = s.nodes.map((a, k) => {
      const prev = s.nodes[s.closed ? (k - 1 + n) % n : Math.max(0, k - 1)], next = s.nodes[s.closed ? (k + 1) % n : Math.min(n - 1, k + 1)];
      const tx = next.x - prev.x, ty = next.y - prev.y, tl = Math.hypot(tx, ty) || 1;
      const d = nodeShift(mode, a, { x: (orient * ty) / tl, y: (-orient * tx) / tl }, b);
      if (!d.x && !d.y) return a;
      changed = true;
      return { ...a, x: a.x + d.x, y: a.y + d.y, ...(a.i ? { i: { x: a.i.x + d.x, y: a.i.y + d.y } } : {}), ...(a.o ? { o: { x: a.o.x + d.x, y: a.o.y + d.y } } : {}) };
    });
    return { closed: s.closed, nodes };
  });
  return { subs: changed ? res : subs, changed };
}

/** Distance from `p` to the segment a–c. */
function segDist(a: Vec, c: Vec, p: Vec): number {
  const dx = c.x - a.x, dy = c.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
}
const near = (a: Vec, c: Vec, b: TweakBrush) => segDist(a, c, b.c) < b.r;

/** Object modes: the world transform for an object whose bounding-box centre is `centre`, or null when the brush misses it. */
export function objectTweak(mode: TweakMode, centre: Vec, b: TweakBrush): Mat | null {
  const w = weight(centre, b);
  if (w <= 0) return null;
  const sgn = b.invert ? -1 : 1;
  switch (mode) {
    case "move": return translate(b.delta.x * w, b.delta.y * w);
    case "moveInOut": return translate(sgn * (b.c.x - centre.x) * w * 0.1, sgn * (b.c.y - centre.y) * w * 0.1);
    case "jitter": { const a = b.rnd() * Math.PI * 2, m = b.rnd() * w * b.r * 0.08; return translate(Math.cos(a) * m, Math.sin(a) * m); }
    case "scale": { const f = 1 - sgn * w * 0.04; return scaleAt(f, f, centre.x, centre.y); }
    case "rotate": return rotateAt(sgn * w * 4, centre.x, centre.y);
    default: return null;
  }
}

/**
 * One brush step on a draft document: object modes move whole top-level objects whose centre is under
 * the brush; path modes edit the nodes of paths, shapes and text under it (shapes and text become
 * paths; Live Effects stay live). Works on `ids` (the selection) or on everything visible and unlocked.
 * Returns the ids that changed.
 */
export function tweakStep(d: Document, ids: string[] | null, mode: TweakMode, b: TweakBrush): string[] {
  const nodesMode = TWEAK_MODES.find((m) => m.id === mode)?.nodes ?? false;
  const scope = ids && ids.length ? topLevel(d.root, ids).filter((id) => isEditable(d.root, id)) : null;
  if (!nodesMode) {
    const tops = scope ?? d.root.children.filter((c) => !c.hidden && !c.locked).map((c) => c.id);
    const moves: [string, Mat][] = [];
    for (const id of tops) {
      const l = locate(d.root, id);
      if (!l) continue;
      const box = nodeBox(l.node, l.world);
      if (isEmptyBox(box)) continue;
      const m = objectTweak(mode, boxCenter(box), b);
      if (m) moves.push([id, m]);
    }
    transformNodesEach(d, moves);
    return moves.map(([id]) => id);
  }
  const inScope = new Set(scope ?? []);
  const leaves: string[] = [];
  walk(d.root, (l) => {
    if (l.node.hidden || l.node.locked) return "skip";
    const mine = !scope || inScope.has(l.node.id) || inScope.has(l.parent.id);
    if (l.node.type === "group") { if (mine) inScope.add(l.node.id); return; }
    if (!mine || !(l.node.type === "path" || l.node.type === "shape" || l.node.type === "text")) return;
    const box = nodeBox(l.node, l.world);
    if (isEmptyBox(box) || box.maxX < b.c.x - b.r || box.minX > b.c.x + b.r || box.maxY < b.c.y - b.r || box.minY > b.c.y + b.r) return;
    leaves.push(l.node.id);
  });
  const changed: string[] = [];
  for (const id of leaves) {
    const l = locate(d.root, id);
    if (!l) continue;
    const r = tweakSubpaths(transformSubpaths(nodeBasePaths(l.node), l.world), mode, b);
    if (!r.changed) continue;
    if (l.node.type !== "path") expandNodes(d, [id], true);
    const p = locate(d.root, id);
    if (p?.node.type !== "path") continue;
    (p.node as PathNode).subpaths = transformSubpaths(r.subs, invert(p.world)).map((s) => ({ closed: s.closed, nodes: s.nodes.map((a) => (a.k === "auto" ? { ...a, k: "smooth" as const } : a)) }));
    changed.push(id);
  }
  return changed;
}
