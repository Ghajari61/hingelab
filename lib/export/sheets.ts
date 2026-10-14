/**
 * A scene cut into its sheets, and SVGs put back together from it: one sheet at a time, mirrored,
 * or with hairline strokes. Elements are copied as written and moved with a transform, so no path
 * is rewritten.
 */
import type { Rect } from "./profiles";
import type { Scene, SceneItem, SceneLayer } from "./scene";

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** The sheets an export covers: the editor's sheets, or the whole document as one. */
export function sheetRects(scene: Scene, sheets: Rect[] | null | undefined): Rect[] {
  return sheets?.length ? sheets.map(({ x, y, w, h }) => ({ x, y, w, h })) : [{ x: 0, y: 0, w: scene.W, h: scene.H }];
}

/** Index of the sheet an element is on: the one holding its centre, or the nearest. */
export function sheetOf(item: SceneItem, rects: Rect[]): number {
  if (!item.box || rects.length < 2) return 0;
  const cx = (item.box[0] + item.box[2]) / 2, cy = (item.box[1] + item.box[3]) / 2;
  let best = 0, bd = Infinity;
  rects.forEach((r, i) => {
    const dx = Math.max(r.x - cx, 0, cx - (r.x + r.w)), dy = Math.max(r.y - cy, 0, cy - (r.y + r.h));
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

export interface Place {
  /** The part of the document to write (a sheet, or all of it). */
  rect: Rect;
  /** Elements to keep: those on this sheet; null keeps every element. */
  sheet: number | null;
  mirror: boolean;
}

/** x and y in the written file for a document point. */
export const placePoint = (pl: Place, x: number, y: number): [number, number] =>
  [pl.mirror ? pl.rect.w - (x - pl.rect.x) : x - pl.rect.x, y - pl.rect.y];

/** Space below the last sheet that holds something (the Free plan's mark), mm. */
export function tailOf(scene: Scene, rects: Rect[]): number {
  const bottom = Math.max(...rects.map((r) => r.y + r.h));
  return scene.layers.some((l) => l.items.some((it) => isTail(it, bottom))) ? Math.max(0, scene.H - bottom) : 0;
}

const isTail = (it: SceneItem, bottom: number) => !!it.box && it.box[1] >= bottom - 1e-6;

export interface Placed { it: SceneItem; /** Added to y: elements below the last sheet go below every sheet. */ dy: number }

/** Each layer's elements on a sheet (null: all of them), with what lies below the sheets on every sheet. */
export function itemsOn(scene: Scene, rects: Rect[], sheet: number | null): { layer: SceneLayer; items: Placed[] }[] {
  if (sheet === null) return scene.layers.map((l) => ({ layer: l, items: l.items.map((it) => ({ it, dy: 0 })) }));
  const r = rects[sheet], bottom = Math.max(...rects.map((q) => q.y + q.h));
  return scene.layers.map((l) => ({
    layer: l,
    items: l.items.flatMap((it) => (isTail(it, bottom) ? [{ it, dy: r.y + r.h - bottom }] : sheetOf(it, rects) === sheet ? [{ it, dy: 0 }] : [])),
  }));
}

const attr = (k: string, v: string) => ` ${k}="${v.replace(/"/g, "&quot;")}"`;

/** An SVG of one sheet or the whole document, as the editor wrote it apart from the placement. */
export function sceneSVG(scene: Scene, rects: Rect[], pl: Place, opts: { hairline?: number } = {}): string {
  const W = r3(pl.rect.w), H = r3(pl.rect.h);
  const root = Object.entries(scene.root).filter(([k]) => k !== "width" && k !== "height" && k !== "viewBox").map(([k, v]) => attr(k, v)).join("");
  let s = `<?xml version="1.0" encoding="UTF-8"?>\n<svg${root} width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">\n${scene.comment}${scene.defs}`;
  const { x, y } = pl.rect;
  const move = (dy: number) => {
    const ty = r3(dy - y);
    return pl.mirror ? `matrix(-1 0 0 1 ${r3(x + pl.rect.w)} ${ty})` : x || ty ? `translate(${r3(-x)} ${ty})` : "";
  };
  for (const { layer, items } of itemsOn(scene, rects, pl.sheet)) {
    if (!items.length) continue;
    const open = opts.hairline && !layer.fill ? layer.open.replace(/stroke-width="[^"]*"/, `stroke-width="${opts.hairline}"`) : layer.open;
    s += open + "\n";
    for (const dy of [...new Set(items.map((p) => p.dy))]) {
      const m = move(dy);
      if (m) s += `<g transform="${m}">\n`;
      for (const p of items) if (p.dy === dy) s += `  ${p.it.raw}\n`;
      if (m) s += `</g>\n`;
    }
    s += `</g>\n`;
  }
  return s + `</svg>\n`;
}

/** File name for sheet i of n. */
export const sheetName = (base: string, i: number, n: number, ext: string) => (n > 1 ? `${base}-sheet-${i + 1}-of-${n}.${ext}` : `${base}.${ext}`);
