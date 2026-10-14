import { describe, expect, it } from "vitest";
import { differenceShapes, shapeContours, totalArea, unionShapes } from "@/lib/letters/polygon";
import { signedArea } from "../geom";
import { SHADOWBOX } from "../shadowbox";
import type { ShadowBoxOutput } from "../shadowbox/build";
import { bridgeIslands } from "../shadowbox/islands";
import { mergeShadowBox } from "../shadowbox/params";
import { LEVEL_CUTS, MAX_PIC_TEXT, decodeContours, encodeContours, encodeLevels, isPictureText } from "../shadowbox/picPath";
import { pictureShapes, sampleShapes } from "../shadowbox/picture";
import { PictureError, svgLevels, traceLevels } from "@/lib/imaging/levels";
import type { Contour } from "@/lib/letters/types";
import { CTX } from "./ctx";

const build = (raw: unknown) => SHADOWBOX.build(mergeShadowBox(raw), CTX) as ShadowBoxOutput;
const layers = (out: ShadowBoxOutput) => out.parts.filter((p) => p.id.startsWith("layer"));
const pieces = (out: ShadowBoxOutput) => out.parts.filter((p) => p.id.startsWith("piece"));
const holeArea = (p: { holes: [number, number][][] }) => p.holes.reduce((a, h) => a + Math.abs(signedArea(h)), 0);
const square = (x: number, y: number, s: number): Contour => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
const levelArea = (s: string) => totalArea(unionShapes(decodeContours(s), [], true));

/** A grey disc, darkest in the middle, on white. */
function radial(n: number) {
  const data = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = Math.hypot(x - n / 2, y - n / 2) / (n / 2);
    const v = Math.min(255, Math.round(d * 255));
    data.set([v, v, v, 255], (y * n + x) * 4);
  }
  return { width: n, height: n, data };
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
  <path fill-rule="evenodd" d="M0 0 H100 V100 H0 Z M25 25 H75 V75 H25 Z"/>
  <circle cx="150" cy="50" r="40"/>
