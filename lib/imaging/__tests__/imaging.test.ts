import { describe, expect, it } from "vitest";
import { autoFixAll } from "@/lib/issues";
import { emptyBitmap, type Bitmap } from "@/lib/studio/trace/raster";
import { adjust, autoAdjust, enhance, upscale } from "../adjust";
import { borderColour, cutout, whiteToAlpha } from "../cutout";
import { dither, engrave, ENGRAVE_MATERIALS, toneCurve, type DitherAlgo } from "../dither";
import { greyOf, imgFromGrey, makeImg, pad, resample, type Img } from "../image";
import { cartoon, lineArt } from "../lineart";
import { components, connectPieces, dilate, distanceTo, erode, openBitmap } from "../morph";
import { depthLayers, perforation } from "../relief";
import { cutSafety, safeFeature, safetyCheck } from "../safety";
import { cleanVectorize, vectorize, vectorizeBitmap, VECTORIZE_DEFAULTS } from "../vectorize";

const flat = (w: number, h: number, v: number) => imgFromGrey(new Array(w * h).fill(v), w, h);
const density = (b: Bitmap) => b.bits.reduce((a, v) => a + v, 0) / b.bits.length;
const rect = (b: Bitmap, x0: number, y0: number, x1: number, y1: number, v: 0 | 1 = 1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) b.bits[y * b.width + x] = v; };
const imgOf = (b: Bitmap): Img => imgFromGrey(Array.from(b.bits, (v) => (v ? 0 : 255)), b.width, b.height);

describe("dithering", () => {
  const ALGOS: DitherAlgo[] = ["floyd", "jarvis", "stucki", "atkinson", "ordered", "halftone", "threshold"];

  it("outputs only burn / no-burn and keeps white white and black black", () => {
    for (const algo of ALGOS) {
      expect(density(dither(new Array(64 * 64).fill(255), 64, 64, { algo }))).toBe(0);
      expect(density(dither(new Array(64 * 64).fill(0), 64, 64, { algo }))).toBeGreaterThan(0.95);
      const b = dither(new Array(32 * 32).fill(100), 32, 32, { algo });
      expect([...b.bits].every((v) => v === 0 || v === 1)).toBe(true);
    }
  });

  it("burns about as many dots as the grey is dark", () => {
    for (const algo of ["floyd", "jarvis", "stucki", "ordered", "halftone"] as const) {
      for (const dark of [0.25, 0.5, 0.75]) {
        const d = density(dither(new Array(128 * 128).fill(255 * (1 - dark)), 128, 128, { algo }));
        expect(Math.abs(d - dark), `${algo} at ${dark}`).toBeLessThan(algo === "halftone" ? 0.08 : 0.03);
      }
    }
  });

  it("Atkinson drops a quarter of the error, so mid-tones go cleaner but stay near the grey", () => {
    const d = density(dither(new Array(128 * 128).fill(127.5), 128, 128, { algo: "atkinson" }));
    expect(d).toBeGreaterThan(0.4);
    expect(d).toBeLessThan(0.6);
  });

  it("threshold and invert", () => {
    const g = [0, 100, 200, 255];
    expect([...dither(g, 4, 1, { algo: "threshold", threshold: 0.5 }).bits]).toEqual([1, 1, 0, 0]);
    expect([...dither(g, 4, 1, { algo: "threshold", threshold: 0.5, invert: true }).bits]).toEqual([0, 0, 1, 1]);
  });

  it("is deterministic", () => {
    const g = Array.from({ length: 50 * 40 }, (_, i) => (i * 37) % 256);
    for (const algo of ALGOS) expect(dither(g, 50, 40, { algo }).bits).toEqual(dither(g, 50, 40, { algo }).bits);
  });

  it("material presets size the raster from the width and the material's resolution", () => {
    const photo = flat(200, 100, 128);
    for (const m of ENGRAVE_MATERIALS) {
      const r = engrave(photo, { material: m.id, widthMm: 50.8 });
      expect(r.bitmap.width).toBe(Math.round(2 * m.dpi));
      expect(r.bitmap.height).toBe(Math.round(m.dpi));
      expect(r.material.id).toBe(m.id);
    }
    // Acrylic, slate and anodised metal mark light: a white photo burns everywhere there.
    expect(density(engrave(flat(40, 40, 255), { material: "slate", widthMm: 10 }).bitmap)).toBeGreaterThan(0.95);
    expect(density(engrave(flat(40, 40, 255), { material: "wood", widthMm: 10 }).bitmap)).toBe(0);
  });

  it("caps the raster size", () => {
    const r = engrave(flat(100, 100, 128), { material: "wood", widthMm: 2000 });
    expect(Math.max(r.bitmap.width, r.bitmap.height)).toBeLessThanOrEqual(3000);
  });

  it("tone curve: gamma above 1 lightens mid-tones and keeps the ends", () => {
    const t = toneCurve(new Float32Array([0, 128, 255]), 1.5, 0);
    expect(t[0]).toBe(0);
    expect(t[2]).toBeCloseTo(255);
    expect(t[1]).toBeGreaterThan(128);
  });
});

