import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as hb from "harfbuzzjs";
import { describe, expect, it } from "vitest";
import { LETTER_DEFAULTS, computeLetterModel, loadFont, makeShape, pointInShape } from "@/lib/letters";
import type { LetterParams, Point } from "@/lib/letters";
import type { Shape } from "@/lib/letters/types";
import { labelPoint } from "@/lib/letters/solid";

/** The plain search: every candidate against every vertex. */
function reference(s: Shape): Point {
  const { x0, y0, x1, y1 } = s.bbox;
  const pts = [s.outer, ...s.holes].flat();
  let best: Point = [(x0 + x1) / 2, (y0 + y1) / 2], bestD = -1;
  const N = 16;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const p: Point = [x0 + ((x1 - x0) * (i + 0.5)) / (N + 1), y0 + ((y1 - y0) * (j + 0.5)) / (N + 1)];
    if (!pointInShape(p, s)) continue;
    let d = Infinity;
    for (const q of pts) d = Math.min(d, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2);
    if (d > bestD) { bestD = d; best = p; }
  }
  return best;
}

const fixture = (file: string, id: string, name: string) => {
  const b = readFileSync(join(__dirname, "fonts", file));
  return loadFont(hb, id, name, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
};

describe("labelPoint", () => {
  it("matches the plain search on every glyph, plate and sheet", () => {
    const shapes: Shape[] = [];
    for (const [file, id, name, text] of [
      ["Fredoka-Bold.ttf", "fredoka", "Fredoka Bold", "Hello & 80%"],
      ["Vazirmatn-Black.ttf", "vazirmatn", "Vazirmatn Black", "سلام دنیا"],
    ] as const) {
      const font = fixture(file, id, name);
      for (const mode of ["box", "solid", "stencil"] as const) {
        const p: LetterParams = { ...LETTER_DEFAULTS, text, fontId: font.id, mode };
        const m = computeLetterModel(p, font, hb);
        if ("error" in m) throw new Error(m.error);
        for (const part of m.parts) if ("outer" in part && part.outer.length >= 3) shapes.push(makeShape(part.outer, "holes" in part ? part.holes : []));
      }
    }
    expect(shapes.length).toBeGreaterThan(20);
    for (const s of shapes) {
      expect(labelPoint(s)).toEqual(reference(s));
      expect(labelPoint(s)).toEqual(reference(s));
    }
  });
});
