import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as hb from "harfbuzzjs";
import { describe, expect, it } from "vitest";
import { BUNDLED_FONTS, FONT_CATEGORIES, loadFont } from "../fonts";
import { directionRuns } from "../shape";

const dir = join(__dirname, "../../../public/fonts");
const load = (id: string) => {
  const info = BUNDLED_FONTS.find((f) => f.id === id)!;
  const b = readFileSync(join(dir, info.file));
  return loadFont(hb, info.id, info.name, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
};

describe("bundled fonts", () => {
  it("every font has its file, an OFL licence, a known category and a unique id", () => {
    const ids = new Set<string>();
    const cats = new Set(FONT_CATEGORIES.map((c) => c.id));
    for (const f of BUNDLED_FONTS) {
      expect(ids.has(f.id), f.id).toBe(false);
      ids.add(f.id);
      expect(existsSync(join(dir, f.file)), f.file).toBe(true);
      expect(cats.has(f.category), f.id).toBe(true);
      expect(existsSync(join(dir, "licenses", `${f.id}-OFL.txt`)), `${f.id} licence`).toBe(true);
    }
  });

  it("offers more than 50 fonts, with Persian ones in several styles", () => {
    expect(BUNDLED_FONTS.length).toBeGreaterThan(50);
    const persian = BUNDLED_FONTS.filter((f) => f.scripts.includes("arabic"));
    expect(persian.length).toBeGreaterThanOrEqual(15);
    expect(new Set(persian.map((f) => f.category)).size).toBeGreaterThanOrEqual(5);
  });

  it("Persian fonts carry the Persian letters and digits", () => {
    for (const f of BUNDLED_FONTS.filter((x) => x.scripts.includes("arabic"))) {
      const font = load(f.id);
      for (const ch of "پچژگکی۱۲۳") expect(font.ot.charToGlyphIndex(ch), `${f.id} ${ch}`).toBeGreaterThan(0);
    }
  });

  it("measures cap height from the H when the font's own figure is wrong", () => {
    const f = load("courgette");
    const H = f.ot.glyphs.get(f.ot.charToGlyphIndex("H")).getBoundingBox().y2;
    expect(Math.abs(f.capHeight - H)).toBeLessThan(H * 0.3);
  });
});

describe("mixed-direction text", () => {
  const visual = (t: string, base: "ltr" | "rtl") => directionRuns(t, base).map((r) => [t.slice(r.start, r.end).trim(), r.rtl]);

  it("keeps English words and numbers inside Persian in reading order", () => {
    expect(visual("سلام Hello", "rtl")).toEqual([["Hello", false], ["سلام", true]]);
    expect(visual("میز ۱۲۳۴ برای 2 نفر", "rtl")).toEqual([["نفر", true], ["2", false], ["برای", true], ["۱۲۳۴", false], ["میز", true]]);
  });

  it("one run for text in one direction", () => {
    expect(directionRuns("Hello world", "ltr")).toEqual([{ start: 0, end: 11, rtl: false }]);
    expect(directionRuns("سلام دنیا", "rtl")).toEqual([{ start: 0, end: 9, rtl: true }]);
  });
});
