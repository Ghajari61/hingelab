import { describe, expect, it } from "vitest";
import { manifold } from "@/lib/parametric/__tests__/helpers";
import {
  CONTOUR_OVERHEAD, CUT_SPEEDS, FORMULA_DEFAULTS, PARAMETRIC_DEFAULTS, assemblyGuideSVG, computeParametric, cutSpeedOf, estimateCutMinutes, fmtMinutes,
  loadSource, mergeParametricParams, type ParametricParams,
} from "@/lib/parametric";
import { FREE_PARAMETRIC_PARTS, parametricLock, parametricLocks } from "@/lib/plans";
import { exportParametricForPlan, parseParametricRequest } from "../exportParametric";

const params = (patch: Partial<ParametricParams> = {}) => mergeParametricParams({ ...structuredClone(PARAMETRIC_DEFAULTS), ...patch });

describe("Parametric plan rules", () => {
  it("Free: library shapes and parallel fins only, at most 30 parts; Pro: everything", () => {
    const lib = params();
    expect(parametricLocks("free", lib)).toEqual([]);
    expect(parametricLocks("free", lib, FREE_PARAMETRIC_PARTS)).toEqual([]);
    expect(parametricLocks("free", lib, FREE_PARAMETRIC_PARTS + 1)).toEqual(["More than 30 parts (this design has 31)"]);
    expect(parametricLocks("free", { source: { kind: "mesh" }, method: "parallel" })).toEqual(["Importing a 3D file"]);
    expect(parametricLocks("free", { source: { kind: "image" }, method: "parallel" })).toEqual(["Photo relief"]);
    expect(parametricLocks("free", { source: { kind: "formula" }, method: "parallel" })).toEqual(["Formula shapes"]);
    expect(parametricLocks("free", { source: { kind: "library" }, method: "waffle" })).toEqual(["Waffle"]);
    expect(parametricLocks("free", { source: { kind: "library" }, method: "curveNormal" })).toEqual(["Fins along a curve"]);
    expect(parametricLocks("free", { source: { kind: "mesh" }, method: "stacked" }, 99)).toHaveLength(3);
    expect(parametricLocks("pro", { source: { kind: "image" }, method: "radial" }, 500)).toEqual([]);
    expect(parametricLock("free", { source: { kind: "image" }, method: "radial" })).toMatch(/^Photo relief and Radial fins need Pro\. On the Free plan you can preview library shapes as parallel fins with up to 30 parts/);
    expect(parametricLock("pro", { source: { kind: "image" }, method: "radial" })).toBeNull();
  });
});

describe("cut-time estimate", () => {
  it("laser time = cut / speed × passes + score / speed + contours × overhead", () => {
    const s = CUT_SPEEDS.birch3;
    expect(estimateCutMinutes(1200, 300, 10, s)).toBeCloseTo((1200 / 12 + 300 / 150 + 10 * CONTOUR_OVERHEAD) / 60, 12);
    expect(cutSpeedOf("birch3", 3)).toBe(s);
    expect(cutSpeedOf("custom", 6).cut).toBeCloseTo(6, 12);
    expect(cutSpeedOf("custom", 9).passes).toBe(2);
    expect(fmtMinutes(0.2)).toBe("about 1 min");
    expect(fmtMinutes(42.4)).toBe("about 42 min");
    expect(fmtMinutes(100)).toBe("about 1 h 40 min");
    expect(fmtMinutes(120)).toBe("about 2 h");
  });

  it("every result carries it, and the assembly guide states it", async () => {
    const p = params();
    const r = computeParametric(p, await loadSource(p), await manifold());
    const contours = r.parts.reduce((a, q) => a + q.cut!.outline.length + q.cut!.inner.length + q.engrave.length, 0);
    expect(r.stats.estimatedCutTime).toBeCloseTo(estimateCutMinutes(r.stats.cutLength, r.stats.engraveLength, contours, cutSpeedOf(p.material.id, p.material.T)), 9);
    expect(r.stats.estimatedCutTime).toBeGreaterThan(1);
    expect(assemblyGuideSVG(r, p)).toContain(`${fmtMinutes(r.stats.estimatedCutTime)} on the laser`);
  });
});

describe("server export with the plan applied", () => {
  it("Free cannot download any Parametric file", async () => {
    const out = await exportParametricForPlan(params(), { kind: "zip" }, "free", await manifold());
    expect(out).toMatchObject({ ok: false, status: 403 });
    if (!out.ok) expect(out.error).toMatch(/Saving and exporting need Pro/);
  });

  it("Free sheet export is refused", async () => {
    const out = await exportParametricForPlan(params(), { kind: "sheet", index: 0 }, "free", await manifold());
    expect(out).toMatchObject({ ok: false, status: 403 });
  });

  it("Free is refused; Pro gets clean files", async () => {
    const wasm = await manifold();
    const dense = params({ parallel: { ...PARAMETRIC_DEFAULTS.parallel, spacing: 5 } });
    const many = await exportParametricForPlan(dense, { kind: "zip" }, "free", wasm);
    expect(many).toMatchObject({ ok: false, status: 403 });
    if (!many.ok) expect(many.error).toMatch(/Saving and exporting need Pro/);

    const formula = params({ source: structuredClone(FORMULA_DEFAULTS.heightfield) });
    expect(await exportParametricForPlan(formula, { kind: "zip" }, "free", wasm)).toMatchObject({ ok: false, status: 403 });
    expect(await exportParametricForPlan(params({ method: "stacked" }), { kind: "guide" }, "free", wasm)).toMatchObject({ ok: false, status: 403 });
    const mesh = params({ source: { kind: "mesh", fileName: "head.stl", units: "mm", upAxis: "Y" } });
    expect(await exportParametricForPlan(mesh, { kind: "zip" }, "free", wasm)).toMatchObject({ ok: false, status: 403 });
    expect(await exportParametricForPlan(mesh, { kind: "zip" }, "pro", wasm)).toMatchObject({ ok: false, status: 422 });

    const pro = await exportParametricForPlan(dense, { kind: "sheet", index: 0 }, "pro", wasm);
    if (!pro.ok) throw new Error(pro.error);
    expect(pro.body as string).not.toContain("watermark");
    const proFormula = await exportParametricForPlan(formula, { kind: "guide" }, "pro", wasm);
    expect(proFormula.ok && (proFormula.body as string).includes("<svg")).toBe(true);
    expect(await exportParametricForPlan(params(), { kind: "sheet", index: 99 }, "pro", wasm)).toMatchObject({ ok: false, status: 400 });
  });

  it("requests are validated", () => {
    expect(parseParametricRequest(null, undefined)).toEqual({ error: "Missing sculpture settings." });
    expect(parseParametricRequest([], undefined)).toEqual({ error: "Missing sculpture settings." });
    expect(parseParametricRequest({}, { kind: "everything" })).toEqual({ error: "Unknown export." });
    expect(parseParametricRequest({}, { kind: "sheet", index: -1 })).toEqual({ error: "Unknown export." });
    expect(parseParametricRequest({ source: { ...FORMULA_DEFAULTS.heightfield, resolution: 5000 } }, undefined)).toEqual({ error: "Invalid formula resolution." });
    const ok = parseParametricRequest({ name: "Wave" }, { kind: "sheet", index: 1 });
    expect("p" in ok && ok.p.name === "Wave" && ok.what.kind === "sheet").toBe(true);
    expect(parseParametricRequest({}, undefined)).toMatchObject({ what: { kind: "zip" } });
  });
});
