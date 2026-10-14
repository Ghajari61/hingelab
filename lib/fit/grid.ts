/**
 * Where the canvas shows each sheet. The layout (and every export) keeps the sheets stacked top
 * to bottom; the view rearranges them into rows and columns that suit the window's shape.
 */

/** Space between sheets in the view, mm (room for the "Sheet N of M" labels). */
export const GRID_GAP = 30;

export interface SheetGrid {
  /** Top-left corner of each sheet in the view, mm. */
  at: { x: number; y: number }[];
  cols: number;
  width: number;
  height: number;
}

/**
 * "Sheet N of M" above a sheet at zoom `z` (screen px per mm): 11 px tall on screen, but never
 * taller than the gap above the sheet allows or wider than the sheet. `size` is 0 when it would
 * be too small to read (the sheet's tooltip still names it); `lift` is the baseline above the sheet.
 */
export function sheetLabel(z: number, sheetW: number, chars: number, gap = GRID_GAP): { size: number; lift: number } {
  const size = Math.min(11 / z, gap * 0.55, sheetW / (Math.max(1, chars) * 0.52));
  return { size: size * z < 6.5 ? 0 : size, lift: Math.min(6 / z, gap * 0.22) };
}

function place(sizes: { w: number; h: number }[], cols: number, gap: number): SheetGrid {
  const colW: number[] = [], rowH: number[] = [];
  sizes.forEach((s, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    colW[c] = Math.max(colW[c] ?? 0, s.w);
    rowH[r] = Math.max(rowH[r] ?? 0, s.h);
  });
  const xs: number[] = [], ys: number[] = [];
  colW.reduce((x, w, c) => ((xs[c] = x), x + w + gap), 0);
  rowH.reduce((y, h, r) => ((ys[r] = y), y + h + gap), 0);
  const sum = (a: number[]) => a.reduce((t, v) => t + v, 0) + gap * (a.length - 1);
  return { at: sizes.map((_, i) => ({ x: xs[i % cols], y: ys[Math.floor(i / cols)] })), cols, width: sum(colW), height: sum(rowH) };
}

/**
 * Rows and columns for `sizes` that show the sheets largest in a view of the given width/height
 * ratio; on a tie the fewer columns win. One sheet is just the sheet.
 */
export function sheetGrid(sizes: { w: number; h: number }[], aspect: number, gap = GRID_GAP): SheetGrid {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1.6;
  let best = place(sizes, 1, gap), score = 0;
  for (let cols = 1; cols <= Math.max(1, sizes.length); cols++) {
    const g = place(sizes, cols, gap);
    const s = Math.min(a / Math.max(g.width, 1e-9), 1 / Math.max(g.height, 1e-9));
    if (s > score * (1 + 1e-9)) { best = g; score = s; }
  }
  return best;
}
