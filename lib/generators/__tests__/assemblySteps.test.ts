import { describe, expect, it } from "vitest";
import { manifold } from "@/lib/parametric/__tests__/helpers";
import { PARAMETRIC_DEFAULTS, assemblyGuideSVG, computeParametric, loadSource, mergeParametricParams } from "@/lib/parametric";
import { SHARED_LINES_STEP, assemblySteps } from "../output";

describe("assembly steps for parts that touch", () => {
  it("generators: the shared-line step comes first only at Spacing 0", () => {
    const steps = ["Glue the sides.", "Add the lid."];
    expect(assemblySteps(steps, 4)).toEqual(steps);
    expect(assemblySteps(steps, 0)).toEqual([SHARED_LINES_STEP, ...steps]);
    expect(assemblySteps(undefined, 0)).toEqual([SHARED_LINES_STEP]);
    expect(assemblySteps(undefined, 2)).toEqual([]);
  });

  it("Parametric: the printed guide says so at Part gap 0", async () => {
    const p = mergeParametricParams(structuredClone(PARAMETRIC_DEFAULTS));
    const r = computeParametric(p, await loadSource(p), await manifold());
    expect(assemblyGuideSVG(r, p)).not.toContain("Part gap 0");
    const q = { ...p, material: { ...p.material, partGap: 0 } };
    expect(assemblyGuideSVG(r, q)).toContain("2. The parts touch on the sheet (Part gap 0)");
  });
});