describe("image tools", () => {
  it("resample keeps a flat colour flat and hits the asked size", () => {
    const r = resample(flat(30, 20, 90), 75, 50);
    expect([r.width, r.height]).toEqual([75, 50]);
    expect(Math.max(...greyOf(r)) - Math.min(...greyOf(r))).toBeLessThan(1);
  });

  it("upscale doubles or quadruples", () => {
    expect(upscale(flat(20, 10, 50), 2).width).toBe(40);
    const u = upscale(flat(20, 10, 50), 4);
    expect([u.width, u.height]).toEqual([80, 40]);
  });

  it("Smart Adjust stretches a dull image to full range", () => {
    const g = Array.from({ length: 100 * 10 }, (_, i) => 80 + ((i % 100) / 99) * 80);
    const img = imgFromGrey(g, 100, 10);
    const o = autoAdjust(img);
    expect(o.black).toBeGreaterThanOrEqual(78);
    expect(o.white).toBeLessThanOrEqual(162);
    const out = greyOf(adjust(img, o));
    expect(Math.min(...out)).toBeLessThan(10);
    expect(Math.max(...out)).toBeGreaterThan(245);
    expect(enhance(img).width).toBe(100);
  });

  it("cutout removes a plain background and keeps the subject", () => {
    const img = makeImg(40, 40, [240, 240, 240, 255]);
    for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) img.data.set([200, 30, 30, 255], (y * 40 + x) * 4);
    expect(borderColour(img)).toEqual([240, 240, 240]);
    const out = cutout(img, { feather: 0 });
    expect(out.data[3]).toBe(0);
    expect(out.data[(20 * 40 + 20) * 4 + 3]).toBe(255);
    expect(whiteToAlpha(makeImg(8, 8)).data[3]).toBe(0);
  });

  it("pad adds a transparent border", () => {
    const p = pad(flat(4, 4, 0), { left: 2, top: 1, right: 0, bottom: 3 });
    expect([p.width, p.height]).toEqual([6, 8]);
    expect(p.data[3]).toBe(0);
    expect(p.data[(1 * 6 + 2) * 4 + 3]).toBe(255);
  });

  it("line art draws the outline of a shape, not its inside", () => {
    const b = emptyBitmap(80, 80);
    rect(b, 20, 20, 60, 60);
    const lines = lineArt(imgOf(b), { thickness: 1, clean: 0 });
    expect(lines.bits[40 * 80 + 40]).toBe(0);
    expect(lines.bits[5 * 80 + 5]).toBe(0);
    let near = 0;
    for (let x = 18; x < 23; x++) near += lines.bits[40 * 80 + x];
    expect(near).toBeGreaterThan(0);
    expect(cartoon(imgOf(b), { levels: 2 }).width).toBe(80);
  });
});

