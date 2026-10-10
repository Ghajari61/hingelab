import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as hb from "harfbuzzjs";
import { describe, expect, it } from "vitest";
import { loadFont, shapeText, type LoadedFont } from "@/lib/letters";
import { mergeParametricParams } from "../defaults";
import { computeParametric, loadSource } from "../engine";
import { signedVolume } from "../source/library";
import { bounds, openEdgeCount } from "../source/mesh";
import { packOutline, textMesh, textRegions, unpackOutline } from "../source/text";
import type { Contour, TextSource } from "../types";
import { manifold } from "./helpers";

function fixture(file: string, id: string, name: string): LoadedFont {
  const b = readFileSync(join(__dirname, "../../letters/__tests__/fonts", file));
  return loadFont(hb, id, name, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
}
const fredoka = fixture("Fredoka-Bold.ttf", "fredoka", "Fredoka Bold");
const vazir = fixture("Vazirmatn-Black.ttf", "vazirmatn", "Vazirmatn Black");

const outline = (font: LoadedFont, text: string, size = 150): Contour[] =>
  shapeText(hb, font, text, { direction: "auto", size, sizeMode: "capHeight", letterSpacing: 0 }).glyphs.flatMap((g) => g.contours);
const area = (cs: Contour[]) => textRegions(cs).reduce((a, s) => a + s.area, 0);

describe("text source", () => {
  it("packs and unpacks glyph outlines exactly, and refuses damaged bytes", () => {
    const cs = outline(fredoka, "Sam");
    expect(unpackOutline(packOutline(cs))).toEqual(cs);
    expect(() => unpackOutline(new ArrayBuffer(24))).toThrow(/damaged/);
  });

  it("flat letters are a closed extrusion: volume = area × depth, counters stay open", () => {
    const cs = outline(fredoka, "O");
    const regions = textRegions(cs);
    expect(regions).toHaveLength(1);
    expect(regions[0].holes).toHaveLength(1);
    const m = textMesh(cs, { depth: 30, profile: "flat", round: 0 });
    expect(openEdgeCount(m)).toBe(0);
    expect(signedVolume(m)).toBeCloseTo(area(cs) * 30, 0);
    const b = bounds(m);
    expect(b.min[2]).toBe(0);
    expect(b.max[2]).toBe(30);
  });

  it("rounded letters rise from the edge to the full depth and stay closed", () => {
    const cs = outline(fredoka, "Sam");
    const flat = textMesh(cs, { depth: 40, profile: "flat", round: 0 });
    const round = textMesh(cs, { depth: 40, profile: "rounded", round: 12 });
    expect(openEdgeCount(round)).toBe(0);
    const b = bounds(round);
    expect(b.min[2]).toBe(0);
    expect(b.max[2]).toBeGreaterThan(39);
    expect(b.max[2]).toBeLessThanOrEqual(40);
    expect(signedVolume(round)).toBeLessThan(signedVolume(flat));
    expect(signedVolume(round)).toBeGreaterThan(0.5 * signedVolume(flat));
  });

  it("Persian text (سام) becomes one joined solid", () => {
    const cs = outline(vazir, "سام");
    const m = textMesh(cs, { depth: 25, profile: "flat", round: 0 });
    expect(openEdgeCount(m)).toBe(0);
    expect(signedVolume(m)).toBeCloseTo(area(cs) * 25, 0);
  });

  it("refuses empty text", () => {
    expect(() => textMesh([], { depth: 20, profile: "flat", round: 0 })).toThrow(/Type some text/);
  });

  it("slices into parallel fins through the engine", async () => {
    const wasm = await manifold();
    const src: TextSource = { kind: "text", text: "HI", font: "fredoka", size: 120, letterSpacing: 0, depth: 30, profile: "flat", round: 0 };
    const p = mergeParametricParams({ source: src });
    p.parallel.spacing = 10;
    p.parallel.backboard = "none";
    const prepared = await loadSource(p, packOutline(outline(fredoka, "HI", 120)));
    expect(prepared.openEdges).toBe(0);
    const r = computeParametric(p, prepared, wasm);
    expect(r.parts.length).toBeGreaterThan(5);
    for (const part of r.parts) expect(part.shape.bbox.y1 - part.shape.bbox.y0).toBeLessThanOrEqual(30 + 0.01);
  });
});
