import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as hb from "harfbuzzjs";
import { describe, expect, it } from "vitest";
import { computeModel, exportSVG, layoutParts, mergeParams, type Params } from "@/lib/hinge";
import { hingePresetParams, HINGE_PRESETS } from "@/lib/hinge/presets";
import { LETTER_DEFAULTS, computeLetterModel, exportLetterSVG, layoutLetters, loadFont, type LetterParams } from "@/lib/letters";
import { exportHingeForPlan } from "@/lib/billing/exportHinge";
import { cleanFit, fitToSheets, packBoxes, type FitBox, type SheetSpec } from "../fitToSheets";
import { SHEET_EDGE, type Arranged } from "../arrange";
import { arrangeHinge, arrangeLetters, scaleHinge } from "../products";

const golden = JSON.parse(readFileSync(fileURLToPath(new URL("../../../golden-svgs.json", import.meta.url)), "utf8")) as { cases: { params: Params; svg: string }[] };

const fontBytes = readFileSync(join(process.cwd(), "lib/letters/__tests__/fonts", "Fredoka-Bold.ttf"));
const fredoka = loadFont(hb, "fredoka", "Fredoka Bold", fontBytes.buffer.slice(fontBytes.byteOffset, fontBytes.byteOffset + fontBytes.byteLength) as ArrayBuffer);

/** Every part's box lies inside its sheet (minus the edge margin) and no two boxes on a sheet overlap. */
function checkPlacement(a: Arranged<unknown, { parts: { bbox: { x0: number; y0: number; x1: number; y1: number } }[] }, { bbox: { x0: number; y0: number; x1: number; y1: number } }>, n: number, bed: { w: number; h: number }) {
  expect(a.lay && a.sheets).toBeTruthy();
  const sheets = a.sheets!;
  expect(sheets.length).toBeLessThanOrEqual(n);
  for (const s of sheets) { expect(s.w).toBe(bed.w); expect(s.h).toBe(bed.h); }
  const boxes = a.lay!.items.map(({ pt, ox, oy }) => ({ x0: pt.bbox.x0 + ox, y0: pt.bbox.y0 + oy, x1: pt.bbox.x1 + ox, y1: pt.bbox.y1 + oy }));
  const sheetOf = boxes.map(b => sheets.findIndex(s => b.x0 >= s.x + SHEET_EDGE - 1e-6 && b.y0 >= s.y + SHEET_EDGE - 1e-6 && b.x1 <= s.x + s.w - SHEET_EDGE + 1e-6 && b.y1 <= s.y + s.h - SHEET_EDGE + 1e-6));
  expect(sheetOf.every(i => i >= 0)).toBe(true);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const A = boxes[i], B = boxes[j];
    const overlap = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0) > 1e-6 && Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0) > 1e-6;
    expect(overlap).toBe(false);
  }
}

/** Do the parts of a product built at this scale nest into n sheets? (Independent of the search.) */
function hingeFitsAt(p: Params, s: number, n: number) {
  const m = computeModel(scaleHinge(p, s));
  if ("error" in m) return false;
  const boxes: FitBox[] = m.parts.map((pt, i) => ({ id: String(i).padStart(4, "0"), w: pt.bbox.x1 - pt.bbox.x0, h: pt.bbox.y1 - pt.bbox.y0 }));
  const r = packBoxes(boxes, { w: p.bedW, h: p.bedH, margin: SHEET_EDGE, gap: p.gap });
  return r.tooBig.length === 0 && r.sheets.length <= n;
}

describe("fitToSheets", () => {
  const sq = (k: number) => (s: number) => ({ value: s, boxes: Array.from({ length: k }, (_, i): FitBox => ({ id: String(i).padStart(4, "0"), w: 100 * s, h: 100 * s })) });
  const sheet: SheetSpec = { w: 300, h: 300, margin: 0, gap: 0 };

  it("finds the analytic scale for squares", () => {
    const one = fitToSheets({ build: sq(1), sheet, sheets: 1, max: 10 })!;
    expect(one.fits).toBe(true);
    expect(one.scale).toBeLessThanOrEqual(3 + 1e-9);
    expect(one.scale).toBeGreaterThan(3 / 1.004 - 1e-9);
    const four = fitToSheets({ build: sq(4), sheet, sheets: 1, max: 10 })!;
    expect(four.scale).toBeCloseTo(1.5, 2);
    const two = fitToSheets({ build: sq(2), sheet, sheets: 2, max: 10 })!;
    expect(two.scale).toBeCloseTo(3, 1);
    expect(two.packed.sheets.length).toBe(2);
  });

  it("only shrinks by default and keeps a design that already fits", () => {
    const r = fitToSheets({ build: sq(1), sheet, sheets: 1 })!;
    expect(r.scale).toBe(1);
    expect(r.upper).toBeNull();
  });

  it("reports when nothing in the range fits", () => {
    const r = fitToSheets({ build: () => ({ value: 0, boxes: [{ id: "0000", w: 400, h: 400 }] }), sheet, sheets: 1 })!;
    expect(r.fits).toBe(false);
    expect(fitToSheets({ build: () => null, sheet, sheets: 1 })).toBeNull();
  });

  it("cleans saved settings", () => {
    expect(cleanFit(undefined)).toEqual({ mode: "off", sheets: 1 });
    expect(cleanFit({ mode: "sheets", sheets: 99 })).toEqual({ mode: "sheets", sheets: 20 });
    expect(cleanFit({ mode: "bogus", sheets: -3 })).toEqual({ mode: "off", sheets: 1 });
  });
});

