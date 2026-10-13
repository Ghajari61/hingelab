import { describe, expect, it } from "vitest";
import { cropTo, editMask, nearestAspect, padTo, place } from "../frame";
import { imgFromGrey, makeImg, type Img } from "../image";
import { runImaging } from "../ops";
import { VECTORIZE_DEFAULTS } from "../vectorize";

/** A white picture with black squares at the given pixel boxes. */
function squares(w: number, h: number, boxes: [number, number, number, number][]): Img {
  const g = new Array(w * h).fill(255);
  for (const [x0, y0, x1, y1] of boxes) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g[y * w + x] = 0;
  return imgFromGrey(g, w, h);
}

describe("model framing", () => {
  it("picks the nearest model shape", () => {
    expect(nearestAspect(1.1)).toBe(1);
    expect(nearestAspect(1.7)).toBe(1.5);
    expect(nearestAspect(0.5)).toBeCloseTo(2 / 3);
  });

  it("pads and crops back to the same pixels", () => {
    const img = squares(30, 10, [[0, 0, 5, 5]]);
    const f = padTo(img, 1.5);
    expect(f.img.width / f.img.height).toBeCloseTo(1.5, 1);
    const back = cropTo(f.img, f.rect);
    expect([back.width, back.height]).toEqual([30, 10]);
    expect(Array.from(back.data)).toEqual(Array.from(img.data));
  });

  it("places a picture in a bigger frame and masks the new room", () => {
    const f = place(makeImg(10, 10, [0, 0, 0, 255]), 20, 10, [128, 128, 128, 255]);
    expect(f.rect).toEqual({ x: 0.25, y: 0, w: 0.5, h: 1 });
    const m = editMask(20, 10, f.rect, true);
    expect(m.data[3]).toBe(0);
    expect(m.data[(5 * 20 + 10) * 4 + 3]).toBe(255);
  });

  it("an inpainting mask clears only the painted pixels", () => {
    const paint = new Uint8Array(4 * 4);
    paint[0] = 1;
    const m = editMask(4, 4, { x: 0, y: 0, w: 1, h: 1 }, false, paint, 4, 4);
    expect(m.data[3]).toBe(0);
    expect(m.data[7]).toBe(255);
  });
});

describe("imaging operations", () => {
  const ctx = { bedW: 500, bedH: 300, minFeatureMm: 1, use: "cut" as const };

  it("vectorize reports cut-safety issues with the settings each fix gives", () => {
    const img = squares(200, 100, [[10, 10, 60, 60], [120, 20, 170, 70]]);
    const r = runImaging({ op: "vectorize", img, options: { ...VECTORIZE_DEFAULTS, widthMm: 100 }, ctx });
    if (r.kind !== "vector") throw new Error("expected a vector result");
    expect(r.vector.subpaths.length).toBe(2);
    const islands = r.vector.issues.find((i) => i.code === "islands");
    expect(islands?.fixes[0].settings.connect).toBe("islands");
    expect(r.vector.lengthMm).toBeGreaterThan(0);
  });

  it("Fix all joins the pieces and fits the bed", () => {
    const img = squares(200, 100, [[10, 10, 60, 60], [120, 20, 170, 70]]);
    const r = runImaging({ op: "vectorize", img, options: { ...VECTORIZE_DEFAULTS, widthMm: 900 }, ctx, fixAll: true });
    if (r.kind !== "vector") throw new Error("expected a vector result");
    expect(r.vector.settings.connect).toBe("islands");
    expect(r.vector.settings.widthMm).toBeLessThanOrEqual(490);
    expect(r.vector.issues.filter((i) => i.level !== "info")).toEqual([]);
    expect(r.vector.applied.length).toBeGreaterThanOrEqual(2);
  });

  it("engrave returns a black-and-white picture at the material resolution", () => {
    const r = runImaging({ op: "engrave", img: imgFromGrey(new Array(64 * 32).fill(128), 64, 32), options: { material: "wood", widthMm: 25.4 } });
    if (r.kind !== "engrave") throw new Error("expected an engraving");
    expect(r.dpi).toBe(254);
    expect(r.img.width).toBe(254);
    const values = new Set<number>();
    for (let i = 0; i < r.img.data.length; i += 4) values.add(r.img.data[i]);
    expect([...values].every((v) => v === 0 || v === 255)).toBe(true);
  });

  it("depth layers become stacked sheet outlines", () => {
    const w = 60, h = 40, data = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = Math.max(0, 1 - Math.hypot(x - 30, y - 20) / 20);
    const r = runImaging({ op: "layers", depth: { w, h, data }, options: { levels: 3, floor: 0.1, speckles: 0 }, vector: { widthMm: 120 } });
    if (r.kind !== "layers") throw new Error("expected layers");
    expect(r.sheets.length).toBe(3);
    expect(r.widthMm).toBe(120);
    const area = (k: number) => r.sheets[k].length;
    expect(area(0)).toBeGreaterThan(0);
  });
});
