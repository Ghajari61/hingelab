import { describe, expect, it } from "vitest";
import { CALIBRATION } from "../calibration";
import { ladderSteps, hingePitches } from "../calibration/params";
import { calibrationFromCoupons, kerfFromStrips } from "../calibration/results";
import { arrangeGenerator, genSVG } from "../output";
import { applyCalibration, materialInfo, type UserMaterial } from "@/lib/materials/library";
import { CTX } from "./ctx";

const span = (c: [number, number][], i: 0 | 1) => Math.max(...c.map((p) => p[i])) - Math.min(...c.map((p) => p[i]));

describe("calibration coupons", () => {
  it("builds every preset and the defaults", () => {
    for (const raw of [{}, ...CALIBRATION.presets.map((p) => p.params)]) {
      const out = CALIBRATION.build(CALIBRATION.merge(raw), CTX);
      expect(out.error).toBeUndefined();
      expect(out.parts.length).toBeGreaterThan(0);
      expect(out.assembly?.length).toBeGreaterThan(0);
    }
  });

  it("strips are cut with the kerf once and never turned", () => {
    const p = CALIBRATION.merge({ K: 0.2, sheet: { nest: "outline" } });
    const a = arrangeGenerator(CALIBRATION, p, CTX);
    const items = a.lay!.items.filter((it) => it.i >= 0);
    expect(items.every((it) => !it.pt.turned)).toBe(true);
    const x1 = items.find((it) => it.pt.src.id === "kerf-x-1")!;
    expect(span(x1.pt.outline[0] as [number, number][], 0)).toBeCloseTo(p.kerf.width + p.K, 2);
    const y1 = items.find((it) => it.pt.src.id === "kerf-y-1")!;
    expect(span(y1.pt.outline[0] as [number, number][], 1)).toBeCloseTo(p.kerf.width + p.K, 2);
  });

  it("each slot is cut at the thickness plus its clearance, less the kerf (the beam adds it back)", () => {
    const p = CALIBRATION.merge({ T: 3, K: 0.2, kerf: { on: false }, hinge: { on: false } });
    const a = arrangeGenerator(CALIBRATION, p, CTX);
    const plate = a.lay!.items.find((it) => it.pt.src.id === "fit-ladder")!;
    const cs = ladderSteps(p.ladder);
    expect(cs).toEqual([-0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2]);
    const widths = plate.pt.inner.map((h) => span(h as [number, number][], 0)).sort((x, y) => x - y);
    cs.forEach((c, i) => expect(widths[i]).toBeCloseTo(3 + c - 0.2, 2));
  });

  it("refuses a ladder whose narrowest slot is no wider than the kerf", () => {
    const out = CALIBRATION.build(CALIBRATION.merge({ T: 0.2, K: 0.3, ladder: { from: -0.1 } }), CTX);
    expect(out.error).toMatch(/no wider than the kerf/);
  });

  it("the hinge strip has one zone per spacing, slits as open cuts", () => {
    const p = CALIBRATION.merge({ kerf: { on: false }, ladder: { on: false } });
    expect(hingePitches(p.hinge)).toEqual([1.5, 2, 2.5, 3]);
    const out = CALIBRATION.build(p, CTX);
    expect(out.parts[0].cuts!.length).toBeGreaterThan(20);
    expect(out.stats.find((s) => s.label.includes("estimate"))).toBeTruthy();
  });

  it("the file has outlines, inner cuts and scored labels", () => {
    const p = CALIBRATION.defaults();
    const svg = genSVG(CALIBRATION, p, arrangeGenerator(CALIBRATION, p, CTX).lay!);
    for (const id of ["outline", "slots", "hinge"]) expect(svg).toContain(`<g id="${id}"`);
  });
});

describe("coupon results", () => {
  it("finds the kerf the strips were really cut with", () => {
    // Cut with K 0.15, the beam really took 0.21: each 10 mm strip measures 10 + 0.15 - 0.21.
    expect(kerfFromStrips(0.15, 5, 10, 5 * (10 + 0.15 - 0.21))).toBeCloseTo(0.21, 6);
    expect(kerfFromStrips(0.15, 5, 10, 50.75)).toBe(0);
    expect(kerfFromStrips(0.15, 5, 10, 20)).toBeNull();
  });

  it("writes measured values to the material and marks it tested", () => {
    const m: UserMaterial = { id: "my-cal", name: "Birch", T: 3, kx: 0.15, ky: 0.15, minFeature: 0, like: "birch3", laser: {} };
    const r = calibrationFromCoupons({ cutKx: 0.15, cutKy: 0.15, strips: 5, width: 10, totalX: 49.7, totalY: 49.6, clearance: 0.05, hingeRadius: 18 }, "2026-10-20");
    expect("cal" in r).toBe(true);
    const next = applyCalibration(m, (r as { cal: never }).cal);
    expect(next.kx).toBeCloseTo(0.21, 6);
    expect(next.ky).toBeCloseTo(0.23, 6);
    expect(next.clearance).toBe(0.05);
    expect(next.calibration).toMatchObject({ date: "2026-10-20", hingeRadius: 18 });
    expect(materialInfo(next.id, [next])!.tested).toBe(true);
  });

  it("names a reading that cannot be right, and needs at least one", () => {
    expect(calibrationFromCoupons({ cutKx: 0.15, cutKy: 0.15, strips: 5, width: 10, totalX: 10 }, "2026-10-20")).toMatchObject({ error: expect.stringMatching(/X strips/) });
    expect(calibrationFromCoupons({ cutKx: 0.15, cutKy: 0.15, strips: 5, width: 10 }, "2026-10-20")).toEqual({ error: "Enter at least one measurement." });
  });
});
