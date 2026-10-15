/**
 * The user's own motif as a MotifRef in a 100 mm box, so every design places, engraves, scores or
 * cuts it just like a built-in motif.
 */
import { differenceShapes, shapeContours, unionShapes } from "@/lib/letters/polygon";
import { bboxOf, rect, transform } from "./geom";
import type { MotifArt } from "./motifArt";
import { isMotifId, type MotifRef } from "./motifs";
import { orient } from "./shapes";
import { PIC_BOX, decodeContours, levelAt } from "./shadowbox/picPath";
import type { BuildContext, Contour } from "./types";
import { textBlock } from "./weld";

/** Contours centred on (0, 0) with their larger side 100. */
function toUnit(cs: Contour[]): Contour[] {
  if (!cs.length) return [];
  const b = bboxOf(cs), s = 100 / Math.max(1e-6, b.x1 - b.x0, b.y1 - b.y0);
  return cs.map((c) => transform(c, { x: -((b.x0 + b.x1) / 2) * s, y: -((b.y0 + b.y1) / 2) * s, sx: s, sy: s }));
}

const cache = new Map<string, MotifRef | null>();
function cached(key: string, make: () => Contour[]): MotifRef | null {
  if (!cache.has(key)) {
    if (cache.size > 24) cache.delete(cache.keys().next().value!);
    const unit = toUnit(make());
    cache.set(key, unit.length ? { unit } : null);
  }
  return cache.get(key)!;
}

/**
 * The motif to place for a motif choice: a built-in id, the traced picture or the typed words.
 * `ref` is null when there is nothing to show (no picture yet, no words); `loading` while the font loads.
 */
export function motifRef(kind: string, art: MotifArt, ctx?: BuildContext, missing?: string[]): { ref: MotifRef | null; loading: boolean } {
  if (isMotifId(kind)) return { ref: kind, loading: false };
  if (kind === "picture") {
    if (!art.levels) return { ref: null, loading: false };
    const ref = cached(`p${art.cut}:${art.invert}:${art.aspect}:${art.levels}`, () => {
      const levels = art.levels.split("|");
      const lv = unionShapes(decodeContours(levels[levelAt(art.cut, levels.length)]), [], true);
      if (!art.invert) return shapeContours(lv);
      const a = art.aspect, w = a >= 1 ? PIC_BOX : PIC_BOX * a, h = a >= 1 ? PIC_BOX / a : PIC_BOX;
      return shapeContours(differenceShapes([orient(rect(0, 0, w, h))], shapeContours(lv)));
    });
    return { ref, loading: false };
  }
  if (kind === "text") {
    if (!art.text.trim()) return { ref: null, loading: false };
    if (!ctx?.text) return { ref: null, loading: !!ctx };
    const t = textBlock(ctx, art.text, art.fontId, 40, { missing });
    if (t.loading) return { ref: null, loading: true };
    return { ref: cached(`t${art.fontId}:${art.text}`, () => shapeContours(unionShapes(t.contours))), loading: false };
  }
  return { ref: null, loading: false };
}
