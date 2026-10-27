/** Text for generators (clock numerals, labels) with the Letters fonts and HarfBuzz shaping. */
import type { HarfBuzz, LoadedFont } from "@/lib/letters/fonts";
import { shapeContours, unionShapes } from "@/lib/letters/polygon";
import { shapeText } from "@/lib/letters/shape";
import { bboxOf } from "./geom";
import type { BuildContext, TextShape } from "./types";

/** A `ctx.text` over the fonts loaded so far; results are cached per string, font and size. */
export function makeTextFn(hb: HarfBuzz, fontOf: (id: string) => LoadedFont | null): NonNullable<BuildContext["text"]> {
  const cache = new Map<string, TextShape>();
  return (s, fontId, height, spacing = 0) => {
    const font = fontOf(fontId);
    if (!font) return null;
    const key = `${fontId}\u0000${height}\u0000${spacing}\u0000${s}`;
    const hit = cache.get(key);
    if (hit) return hit;
    // Numbers read left to right in every script (also in scripts written right to left), so digit-only text is LTR.
    const direction = /\p{L}/u.test(s) ? "auto" : "ltr";
    const out = shapeText(hb, font, s, { direction, size: height, sizeMode: "capHeight", letterSpacing: Number.isFinite(spacing) ? spacing : 0 });
    const contours = shapeContours(unionShapes(out.glyphs.flatMap((g) => g.contours)));
    const bb = contours.length ? bboxOf(contours) : { x0: 0, y0: 0, x1: 0, y1: 0 };
    const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
    const shape: TextShape = {
      contours: contours.map((c) => c.map(([x, y]) => [x - cx, y - cy] as [number, number])),
      width: bb.x1 - bb.x0,
      height: bb.y1 - bb.y0,
      missing: out.shaped.missing,
      glyphs: out.glyphs.map((g) => g.contours.map((c) => c.map(([x, y]) => [x - cx, y - cy] as [number, number]))).filter((g) => g.length),
    };
    cache.set(key, shape);
    return shape;
  };
}
