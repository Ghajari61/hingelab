/** Fit adapter for Letters. With Fit off it returns exactly the classic build and row layout. */
import { computeLetterModel, layoutLetters, type HarfBuzz, type LetterModel, type LetterParams, type LetterPart, type LetterResult, type LoadedFont } from "@/lib/letters";
import { arrangeFit, r1, type Arranged } from "./arrange";
import { cleanFit } from "./fitToSheets";

/** Letters at a scale: letter size, spacing, box depth and stencil border scale; material and joints stay. */
export function scaleLetters(p: LetterParams, s: number): LetterParams {
  if (s === 1) return p;
  return {
    ...p,
    size: r1(p.size * s),
    letterSpacing: r1(p.letterSpacing * s),
    depth: p.mode === "box" ? r1(p.depth * s) : p.depth,
    sheetMargin: r1(p.sheetMargin * s),
    islandArea: p.islandArea * s * s,
  };
}

export type LettersArranged = Arranged<LetterParams, LetterModel, LetterPart>;

export function arrangeLetters(p: LetterParams, font: LoadedFont, hb: HarfBuzz): LettersArranged {
  const fit = cleanFit(p.fit);
  if (fit.mode === "off") {
    const result: LetterResult = computeLetterModel(p, font, hb);
    return { params: p, result, lay: "error" in result ? null : layoutLetters(result, p), sheets: null, fit: null };
  }
  return arrangeFit<LetterParams, LetterModel, LetterPart>(fit, { w: p.bedW, h: p.bedH, gap: p.gap }, (s) => {
    const q = scaleLetters(p, s);
    return { params: q, result: computeLetterModel(q, font, hb) };
  });
}
