import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { computeModel, exportSVG, layoutParts } from "../index";
import type { Params } from "../types";

interface GoldenCase {
  params: Params;
  L: number;
  rN: number;
  hBody: number;
  analysis: {
    rMin: number;
    ratio: number;
    verdict: string;
    barLen: number;
    barW: number;
    Lp: number;
    nSeg: number;
    columns: number;
  };
  layout: { width: number; height: number };
  svg: string;
}

const golden = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../golden-svgs.json", import.meta.url)), "utf8"),
) as { cases: GoldenCase[] };

function near(actual: number, expected: number, label: string) {
  const delta = Math.abs(actual - expected);
  if (delta > 1e-9) throw new Error(`${label}: got ${actual}, golden ${expected}, delta ${delta}`);
}

describe("golden SVG parity", () => {
  it("loads every generated case", () => {
    expect(golden.cases.length).toBe(198);
  });

  for (const [i, c] of golden.cases.entries()) {
    const p = c.params;
    const extras = `${p.stretch ? ` stretch ${p.stretch}` : ""}${p.testStrip ? " test strip" : ""}${p.labels ? "" : " no labels"}`;
    it(`case ${i} ${p.shape}/${p.lid}/${p.pattern}/${p.cutStyle}/split ${p.split}${extras}`, () => {
      const model = computeModel(p);
      expect("error" in model).toBe(false);
      if ("error" in model) return;
      const lay = layoutParts(model.parts, p.bedW, p.gap);
      const svg = exportSVG(model, lay, p);
      if (svg !== c.svg) {
        let j = 0;
        const n = Math.min(svg.length, c.svg.length);
        while (j < n && svg[j] === c.svg[j]) j++;
        expect.fail(
          `SVG mismatch at index ${j} (lengths ${svg.length} vs ${c.svg.length})\n` +
          `got:  ${JSON.stringify(svg.slice(Math.max(0, j - 30), j + 90))}\n` +
          `want: ${JSON.stringify(c.svg.slice(Math.max(0, j - 30), j + 90))}`,
        );
      }
      near(model.L, c.L, "L");
      near(model.rN, c.rN, "rN");
      near(model.hBody, c.hBody, "hBody");
      near(lay.width, c.layout.width, "layout.width");
      near(lay.height, c.layout.height, "layout.height");
      near(model.analysis.rMin, c.analysis.rMin, "rMin");
      near(model.analysis.ratio, c.analysis.ratio, "ratio");
      expect(model.analysis.verdict).toBe(c.analysis.verdict);
      near(model.analysis.barLen, c.analysis.barLen, "barLen");
      near(model.analysis.barW, c.analysis.barW, "barW");
      near(model.analysis.Lp, c.analysis.Lp, "Lp");
      near(model.analysis.nSeg, c.analysis.nSeg, "nSeg");
      near(model.analysis.columns, c.analysis.columns, "columns");
    });
  }
});
