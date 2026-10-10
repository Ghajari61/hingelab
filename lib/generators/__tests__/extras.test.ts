import { describe, expect, it } from "vitest";
import { SHEET_EDGE } from "@/lib/fit/arrange";
import { CAL_STRIP } from "@/lib/fit/calibration";
import { intersectShapes, offsetShapes, shapeContours, totalArea, unionShapes } from "@/lib/letters/polygon";
import { ALL_GENERATORS } from "../all";
import { arrangeGenerator, cleanExtras, genSVG, type CutPart, type GenArranged } from "../output";
import { SHEET_EXTRAS, type GenBase } from "../types";
import { CTX } from "./ctx";

const at = (pt: CutPart, ox: number, oy: number) =>
  unionShapes([...pt.outline, ...pt.inner].map((c) => c.map(([x, y]) => [x + ox, y + oy] as [number, number])), [], true);

function checkSheets(a: GenArranged<GenBase>, gap: number, reserve: number, tag: string) {
  const sheets = a.sheets!;
  const items = a.lay!.items.filter((it) => it.i >= 0);
  const placed = items.map((it) => {
    const s = sheets.findIndex((sh) => {
      const b = it.pt.bbox;
      return b.x0 + it.ox >= sh.x + SHEET_EDGE - 1e-3 && b.y0 + it.oy >= sh.y + SHEET_EDGE - 1e-3 &&
        b.x1 + it.ox <= sh.x + sh.w - SHEET_EDGE + 1e-3 && b.y1 + it.oy <= sh.y + sh.h - SHEET_EDGE - reserve + 1e-3;
    });
    return { name: it.pt.name, s, shapes: offsetShapes(at(it.pt, it.ox, it.oy), gap / 2 - 0.05) };
  });
  for (const p of placed) if (!sheets[p.s]?.warn) expect(p.s, `${tag}: ${p.name} on a sheet`).toBeGreaterThanOrEqual(0);
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    if (placed[i].s !== placed[j].s) continue;
    const o = totalArea(intersectShapes(shapeContours(placed[i].shapes), shapeContours(placed[j].shapes)));
    expect(o, `${tag}: ${placed[i].name} × ${placed[j].name}`).toBeLessThan(1e-3);
  }
}

describe("sheet extras", () => {
  it("old saves clean to the defaults", () => {
    expect(cleanExtras(undefined)).toEqual(SHEET_EXTRAS);
    expect(cleanExtras({ nest: "bogus", calibration: "yes", labels: 1 })).toEqual(SHEET_EXTRAS);
    expect(cleanExtras({ nest: "outline", calibration: true, labels: true })).toEqual({ nest: "outline", calibration: true, labels: true });
  });

  for (const def of ALL_GENERATORS) {
    describe(def.id, () => {
      it("the defaults lay out exactly as without extras", () => {
        const p = def.defaults();
        const a = arrangeGenerator(def, p, CTX);
        const b = arrangeGenerator(def, { ...p, sheet: undefined }, CTX);
        expect(genSVG(def, p, a.lay!)).toBe(genSVG(def, p, b.lay!));
      });

      it("outline nesting keeps every preset's parts on the sheets, apart, and clear of the calibration strip", () => {
        for (const pr of def.presets) {
          const p = def.merge(pr.params);
          const q = { ...p, sheet: { nest: "outline", calibration: true, labels: false } } as typeof p;
          const a = arrangeGenerator(def, q, CTX);
          expect(a.lay, pr.id).toBeTruthy();
          checkSheets(a as GenArranged<GenBase>, p.gap, CAL_STRIP, pr.id);
          const bars = a.lay!.items.filter((it) => it.i === -1);
          expect(bars.length, pr.id).toBe(a.sheets!.length);
          for (const bar of bars) {
            const sh = a.sheets!.find((s) => bar.oy >= s.y && bar.oy <= s.y + s.h)!;
            expect(bar.oy + bar.pt.bbox.y1, pr.id).toBeLessThanOrEqual(sh.y + sh.h - SHEET_EDGE + 1e-3);
            expect(bar.oy + bar.pt.bbox.y0, pr.id).toBeGreaterThanOrEqual(sh.y + sh.h - SHEET_EDGE - CAL_STRIP - 1e-3);
          }
          const svg = genSVG(def, q, a.lay!);
          expect(svg, pr.id).toMatch(/Calibration bar/);
          expect(svg, pr.id).not.toMatch(/NaN|Infinity|undefined/);
        }
      }, 60000);

      it("part labels go on the score layer, inside their parts", () => {
        const p = def.defaults();
        const plain = arrangeGenerator(def, p, CTX);
        const q = { ...p, sheet: { ...SHEET_EXTRAS, labels: true } };
        const a = arrangeGenerator(def, q, CTX);
        const labelled = a.lay!.items.filter((it, k) => it.pt.score.length > plain.lay!.items[k].pt.score.length);
        // Parts with open cuts (puzzle boards) stay unlabelled: a name would run across the cuts.
        const plainParts = plain.lay!.items.filter((it) => !it.pt.cuts.length);
        if (plainParts.length) expect(labelled.length).toBeGreaterThan(0);
        else expect(labelled.length).toBe(0);
        for (const it of a.lay!.items) {
          const k = plain.lay!.items[a.lay!.items.indexOf(it)];
          for (const c of it.pt.score.slice(k.pt.score.length)) for (const [x, y] of c) {
            expect(x >= it.pt.bbox.x0 && x <= it.pt.bbox.x1 && y >= it.pt.bbox.y0 && y <= it.pt.bbox.y1, it.pt.name).toBe(true);
          }
        }
        if (labelled.length) expect(genSVG(def, q, a.lay!)).toMatch(/Score lines/);
      });
    });
  }
});
