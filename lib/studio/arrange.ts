/**
 * Arrange: moves the selected objects (no copies) into a grid or onto a circle / ellipse. Objects are
 * taken in selection order; the grid starts at the selection's top-left corner.
 */
import { boxCenter, isEmptyBox, mul, rotateAt, translate } from "./geom";
import { selectionBox, topLevel, transformNodesEach, worldBox } from "./scene";
import type { Document, Mat } from "./types";

export interface GridArrange {
  /** 0 = worked out from the other value (or a near-square grid when both are 0). */
  rows: number;
  cols: number;
  spacingX: number;
  spacingY: number;
  /** Position inside the cell: 0 left / top, 0.5 centre, 1 right / bottom. */
  alignX: number;
  alignY: number;
  /** Every cell as big as the largest object; otherwise each column / row fits its widest / tallest object. */
  equal: boolean;
}

export function gridSize(n: number, rows: number, cols: number): { rows: number; cols: number } {
  if (n < 1) return { rows: 0, cols: 0 };
  let r = Math.max(0, Math.round(rows)), c = Math.max(0, Math.round(cols));
  if (!r && !c) c = Math.ceil(Math.sqrt(n));
  if (!c) c = Math.ceil(n / r);
  if (!r) r = Math.ceil(n / c);
  return { rows: r, cols: c };
}

export function arrangeGrid(d: Document, ids: string[], o: GridArrange): void {
  const items = topLevel(d.root, ids).map((id) => ({ id, b: worldBox(d.root, id) })).filter((i) => !isEmptyBox(i.b));
  if (!items.length) return;
  const start = selectionBox(d, items.map((i) => i.id));
  const { cols } = gridSize(items.length, o.rows, o.cols);
  const rowsUsed = Math.ceil(items.length / cols);
  const w = (k: number) => items[k].b.maxX - items[k].b.minX, h = (k: number) => items[k].b.maxY - items[k].b.minY;
  const maxW = Math.max(...items.map((_, k) => w(k))), maxH = Math.max(...items.map((_, k) => h(k)));
  const colW = Array.from({ length: cols }, (_, c) => o.equal ? maxW : Math.max(0, ...items.map((_, k) => (k % cols === c ? w(k) : 0))));
  const rowH = Array.from({ length: rowsUsed }, (_, r) => o.equal ? maxH : Math.max(0, ...items.map((_, k) => (Math.floor(k / cols) === r ? h(k) : 0))));
  const colX = colW.map((_, c) => start.minX + colW.slice(0, c).reduce((s, v) => s + v + o.spacingX, 0));
  const rowY = rowH.map((_, r) => start.minY + rowH.slice(0, r).reduce((s, v) => s + v + o.spacingY, 0));
  const moves: [string, Mat][] = [];
  items.forEach((it, k) => {
    const c = k % cols, r = Math.floor(k / cols);
    const x = colX[c] + (colW[c] - w(k)) * o.alignX, y = rowY[r] + (rowH[r] - h(k)) * o.alignY;
    const dx = x - it.b.minX, dy = y - it.b.minY;
    if (Math.abs(dx) > 1e-12 || Math.abs(dy) > 1e-12) moves.push([it.id, translate(dx, dy)]);
  });
  transformNodesEach(d, moves);
}

export interface PolarArrange {
  /** The centre: the first or last selected object's centre (that object stays put), or the selection's centre. */
  center: "first" | "last" | "bbox";
  rx: number;
  ry: number;
  /** Degrees, clockwise from 3 o'clock (screen y points down). */
  start: number;
  end: number;
  /** Turn each object to follow the circle (its top points outwards). */
  rotate: boolean;
}

/** Centres the objects on an ellipse, evenly by angle from `start` to `end` (a full turn spaces them all the way round). */
export function arrangePolar(d: Document, ids: string[], o: PolarArrange): void {
  let top = topLevel(d.root, ids).filter((id) => !isEmptyBox(worldBox(d.root, id)));
  if (!top.length) return;
  let c = boxCenter(selectionBox(d, top));
  if (o.center !== "bbox" && top.length > 1) {
    const hub = o.center === "first" ? top[0] : top[top.length - 1];
    c = boxCenter(worldBox(d.root, hub));
    top = top.filter((id) => id !== hub);
  }
  const n = top.length;
  const sweep = o.end - o.start;
  const full = Math.abs(Math.abs(sweep) - 360) < 1e-9 || Math.abs(sweep) < 1e-9;
  const step = n === 1 ? 0 : full ? (Math.abs(sweep) < 1e-9 ? 360 : sweep) / n : sweep / (n - 1);
  transformNodesEach(d, top.map((id, k) => {
    const a = o.start + step * k, r = (a * Math.PI) / 180;
    const p = { x: c.x + o.rx * Math.cos(r), y: c.y + o.ry * Math.sin(r) };
    const oc = boxCenter(worldBox(d.root, id));
    return [id, mul(translate(p.x - oc.x, p.y - oc.y), o.rotate ? rotateAt(a + 90, oc.x, oc.y) : [1, 0, 0, 1, 0, 0])];
  }));
}
