import { describe, expect, it } from "vitest";
import { ALL_GENERATORS } from "@/lib/generators/all";
import { arrangeGenerator, genSVG } from "@/lib/generators/output";
import { CTX } from "@/lib/generators/__tests__/ctx";
import { clone, DEFAULTS } from "@/lib/hinge";
import { arrangeHinge } from "@/lib/fit/hinge";
import { mergeParametricParams } from "@/lib/parametric/defaults";
import { computeParametric, loadSource } from "@/lib/parametric/engine";
import { manifold } from "@/lib/parametric/__tests__/helpers";
import { fabFromGenerator, fabFromHinge, fabFromParametric } from "../adapters";
import { fabStatus, fabSummary } from "../model";

const layerPaths = (svg: string, id: string) => {
  const m = new RegExp(`<g id="${id}"[^>]*>([\\s\\S]*?)</g>`).exec(svg);
  return m ? (m[1].match(/<path /g) ?? []).length : 0;
};

describe("the fabrication model agrees with the layout, the status bar and the export", () => {
  it.each(ALL_GENERATORS.map((g) => [g.id, g] as const))("%s", (id, def) => {
    const p = def.merge({});
    const a = arrangeGenerator(def, p, CTX);
    const m = fabFromGenerator(id, p, a)!;
    expect(m).not.toBeNull();
    expect(m.sheets.length).toBe(a.sheets?.length ?? 1);
    expect(m.sheets.length).toBe(a.fit?.sheets ?? 1);
    const items = a.lay!.items.filter((it) => it.i >= 0);
    expect(m.parts.length).toBe(items.length);
    expect(m.parts.every((pt) => pt.sheet >= 0)).toBe(true);
    expect(m.sheets.reduce((n, s) => n + s.parts, 0)).toBe(m.parts.length);
    for (const s of m.sheets) {
      expect(s.used.w).toBeLessThanOrEqual(s.w + 1e-6);
      expect(s.used.h).toBeLessThanOrEqual(s.h + 1e-6);
    }
    // The exported file has one outline path per outline contour, at the layout's size.
    const svg = genSVG(def, a.params, a.lay!);
    expect(layerPaths(svg, "outline")).toBe(a.lay!.items.reduce((n, it) => n + it.pt.outline.length, 0));
    expect(svg).toContain(`width="${Math.round(a.lay!.width * 1000) / 1000}mm"`);
    expect(m.totals.cut).toBeGreaterThan(0);
    expect(fabStatus(m, (v) => `${v}`).count).toBe(m.parts.length);
    expect(fabSummary(m)).toMatch(/^\d+ parts? on \d+ sheets?/);
  });

  it("generators with 3D placements report their assembled size", () => {
    const sign = ALL_GENERATORS.find((g) => g.id === "sign")!;
    const p = sign.merge({});
    const m = fabFromGenerator("sign", p, arrangeGenerator(sign, p, CTX))!;
    expect(m.assembled).not.toBeNull();
    expect(m.assembled!.every((v) => v > 0)).toBe(true);
  });

  it("Hinge Box: parts as laid out, the outside size as assembled", () => {
    const p = clone(DEFAULTS);
    const a = arrangeHinge(p);
    const m = fabFromHinge(p, a)!;
    expect(m.parts.length).toBe(a.lay!.items.length);
    expect(m.sheets.length).toBe(a.sheets?.length ?? 1);
    expect(m.assembled).toEqual([p.W, p.D, p.H]);
  });

  it("Parametric: parts, sheets and usage as the slicer reports them", async () => {
    const p = mergeParametricParams({ source: { kind: "library", id: "sphere", detail: 4 } });
    const r = computeParametric(p, await loadSource(p), await manifold());
    const m = fabFromParametric(p, r);
    expect(m.parts.length).toBe(r.stats.partCount);
    expect(m.sheets.length).toBe(r.stats.sheetCount);
    expect(Math.abs(m.totals.usage - r.stats.materialUsage)).toBeLessThan(0.02);
    for (const s of m.sheets) expect(s.used.w).toBeLessThanOrEqual(s.w + 1e-6);
  }, 60000);
});
