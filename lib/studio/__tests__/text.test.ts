import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as hb from "harfbuzzjs";
import { describe, expect, it } from "vitest";
import { loadFont, type LoadedFont } from "@/lib/letters";
import { subpathsBox } from "../geom";
import { layoutText, type TextSettings } from "../text";

function fixture(file: string, id: string): LoadedFont {
  const b = readFileSync(join(__dirname, "..", "..", "letters", "__tests__", "fonts", file));
  return loadFont(hb, id, id, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
}
const fredoka = fixture("Fredoka-Bold.ttf", "fredoka");
const vazir = fixture("Vazirmatn-Black.ttf", "vazir");
const base: TextSettings = { text: "Hello", size: 20, tracking: 0, lineHeight: 1.2, align: "start", direction: "auto" };

describe("studio text", () => {
  it("lays out point text from the anchor with curves, scaling with size", () => {
    const a = layoutText(hb, fredoka, base), b = layoutText(hb, fredoka, { ...base, size: 40 });
    expect(a.outline.length).toBeGreaterThan(4);
    expect(a.outline.some((s) => s.nodes.some((n) => n.i || n.o))).toBe(true);
    const ba = subpathsBox(a.outline), bb = subpathsBox(b.outline);
    expect(ba.minX).toBeGreaterThanOrEqual(-0.5);
    expect(ba.maxY).toBeLessThan(1);
    expect((bb.maxX - bb.minX) / (ba.maxX - ba.minX)).toBeCloseTo(2, 5);
    expect(a.lines[0].width).toBeGreaterThan(40);
  });

  it("tracking widens the line; centre and end alignment move the anchor", () => {
    const plain = layoutText(hb, fredoka, base).lines[0].width;
    const gaps = (layoutText(hb, fredoka, { ...base, tracking: 100 }).lines[0].width - plain) / 2;
    expect([3, 4]).toContain(Math.round(gaps * 1e6) / 1e6);
    const c = layoutText(hb, fredoka, { ...base, align: "center" }).lines[0];
    expect(c.x).toBeCloseTo(-c.width / 2, 9);
    expect(layoutText(hb, fredoka, { ...base, align: "end" }).lines[0].x).toBeCloseTo(-plain, 9);
  });

  it("stacks lines by line height and wraps area text", () => {
    const two = layoutText(hb, fredoka, { ...base, text: "Hello\nWorld" });
    expect(two.lines.map((l) => l.baseline)).toEqual([0, 24]);
    const area = layoutText(hb, fredoka, { ...base, text: "one two three four five six", width: 60 });
    expect(area.lines.length).toBeGreaterThan(1);
    for (const l of area.lines) expect(l.width <= 60 || !l.text.includes(" ")).toBe(true);
  });

  it("shapes Persian right to left; tracking only opens the one non-joining gap (after alef)", () => {
    const fa = layoutText(hb, vazir, { ...base, text: "سام" });
    expect(fa.lines[0].direction).toBe("rtl");
    expect(fa.lines[0].x).toBeCloseTo(-fa.lines[0].width, 9);
    const spaced = layoutText(hb, vazir, { ...base, text: "سام", tracking: 200 });
    expect(spaced.lines[0].width).toBeCloseTo(fa.lines[0].width + 4, 6);
    expect(layoutText(hb, fredoka, { ...base, text: "سام" }).missing.length).toBeGreaterThan(0);
  });
});
