import { LAYER_COLORS } from "./cutLayers";
import { mul, nodePaths, pathD, transformSubpaths } from "./geom";
import type { Document, Mat, SceneNode, Subpath } from "./types";

/**
 * Thumbnail art for `documentThumbnail`: the document's visible paths in mm, stroked in their layer
 * colour. Only numbers from the geometry and the fixed palette are written, so it is safe as markup.
 * Stops after `maxAnchors` anchors to keep stored thumbnails small.
 */
export function documentArt(doc: Document, maxAnchors = 2500): string {
  const w = Math.max(1, ...doc.sheets.map((s) => s.w), ...doc.sheets.map((s) => s.h));
  const stroke = +(w / 250).toFixed(3);
  const byLayer = new Map<number, Subpath[]>();
  let left = maxAnchors;
  const visit = (n: SceneNode, world: Mat) => {
    if (n.hidden || left <= 0) return;
    const m = mul(world, n.transform);
    if (n.type === "group") { n.children.forEach((c) => visit(c, m)); return; }
    if (n.type === "image") return;
    const subs = transformSubpaths(nodePaths(n), m);
    const count = subs.reduce((a, s) => a + s.nodes.length, 0);
    if (!count) return;
    left -= count;
    const layer = Number.isInteger(n.layer) && n.layer >= 0 && n.layer < LAYER_COLORS.length ? n.layer : 2;
    byLayer.set(layer, [...(byLayer.get(layer) ?? []), ...subs]);
  };
  doc.root.children.forEach((c) => visit(c, doc.root.transform));
  let out = "";
  for (const [layer, subs] of byLayer) {
    const d = pathD(subs, 1);
    if (!d) continue;
    const color = LAYER_COLORS[layer];
    out += layer === 0
      ? `<path d="${d}" fill="${color}" fill-opacity="0.55" fill-rule="evenodd" stroke="none"/>`
      : `<path d="${d}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linejoin="round"/>`;
  }
  return out;
}
