import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as hb from "harfbuzzjs";
import { describe, expect, it } from "vitest";
import { BUNDLED_FONTS, loadFont, shapeText } from "@/lib/letters";
import { parametricRequestError } from "@/lib/billing/validate";
import { LIMITS, mergeParametricParams } from "../defaults";
import { computeParametric, loadSource } from "../engine";
import { PARAMETRIC_CATEGORIES, PARAMETRIC_PRESETS } from "../presets";
import { PRESET_PARTS } from "../presetParts";
import { recognise, shapeExpression, type ShapeSpec, type ShapeTargetId } from "../shapes";
import { RELIEF_IDS, reliefMesh } from "../source/reliefs";
import { signedVolume } from "../source/library";
import { openEdgeCount } from "../source/mesh";
import { packOutline } from "../source/text";
import { manifold } from "./helpers";

function textFile(font: string, text: string, size: number, letterSpacing: number): ArrayBuffer {
  const meta = BUNDLED_FONTS.find((f) => f.id === font)!;
  const b = readFileSync(join(process.cwd(), "public", "fonts", meta.file));
  const f = loadFont(hb, meta.id, meta.name, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  return packOutline(shapeText(hb, f, text, { direction: "auto", size, sizeMode: "capHeight", letterSpacing }).glyphs.flatMap((g) => g.contours));
}

describe("parametric design library", () => {
  it("has 45–75 designs, each in a known category, with every category used", () => {
    expect(PARAMETRIC_PRESETS.length).toBeGreaterThanOrEqual(45);
    expect(PARAMETRIC_PRESETS.length).toBeLessThanOrEqual(75);
    const cats = new Set(PARAMETRIC_CATEGORIES.map((c) => c.id));
    for (const pr of PARAMETRIC_PRESETS) expect(cats.has(pr.category), pr.id).toBe(true);
    for (const c of cats) expect(PARAMETRIC_PRESETS.some((pr) => pr.category === c), c).toBe(true);
  });

  it("every design passes the export request checks", () => {
    for (const pr of PARAMETRIC_PRESETS) expect(parametricRequestError(mergeParametricParams(pr.params)), pr.id).toBeNull();
  });

  it("clock and frame formulas match their shape specs", () => {
    const shaped = PARAMETRIC_PRESETS.filter((pr) => pr.params.shapes);
    expect(shaped.length).toBeGreaterThan(0);
    for (const pr of shaped) {
      const cn = pr.params.curveNormal!;
      const written: Partial<Record<ShapeTargetId, string>> = {
        finLength: cn.finLength, finHeight: cn.finHeight, twist: cn.twist,
        outline: cn.outerBoundary?.kind === "formula" ? cn.outerBoundary.expression : undefined,
      };
      for (const [target, spec] of Object.entries(pr.params.shapes!) as [ShapeTargetId, ShapeSpec][]) {
        expect(written[target], `${pr.id} ${target}`).toBe(shapeExpression(target, spec));
        expect(recognise(target, written[target]!, spec), `${pr.id} ${target}`).toEqual(spec);
      }
    }
  });

  it("every new relief is a closed, outward-facing solid", () => {
    for (const id of RELIEF_IDS) {
      const m = reliefMesh(id);
      expect(openEdgeCount(m), id).toBe(0);
      expect(signedVolume(m), id).toBeGreaterThan(0);
    }
  });

  for (const cat of PARAMETRIC_CATEGORIES) {
    it(`the ${cat.name} designs slice within the limits and match their stored part counts`, async () => {
      const wasm = await manifold();
      for (const pr of PARAMETRIC_PRESETS.filter((q) => q.category === cat.id)) {
        const p = mergeParametricParams(pr.params);
        const file = p.source.kind === "text" ? textFile(p.source.font, p.source.text, p.source.size, p.source.letterSpacing) : undefined;
        const r = computeParametric(p, await loadSource(p, file), wasm);
        expect(r.parts.length, pr.id).toBeGreaterThan(0);
        expect(r.stats.partCount, pr.id).toBeLessThanOrEqual(LIMITS.maxParts);
        expect(r.stats.sheetCount, pr.id).toBeLessThanOrEqual(LIMITS.maxSheets);
        expect(r.warnings.filter((w) => w.code === "PART_TOO_BIG"), pr.id).toEqual([]);
        expect(PRESET_PARTS[pr.id], `${pr.id}: run THUMBS_ONLY=parametric node scripts/build-preset-thumbs.mjs`).toBe(r.stats.partCount);
      }
    }, 120000);
  }
});
