import { describe, expect, it } from "vitest";
import { parametricRequestError } from "@/lib/billing/validate";
import { MATERIALS } from "@/lib/hinge";
import { LUMBER, railSpans } from "../backboard";
import { mergeParametricParams } from "../defaults";
import { computeParametric, loadSource } from "../engine";
import { mountEstimate, sheetsLabel } from "../mount";
import { PATTERN_SOURCE_DEFAULTS } from "../source/pattern";
import type { ParametricParams, RailMount } from "../types";
import { manifold } from "./helpers";

const piece = (rails?: Partial<RailMount>, more: Partial<ParametricParams["parallel"]> = {}): ParametricParams => {
  const p = mergeParametricParams({ source: { ...PATTERN_SOURCE_DEFAULTS, width: 400, height: 300, depth: 40, resolution: 64 }, method: "parallel" });
  Object.assign(p.parallel, { backboard: "rails", fillEmptySlots: true, spacing: 15, slatDepth: 10, rails: { lumber: "1x2", count: 2, clearance: 0.5, ...rails }, ...more });
  return p;
};
const build = async (p: ParametricParams) => computeParametric(p, await loadSource(p), await manifold());

describe("Parametric rails", () => {
  it("notches every slat over the rails: no backboard, no tabs, and the slats stay whole", async () => {
    const p = piece();
    const r = await build(p);
    expect(r.parts.some((q) => q.kind === "backboard")).toBe(false);
    const slats = r.parts.filter((q) => q.kind === "slat" || q.kind === "fin");
    expect(slats.length).toBeGreaterThan(15);
    expect(slats.every((q) => !q.tabs?.length)).toBe(true);
    const ys = slats[0].shape.outer.map((q) => q[1]);
    // The notch's roof at the rail's thickness plus the clearance.
    expect(ys.some((y) => Math.abs(y - (LUMBER["1x2"].t + 0.5)) < 1e-6)).toBe(true);
    // Each slat is one piece (its id has no -A/-B suffix).
    expect(slats.every((q) => !/-[A-Z]$/.test(q.id))).toBe(true);
    // Deepened to clear the 19 mm notch, with a note.
    expect(r.warnings.some((w) => w.code === "NOTCH_DEEP")).toBe(true);
    expect(r.guide.some((g) => /rails? of 1x2/.test(g))).toBe(true);
  }, 60000);

  it("one rail goes across the middle; wider lumber cuts wider notches", () => {
    const one = railSpans(0, 300, { lumber: "1x4", count: 1, clearance: 0 });
    expect(one).toHaveLength(1);
    expect(one[0][0] + one[0][1]).toBeCloseTo(300, 6);
    expect(one[0][1] - one[0][0]).toBe(89);
    expect(railSpans(0, 300, { lumber: "1x2", count: 2, clearance: 1 }).map(([a, b]) => b - a)).toEqual([40, 40]);
  });

  it("warns when a rail is close to the slats' ends", async () => {
    const p = piece({ lumber: "1x4" });
    p.source = { ...PATTERN_SOURCE_DEFAULTS, width: 400, height: 140, depth: 30, resolution: 48 };
    const r = await build(p);
    expect(r.warnings.some((w) => w.code === "RAIL_NEAR_END")).toBe(true);
  }, 60000);

  it("estimates the rails' lumber and screws, and words the sheet count", async () => {
    const p = piece();
    const r = await build(p);
    const m = mountEstimate(p, r)!;
    expect(m.rails).toBe(2);
    expect(m.lumber).toMatch(/1x2/);
    expect(m.railLength).toBeGreaterThan(380);
    expect(m.wallScrews).toBe(2 * (Math.ceil(m.railLength / 400) + 1));
    expect(m.pins).toBe(2 * r.parts.filter((q) => q.kind === "slat" || q.kind === "fin").length);
    expect(mountEstimate({ ...p, parallel: { ...p.parallel, backboard: "slats" } }, r)).toBeNull();
    const q = { ...p, material: { ...p.material, sheetW: 609.6, sheetH: 304.8 } };
    expect(sheetsLabel(q, 10, true)).toBe("~10 sheets of 24 × 12 in");
    expect(sheetsLabel(q, 1, false)).toBe("1 sheet of 610 × 305 mm");
  }, 60000);

  it("the server checks the rails; a 1/4 inch board is in the materials", () => {
    expect(parametricRequestError(piece())).toBeNull();
    expect(parametricRequestError(piece({ lumber: "2x6" as never }))).not.toBeNull();
    expect(parametricRequestError(piece({ count: 5 as never }))).not.toBeNull();
    expect(MATERIALS.birch14.T).toBe(6.35);
  });
});