</svg>`;

describe("picture paths", () => {
  it("round-trip contours as whole units and reject anything else", () => {
    const cs: Contour[] = [square(10.2, 20.7, 300), [[500, 500], [600, 520.4], [550, 640]]];
    const back = decodeContours(encodeContours(cs));
    expect(back).toHaveLength(2);
    expect(back[0]).toEqual([[10, 21], [310, 21], [310, 321], [10, 321]]);
    expect(back[1]).toEqual([[500, 500], [600, 520], [550, 640]]);
    expect(isPictureText("")).toBe(true);
    expect(isPictureText(encodeLevels([cs, cs]))).toBe(true);
    for (const bad of ["<script>", "M 1 2 L 3 4", "javascript:", "M1 2|".repeat(11), "1".repeat(MAX_PIC_TEXT + 1), 42, null]) expect(isPictureText(bad), String(bad).slice(0, 20)).toBe(false);
  });

  it("merge keeps a valid picture and drops a bad one", () => {
    const levels = encodeLevels([[square(0, 0, 1000)]]);
    const ok = mergeShadowBox({ picture: { levels, aspect: 2, name: "my cat.png", image: "data:image/jpeg;base64,AAAA" } }).picture;
    expect(ok).toMatchObject({ levels, aspect: 2, image: "data:image/jpeg;base64,AAAA" });
    const bad = mergeShadowBox({ picture: { levels: "M0 0 l<script>", aspect: 1e9, name: "<b>x</b>".repeat(50), image: "javascript:alert(1)", sample: "dragon", mode: "melt" } }).picture;
    expect(bad.levels).toBe("");
    expect(bad.image).toBe("");
    expect(bad.aspect).toBeLessThanOrEqual(10);
    expect(bad.name).not.toMatch(/[<>]/);
    expect(bad.name.length).toBeLessThanOrEqual(80);
    expect(bad.sample).toBe("cat");
    expect(bad.mode).toBe("grow");
  });
});

describe("tracing", () => {
  it("traces a picture into nested levels: darker cut-offs sit inside lighter ones", () => {
    const { levels, aspect } = traceLevels(radial(120));
    expect(aspect).toBe(1);
    const parts = levels.split("|");
    expect(parts).toHaveLength(LEVEL_CUTS.length);
    const areas = parts.map(levelArea);
    for (let i = 1; i < areas.length; i++) expect(areas[i], `level ${i}`).toBeGreaterThan(areas[i - 1]);
    const shapes = pictureShapes(levels);
    for (let i = 1; i < shapes.length; i++) {
      const outside = totalArea(differenceShapes(shapeContours(shapes[i - 1]), shapeContours(shapes[i])));
      expect(outside, `level ${i - 1} outside ${i}`).toBeLessThan(areas[i - 1] * 0.02 + 50);
    }
  });

  it("traces an SVG's filled shapes, holes included, and refuses one with none", () => {
    const { levels, aspect } = svgLevels(SVG);
    // The art spans 190 × 100 units: a 100-unit square with a 50-unit hole and a 40-unit circle.
    expect(aspect).toBeCloseTo(1.9, 2);
    expect(levels.split("|")).toHaveLength(1);
    const k = (1000 / 190) ** 2;
    expect(levelArea(levels) / ((100 * 100 - 50 * 50 + Math.PI * 40 * 40) * k)).toBeCloseTo(1, 1);
    expect(() => svgLevels(`<svg xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="0" x2="10" y2="10" stroke="black"/></svg>`)).toThrow(PictureError);
  });
});

describe("picture pattern", () => {
  it("rings grow around the shape from the back to the front", () => {
    const out = build({ stack: { count: 6 }, design: { pattern: "picture" }, picture: { sample: "heart", mode: "grow", step: 6 } });
    expect(out.error).toBeUndefined();
    const cut = layers(out).map(holeArea);
    expect(cut).toHaveLength(6);
    for (let i = 1; i < cut.length - 1; i++) expect(cut[i], `layer ${i}`).toBeGreaterThan(cut[i - 1]);
  });

  it("a traced picture cuts one brightness level per layer, and invert swaps light and dark", () => {
    const { levels, aspect } = traceLevels(radial(120));
    const base = { stack: { count: 5 }, design: { pattern: "picture" }, picture: { levels, aspect, mode: "levels", dark: 10, light: 90 } };
    const out = build(base);
    expect(out.error).toBeUndefined();
    // Layer 0 is the solid back.
    const cut = layers(out).slice(1).map(holeArea);
    for (let i = 1; i < cut.length; i++) expect(cut[i], `layer ${i + 1}`).toBeGreaterThan(cut[i - 1]);
    // Inverted, the light surround is cut and the dark middle is left standing.
    const flipped = build({ ...base, picture: { ...base.picture, invert: true } });
    const inv = layers(flipped).slice(1).map(holeArea);
    expect(inv[0]).toBeGreaterThan(cut[0]);
    expect(flipped.info!.dropped).toBeGreaterThan(0);
  });

  it("a tunnel nests the shape from small at the back to large at the front", () => {
    const out = build({ stack: { count: 6 }, design: { pattern: "picture", min: 20, max: 90 }, picture: { sample: "tree", mode: "scale" } });
    const cut = layers(out).slice(1).map(holeArea);
    for (let i = 1; i < cut.length; i++) expect(cut[i]).toBeGreaterThan(cut[i - 1]);
  });

  it("paper mode leaves the shape standing: dropped, bridged into one piece, or cut as parts", () => {
    const pc = { sample: "flower", mode: "grow", paper: true, size: 40, step: 6 };
    const dropped = build({ stack: { count: 5 }, design: { pattern: "picture", loose: "drop" }, picture: pc });
    expect(dropped.info!.dropped).toBeGreaterThan(0);
    const bridged = build({ stack: { count: 5 }, design: { pattern: "picture", loose: "bridge", bridge: 2 }, picture: pc });
    expect(bridged.info!.dropped).toBe(0);
    expect(bridged.info!.bridges).toBeGreaterThan(0);
    expect(pieces(bridged)).toHaveLength(0);
    // Bridged layers keep more paper than the ones with the shape left out.
    const sum = (o: ShadowBoxOutput) => layers(o).reduce((a, l) => a + Math.abs(signedArea(l.outer)) - holeArea(l), 0);
    expect(sum(bridged)).toBeGreaterThan(sum(dropped));
    const parts = build({ stack: { count: 5 }, design: { pattern: "picture", loose: "parts" }, picture: pc });
    expect(parts.info!.dropped).toBe(0);
    expect(pieces(parts).length).toBeGreaterThan(0);
    expect(SHADOWBOX.check(mergeShadowBox({ stack: { count: 5 }, design: { pattern: "picture", loose: "parts" }, picture: pc }), parts).filter((i) => i.level !== "info")).toEqual([]);
  });

  it("bridges join every loose piece into one", () => {
    const main = differenceShapes([square(0, 0, 100)], [square(10, 10, 80)])[0];
    const loose = unionShapes([square(20, 20, 10), square(40, 40, 10), square(60, 20, 8)]);
    const r = bridgeIslands(main, loose, 2);
    expect(r.bridges).toBe(3);
    expect(r.left).toBe(0);
    expect(totalArea([r.shape])).toBeGreaterThan(totalArea([main]) + 100 + 100 + 64);
  });

  it("minimum cut detail removes slivers thinner than it", () => {
    // A 400-unit square crossed by a 4-unit wide line (about 0.4 mm here).
    const levels = encodeLevels([[square(300, 300, 400), [[100, 500], [900, 500], [900, 504], [100, 504]]]]);
    const at = (detail: number) => holeArea(layers(build({ stack: { count: 3 }, design: { pattern: "picture" }, picture: { levels, aspect: 1, mode: "grow", step: 0, size: 60, detail } }))[1]);
    const line = at(0) - at(2);
    expect(line).toBeGreaterThan(at(0) * 0.005);
    expect(at(2)).toBeCloseTo(at(3), -1);
  });

  it("samples are all one solid shape", () => {
    for (const id of ["cat", "fish", "bird", "pear"] as const) {
      const s = sampleShapes(id);
      expect(s.shapes, id).toHaveLength(1);
      expect(Math.max(s.w, s.h), id).toBeCloseTo(1000, 0);
    }
  });
});
