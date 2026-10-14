import { describe, expect, it } from "vitest";
import { buildTestcard } from "../testcard/build";
import { checkTestcard } from "../testcard/check";
import { testcardMeasured, TESTCARD } from "../testcard";
import { kerfValues, mergeTestcard, slotWidths, MAX_TEETH, type TestcardParams } from "../testcard/params";
import { cleanExtras, cutPart, kerfOf, thinParts, turnCutPart } from "../output";
import type { Contour, GenPart } from "../types";

const card = (over: Record<string, unknown> = {}) => mergeTestcard(over);
const at = (c: Contour, y: number) => {
  const out: number[] = [];
  c.forEach((a, i) => {
    const b = c[(i + 1) % c.length];
    if (Math.abs(a[1] - y) < 1e-9 && Math.abs(b[1] - y) < 1e-9) out.push(Math.abs(b[0] - a[0]));
  });
  return out;
};
const span = (c: Contour, i: 0 | 1) => Math.max(...c.map((p) => p[i])) - Math.min(...c.map((p) => p[i]));
const square = (s: number, holes: Contour[] = []): GenPart => ({ id: "sq", name: "SQ", outer: [[0, 0], [s, 0], [s, s], [0, s]], holes });

describe("test card values", () => {
  it("steps the kerf from tooth to tooth and centres the slots on the thickness", () => {
    expect(kerfValues(card())).toEqual([0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4]);
    expect(slotWidths(card({ T: 3, card: { slots: 5, tStep: 0.1 } }))).toEqual([2.8, 2.9, 3, 3.1, 3.2]);
  });

  it("clamps what a save can ask for", () => {
    const p = card({ card: { kind: "nope", axis: "z", count: 99, slots: 1 }, pick: { x: -3, y: 2.6, t: 40 } });
    expect(p.card).toMatchObject({ kind: "kerf", axis: "x", count: MAX_TEETH, slots: 3 });
    expect(p.pick).toEqual({ x: 0, y: 3, t: MAX_TEETH });
  });
});

describe("kerf comb", () => {
  it("widens each tooth and narrows each slot by its own kerf", () => {
    const p = card();
    const out = buildTestcard(p);
    expect(out.error).toBeUndefined();
    const [comb, gauge] = out.parts;
    const ks = kerfValues(p), W = p.card.tooth;
    const tip = Math.max(...comb.outer.map((q) => q[1]));
    expect(at(comb.outer, tip)).toEqual(ks.map((k) => W + k).reverse().map((v) => expect.closeTo(v, 9)));
    const depth = Math.max(16, 1.6 * W) - 4;
    expect(at(gauge.outer, depth)).toEqual(ks.map((k) => expect.closeTo(W - k, 9)));
  });

  it("keeps its parts as drawn: no added kerf, never turned", () => {
    for (const pt of buildTestcard(card({ card: { axis: "both" } })).parts) {
      expect(pt).toMatchObject({ ownKerf: true, upright: true });
      expect(cutPart(pt, 0.2, 0.4).outline).toEqual([pt.outer]);
      expect(pt.score?.length).toBeGreaterThan(0);
    }
  });

  it("makes an X and a Y pair, the Y pair turned a quarter", () => {
    const parts = buildTestcard(card({ card: { axis: "both" } })).parts;
    expect(parts.map((p) => p.name)).toEqual(["COMB X", "GAUGE X", "COMB Y", "GAUGE Y"]);
    expect(span(parts[2].outer, 0)).toBeCloseTo(span(parts[0].outer, 1), 9);
    expect(span(parts[2].outer, 1)).toBeCloseTo(span(parts[0].outer, 0), 9);
    expect(buildTestcard(card({ card: { axis: "y" } })).parts.map((p) => p.name)).toEqual(["COMB Y", "GAUGE Y"]);
  });

  it("refuses kerfs that close the gauge's slots", () => {
    expect(buildTestcard(card({ card: { tooth: 4, from: 2, step: 0.5 } })).error).toMatch(/too narrow/);
  });
});

