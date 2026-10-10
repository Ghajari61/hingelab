import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as hb from "harfbuzzjs";
import { describe, expect, it } from "vitest";
import {
  LETTER_DEFAULTS, computeLetterModel, exportLetterSVG, layoutLetters, loadFont, makeShape, offsetShapes, pointInShape,
  shapeText, signedArea,
} from "@/lib/letters";
import type { LetterModel, LetterParams, LetterResult, LoadedFont, SolidPart } from "@/lib/letters";

function fixture(file: string, id: string, name: string): LoadedFont {
  const b = readFileSync(join(__dirname, "fonts", file));
  return loadFont(hb, id, name, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
}

const fredoka = fixture("Fredoka-Bold.ttf", "fredoka", "Fredoka Bold");
const vazir = fixture("Vazirmatn-Black.ttf", "vazirmatn", "Vazirmatn Black");
const isPersian = (t: string) => /[\u0600-\u06ff]/u.test(t);
const fontFor = (t: string) => (isPersian(t) ? vazir : fredoka);

const params = (text: string, extra: Partial<LetterParams> = {}): LetterParams => ({
  ...LETTER_DEFAULTS, text, fontId: isPersian(text) ? "vazirmatn" : "fredoka", ...extra,
});

function model(text: string, extra: Partial<LetterParams> = {}): LetterModel {
  const r: LetterResult = computeLetterModel(params(text, extra), fontFor(text), hb);
  if ("error" in r) throw new Error(r.error);
  return r;
}

const finite = (n: number) => Number.isFinite(n);

/** Solid-mode parts (every part of a solid model is a SolidPart). */
function solids(m: LetterModel): SolidPart[] {
  return m.parts.map(pt => {
    if (pt.kind !== "solid") throw new Error(`unexpected ${pt.kind} part`);
    return pt;
  });
}

describe("1. solid letters: every text produces parts", () => {
  const TEXTS = ["O", "A", "S", "B", "e", "8", "Sam", "HingeLab", "س", "سام", "ایران", "۱۲۳"];
  for (const text of TEXTS) {
    it(text, () => {
      const m = model(text);
      expect(m.parts.length).toBeGreaterThanOrEqual(1);
      expect(m.shaped.missing).toEqual([]);
      for (const pt of solids(m)) {
        expect(pt.outer.length).toBeGreaterThanOrEqual(3);
        expect(signedArea(pt.outer)).toBeGreaterThan(0);
        for (const h of pt.holes) {
          expect(signedArea(h)).toBeLessThan(0);
          expect(h.every(q => q[0] >= pt.bbox.x0 && q[0] <= pt.bbox.x1 && q[1] >= pt.bbox.y0 && q[1] <= pt.bbox.y1)).toBe(true);
        }
        expect([pt.outer, ...pt.holes].flat(2).every(finite)).toBe(true);
        expect(pointInShape([pt.label.x, pt.label.y], { ...pt, area: 0, group: 0 })).toBe(true);
      }
    });
  }

  it("counters become holes: one in O, one in e, two in 8", () => {
    expect(solids(model("O"))[0].holes.length).toBe(1);
    expect(solids(model("e"))[0].holes.length).toBe(1);
    expect(solids(model("8"))[0].holes.length).toBe(2);
  });

  it("cap height sizing: H is as tall as the size", () => {
    const m = model("H", { K: 0 });
    expect(m.bbox.y1 - m.bbox.y0).toBeCloseTo(150, 0);
  });

  it("total-height sizing covers ascenders and descenders", () => {
    const m = model("Hg", { sizeMode: "totalHeight", size: 100, K: 0 });
    expect(m.bbox.y1 - m.bbox.y0).toBeCloseTo(100, 1);
  });

  it("kerf grows outlines by K/2 on each side", () => {
    const a = model("O", { K: 0 }).parts[0].bbox, b = model("O", { K: 0.4 }).parts[0].bbox;
    expect(b.x1 - b.x0 - (a.x1 - a.x0)).toBeCloseTo(0.4, 2);
  });

  it("offsets are exact: a 10 mm square inset by 1 mm is an 8 mm square, and back out restores it", () => {
    const sq = makeShape([[0, 0], [10, 0], [10, 10], [0, 10]], []);
    const inner = offsetShapes([sq], -1);
    expect(inner.length).toBe(1);
    expect(inner[0].bbox).toEqual({ x0: 1, y0: 1, x1: 9, y1: 9 });
    expect(inner[0].area).toBeCloseTo(64, 6);
    const back = offsetShapes(inner, 1)[0];
    expect(back.bbox).toEqual({ x0: 0, y0: 0, x1: 10, y1: 10 });
    // Rounded corners of radius 1; chords sit inside the true arcs, so slightly less area.
    expect(back.area).toBeLessThan(100 - (4 - Math.PI));
    expect(back.area).toBeGreaterThan(100 - (4 - Math.PI) - 0.15);
  });

  it("thin-stroke warning: none for bold letters at 150 mm, raised for hairline strokes", () => {
    const thinWarn = (m: LetterModel) => m.issues.some(i => i.lvl === "warn" && i.msg.includes("thinner than"));
    expect(thinWarn(model("Sam"))).toBe(false);
    expect(thinWarn(model("سام"))).toBe(false);
    expect(model("سام").thin).toEqual([]);
    // Fredoka Bold strokes are about a quarter of the cap height: 1.5 mm at 6 mm, under the 2 mm minimum.
    expect(thinWarn(model("Sam", { size: 6 }))).toBe(true);
  });

  it("warns about characters the font lacks and still cuts the rest", () => {
    const r = computeLetterModel(params("Aس"), fredoka, hb);
    if ("error" in r) throw new Error(r.error);
    expect(r.shaped.missing).toEqual(["س"]);
    expect(r.issues.some(i => i.lvl === "warn" && i.msg.includes("“س”"))).toBe(true);
    expect(r.parts.length).toBe(1);
  });

  it("empty text and unavailable modes return errors", () => {
    expect(computeLetterModel(params("  "), fredoka, hb)).toEqual({ error: "Type some text to start." });
    expect("error" in computeLetterModel(params("A", { mode: "stencil" }), fredoka, hb)).toBe(true);
  });
});

describe("8. Persian shaping", () => {
  it("سام uses contextual forms, right-to-left order, and welds into its joined groups", () => {
    const text = "سام";
    const out = shapeText(hb, vazir, text, LETTER_DEFAULTS);
    expect(out.shaped.direction).toBe("rtl");
    const isolated = [...text].map(c => vazir.ot.charToGlyphIndex(c));
    const byCluster = new Map(out.shaped.glyphs.map(g => [g.cluster, g]));
    // س is initial and ا is final (joined); م follows ا, which never joins forward, so it stays isolated.
    expect(byCluster.get(0)!.gid).not.toBe(isolated[0]);
    expect(byCluster.get(1)!.gid).not.toBe(isolated[1]);
    expect(byCluster.get(2)!.gid).toBe(isolated[2]);
    // Visual order: the last letter is leftmost, the first letter is rightmost.
    expect(out.shaped.glyphs.map(g => g.cluster)).toEqual([2, 1, 0]);
    const xs = out.shaped.glyphs.map(g => g.x);
    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);

    const m = model(text);
    expect(m.shapes.length).toBe(2);
    expect(m.islands.length).toBe(0);
    const [left, right] = [...m.parts].sort((a, b) => a.bbox.x0 - b.bbox.x0);
    expect(left.name).toBe("م");
    expect(right.name).toBe("سا");
  });

  it("بیت is one joined body plus its dots as islands", () => {
    const m = model("بیت", { size: 60 });
    const main = m.shapes.filter(s => s.area >= LETTER_DEFAULTS.islandArea);
    expect(main.length).toBe(1);
    expect(m.islands.length).toBeGreaterThanOrEqual(3);
    expect(m.islands.length + main.length).toBe(m.shapes.length);
  });

  it("letter spacing never separates joined Persian letters", () => {
    const g0 = shapeText(hb, vazir, "سام", LETTER_DEFAULTS).shaped.glyphs;
    const g1 = shapeText(hb, vazir, "سام", { ...LETTER_DEFAULTS, letterSpacing: 10 }).shaped.glyphs;
    // ا -> س is joined: no gap added. م -> ا is a break: 10 mm added.
    expect(g1[2].x - g1[1].x).toBeCloseTo(g0[2].x - g0[1].x, 6);
    expect(g1[1].x - g1[0].x).toBeCloseTo(g0[1].x - g0[0].x + 10, 6);
  });

  it("Latin letter spacing goes between every letter", () => {
    const g0 = shapeText(hb, fredoka, "Sam", LETTER_DEFAULTS).shaped.glyphs;
    const g1 = shapeText(hb, fredoka, "Sam", { ...LETTER_DEFAULTS, letterSpacing: 5 }).shaped.glyphs;
    expect(g1[2].x - g0[2].x).toBeCloseTo(10, 6);
  });
});