describe("Hinge Box fit", () => {
  it("Fit off is the classic build: every golden case exports byte-for-byte through arrangeHinge", () => {
    for (const c of golden.cases) {
      const a = arrangeHinge(c.params);
      expect(a.fit).toBeNull();
      expect("error" in a.result).toBe(false);
      if ("error" in a.result) continue;
      expect(exportSVG(a.result, a.lay!, a.params)).toBe(c.svg);
    }
  });

  it("the fitted box always fits in N sheets, and the scale is the largest that does", () => {
    const bed = { w: 300, h: 200 };
    for (const pr of HINGE_PRESETS.slice(0, 8)) {
      for (const n of [1, 2]) {
        const p: Params = { ...hingePresetParams(pr.params as Partial<Params>), bedW: bed.w, bedH: bed.h, fit: { mode: "sheets", sheets: n } };
        const a = arrangeHinge(p);
        expect(a.fit, pr.id).not.toBeNull();
        if (!a.fit!.fits) continue;
        checkPlacement(a as never, n, bed);
        expect(a.fit!.scale).toBeLessThanOrEqual(1);
        if (a.fit!.scale < 1) {
          // Just above the result it no longer fits.
          expect(hingeFitsAt(p, a.fit!.scale * 1.005, n), `${pr.id} n=${n}`).toBe(false);
        }
        expect(a.params.T).toBe(p.T);
        expect(a.params.tabW).toBe(p.tabW);
        expect(a.params.slit).toBe(p.slit);
        expect(a.params.pitch).toBe(p.pitch);
        expect(a.params.bridge).toBe(p.bridge);
      }
    }
  });

  it("a box larger than one small bed is shrunk to fit it", () => {
    const p: Params = { ...mergeParams({ W: 260, D: 180, H: 120 }), bedW: 300, bedH: 200, fit: { mode: "sheets", sheets: 1 } };
    expect(hingeFitsAt(p, 1, 1)).toBe(false);
    const a = arrangeHinge(p);
    expect(a.fit!.fits).toBe(true);
    expect(a.fit!.scale).toBeLessThan(1);
    expect(a.fit!.sheets).toBe(1);
    expect(a.params.W).toBeLessThan(260);
    checkPlacement(a as never, 1, { w: 300, h: 200 });
  });

  it("Auto keeps the design size and uses as many sheets as needed", () => {
    const p: Params = { ...mergeParams({ W: 260, D: 180, H: 120 }), bedW: 300, bedH: 200, fit: { mode: "auto", sheets: 1 } };
    const a = arrangeHinge(p);
    expect(a.fit!.scale).toBe(1);
    expect(a.params.W).toBe(260);
    expect(a.fit!.sheets).toBeGreaterThan(1);
  });

  it("the server export builds the same fitted file", () => {
    const p: Params = { ...mergeParams({ W: 260, D: 180, H: 120 }), bedW: 300, bedH: 200, fit: { mode: "sheets", sheets: 2 } };
    const a = arrangeHinge(p);
    if ("error" in a.result) throw new Error(a.result.error);
    const out = exportHingeForPlan(p, "pro");
    expect(out.ok && out.svg).toBe(exportSVG(a.result, a.lay!, a.params));
    // The classic export of the unscaled box differs.
    const m = computeModel(p);
    if (!("error" in m)) expect(out.ok && out.svg).not.toBe(exportSVG(m, layoutParts(m.parts, p.bedW, p.gap), p));
  });
});

describe("Letters fit", () => {
  const P = (x: Partial<LetterParams>): LetterParams => ({ ...LETTER_DEFAULTS, ...x });

  it("Fit off is the classic build", () => {
    for (const p of [P({ text: "Sam", mode: "solid" }), P({ text: "Hi", mode: "box" })]) {
      const a = arrangeLetters(p, fredoka, hb);
      const m = computeLetterModel(p, fredoka, hb);
      if ("error" in m || "error" in a.result) throw new Error("build failed");
      expect(exportLetterSVG(a.lay!, a.params)).toBe(exportLetterSVG(layoutLetters(m, p), p));
    }
  });

  it("shrinks a word to one bed and the scale is the largest that fits", () => {
    const bed = { w: 300, h: 200 };
    const p = P({ text: "HELLO", mode: "solid", size: 150, bedW: bed.w, bedH: bed.h, fit: { mode: "sheets", sheets: 1 } });
    const a = arrangeLetters(p, fredoka, hb);
    expect(a.fit!.fits).toBe(true);
    expect(a.fit!.scale).toBeLessThan(1);
    expect(a.params.size).toBeLessThan(150);
    expect(a.params.T).toBe(p.T);
    checkPlacement(a as never, 1, bed);
    const up = a.fit!.scale * 1.005;
    const m = computeLetterModel({ ...p, size: Math.round(p.size * up * 10) / 10, sheetMargin: Math.round(p.sheetMargin * up * 10) / 10, islandArea: p.islandArea * up * up }, fredoka, hb);
    if ("error" in m) return;
    const r = packBoxes(m.parts.map((pt, i) => ({ id: String(i).padStart(4, "0"), w: pt.bbox.x1 - pt.bbox.x0, h: pt.bbox.y1 - pt.bbox.y0 })), { w: bed.w, h: bed.h, margin: SHEET_EDGE, gap: p.gap });
    expect(r.tooBig.length === 0 && r.sheets.length <= 1).toBe(false);
  });
});
