/**
 * Align & Distribute extras: what to align to (first / last selected, biggest / smallest object),
 * Remove Overlaps, Exchange Positions and aligning path nodes. All in world space on top-level objects.
 */
import { seeded } from "./arrays";
import { apply, boxCenter, invert, isEmptyBox, translate, type Box } from "./geom";
import { anchorsBox, editAnchors, type MSub, type NodeRef } from "./nodeOps";
import { topLevel, transformNodesEach, walk, worldBox, type AlignMode } from "./scene";
import type { Document, Mat, Vec } from "./types";

export type AlignTo = "selection" | "first" | "key" | "biggest" | "smallest" | "artboard";

const area = (b: Box) => (b.maxX - b.minX) * (b.maxY - b.minY);

/**
 * The box to align to for `ids` in selection order, or undefined for the selection's own bounds.
 * "key" is the last selected object. Ties for biggest / smallest go to the earlier selected object.
 */
export function alignTarget(d: Document, ids: string[], to: AlignTo): Box | undefined {
  if (to === "artboard") {
    const s = d.sheets[0];
    return s ? { minX: s.x, minY: s.y, maxX: s.x + s.w, maxY: s.y + s.h } : undefined;
  }
  const items = ids.map((id) => ({ id, b: worldBox(d.root, id) })).filter((i) => !isEmptyBox(i.b));
  if (!items.length || to === "selection") return undefined;
  if (to === "first") return items[0].b;
  if (to === "key") return items[items.length - 1].b;
  let pick = items[0];
  for (const i of items) if (to === "biggest" ? area(i.b) > area(pick.b) : area(i.b) < area(pick.b)) pick = i;
  return pick.b;
}

/**
 * Moves objects apart until no two bounding boxes are closer than `gap`. Each overlapping pair is
 * pushed apart along the axis that needs the smaller move, half each way; repeated until settled.
 * Deterministic: pairs are visited in selection order, and equal centres separate to the right.
 */
export function removeOverlaps(d: Document, ids: string[], gap = 0): number {
  const top = topLevel(d.root, ids);
  const items = top.map((id) => ({ id, b: worldBox(d.root, id), dx: 0, dy: 0 })).filter((i) => !isEmptyBox(i.b));
  if (items.length < 2) return 0;
  const g = Math.max(0, gap);
  const at = (i: (typeof items)[number]) => ({ minX: i.b.minX + i.dx, minY: i.b.minY + i.dy, maxX: i.b.maxX + i.dx, maxY: i.b.maxY + i.dy });
  for (let pass = 0; pass < 500; pass++) {
    let moved = false;
    for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
      const A = at(items[a]), B = at(items[b]);
      const ox = Math.min(A.maxX, B.maxX) - Math.max(A.minX, B.minX) + g;
      const oy = Math.min(A.maxY, B.maxY) - Math.max(A.minY, B.minY) + g;
      if (ox <= 1e-9 || oy <= 1e-9) continue;
      const ca = boxCenter(A), cb = boxCenter(B);
      if (ox <= oy) {
        const s = cb.x > ca.x || (cb.x === ca.x) ? 1 : -1;
        items[a].dx -= (s * ox) / 2; items[b].dx += (s * ox) / 2;
      } else {
        const s = cb.y > ca.y || (cb.y === ca.y) ? 1 : -1;
        items[a].dy -= (s * oy) / 2; items[b].dy += (s * oy) / 2;
      }
      moved = true;
    }
    if (!moved) break;
  }
  const moves = items.filter((i) => Math.abs(i.dx) > 1e-12 || Math.abs(i.dy) > 1e-12).map((i): [string, Mat] => [i.id, translate(i.dx, i.dy)]);
  transformNodesEach(d, moves);
  return moves.length;
}

export type ExchangeOrder = "selection" | "stack" | "clockwise" | "random";

/**
 * Each object moves to the next one's place (bounding-box centre), the last to the first's, in
 * selection order, stacking order (back to front), clockwise around the selection's centre from the
 * left (screen y points down), or a seeded random order.
 */
export function exchangePositions(d: Document, ids: string[], order: ExchangeOrder, seed = 1): void {
  const top = topLevel(d.root, ids);
  let items = top.map((id) => ({ id, c: boxCenter(worldBox(d.root, id)), b: worldBox(d.root, id) })).filter((i) => !isEmptyBox(i.b));
  if (items.length < 2) return;
  if (order === "stack") {
    const z = new Map<string, number>();
    let k = 0;
    walk(d.root, (l) => { z.set(l.node.id, k++); });
    items.sort((p, q) => (z.get(p.id) ?? 0) - (z.get(q.id) ?? 0));
  } else if (order === "clockwise") {
    const m = { x: items.reduce((s, i) => s + i.c.x, 0) / items.length, y: items.reduce((s, i) => s + i.c.y, 0) / items.length };
    const ang = (p: Vec) => { const a = Math.atan2(p.y - m.y, p.x - m.x); return a < -Math.PI + 1e-12 ? Math.PI : a; };
    items.sort((p, q) => ang(p.c) - ang(q.c) || Math.hypot(p.c.x - m.x, p.c.y - m.y) - Math.hypot(q.c.x - m.x, q.c.y - m.y));
  } else if (order === "random") {
    const rnd = seeded(seed);
    items = items.slice();
    for (let k = items.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [items[k], items[j]] = [items[j], items[k]]; }
  }
  const targets = items.map((_, k) => items[(k + 1) % items.length].c);
  transformNodesEach(d, items.map((i, k) => [i.id, translate(targets[k].x - i.c.x, targets[k].y - i.c.y)]));
}

/** Lines up the selected path nodes (with their handles) on the left / centre / right / top / middle / bottom of their bounds. */
export function alignAnchors(d: Document, refs: NodeRef[], mode: AlignMode): NodeRef[] {
  const b = anchorsBox(d, refs);
  if (isEmptyBox(b) || refs.length < 2) return refs;
  const c = boxCenter(b);
  const target = mode === "left" ? b.minX : mode === "right" ? b.maxX : mode === "hcenter" ? c.x : mode === "top" ? b.minY : mode === "bottom" ? b.maxY : c.y;
  const horizontal = mode === "left" || mode === "right" || mode === "hcenter";
  return editAnchors(d, refs, (ms: MSub[], world: Mat) => {
    const inv = invert(world);
    let any = false;
    const out = ms.map((s) => ({
      closed: s.closed,
      nodes: s.nodes.map((a) => {
        if (!a.s) return a;
        const w = apply(world, a);
        const delta = horizontal ? { x: target - w.x, y: 0 } : { x: 0, y: target - w.y };
        if (Math.abs(delta.x) < 1e-12 && Math.abs(delta.y) < 1e-12) return a;
        any = true;
        const l = { x: inv[0] * delta.x + inv[2] * delta.y, y: inv[1] * delta.x + inv[3] * delta.y };
        const t = (p: Vec) => ({ x: p.x + l.x, y: p.y + l.y });
        return { ...a, ...t(a), ...(a.i ? { i: t(a.i) } : {}), ...(a.o ? { o: t(a.o) } : {}) };
      }),
    }));
    return any ? out : null;
  });
}
