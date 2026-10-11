/**
 * Paste Size and Paste Style: the selection takes the size, or the cut layer and Live Effects, of the
 * objects on the HingeLab clipboard.
 */
import { newId } from "./doc";
import { canHaveEffects } from "./effects";
import { emptyBox, isEmptyBox, nodeBox, scaleAt, unionBox, type Box } from "./geom";
import { findNode, selectionBox, topLevel, transformNodesEach, worldBox } from "./scene";
import { refAt, type RefPoint } from "./transform";
import type { Document, Mat, SceneNode } from "./types";

/** Bounds of clipboard nodes (their transforms are world transforms). */
export function clipBox(nodes: SceneNode[]): Box {
  return nodes.reduce((b, n) => { const nb = nodeBox(n); return isEmptyBox(nb) ? b : unionBox(b, nb); }, emptyBox());
}

export type PasteSizeMode = "width" | "height" | "both";

/**
 * Scales the selection (or each object, with `separately`) so its width, height or both match `target`,
 * keeping the reference point still. Width or height alone scales proportionally when `lockRatio` is on.
 */
export function pasteSize(d: Document, ids: string[], target: Box, mode: PasteSizeMode, separately: boolean, rp: RefPoint, lockRatio = false): boolean {
  if (isEmptyBox(target)) return false;
  const tw = target.maxX - target.minX, th = target.maxY - target.minY;
  const top = topLevel(d.root, ids);
  const groups = separately ? top.map((id) => [id]) : [top];
  const moves: [string, Mat][] = [];
  for (const g of groups) {
    const b = separately ? worldBox(d.root, g[0]) : selectionBox(d, g);
    if (isEmptyBox(b)) continue;
    const w = b.maxX - b.minX, h = b.maxY - b.minY;
    let sx = mode !== "height" && w > 1e-9 && tw > 1e-9 ? tw / w : 1;
    let sy = mode !== "width" && h > 1e-9 && th > 1e-9 ? th / h : 1;
    if (lockRatio && mode === "width") sy = sx;
    if (lockRatio && mode === "height") sx = sy;
    if (Math.abs(sx - 1) < 1e-12 && Math.abs(sy - 1) < 1e-12) continue;
    const p = refAt(b, rp), m = scaleAt(sx, sy, p.x, p.y);
    for (const id of g) moves.push([id, m]);
  }
  transformNodesEach(d, moves);
  return moves.length > 0;
}

const setLayerDeep = (n: SceneNode, layer: number) => { n.layer = layer; if (n.type === "group") n.children.forEach((c) => setLayerDeep(c, layer)); };

/** The selection takes the first clipboard object's cut layer and (where it can have them) its Live Effects, with new effect ids. */
export function pasteStyle(d: Document, ids: string[], style: SceneNode, id: () => string = newId): number {
  const fx = canHaveEffects(style) ? style.effects ?? [] : [];
  let n = 0;
  for (const nid of topLevel(d.root, ids)) {
    const node = findNode(d.root, nid);
    if (!node) continue;
    setLayerDeep(node, style.layer);
    if (canHaveEffects(node)) {
      if (fx.length) node.effects = fx.map((e) => ({ ...JSON.parse(JSON.stringify(e)), id: id() }));
      else delete node.effects;
    }
    n++;
  }
  return n;
}
