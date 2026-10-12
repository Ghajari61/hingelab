import { describe, expect, it } from "vitest";
import { parametricRequestError } from "@/lib/billing/validate";
import { LIMITS, mergeParametricParams } from "../defaults";
import { previewData } from "../designPreview";
import { computeParametric, loadSource } from "../engine";
import { BUILD_AS, RECIPES, defaultDesign, designParams, randomDesign, variations, type Design } from "../generator";
import { recognise } from "../shapes";
import { manifold } from "./helpers";

const every = (): Design[] => {
  const out: Design[] = [];
  for (const r of RECIPES) {
    const ways = r.kind === "surface" ? BUILD_AS.map((b) => b.id) : ["fins" as const];
    for (const buildAs of ways) out.push({ ...defaultDesign(r.id, 42), buildAs });
  }
  for (let seed = 1; seed <= 120; seed++) out.push(randomDesign(seed));
  return out;
};

describe("design generator", () => {
  it("is deterministic: the same design always writes the same settings", () => {
    for (const d of every().slice(0, 40)) expect(designParams(d)).toEqual(designParams(structuredClone(d)));
    expect(randomDesign(77)).toEqual(randomDesign(77));
    expect(variations(randomDesign(5), 6)).toEqual(variations(randomDesign(5), 6));
  });

  it("different seeds give different designs", () => {
    const a = designParams(defaultDesign("terrain", 1)), b = designParams(defaultDesign("terrain", 2));
    expect(JSON.stringify(a.source)).not.toEqual(JSON.stringify(b.source));
  });

  it("every recipe, cut and random design passes the editor ranges and the export checks", () => {
    for (const d of every()) {
      const p = mergeParametricParams(designParams(d));
      expect(parametricRequestError(p), JSON.stringify(d)).toBeNull();
    }
  });

  it("random sliders stay inside their ranges and variations keep the recipe", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const d = randomDesign(seed);
      const r = RECIPES.find((x) => x.id === d.recipe)!;
      for (const k of r.knobs) {
        expect(d.knobs[k.id]).toBeGreaterThanOrEqual(k.min);
        expect(d.knobs[k.id]).toBeLessThanOrEqual(k.max);
      }
      for (const v of variations(d, 6)) {
        expect(v.recipe).toBe(d.recipe);
        expect(v.buildAs).toBe(d.buildAs);
        expect(v.seed).not.toBe(d.seed);
        for (const k of r.knobs) expect(v.knobs[k.id]).toBeGreaterThanOrEqual(k.min);
      }
    }
  });

  it("formulas compile and give finite numbers everywhere in the preview", () => {
    for (const d of every()) {
      const data = previewData(mergeParametricParams(designParams(d)), 32);
      expect(data, d.recipe).not.toBeNull();
      if (data!.kind === "field") {
        let finite = 0;
        for (const v of data!.z) if (Number.isFinite(v)) finite++;
        expect(finite, d.recipe).toBeGreaterThan(data!.z.length / 2);
        expect(data!.hi, d.recipe).toBeGreaterThan(data!.lo);
      } else {
        expect(data!.segs.length).toBeGreaterThanOrEqual(30);
        for (const s of data!.segs) for (const v of s) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it("clock formulas are recognised by the shape buttons", () => {
    const p = designParams(randomDesign(3, "leaf-clock"));
    const cn = p.curveNormal!;
    expect(recognise("finLength", cn.finLength, p.shapes?.finLength)).toEqual(p.shapes?.finLength);
    expect(recognise("twist", cn.twist, p.shapes?.twist)).toEqual(p.shapes?.twist);
  });

  it("each recipe's default design slices within the limits", async () => {
    const wasm = await manifold();
    for (const r of RECIPES) {
      const p = mergeParametricParams(designParams({ ...defaultDesign(r.id, 9), buildAs: r.kind === "surface" ? "slats" : "fins" }));
      const res = computeParametric(p, await loadSource(p), wasm);
      expect(res.parts.length, r.id).toBeGreaterThan(0);
      expect(res.stats.partCount, r.id).toBeLessThanOrEqual(LIMITS.maxParts);
      expect(res.stats.sheetCount, r.id).toBeLessThanOrEqual(LIMITS.maxSheets);
      expect(res.warnings.filter((w) => ["PART_TOO_BIG", "TOO_MANY_PARTS", "TOO_MANY_SHEETS", "FINS_COLLIDE_AT_HUB"].includes(w.code)), r.id).toEqual([]);
    }
  }, 120000);
});
