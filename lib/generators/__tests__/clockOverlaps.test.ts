/** Clock markers and patterns that must not draw over one another. */
import { describe, expect, it } from "vitest";
import { intersectShapes, unionShapes } from "@/lib/letters/polygon";
import { CLOCK } from "../clock";
import { distToContour as distT, pointInContour as pointInContourT, signedArea } from "../geom";
import { clockGeometry as clockGeometryT } from "../clock/build";
import { itemOf } from "../items";
import type { Contour, GenPart } from "../types";
import { CTX } from "./ctx";

const build = (raw: unknown) => CLOCK.build(CLOCK.merge(raw), CTX);
const area = (cs: Contour[]) => unionShapes(cs, [], true).reduce((n, s) => n + s.area, 0);
const marks = (pt: GenPart) => [...(pt.engrave ?? []), ...pt.holes];

/** Area where a tick lies on a numeral, on every part. */
function tickOnNumeral(parts: GenPart[]) {
  let a = 0;
  for (const pt of parts) {
    const ms = marks(pt), nums = ms.filter((c) => itemOf(c) === "Numerals"), ticks = ms.filter((c) => itemOf(c) === "Ticks");
    if (!nums.length || !ticks.length) continue;
    a += intersectShapes(ticks, shapeContoursOf(nums)).reduce((n, s) => n + s.area, 0);
  }
  return a;
}
const shapeContoursOf = (cs: Contour[]) => unionShapes(cs, [], true).flatMap((s) => [s.outer, ...s.holes]);

describe("clock markers", () => {
  const CASES = [
    { markers: { style: "numerals", numerals: "roman", minutes: true, size: 24 } },
    { markers: { style: "numerals", numerals: "roman", minutes: true, size: 30, follow: true } },
    { markers: { style: "numerals", numerals: "arabic", minutes: true, size: 30, fontId: "pacifico" } },
    { markers: { style: "mixed", numerals: "roman", minutes: true, size: 34 } },
    { face: { shape: "gear" }, markers: { style: "numerals", minutes: true, size: 26 } },
    { face: { layers: "ring" }, markers: { style: "numerals", numerals: "roman", minutes: true, size: 22 } },
  ];
  it("keeps every tick clear of the numerals", () => {
    for (const raw of CASES) expect(tickOnNumeral(build(raw).parts), JSON.stringify(raw)).toBe(0);
    for (const pr of CLOCK.presets) expect(tickOnNumeral(build(pr.params).parts), pr.id).toBe(0);
  });

  it("still draws the minute ticks away from the numerals", () => {
    const out = build({ markers: { style: "numerals", numerals: "arabic", minutes: true, size: 12 } });
    const ticks = out.parts.flatMap(marks).filter((c) => itemOf(c) === "Ticks");
    expect(ticks.length).toBeGreaterThanOrEqual(40);
    expect(area(ticks)).toBeGreaterThan(0);
  });
});

describe("clock pattern", () => {
  it("cuts only whole shapes: no star is clipped at the edge of its area", () => {
    for (const raw of [
      { face: { layers: "single" }, pattern: { pattern: "stars", on: "face", cell: 14, bar: 2 } },
      { face: { layers: "ring" }, pattern: { pattern: "stars", on: "back", cell: 14, bar: 2 } },
      { face: { layers: "single", shape: "gear" }, pattern: { pattern: "circles", on: "face", cell: 12, bar: 2 } },
    ]) {
      const plain = build({ ...raw, pattern: { pattern: "none" } }).parts.flatMap((p) => p.holes).length;
      const holes = build(raw).parts.flatMap((p) => p.holes);
      const pattern = holes.map((c) => Math.round(Math.abs(signedArea(c)) * 10) / 10);
      expect(holes.length - plain, JSON.stringify(raw)).toBeGreaterThan(10);
      // the pattern's shapes all have one size (the most common); a clipped one would be smaller
      const count = new Map<number, number>();
      for (const v of pattern) count.set(v, (count.get(v) ?? 0) + 1);
      const mode = [...count.entries()].sort((x, y) => y[1] - x[1])[0][0];
      expect(pattern.filter((v) => v !== mode).length, JSON.stringify(raw)).toBe(plain);
    }
  });
});

describe("clock numerals on their band", () => {
  const SHAPES = ["round", "cloud", "heart", "flower", "square", "polygon", "scallop"];
  const inside = (q: [number, number], c: Contour) => pointInContourT(q, c);
  it("keeps every numeral wholly on the face (and on the ring, off its opening) and apart from the others", () => {
    for (const shape of SHAPES) for (const layers of ["single", "ring"]) for (const size of [20, 30]) for (const follow of [false, true]) {
      const raw = { face: { shape, layers, size: 300 }, markers: { style: "numerals", numerals: "roman", size, follow, minutes: true } };
      const p = CLOCK.merge(raw), out = CLOCK.build(p, CTX);
      const label = JSON.stringify(raw);
      const g = clockGeometryT(p, CTX);
      if ("error" in g) throw Error(label);
      const part = out.parts.find((q) => q.id === (g.markersOn === "ring" ? "ring" : g.markersOn === "back" ? "back" : "face"))!;
      const nums = marks(part).filter((c) => itemOf(c) === "Numerals");
      expect(nums.length, label).toBeGreaterThan(11);
      for (const c of nums) for (const q of c) {
        expect(inside(q, g.outline) && distT(q, g.outline) >= 1.4, `${label} outside the face`).toBe(true);
        if (g.markersOn === "ring") expect(!inside(q, g.ringInner!) && distT(q, g.ringInner!) >= 1.4, `${label} on the opening`).toBe(true);
        if (g.markersOn === "back") expect(inside(q, g.ringInner!), `${label} under the ring`).toBe(true);
      }
      // numerals never overlap each other
      const blocks = unionShapes(nums, [], true);
      expect(area(nums), label).toBeCloseTo(blocks.reduce((n, s) => n + s.area, 0), 0);
    }
  }, 120_000);
});
