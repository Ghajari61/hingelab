import { describe, expect, it } from "vitest";
import { ALL_GENERATORS } from "@/lib/generators/all";
import { arrangeGenerator, genSVG } from "@/lib/generators/output";
import { CTX } from "@/lib/generators/__tests__/ctx";
import { clone, DEFAULTS } from "@/lib/hinge";
import { arrangeHinge } from "@/lib/fit/hinge";
import { autoFixAll } from "@/lib/issues";
import { mergeParametricParams } from "@/lib/parametric/defaults";
import { computeParametric, loadSource } from "@/lib/parametric/engine";
import { manifold } from "@/lib/parametric/__tests__/helpers";
import { fabFromGenerator, fabFromHinge, fabFromParametric } from "../adapters";
import { genFabIssues } from "../issues";
import { fabModel, type FabModel } from "../model";
import { repairLayout } from "../repair";
import { insideRegion, selfCrossing, sharedLines, validateFab } from "../validate";

type Pt = [number, number];
const sq = (x: number, y: number, s: number): Pt[] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
const bbox = (cs: Pt[][]) => {
  const xs = cs.flat().map((p) => p[0]), ys = cs.flat().map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
};
interface P { bbox: ReturnType<typeof bbox>; id: string; outline: Pt[][]; inner: Pt[][]; cuts: Pt[][] }
const part = (id: string, outline: Pt[][], inner: Pt[][] = [], cuts: Pt[][] = []): P => ({ id, outline, inner, cuts, bbox: bbox([...outline, ...inner]) });
/** A one-sheet model from parts placed at (ox, oy). */
function model(items: [P, number, number][], sheet = { w: 200, h: 100 }): FabModel {
  return fabModel<P>({
    product: "test", bed: sheet, sheets: [{ x: 0, y: 0, w: sheet.w, h: sheet.h, label: "Sheet 1 of 1" }], material: { name: "Test", T: 3, kx: 0, ky: 0 },
    lay: { items: items.map(([pt, ox, oy], i) => ({ pt, i, w: pt.bbox.x1 - pt.bbox.x0, h: pt.bbox.y1 - pt.bbox.y0, ox, oy })), width: sheet.w, height: sheet.h },
    id: (pt) => pt.id, name: (pt) => pt.id,
    ops: (pt) => ({ outline: pt.outline, inner: pt.inner, cuts: pt.cuts, score: [], engrave: [] }),
  });
}
const codes = (m: FabModel, o = {}) => validateFab(m, o).map((i) => i.code).sort();

describe("geometry checks", () => {
  it("a clean part has none", () => {
    expect(codes(model([[part("a", [sq(0, 0, 20)], [sq(5, 5, 4)]), 10, 10]]))).toEqual([]);
  });

  it("finds a self-crossing outline and says where", () => {
    const bow: Pt[] = [[0, 0], [20, 20], [20, 0], [0, 20]];
    expect(selfCrossing(bow)).toEqual([10, 10]);
    const v = validateFab(model([[part("bow", [bow]), 10, 10]]));
    const x = v.find((i) => i.code === "SELF_INTERSECT")!;
    expect(x.severity).toBe("warning");
    expect(x.partIds).toEqual(["bow"]);
    expect(x.at!.x0).toBeLessThan(20);
    expect(x.at!.x1).toBeGreaterThan(20);
  });

  it("ignores rounding twists too small to cut", () => {
    const c: Pt[] = [[0, 0], [10, 0], [10, 10], [5.002, 10], [5, 10.004], [5.001, 9.996], [0, 10]];
    expect(selfCrossing(c)).toBeNull();
  });

  it("open, empty and repeated-point contours", () => {
    const m = model([[part("a", [sq(0, 0, 20)], [[[5, 5], [6, 6]], [[8, 8], [9, 8], [9, 8.0000001]]]), 0, 0], [part("b", [[[0, 0], [10, 0], [10, 0.00001], [10, 10], [0, 10]]]), 50, 0]]);
    expect(codes(m)).toEqual(["OPEN_PATH", "SHORT_SEGMENTS", "ZERO_AREA"]);
  });

  it("holes outside their part, and pieces that drop out of a hole", () => {
    const m = model([[part("a", [sq(0, 0, 20), sq(8, 8, 4)], [sq(30, 0, 5), sq(6, 6, 8)]), 0, 0]]);
    expect(codes(m)).toEqual(["HOLE_OUTSIDE", "LOOSE_ISLAND"]);
    // A hole in an island in a hole is inside material: the even-odd of the other contours.
    const nested = model([[part("n", [sq(0, 0, 40), sq(10, 10, 20)], [sq(5, 5, 30), sq(15, 15, 10)]), 0, 0]]);
    expect(codes(nested)).toEqual(["LOOSE_ISLAND"]);
  });

  it("lines cut twice, graded by how much", () => {
    const m = model([[part("a", [sq(0, 0, 20)]), 0, 0], [part("b", [sq(20, 0, 20)]), 0, 0]]);
    const d = validateFab(m).find((i) => i.code === "DUPLICATE_CUT")!;
    expect(d.severity).toBe("warning");
    expect(d.partIds.sort()).toEqual(["a", "b"]);
    expect(d.message).toMatch(/^20 mm/);
    const little = model([[part("a", [sq(0, 0, 20)], [], [[[20, 5], [20, 6.5]]]), 0, 0]]);
    expect(validateFab(little).find((i) => i.code === "DUPLICATE_CUT")!.severity).toBe("note");
    expect(sharedLines([{ c: sq(0, 0, 10), closed: true }, { c: sq(10.5, 0, 10), closed: true }])).toEqual([]);
  });

  it("overlapping parts, but not a part nested in another's hole", () => {
    expect(codes(model([[part("a", [sq(0, 0, 30)]), 0, 0], [part("b", [sq(0, 0, 30)]), 20, 10]]))).toContain("OVERLAP");
    expect(codes(model([[part("big", [sq(0, 0, 60)], [sq(10, 10, 40)]), 0, 0], [part("small", [sq(0, 0, 20)]), 20, 20]]))).toEqual([]);
    expect(codes(model([[part("big", [sq(0, 0, 60)]), 0, 0], [part("inside", [sq(0, 0, 10)]), 20, 20]]))).toContain("OVERLAP");
  });

  it("parts off the sheet and in a keep-out", () => {
    expect(validateFab(model([[part("a", [sq(0, 0, 20)]), 190, 10]])).map((i) => [i.code, i.severity])).toEqual([["OFF_SHEET", "blocking"]]);
    expect(codes(model([[part("a", [sq(0, 0, 20)]), 10, 10]]), { keepOut: [{ x: 0, y: 0, w: 15, h: 15 }] })).toEqual(["KEEP_OUT"]);
  });

  it("narrow bars against the material's minimum feature", () => {
    const bar: Pt[] = [[0, 0], [40, 0], [40, 10], [21, 10], [21, 30], [19, 30], [19, 10], [0, 10]];
    expect(codes(model([[part("t", [bar]), 0, 0]]), { minFeature: 3 })).toEqual(["NARROW"]);
    expect(codes(model([[part("t", [bar]), 0, 0]]), { minFeature: 1 })).toEqual([]);
  });

  it("even-odd inside test", () => {
    expect(insideRegion([5, 5], [sq(0, 0, 10)])).toBe(true);
    expect(insideRegion([5, 5], [sq(0, 0, 10), sq(2, 2, 6)])).toBe(false);
  });
});