describe("10. solid with weldDots", () => {
  for (const text of ["iji", "بیت"]) {
    it(`${text} is exactly one part`, () => {
      const loose = model(text);
      expect(loose.parts.length).toBeGreaterThan(1);
      const m = model(text, { weldDots: true });
      expect(m.parts.length).toBe(1);
      expect(m.bridges.length).toBe(loose.shapes.length - 1);
      expect(m.issues.filter(i => i.lvl === "warn")).toEqual([]);
    });
  }

  it("weldDots keeps separate words separate", () => {
    expect(model("ij ij", { weldDots: true }).parts.length).toBe(2);
  });
});

describe("11. SVG export", () => {
  for (const text of ["Sam", "سام"]) {
    it(text, () => {
      const p = params(text, { labels: true });
      const m = model(text, { labels: true });
      const svg = exportLetterSVG(layoutLetters(m, p), p);
      expect(svg).not.toMatch(/NaN|undefined|Infinity/);
      expect(svg).toMatch(/<svg [^>]*width="[\d.]+mm" height="[\d.]+mm" viewBox="0 0 [\d.]+ [\d.]+"/);
      const groups = [...svg.matchAll(/<g id="(\w+)" inkscape:groupmode="layer" inkscape:label="([^"]+)"/g)].map(g => `${g[1]}|${g[2]}`);
      expect(groups).toEqual(["labels|00 Part labels (engrave)", "slots|03 Inner cuts (slots)", "outline|02 Outline cut"]);
      const outline = svg.split('<g id="outline"')[1];
      expect((outline.match(/<path /g) ?? []).length).toBe(m.parts.length);
      expect(svg).toContain(text);
    });
  }

  it("labels are off by default and user text is escaped", () => {
    const p = params("A&B");
    const m = model("A&B", { labels: true });
    expect(exportLetterSVG(layoutLetters(m, p), p)).not.toContain('<g id="labels"');
    const svg = exportLetterSVG(layoutLetters(m, { ...p, labels: true }), { ...p, labels: true });
    expect(svg).toContain(">&amp;</text>");
    expect(svg).not.toContain(">&</text>");
  });
});
