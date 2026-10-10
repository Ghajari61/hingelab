import type { BBox, Layout, Part } from "./types";

/**
 * Shelf-pack parts onto a bed of width `bedW`, walls first, then taller pieces.
 * With `keepOrder`, parts are packed in the given order (letters stay in reading order).
 */
export function layoutParts<T extends { kind: string; bbox: BBox } = Part>(parts: T[], bedW: number, gap: number, keepOrder = false): Layout<T> {
  const margin = 5;
  const items = parts.map((pt, i) => ({ pt, i, w: pt.bbox.x1 - pt.bbox.x0, h: pt.bbox.y1 - pt.bbox.y0, ox: 0, oy: 0 }));
  const order = keepOrder ? items : items.slice().sort((a, b) => +(b.pt.kind === "wall") - +(a.pt.kind === "wall") || b.h - a.h);
  let x = margin, y = margin, rowH = 0, maxX = 0;
  for (const it of order) {
    if (x > margin && x + it.w > bedW - margin) { x = margin; y += rowH + gap; rowH = 0; }
    it.ox = x - it.pt.bbox.x0; it.oy = y - it.pt.bbox.y0;
    x += it.w + gap; rowH = Math.max(rowH, it.h); maxX = Math.max(maxX, x - gap);
  }
  return { items, width: maxX + margin, height: y + rowH + margin };
}
