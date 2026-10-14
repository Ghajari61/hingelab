import { describe, expect, it } from "vitest";
import { autoFit, barWidth, clone, computeModel, DEFAULTS, honeyLattice, withFittedLattice } from "../index";
import { offsetPolyXY } from "../polygon";
import { hingeRequestError } from "@/lib/billing/validate";
import { evalNumberExpr } from "@/lib/studio/expr";
import type { Model, Params, PlatePart, Point, WallPart } from "../types";

const box = (over: Partial<Params> = {}): Params => Object.assign(clone(DEFAULTS), over);
function model(over: Partial<Params> = {}): Model {
  const m = computeModel(box(over));
  if ("error" in m) throw new Error(m.error);
  return m;
}
const plate = (m: Model, name: string) => m.parts.find((p): p is PlatePart => p.kind === "plate" && p.name === name);
const walls = (m: Model) => m.parts.filter((p): p is WallPart => p.kind === "wall" && !p.test);
const size = (b: { x0: number; y0: number; x1: number; y1: number }) => ({ w: b.x1 - b.x0, h: b.y1 - b.y0 });

/** Distance from point q to the line through a and b. */
const lineDist = (q: Point, a: Point, b: Point) => Math.abs((b[0] - a[0]) * (a[1] - q[1]) - (a[0] - q[0]) * (b[1] - a[1])) / Math.hypot(b[0] - a[0], b[1] - a[1]);

describe("separate X and Y kerf", () => {
  it("grows the base by Kerf X across and Kerf Y down", () => {
    const one = size(plate(model(), "BASE")!.bbox);
    expect(one.w).toBeCloseTo(DEFAULTS.W + DEFAULTS.K, 6);
    expect(one.h).toBeCloseTo(DEFAULTS.D + DEFAULTS.K, 6);
    const two = size(plate(model({ Ky: 0.35 }), "BASE")!.bbox);
    expect(two.w).toBeCloseTo(DEFAULTS.W + DEFAULTS.K, 6);
    expect(two.h).toBeCloseTo(DEFAULTS.D + 0.35, 6);
  });

  it("changes only the wall's height", () => {
    const a = size(walls(model())[0].bbox), b = size(walls(model({ Ky: 0.35 }))[0].bbox);
    expect(b.w).toBeCloseTo(a.w, 6);
    expect(b.h - a.h).toBeCloseTo(0.35 - DEFAULTS.K, 6);
  });

  it("rejects a Kerf Y as thick as the sheet", () => {
    expect(computeModel(box({ Ky: 3 }))).toEqual({ error: expect.stringMatching(/Kerf Y/) });
  });
});