describe("bitmap shape tools", () => {
  it("distance, erode and dilate", () => {
    const b = emptyBitmap(21, 21);
    rect(b, 5, 5, 16, 16);
    expect(distanceTo(b, 1)[10 * 21 + 10]).toBeCloseTo(6);
    expect(density(erode(b, 2))).toBeCloseTo((7 * 7) / 441, 5);
    expect(dilate(b, 1).bits[4 * 21 + 10]).toBe(1);
    expect(dilate(b, 1).bits[3 * 21 + 10]).toBe(0);
  });

  it("opening removes lines thinner than the feature size and keeps thick parts", () => {
    const b = emptyBitmap(60, 40);
    rect(b, 5, 5, 25, 35);
    rect(b, 25, 19, 55, 21);
    const o = openBitmap(b, 2);
    expect(o.bits[20 * 60 + 40]).toBe(0);
    expect(o.bits[20 * 60 + 15]).toBe(1);
  });

  it("bridges join loose pieces into one, and stencil pockets to the outside", () => {
    const b = emptyBitmap(80, 40);
    rect(b, 5, 5, 30, 35);
    rect(b, 45, 10, 60, 30);
    rect(b, 68, 15, 75, 25);
    expect(components(b, 1).sizes.length).toBe(3);
    const j = connectPieces(b, "islands", 3);
    expect(j.bridges).toBe(2);
    expect(components(j.bitmap, 1).sizes.length).toBe(1);

    const o = emptyBitmap(40, 40);
    rect(o, 5, 5, 35, 35);
    rect(o, 15, 15, 25, 25, 0);
    expect(components(o, 0).border.filter((e) => !e).length).toBe(1);
    const s = connectPieces(o, "holes", 3);
    expect(components(s.bitmap, 0).border.every((e) => e)).toBe(true);
  });
});

describe("vectorize", () => {
  const square = () => { const b = emptyBitmap(100, 100); rect(b, 20, 20, 80, 80); return b; };

  it("traces a square to one closed outline at the asked size in mm", () => {
    const v = vectorizeBitmap(square(), { widthMm: 50, smooth: 0, optimize: 0.5 });
    expect(v.pxPerMm).toBeCloseTo(2);
    expect(v.heightMm).toBeCloseTo(50);
    expect(v.subpaths).toHaveLength(1);
    expect(v.subpaths[0].closed).toBe(true);
    const xs = v.subpaths[0].nodes.map((n) => n.x), ys = v.subpaths[0].nodes.map((n) => n.y);
    expect(Math.min(...xs)).toBeCloseTo(10, 0);
    expect(Math.max(...xs)).toBeCloseTo(40, 0);
    expect(Math.min(...ys)).toBeCloseTo(10, 0);
  });

  it("vectorizes an image the same as its ink bitmap", () => {
    const v = vectorize(imgOf(square()), { widthMm: 50 });
    expect(v.subpaths).toHaveLength(1);
    expect(vectorize(imgOf(square()), { widthMm: 50, source: "light" }).subpaths.length).toBe(2);
  });

  it("minimum feature size drops thin parts; minimum area drops specks", () => {
    const b = square();
    rect(b, 80, 49, 98, 51);
    rect(b, 2, 2, 4, 4);
    const raw = vectorizeBitmap(b, { widthMm: 100, minAreaMm2: 0 });
    const clean = vectorizeBitmap(b, { widthMm: 100, minFeatureMm: 3, minAreaMm2: 10 });
    expect(raw.subpaths.length).toBe(2);
    expect(clean.subpaths.length).toBe(1);
    const maxX = Math.max(...clean.subpaths[0].nodes.map((n) => n.x));
    expect(maxX).toBeLessThan(81);
  });

  it("bridges make separate pieces one outline", () => {
    const b = emptyBitmap(100, 50);
    rect(b, 5, 5, 40, 45);
    rect(b, 60, 5, 95, 45);
    expect(vectorizeBitmap(b, { widthMm: 100 }).subpaths.length).toBe(2);
    const v = vectorizeBitmap(b, { widthMm: 100, connect: "islands", bridgeMm: 4 });
    expect(v.bridges).toBe(1);
    expect(v.subpaths.length).toBe(1);
  });

  it("centre-lines give open strokes", () => {
    const b = emptyBitmap(100, 30);
    rect(b, 10, 13, 90, 17);
    const v = vectorizeBitmap(b, { widthMm: 100, lines: true });
    expect(v.lines).toBe(true);
    expect(v.subpaths.length).toBeGreaterThan(0);
    expect(v.subpaths.some((s) => !s.closed)).toBe(true);
  });

  it("cleans settings from anywhere", () => {
    const o = cleanVectorize({ widthMm: -5, threshold: 7, connect: "x" as never, source: "nope" as never });
    expect(o.widthMm).toBe(5);
    expect(o.threshold).toBe(0.99);
    expect(o.connect).toBe("none");
    expect(o.source).toBe("dark");
  });
});