describe("every product's presets", () => {
  it("no generator preset has a blocking geometry problem, and checking is quick", () => {
    let slowest = 0;
    for (const def of ALL_GENERATORS) for (const pr of def.presets) {
      const p = def.merge(pr.params);
      const m = fabFromGenerator(def.id, p, arrangeGenerator(def, p, CTX))!;
      const t = performance.now();
      const v = validateFab(m);
      slowest = Math.max(slowest, performance.now() - t);
      expect(v.filter((i) => i.severity === "blocking").map((i) => i.message), `${def.id}/${pr.id}`).toEqual([]);
    }
    expect(slowest).toBeLessThan(250);
  }, 300_000);

  it("Hinge Box and Parametric", async () => {
    const h = clone(DEFAULTS);
    expect(validateFab(fabFromHinge(h, arrangeHinge(h))!)).toEqual([]);
    const p = mergeParametricParams({ source: { kind: "library", id: "sphere", detail: 4 } });
    const r = computeParametric(p, await loadSource(p), await manifold());
    expect(validateFab(fabFromParametric(p, r)).filter((i) => i.severity === "blocking")).toEqual([]);
  }, 60_000);
});

describe("clean-up", () => {
  const def = ALL_GENERATORS.find((g) => g.id === "shadowbox")!;
  const p = def.merge(def.presets.find((x) => x.id === "pine-ridge")!.params);

  it("is offered as a safe fix, removes the empty slivers, and says what it did", () => {
    const a = arrangeGenerator(def, p, CTX);
    const before = genFabIssues(validateFab(fabFromGenerator("shadowbox", p, a)!), p, a.repaired);
    const empty = before.find((i) => i.code === "FAB_ZERO_AREA")!;
    expect(empty.fixes).toEqual([expect.objectContaining({ id: "repair", safe: true })]);
    const q = empty.fixes[0].apply(p);
    expect(q.sheet?.repair).toBe(true);
    const b = arrangeGenerator(def, q, CTX);
    expect(b.repaired!.empty).toBe(2);
    const after = genFabIssues(validateFab(fabFromGenerator("shadowbox", q, b)!), q, b.repaired);
    expect(after.find((i) => i.code === "FAB_ZERO_AREA")).toBeUndefined();
    const note = after.find((i) => i.code === "FAB_REPAIRED")!;
    expect(note.message).toMatch(/removed 2 empty shapes/);
    expect(note.fixes[0].safe).toBe(false);
    expect(note.fixes[0].apply(q).sheet?.repair).toBeUndefined();
    expect(genSVG(def, q, b.lay!)).toContain("Cut paths cleaned up");
  });

  it("Auto-fix all applies it once and stops", () => {
    const check = (q: typeof p) => { const a = arrangeGenerator(def, q, CTX); return genFabIssues(validateFab(fabFromGenerator("shadowbox", q, a)!), q, a.repaired); };
    const r = autoFixAll(p, check);
    expect(r.applied).toEqual(["Clean up the cut paths"]);
  });

  it("changes nothing on a clean layout", () => {
    const sign = ALL_GENERATORS.find((g) => g.id === "sign")!;
    const a = arrangeGenerator(sign, sign.merge({}), CTX);
    const r = repairLayout(a.lay!);
    expect(r.count).toEqual({ points: 0, empty: 0, repeated: 0 });
    expect(r.lay.items.map((it) => it.pt.outline)).toEqual(a.lay!.items.map((it) => it.pt.outline));
  });

  it("removes a contour repeated within a part, whatever its start and direction", () => {
    const sign = ALL_GENERATORS.find((g) => g.id === "sign")!;
    const a = arrangeGenerator(sign, sign.merge({}), CTX);
    const it0 = a.lay!.items[0];
    const c = it0.pt.outline[0];
    const twisted = [...c.slice(3), ...c.slice(0, 3)].reverse();
    const lay = { ...a.lay!, items: [{ ...it0, pt: { ...it0.pt, inner: [...it0.pt.inner, twisted] } }] };
    expect(repairLayout(lay).count.repeated).toBe(1);
  });
});
