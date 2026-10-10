/**
 * computeLetterModel: text + font -> shapes -> parts. Pure; HarfBuzz is passed in.
 */
import type { HarfBuzz, LoadedFont } from "./fonts";
import { boxError, letterBoxes } from "./box";
import { bridgeWidthOf, minFeatureOf } from "./defaults";
import { MIN_PIECE_AREA, bboxOfContours, dropSpecks, offsetShapes, shapeContours, unionShapes } from "./polygon";
import { shapeText } from "./shape";
import { groupOutlines, shapeLabels, solidParts, thinFeatures, weldPieces } from "./solid";
import type { BoxInfo, Bridge, LetterIssue, LetterParams, LetterPart, LetterResult, Shape } from "./types";

const MODE_NAMES = { box: "Letter Box", solid: "Solid", stencil: "Stencil" } as const;

export function computeLetterModel(p: LetterParams, font: LoadedFont, hb: HarfBuzz): LetterResult {
  if (!p.text.trim()) return { error: "Type some text to start." };
  if (p.mode === "stencil") return { error: `${MODE_NAMES[p.mode]} mode is not available yet.` };
  if (!(p.size >= 5)) return { error: "The letter size must be at least 5 mm." };
  if (!(p.K >= 0) || !(p.T > 0)) return { error: "Check the material thickness and kerf." };
  const box = p.mode === "box";
  if (box) {
    const err = boxError(p);
    if (err) return { error: err };
  }

  const out = shapeText(hb, font, p.text, p);
  const issues: LetterIssue[] = [];
  if (out.shaped.missing.length) {
    issues.push({ lvl: "warn", msg: `${font.name} has no glyph for ${out.shaped.missing.map(c => `“${c}”`).join(" ")}. Those characters are skipped; pick a font that covers them.` });
  }
  if (!out.glyphs.length) {
    return { error: out.shaped.missing.length ? `${font.name} has none of these characters. Pick another font.` : "Nothing to cut: the text has no visible characters." };
  }

  const sources = groupOutlines(out, p.text, p.weld);
  const m = minFeatureOf(p);
  const w = bridgeWidthOf(p);
  const shapes: Shape[] = [];
  const islands: Shape[] = [];
  const bridges: Bridge[] = [];
  const thin: Shape[] = [];
  const named: { shape: Shape; name: string }[] = [];

  sources.forEach((src, gi) => {
    let gs = dropSpecks(offsetShapes(dropSpecks(unionShapes(src.contours), MIN_PIECE_AREA), p.thicken), MIN_PIECE_AREA);
    gs.forEach(s => (s.group = gi));
    shapes.push(...gs);
    islands.push(...gs.filter(s => s.area < p.islandArea));

    const tf = thinFeatures(box ? gs.filter(s => s.area >= p.islandArea) : gs, m);
    thin.push(...tf);
    if (tf.length) {
      issues.push({ lvl: "warn", msg: `Some strokes in “${src.text}” are thinner than ${m} mm and may burn or break. Use a bolder font, a larger size, or Thicken.` });
    }

    let names = shapeLabels(gs, src);
    if (!box && p.weldDots && gs.length > 1) {
      const wd = weldPieces(gs, w);
      bridges.push(...wd.bridges);
      if (wd.shapes.length > 1) issues.push({ lvl: "warn", msg: `Weld dots could not join every piece of “${src.text}”.` });
      gs = wd.shapes;
      gs.forEach(s => (s.group = gi));
      names = gs.map(() => src.text);
    }
    gs.forEach((s, i) => named.push({ shape: s, name: names[i] }));
  });

  named.sort((a, b) => a.shape.bbox.x0 + a.shape.bbox.x1 - (b.shape.bbox.x0 + b.shape.bbox.x1));

  let parts: LetterPart[];
  let boxInfo: BoxInfo | null = null;
  if (box) {
    const mains = named.filter(n => n.shape.area >= p.islandArea);
    const small = named.filter(n => n.shape.area < p.islandArea);
    if (!mains.length) return { error: "Every piece is smaller than the island size, so there is nothing to box. Use a larger size or a smaller island size." };
    const res = letterBoxes(mains, p);
    issues.push(...res.issues);
    boxInfo = res.box;
    parts = [...res.walls, ...res.plates];
    if (small.length && p.smallIslands === "flat") {
      parts.push(...solidParts(small.map(n => n.shape), small.map(n => `${n.name} · dot`), p.K));
      issues.push({ lvl: "info", msg: `${small.length} small piece${small.length > 1 ? "s" : ""} (dots or accents) ${small.length > 1 ? "are" : "is"} cut flat. Glue ${small.length > 1 ? "them" : "it"} on top of the lid.` });
    } else if (small.length) {
      issues.push({ lvl: "info", msg: `${small.length} small piece${small.length > 1 ? "s" : ""} (dots or accents) ${small.length > 1 ? "were" : "was"} left out.` });
    }
  } else {
    parts = solidParts(named.map(n => n.shape), named.map(n => n.name), p.K);
    if (!p.weldDots && islands.length) {
      issues.push({ lvl: "info", msg: `${islands.length} small piece${islands.length > 1 ? "s" : ""} (dots or accents) ${islands.length > 1 ? "are" : "is"} cut separately. Tick Weld dots to join them to the letters.` });
    }
  }

  return {
    mode: p.mode,
    shaped: out.shaped,
    groups: sources.map(s => ({ text: s.text, contours: s.contours })),
    shapes,
    islands,
    bridges,
    thin,
    parts,
    issues: issues.filter((iss, k) => issues.findIndex(o => o.msg === iss.msg) === k),
    bbox: bboxOfContours(shapeContours(shapes)),
    box: boxInfo,
  };
}