describe("cut safety", () => {
  const ctx = { bedW: 300, bedH: 200, minFeatureMm: 2, use: "cut" as const };

  it("finds thin parts, loose pieces and an oversized result, and Fix all solves them", () => {
    const b = emptyBitmap(200, 100);
    rect(b, 10, 10, 90, 90);
    rect(b, 90, 49, 150, 50);
    rect(b, 160, 30, 190, 70);
    // 2 px per mm: the 1 px line is 0.5 mm thick, and 100 mm is wider than an 80 mm bed.
    const p = { ...VECTORIZE_DEFAULTS, widthMm: 100, minAreaMm2: 0 };
    const check = safetyCheck(b, { ...ctx, bedW: 80 });
    const codes = check(p).map((i) => i.code).sort();
    expect(codes).toEqual(["bed", "islands", "thin"]);
    const fixed = autoFixAll(p, check);
    expect(fixed.remaining).toEqual([]);
    expect(fixed.params.widthMm).toBeLessThanOrEqual(70);
    expect(fixed.params.connect).toBe("islands");
    expect(fixed.params.minFeatureMm).toBe(2);
  });

  it("stencil pockets get bridges; engraving skips cut checks", () => {
    const o = emptyBitmap(100, 100);
    rect(o, 10, 10, 90, 90);
    rect(o, 40, 40, 60, 60, 0);
    const p = { ...VECTORIZE_DEFAULTS, widthMm: 100 };
    const stencil = safetyCheck(o, { ...ctx, use: "stencil" });
    expect(stencil(p).map((i) => i.code)).toEqual(["pockets"]);
    expect(autoFixAll(p, stencil).remaining).toEqual([]);
    expect(safetyCheck(o, { ...ctx, use: "engrave" })(p)).toEqual([]);
  });

  it("an empty result is an error", () => {
    const v = vectorizeBitmap(emptyBitmap(20, 20), { widthMm: 20 });
    expect(cutSafety(v, { ...VECTORIZE_DEFAULTS, widthMm: 20 }, ctx)[0].code).toBe("empty");
  });

  it("safe feature size follows the material thickness", () => {
    expect(safeFeature(1)).toBe(0.8);
    expect(safeFeature(6)).toBe(2.1);
  });
});

describe("relief and perforation", () => {
  it("depth levels stack: every sheet lies inside the one below", () => {
    const w = 40, h = 40, data = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = Math.max(0, 1 - Math.hypot(x - 20, y - 20) / 20);
    const layers = depthLayers({ w, h, data }, { levels: 4, floor: 0.1, speckles: 0 });
    expect(layers).toHaveLength(4);
    for (let k = 1; k < layers.length; k++) {
      expect(density(layers[k])).toBeLessThan(density(layers[k - 1]));
      for (let i = 0; i < w * h; i++) if (layers[k].bits[i]) expect(layers[k - 1].bits[i]).toBe(1);
    }
  });

  it("perforation fills the panel inside the margin", () => {
    const motif = [{ closed: true, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] }];
    const r = perforation(motif, { width: 200, height: 100, cell: 20, gap: 5, margin: 10, stagger: false });
    expect(r.count).toBe(9 * 4);
    for (const s of r.holes) for (const n of s.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(10 - 1e-9);
      expect(n.x).toBeLessThanOrEqual(190 + 1e-9);
    }
    expect(Math.max(...r.holes[0].nodes.map((n) => n.x)) - Math.min(...r.holes[0].nodes.map((n) => n.x))).toBeCloseTo(15);
  });
});
