/**
 * What each mark on a product is: its text, motif, numbers or picture. Builders tag the contours and
 * pictures they put on a part; the 3D view draws every item as a part of its own (named
 * `<part> · <item> engraving`, a picture `<part> · <item>`), and its scale gizmo sizes that item's setting (lib/generators/grips3d.ts). The
 * tags live beside the geometry and never change it.
 */
import type { Contour, GenImage } from "./types";

const TAGS = new WeakMap<object, string>();

/** Marks every contour (or picture) in `cs` as `item`; returns `cs`. */
export function tagItem<T extends Contour | GenImage>(cs: T[], item: string): T[] {
  for (const c of cs) TAGS.set(c, item);
  return cs;
}

/** The item a contour or picture was tagged as. */
export const itemOf = (c: Contour | GenImage): string | undefined => TAGS.get(c);

/** The separator between a part's name and its item's in a 3D object's name. */
export const ITEM_SEP = " · ";

/** The 3D object name of an item's engraved (or scored) skin on a part. */
export const itemSkinName = (part: string, item: string) => `${part}${ITEM_SEP}${item} engraving`;

/** The item named in a 3D object's name (`Sign · Text engraving`, `Puzzle · Picture` → `Text`, `Picture`), or null. */
export function itemInName(name: string | null | undefined): string | null {
  const i = name ? name.lastIndexOf(ITEM_SEP) : -1;
  return i > 0 ? name!.slice(i + ITEM_SEP.length).replace(/ engraving$/, "") : null;
}

export interface ItemBlock { item: string; cs: Contour[] }

interface Box { x0: number; y0: number; x1: number; y1: number }

function boxOf(cs: Contour[]): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cs) for (const [x, y] of c) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return x0 <= x1 ? { x0, y0, x1, y1 } : null;
}

/**
 * Tags contours made from several items at once (a text and its motif welded into one engraving) by
 * where they lie: each takes the item whose block (`cs`, in the same frame) holds it, the smallest
 * block when several do. Contours outside every block (a border) stay untagged.
 */
export function tagByPlace(cs: Contour[], blocks: ItemBlock[]): Contour[] {
  const boxes = blocks.flatMap((b) => {
    const r = boxOf(b.cs);
    if (!r) return [];
    const pad = 1.5 + 0.06 * Math.max(r.x1 - r.x0, r.y1 - r.y0);
    return [{ item: b.item, x0: r.x0 - pad, y0: r.y0 - pad, x1: r.x1 + pad, y1: r.y1 + pad, area: (r.x1 - r.x0) * (r.y1 - r.y0) }];
  });
  if (!boxes.length) return cs;
  for (const c of cs) {
    const r = boxOf([c]);
    if (!r) continue;
    let best: (typeof boxes)[number] | null = null;
    for (const b of boxes) {
      if (r.x0 < b.x0 || r.y0 < b.y0 || r.x1 > b.x1 || r.y1 > b.y1) continue;
      if (!best || b.area < best.area) best = b;
    }
    if (best) TAGS.set(c, best.item);
  }
  return cs;
}

/** The tagged contours of `cs` grouped by item, as blocks for tagByPlace (outlines traced from them). */
export function blocksOf(cs: Contour[]): ItemBlock[] {
  const by = new Map<string, Contour[]>();
  for (const c of cs) {
    const item = TAGS.get(c);
    if (!item) continue;
    const group = by.get(item);
    if (group) group.push(c);
    else by.set(item, [c]);
  }
  return [...by].map(([item, group]) => ({ item, cs: group }));
}

/** Tags a part's engraving and scoring by place (see tagByPlace); returns `m`. */
export function tagMarks<T extends { engrave?: Contour[]; score?: Contour[] }>(m: T, blocks: ItemBlock[]): T {
  if (m.engrave) tagByPlace(m.engrave, blocks);
  if (m.score) tagByPlace(m.score, blocks);
  return m;
}