describe("thickness card", () => {
  it("cuts each slot its width less the kerf", () => {
    const p = card({ T: 3, K: 0.2, card: { kind: "thickness", slots: 5, tStep: 0.1 } });
    const [pt] = buildTestcard(p).parts;
    expect(pt.name).toBe("THICKNESS");
    expect(at(pt.outer, 12)).toEqual(slotWidths(p).map((w) => expect.closeTo(w - 0.2, 9)));
  });

  it("refuses slots too narrow to cut", () => {
    expect(buildTestcard(card({ T: 0.5, K: 0.4, card: { kind: "thickness", slots: 11, tStep: 0.1 } })).error).toMatch(/too narrow/);
  });
});

describe("your result", () => {
  it("reads the picked pair or slot", () => {
    expect(testcardMeasured(card())).toBeNull();
    expect(testcardMeasured(card({ pick: { x: 3 } }))).toMatchObject({ kx: 0.15 });
    expect(testcardMeasured(card({ pick: { x: 3, y: 5 } }))?.ky).toBeUndefined();
    expect(testcardMeasured(card({ card: { axis: "both" }, pick: { x: 2, y: 4 } }))).toMatchObject({ kx: 0.1, ky: 0.2, note: expect.stringMatching(/kerf X 0.1 mm .* kerf Y 0.2 mm/) });
    expect(testcardMeasured(card({ T: 3, card: { kind: "thickness", slots: 5, tStep: 0.1 }, pick: { t: 2 } }))).toMatchObject({ T: 2.9 });
    expect(TESTCARD.measured).toBe(testcardMeasured);
  });

  it("offers to recentre a range that misses the kerf or ends at the pick", () => {
    const off = checkTestcard(card({ K: 0.6 }));
    expect(off.map((i) => i.code)).toEqual(["RANGE_OFF"]);
    const moved = off[0].fixes[0].apply(card({ K: 0.6 })) as TestcardParams;
    const ks = kerfValues(moved);
    expect(ks[0]).toBeLessThan(0.6);
    expect(ks[ks.length - 1]).toBeGreaterThan(0.6);
    expect(checkTestcard(moved)).toEqual([]);
    const edge = checkTestcard(card({ pick: { x: 8 } }));
    expect(edge.map((i) => i.code)).toEqual(["PICK_EDGE"]);
    expect(checkTestcard(card({ pick: { x: 4 } }))).toEqual([]);
  });
});

describe("kerf by axis on generator parts", () => {
  it("grows a part by K across vertical edges and Ky across horizontal ones", () => {
    const pt = cutPart(square(20), 0.2, 0.4);
    expect(pt.kerf).toEqual([0.2, 0.4]);
    expect(pt.bbox.x1 - pt.bbox.x0).toBeCloseTo(20.2, 3);
    expect(pt.bbox.y1 - pt.bbox.y0).toBeCloseTo(20.4, 3);
    expect(cutPart(square(20), 0.2).kerf).toBeUndefined();
  });

  it("compensates a part turned on the sheet for the sheet's axes", () => {
    const pt = cutPart({ ...square(20), outer: [[0, 0], [30, 0], [30, 10], [0, 10]] }, 0.2, 0.4);
    const turned = turnCutPart(pt, 90);
    expect(turned.bbox.x1 - turned.bbox.x0).toBeCloseTo(10.2, 3);
    expect(turned.bbox.y1 - turned.bbox.y0).toBeCloseTo(30.4, 3);
  });

  it("uses the sheet's Kerf Y only when separate kerfs are on", () => {
    const base = card({ K: 0.15 });
    expect(kerfOf(base)).toEqual([0.15, 0.15]);
    expect(kerfOf({ ...base, sheet: { ...base.sheet!, kerfXY: true, kerfY: 0.3 } })).toEqual([0.15, 0.3]);
    expect(kerfOf({ ...base, sheet: { ...base.sheet!, kerfXY: false, kerfY: 0.3 } })).toEqual([0.15, 0.15]);
    expect(cleanExtras({ kerfXY: true, kerfY: 9, minFeature: -1 })).toMatchObject({ kerfXY: true, kerfY: 2, minFeature: 0 });
  });

  it("names parts with features thinner than the material holds", () => {
    const comb: GenPart = { id: "c", name: "COMB", outer: [[0, 0], [30, 0], [30, 5], [16, 5], [16, 25], [15, 25], [15, 5], [0, 5]], holes: [] };
    const parts = [cutPart(comb, 0), cutPart(square(20), 0)];
    expect(thinParts(parts, 2)).toEqual(["COMB"]);
    expect(thinParts(parts, 0.5)).toEqual([]);
  });
});
