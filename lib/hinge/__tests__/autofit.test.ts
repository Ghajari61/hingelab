import { describe, expect, it } from "vitest";
import { autoFit, clone, computeModel, DEFAULTS } from "../index";
import type { Params } from "../types";

describe("D. auto-fit", () => {
  const cases: [string, Partial<Params>][] = [
    ["DEFAULTS with R=12", { R: 12 }],
    ["R=40, W=200, D=140", { R: 40, W: 200, D: 140 }],
  ];
  for (const [label, over] of cases) {
    it(label, () => {
      const p = Object.assign(clone(DEFAULTS), over);
      const model = computeModel(p);
      if ("error" in model) throw new Error(`unexpected error: ${model.error}`);
      const res = autoFit(p, model.hBody, model.rN);
      expect(res.ok).toBe(true);
      expect(res.a.rMin * 1.3).toBeLessThanOrEqual(model.rN);
    });
  }
});
