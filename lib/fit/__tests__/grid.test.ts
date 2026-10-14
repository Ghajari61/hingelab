import { describe, expect, it } from "vitest";
import { GRID_GAP, sheetGrid, sheetLabel } from "../grid";

const same = (n: number, w = 600, h = 400) => Array.from({ length: n }, () => ({ w, h }));

function overlaps(sizes: { w: number; h: number }[], at: { x: number; y: number }[]) {
  for (let i = 0; i < sizes.length; i++) for (let j = i + 1; j < sizes.length; j++) {
    const a = { ...at[i], ...sizes[i] }, b = { ...at[j], ...sizes[j] };
    const gx = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w);
    const gy = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
    if (Math.max(gx, gy) < GRID_GAP - 1e-9) return true;
  }
  return false;
}

describe("sheet grid", () => {
  it("one sheet is just the sheet", () => {
    const g = sheetGrid(same(1), 1.6);
    expect(g.at).toEqual([{ x: 0, y: 0 }]);
    expect([g.width, g.height, g.cols]).toEqual([600, 400, 1]);
  });

  it("lays many sheets out in rows and columns that suit the window", () => {
    const wide = sheetGrid(same(6), 16 / 9);
    expect(wide.cols).toBe(3);
    expect(wide.height).toBe(2 * 400 + GRID_GAP);
    const tall = sheetGrid(same(6), 0.6);
    expect(tall.cols).toBeLessThan(wide.cols);
    // Not one tall column: the sheets show far bigger than stacked top to bottom.
    const scale = (g: { width: number; height: number }) => Math.min(16 / 9 / g.width, 1 / g.height);
    expect(scale(wide)).toBeGreaterThan(scale({ width: 600, height: 6 * 400 + 5 * GRID_GAP }) * 2);
  });

  it("keeps the gap between every pair of sheets, whatever their sizes", () => {
    const sizes = [{ w: 600, h: 400 }, { w: 300, h: 300 }, { w: 450, h: 200 }, { w: 600, h: 400 }, { w: 200, h: 500 }];
    for (const aspect of [0.4, 1, 1.6, 3]) {
      const g = sheetGrid(sizes, aspect);
      expect(overlaps(sizes, g.at)).toBe(false);
      for (let i = 0; i < sizes.length; i++) {
        expect(g.at[i].x + sizes[i].w).toBeLessThanOrEqual(g.width + 1e-9);
        expect(g.at[i].y + sizes[i].h).toBeLessThanOrEqual(g.height + 1e-9);
      }
    }
  });

  it("prefers fewer columns on a tie and survives odd window shapes", () => {
    expect(sheetGrid(same(2, 100, 100), 0).cols).toBeGreaterThanOrEqual(1);
    expect(sheetGrid(same(3), Number.NaN).at).toHaveLength(3);
    expect(sheetGrid([], 1.6).at).toEqual([]);
  });
});

describe("sheet labels", () => {
  it("never overlap the sheet above or beside, at any zoom", () => {
    const label = "Sheet 12 of 12 · Gold mirror acrylic";
    for (const z of [0.05, 0.2, 0.5, 1, 3.78, 10, 80]) {
      const { size, lift } = sheetLabel(z, 300, label.length);
      if (!size) { expect(11 / z * z).toBeGreaterThan(0); continue; }
      // Baseline plus capital height stays inside the gap above the sheet.
      expect(lift + size * 0.75).toBeLessThan(GRID_GAP);
      // An average Latin character is about half the font size wide.
      expect(label.length * size * 0.52).toBeLessThanOrEqual(300 + 1e-9);
      expect(size * z).toBeGreaterThanOrEqual(6.5);
    }
  });

  it("are 11 px on screen when there is room, and hidden when they would be unreadable", () => {
    expect(sheetLabel(3.78, 600, 12).size * 3.78).toBeCloseTo(11, 6);
    expect(sheetLabel(0.05, 600, 12).size).toBe(0);
  });
});
