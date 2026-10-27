import type { Sheet } from './types';
import { r3 } from '@/lib/hinge/util';

export const SHEET_GAP = 40;

/** One millimetre coordinate system for the canvas, Lay Flat and the combined cut file. */
export function layoutSheets(sheets: Pick<Sheet, 'width' | 'height'>[]) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(sheets.length)));
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  let y = 0, W = 0;
  for (let r = 0; r * cols < sheets.length; r++) {
    let x = 0, rowH = 0;
    for (const s of sheets.slice(r * cols, (r + 1) * cols)) {
      rects.push({ x, y, w: r3(s.width), h: r3(s.height) });
      x = r3(x + s.width + SHEET_GAP);
      rowH = Math.max(rowH, r3(s.height));
    }
    W = Math.max(W, x - SHEET_GAP);
    y = r3(y + rowH + SHEET_GAP);
  }
  return { rects, W: r3(W), H: r3(Math.max(0, y - SHEET_GAP)) };
}
