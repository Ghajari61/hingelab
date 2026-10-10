import { describe, expect, it } from "vitest";
import { intersectShapes, offsetShapes, shapeContours, totalArea, unionShapes } from "@/lib/letters/polygon";
import type { Contour } from "@/lib/letters/types";
import { nestOutlines, rotatePoint, type OutlineNest, type OutlinePart } from "../outline";

const rect = (x: number, y: number, w: number, h: number): Contour => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const L = (s: number, t: number): Contour => [[0, 0], [s, 0], [s, t], [t, t], [t, s], [0, s]];

/** Each placed part's filled outline in sheet mm, grown by `grow`. */
function placed(parts: OutlinePart[], nest: OutlineNest, sheet: number, grow = 0) {
  return nest.sheets[sheet].items.map((it) => {
    const p = parts.find((q) => q.id === it.id)!;
    const cs = p.outline.map((c) => c.map((q) => { const [x, y] = rotatePoint(q, it.angle); return [x + it.x, y + it.y] as [number, number]; }));
    return { id: it.id, angle: it.angle, shapes: offsetShapes(unionShapes(cs, [], true), grow) };
  });
}

function check(parts: OutlinePart[], nest: OutlineNest, spec: { w: number; h: number; margin: number; gap: number }) {
  const ids = nest.sheets.flatMap((s) => s.items.map((i) => i.id));
  expect(ids.sort()).toEqual(parts.map((p) => p.id).sort());
  nest.sheets.forEach((sh, si) => {
    if (sh.oversize) return;
    const ps = placed(parts, nest, si);
    for (const p of ps) {
      for (const c of shapeContours(p.shapes)) for (const [x, y] of c) {
        expect(x, p.id).toBeGreaterThanOrEqual(spec.margin - 1e-3);
        expect(y, p.id).toBeGreaterThanOrEqual(spec.margin - 1e-3);
        expect(x, p.id).toBeLessThanOrEqual(spec.w - spec.margin + 1e-3);
        expect(y, p.id).toBeLessThanOrEqual(spec.h - spec.margin + 1e-3);
      }
      expect(parts.find((q) => q.id === p.id)!.angles).toContain(p.angle);
    }
    // Grown by just under half the gap, no two parts may touch.
    const grown = placed(parts, nest, si, spec.gap / 2 - 0.05);
    for (let i = 0; i < grown.length; i++) for (let j = i + 1; j < grown.length; j++) {
      const a = totalArea(intersectShapes(shapeContours(grown[i].shapes), shapeContours(grown[j].shapes)));
      expect(a, `${grown[i].id} × ${grown[j].id}`).toBeLessThan(1e-3);
    }
  });
}

describe("outline nesting", () => {
  it("drops small parts into a frame's hole, which box packing cannot", () => {
    const spec = { w: 120, h: 120, margin: 5, gap: 2 };
    const parts: OutlinePart[] = [
      { id: "frame", outline: [rect(0, 0, 108, 108), rect(8, 8, 92, 92)], angles: [0] },
      ...[1, 2, 3, 4].map((i) => ({ id: `sq${i}`, outline: [rect(0, 0, 36, 36)], angles: [0, 90] })),
    ];
    const n = nestOutlines(parts, spec);
    expect(n.tooBig).toEqual([]);
    expect(n.sheets.length).toBe(1);
    check(parts, n, spec);
  });

  it("interlocks L shapes by turning them (boxes would fit only four), and keeps the gap", () => {
    const spec = { w: 130, h: 130, margin: 3, gap: 3 };
    const parts: OutlinePart[] = Array.from({ length: 6 }, (_, i) => ({ id: `L${i}`, outline: [L(40, 12)], angles: [0, 90, 180, 270] }));
    const n = nestOutlines(parts, spec);
    expect(n.sheets.length).toBe(1);
    check(parts, n, spec);
  });

  it("opens new sheets when one is full and sets parts larger than the sheet apart", () => {
    const spec = { w: 100, h: 60, margin: 2, gap: 2 };
    const parts: OutlinePart[] = [
      ...Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, outline: [rect(0, 0, 45, 25)], angles: [0, 90] })),
      { id: "huge", outline: [rect(0, 0, 150, 40)], angles: [0, 90] },
    ];
    const n = nestOutlines(parts, spec);
    expect(n.tooBig).toEqual(["huge"]);
    const normal = n.sheets.filter((s) => !s.oversize);
    expect(normal.length).toBe(2);
    const big = n.sheets.find((s) => s.oversize)!;
    expect(big.w).toBeCloseTo(150 + 2 * spec.margin, 3);
    expect(big.h).toBeCloseTo(40 + 2 * spec.margin, 3);
    check(parts, n, spec);
  });
});
