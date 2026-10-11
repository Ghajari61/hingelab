import { describe, expect, it } from "vitest";
import { unionShapes } from "@/lib/letters/polygon";
import { bboxOf, rect, signedArea } from "../geom";
import { MOTIF_IDS, motif, motifArt } from "../motifs";
import { orient, SHAPE_KINDS, shapeArt, shapeOutline } from "../shapes";
import { bridgeIslands, textBlock, weld, withSticks } from "../weld";
import { CTX } from "./ctx";

const finite = (cs: number[][][]) => cs.every((c) => c.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));

describe("shapes", () => {
  for (const k of SHAPE_KINDS) {
    it(`${k} fills its box as one simple outline`, () => {
      const c = shapeOutline(k, 120, 80, 3);
      expect(finite([c])).toBe(true);
      const b = bboxOf([c]);
      expect(b.x0).toBeCloseTo(0, 0);
      expect(b.y0).toBeCloseTo(0, 0);
      expect(b.x1).toBeCloseTo(120, 0);
      expect(b.y1).toBeCloseTo(80, 0);
      const u = unionShapes([orient(c)]);
      expect(u).toHaveLength(1);
      expect(u[0].area).toBeCloseTo(Math.abs(signedArea(c)), -1);
      expect(shapeArt(k)[0].d).toMatch(/^M[-\d.]+[ ,][-\d.]+ L/);
    });
  }
});

describe("motifs", () => {
  for (const id of MOTIF_IDS) {
    it(`${id} scales to its size`, () => {
      const cs = motif(id, 60, 10, 20);
      expect(cs.length).toBeGreaterThan(0);
      expect(finite(cs)).toBe(true);
      const b = bboxOf(cs);
      expect(Math.max(b.x1 - b.x0, b.y1 - b.y0)).toBeCloseTo(60, 1);
      expect((b.x0 + b.x1) / 2).toBeCloseTo(10, 1);
      expect(motifArt(id)[0].d).toMatch(/^M[-\d.]+[ ,][-\d.]+ L/);
    });
  }
  it("flipped motifs keep their area", () => {
    const a = unionShapes(motif("hearts", 50)).reduce((s, x) => s + x.area, 0);
    const b = unionShapes(motif("hearts", 50, 0, 0, true)).reduce((s, x) => s + x.area, 0);
    expect(b).toBeCloseTo(a, 0);
  });
});

describe("weld", () => {
  it("bridges islands into one piece", () => {
    const shapes = unionShapes([orient(rect(0, 0, 20, 20)), orient(rect(40, 0, 20, 20)), orient(rect(0, 50, 10, 10))]);
    expect(shapes).toHaveLength(3);
    expect(bridgeIslands(shapes, 3)).toHaveLength(1);
  });

  it("welds text with a border into one piece and adds sticks", () => {
    const t = textBlock(CTX, "Happy\nBirthday", "pacifico", 30);
    expect(t.loading).toBe(false);
    expect(t.width).toBeGreaterThan(50);
    const s = weld(t.contours, { border: 3 })!;
    expect(s).toBeTruthy();
    const b0 = bboxOf([s.outer]);
    const st = withSticks(s, [{ x: -20, length: 100, width: 8, tip: 12 }, { x: 20, length: 100, width: 8, tip: 12 }]);
    const b1 = bboxOf([st.outer]);
    expect(b1.y1).toBeCloseTo(b0.y1 + 100, 0);
    expect(unionShapes([st.outer, ...st.holes])).toHaveLength(1);
  });

  it("solid welds have no holes", () => {
    const t = textBlock(CTX, "ABO", "archivo-black", 20);
    expect(weld(t.contours, { border: 0 })!.holes.length).toBeGreaterThan(0);
    expect(weld(t.contours, { border: 2, solid: true })!.holes).toHaveLength(0);
  });
});