describe("exact miter offset", () => {
  it("moves each side of a square by half its own kerf", () => {
    const o = offsetPolyXY([[0, 0], [10, 0], [10, 10], [0, 10]], 0.2, 0.4);
    const xs = o.map((p) => p[0]), ys = o.map((p) => p[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(10.2, 9);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(10.4, 9);
  });

  it("moves a slanted side by the kerf across it", () => {
    const hex: Point[] = Array.from({ length: 6 }, (_, i) => [5 * Math.cos((i * Math.PI) / 3 + Math.PI / 6), 5 * Math.sin((i * Math.PI) / 3 + Math.PI / 6)]);
    const o = offsetPolyXY(hex, 0.2, 0.4);
    for (let i = 0; i < 6; i++) {
      const a = hex[i], b = hex[(i + 1) % 6], ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey);
      const want = Math.hypot((ey / l) * 0.2, (ex / l) * 0.4) / 2;
      expect(lineDist(o[i], a, b)).toBeCloseTo(want, 9);
      expect(lineDist(o[(i + 1) % 6], a, b)).toBeCloseTo(want, 9);
    }
  });
});

describe("honeycomb hinge", () => {
  const honey = box({ pattern: "honeycomb", R: 40, slotW: 4, pitch: 2.5 });

  it("leaves the other patterns' settings alone", () => {
    const p = box();
    expect(honeyLattice(p)).toBe(p);
  });

  it("derives the cells from the cell width and the column spacing", () => {
    const q = honeyLattice(honey);
    expect(q.slit).toBeCloseTo((2 * 4) / Math.sqrt(3), 3);
    expect(q.bridge).toBeCloseTo(2 * Math.sqrt(3) * 2.5 - q.slit, 3);
    expect(barWidth(honey)).toBeCloseTo(1, 9);
  });

  it("builds a box and estimates its bend from the walls between cells", () => {
    const m = model({ pattern: "honeycomb", R: 40, slotW: 4, pitch: 2.5 });
    expect(m.analysis.barW).toBeCloseTo(1, 9);
    expect(m.analysis.rMin).toBeGreaterThan(0);
    expect(walls(m).every((w) => w.outline.length > 4 && w.caps.length === 0)).toBe(true);
  });

  it("refuses walls too thin to cut", () => {
    expect(computeModel(box({ pattern: "honeycomb", slotW: 4.9, pitch: 2.5 }))).toEqual({ error: expect.stringMatching(/Honeycomb walls/) });
  });

  it("auto-fits a cell width and spacing that bend round a large corner", () => {
    const big = box({ pattern: "honeycomb", W: 200, D: 160, R: 60, slotW: 4, pitch: 2.5 });
    const m = computeModel(big);
    if ("error" in m) throw new Error(m.error);
    const res = autoFit(big, m.hBody, m.rN);
    expect(res.ok).toBe(true);
    const fitted = withFittedLattice(big, res.q);
    expect(fitted.slit).toBe(big.slit);
    const m2 = computeModel(fitted);
    if ("error" in m2) throw new Error(m2.error);
    expect(m2.analysis.rMin * 1.3).toBeLessThanOrEqual(m2.rN + 1e-9);
    expect(barWidth(fitted)).toBeGreaterThanOrEqual(0.9 - 1e-9);
  });

  it("says when no honeycomb bends round a small corner", () => {
    const m = model({ pattern: "honeycomb", slotW: 4, pitch: 2.5 });
    const res = autoFit(honey, m.hBody, m.rN);
    expect(res.ok).toBe(false);
    expect(res.a.rMin).toBeGreaterThan(m.rN);
  });

  it("is a valid export request", () => {
    expect(hingeRequestError(honey)).toBeNull();
  });
});

describe("lid options", () => {
  it("makes the lid wider by the overhang all round", () => {
    const m = model({ lidOver: 6 });
    const base = size(plate(m, "BASE")!.bbox), lid = size(plate(m, "LID")!.bbox);
    expect(lid.w - base.w).toBeCloseTo(12, 6);
    expect(lid.h - base.h).toBeCloseTo(12, 6);
    expect(size(plate(m, "LID LIP")!.bbox).w).toBeLessThan(base.w);
  });

  it("cuts a finger hole through the lid and its lip", () => {
    const m = model({ lidHole: "finger" });
    for (const name of ["LID", "LID LIP"]) {
      const pt = plate(m, name)!;
      expect(pt.hole).toBe(11);
      const hole = pt.slots[pt.slots.length - 1], xs = hole.map((p) => p[0]);
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(22 - DEFAULTS.K, 3);
    }
  });

  it("puts a knob hole in a fixed lid beside its tab slots", () => {
    const m = model({ lid: "fixed", lidHole: "knob", lidHoleD: 6 });
    const lid = plate(m, "LID")!, base = plate(m, "BASE")!;
    expect(lid.slots).toHaveLength(base.slots.length + 1);
    expect(lid.hole).toBe(3);
  });

  it("leaves out a hole too big for the lid and says so", () => {
    const m = model({ lidHole: "finger", lidHoleD: 200 });
    expect(plate(m, "LID")!.hole).toBeUndefined();
    expect(m.issues.some((i) => /too big/.test(i.msg))).toBe(true);
  });

  it("can drop the lip", () => {
    const m = model({ lidLip: false });
    expect(plate(m, "LID LIP")).toBeUndefined();
    expect(plate(m, "LID")).toBeDefined();
  });

  it("validates the new settings when they are given", () => {
    expect(hingeRequestError(box({ lidOver: 5, lidHole: "knob", lidHoleD: 6, lidLip: false, Ky: 0.2, gamma: 0.02, minFeature: 1 }))).toBeNull();
    expect(hingeRequestError(box({ lidHole: "square" as never }))).not.toBeNull();
    expect(hingeRequestError(box({ Ky: 9 }))).not.toBeNull();
    expect(hingeRequestError(box({ lidLip: "yes" as never }))).not.toBeNull();
  });
});

describe("whole tabs, any thickness, mixed units", () => {
  const shapes: Partial<Params>[] = [
    {}, { W: 97, D: 61 }, { shape: "poly", sides: 7, W: 150 }, { shape: "cyl", dia: 120 }, { shape: "pill", W: 180, D: 70 }, { split: 2, W: 260 }, { lid: "fixed", W: 123, D: 77 },
  ];
  for (const over of shapes) {
    it(`never cuts a part tab: ${JSON.stringify(over)}`, () => {
      const m = model(over);
      for (const e of m.core.edges) for (const u of e.tabs) {
        expect(u - DEFAULTS.tabW / 2).toBeGreaterThanOrEqual(-1e-9);
        expect(u + DEFAULTS.tabW / 2).toBeLessThanOrEqual(e.len + 1e-9);
      }
      let tabs = 0;
      for (const w of walls(m)) {
        const yMax = Math.max(...w.outline.map((p) => p[1]));
        w.outline.forEach((a, i) => {
          const b = w.outline[(i + 1) % w.outline.length];
          if (Math.abs(a[1] - yMax) > 1e-6 || Math.abs(b[1] - yMax) > 1e-6) return;
          tabs++;
          expect(Math.abs(b[0] - a[0])).toBeCloseTo(DEFAULTS.tabW + DEFAULTS.K, 6);
        });
      }
      expect(tabs).toBeGreaterThan(0);
    });
  }

  it("builds boxes in thick sheet", () => {
    for (const T of [6, 12, 18]) {
      const m = computeModel(box({ T, K: 0.25, R: 60, W: 300, D: 220, H: 160, slotW: 1.2, pitch: 4, tabW: 20 }));
      expect("error" in m ? m.error : null).toBeNull();
    }
    expect(hingeRequestError(box({ T: 40 }))).toBeNull();
  });

  it("reads lengths typed in other units", () => {
    expect(evalNumberExpr("1/8in", { current: 3, unit: "mm" })).toBeCloseTo(3.175, 9);
    expect(evalNumberExpr("3mm", { current: 0.1, unit: "in" })).toBeCloseTo(3 / 25.4, 9);
    expect(evalNumberExpr("2cm", { current: 3, unit: "mm" })).toBeCloseTo(20, 9);
  });
});
