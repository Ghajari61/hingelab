import { inflateSync, deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { bboxOf } from "../geom";
import { SHADOWBOX } from "../shadowbox";
import { windowBox, type ShadowBoxOutput } from "../shadowbox/build";
import { mergeShadowBox } from "../shadowbox/params";
import { centreOn, photoDpi, photoPlace, photoSpec, MAX_ENGRAVE_SIDE, PRINT_SIDE } from "../shadowbox/photo";
import { arrangeGenerator, genSVG } from "../output";
import type { ImageSpec } from "../types";
import { applyLook, subjectOf, toneOf } from "@/lib/imaging/photoLook";
import type { PhotoSpec } from "@/lib/imaging/photoSpec";
import { jpegInfo, photoPdf, printPage } from "@/lib/imaging/pdf";
import { base64, crc32, encodeGreyPng } from "@/lib/imaging/png";
import { CTX } from "./ctx";

const deflate = async (raw: Uint8Array) => new Uint8Array(deflateSync(raw));
const JPG = "data:image/jpeg;base64,AAAA";
const build = (raw: unknown) => SHADOWBOX.build(mergeShadowBox(raw), CTX) as ShadowBoxOutput;
const spec = (s: Partial<PhotoSpec>): PhotoSpec => ({ look: "colour", bright: 0, contrast: 0, tones: 4, dither: "floyd", bg: false, tol: 0.18, side: 100, ...s });

/** A grey ramp, black on the left to white on the right, `n` pixels square. */
function ramp(n: number) {
  const data = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = Math.round((x / (n - 1)) * 255); data.set([v, v, v, 255], (y * n + x) * 4); }
  return { width: n, height: n, data };
}

/** A dark red disc of radius r at (cx, cy) on a plain light blue background. */
function disc(w: number, h: number, cx: number, cy: number, r: number) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(Math.hypot(x - cx, y - cy) <= r ? [150, 20, 30, 255] : [200, 220, 240, 255], (y * w + x) * 4);
  return { width: w, height: h, data };
}

/** PNG chunks: type and data. */
function chunks(png: Uint8Array) {
  const v = new DataView(png.buffer, png.byteOffset), out: { type: string; data: Uint8Array; crcOk: boolean }[] = [];
  for (let i = 8; i < png.length;) {
    const len = v.getUint32(i), type = String.fromCharCode(...png.subarray(i + 4, i + 8));
    const crc = v.getUint32(i + 8 + len);
    out.push({ type, data: png.subarray(i + 8, i + 8 + len), crcOk: ((crc32(png.subarray(i + 4, i + 8 + len)) ^ 0xffffffff) >>> 0) === crc });
    i += 12 + len;
  }
  return out;
}

/** A tiny "JPEG": just the start marker and a baseline frame header. */
function fakeJpeg(w: number, h: number, comps: number) {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, comps, 1, 0x11, 0, 0, 0, 0xff, 0xd9]);
}

describe("photo PNG writer", () => {
  it("writes valid 1-bit and 8-bit grey PNGs", async () => {
    const bits = new Uint8Array(10 * 3);
    bits[0] = 1; bits[9] = 1; bits[10 + 4] = 1;
    const png = await encodeGreyPng(bits, 10, 3, 1, deflate);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const cs = chunks(png);
    expect(cs.map((c) => c.type)).toEqual(["IHDR", "IDAT", "IEND"]);
    expect(cs.every((c) => c.crcOk)).toBe(true);
    const ih = new DataView(cs[0].data.buffer, cs[0].data.byteOffset);
    expect([ih.getUint32(0), ih.getUint32(4), cs[0].data[8], cs[0].data[9]]).toEqual([10, 3, 1, 0]);
    // Each row: filter byte 0, then 2 bytes of bits (1 = white); burn pixels are 0 bits.
    const raw = inflateSync(cs[1].data);
    expect(raw.length).toBe(3 * 3);
    expect([...raw.subarray(0, 3)]).toEqual([0, 0b01111111, 0b10000000]);
    expect([...raw.subarray(3, 6)]).toEqual([0, 0b11110111, 0b11000000]);

    const grey = await encodeGreyPng([0, 128, 255, 7], 2, 2, 8, deflate);
    const g = chunks(grey);
    expect(g[0].data[8]).toBe(8);
    expect([...inflateSync(g[1].data)]).toEqual([0, 0, 128, 0, 255, 7]);
    expect(base64(new Uint8Array([104, 105]))).toBe("aGk=");
  });
});

describe("photo print PDF", () => {
  it("reads JPEG frame headers", () => {
    expect(jpegInfo(fakeJpeg(640, 480, 3))).toEqual({ width: 640, height: 480, components: 3 });
    expect(jpegInfo(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });

  it("places the photo at its real size on the paper, or on a page of its own size", () => {
    expect(printPage("a4", 150, 100)).toEqual({ pageW: 210, pageH: 297, x: 30, y: 93.5, custom: false });
    // Too wide for portrait A4: it turns the page.
    expect(printPage("a4", 250, 150)).toMatchObject({ pageW: 297, pageH: 210, custom: false });
    // A window-sized print (182 mm square) still fits A4.
    expect(printPage("a4", 182, 182)).toMatchObject({ pageW: 210, pageH: 297, x: 14, custom: false });
    expect(printPage("letter", 400, 300)).toEqual({ pageW: 424, pageH: 334, x: 12, y: 12, custom: true });
  });

  it("writes a one-page PDF with a correct cross-reference table", () => {
    const jpeg = fakeJpeg(64, 32, 1);
    const pdf = photoPdf({ pageW: 210, pageH: 297, jpeg, x: 30, y: 40, w: 150, h: 75, clip: [[0, 0], [150, 0], [150, 75], [0, 75]], caption: "Box (1): print at 100 %, cut — here" });
    const text = new TextDecoder("latin1").decode(pdf);
    expect(text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("/MediaBox [0 0 595.276 841.89]");
    expect(text).toContain("/Width 64 /Height 32 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /DCTDecode");
    // 150 × 75 mm in points, at (30, 297 − 40 − 75) mm.
    expect(text).toContain("425.197 0 0 212.598 85.039 515.906 cm");
    expect(text).toContain("W n");
    expect(text).toContain("(Box \\(1\\): print at 100 %, cut ? here) Tj");
    const start = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(start, start + 4)).toBe("xref");
    const offs = [...text.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offs).toHaveLength(6);
    offs.forEach((o, i) => expect(text.slice(o, o + 8)).toBe(`${i + 1} 0 obj\n`));
    // The JPEG goes in byte for byte.
    const at = text.indexOf("stream\n", text.indexOf("/DCTDecode")) + 7;
    expect([...pdf.subarray(at, at + jpeg.length)]).toEqual([...jpeg]);
    expect(() => photoPdf({ pageW: 210, pageH: 297, jpeg: new Uint8Array(8), x: 0, y: 0, w: 1, h: 1 })).toThrow();
  });
});

describe("photo looks", () => {
  it("brightness and contrast pivot round mid-grey", () => {
    const flat = toneOf(0, 0);
    expect(flat.every((v, i) => v === i)).toBe(true);
    const more = toneOf(0, 100);
    expect([more[0], more[128], more[255]]).toEqual([0, 128, 255]);
    expect(more[64]).toBe(0);
    expect(toneOf(50, 0)[100]).toBe(164);
    expect(toneOf(0, -100).every((v) => v === 128)).toBe(true);
  });

  it("makes grey, a few flat tones, or dots with the photo's ink", () => {
    const grey = applyLook(ramp(64), spec({ look: "grey" }));
    expect(grey.kind).toBe("grey");
    const poster = applyLook(ramp(64), spec({ look: "poster", tones: 3 }));
    if (poster.kind !== "grey") throw new Error();
    expect(new Set(poster.grey)).toEqual(new Set([0, 128, 255]));
    const dots = applyLook(ramp(64), spec({ look: "engrave", dither: "floyd" }));
    if (dots.kind !== "bits") throw new Error();
    const ink = dots.bitmap.bits.reduce((a, b) => a + b, 0) / dots.bitmap.bits.length;
    expect(ink).toBeGreaterThan(0.42);
    expect(ink).toBeLessThan(0.58);
    // Darker on the left (more burn) than the right.
    const col = (x: number) => { let n = 0; for (let y = 0; y < 64; y++) n += dots.bitmap.bits[y * 64 + x]; return n; };
    expect(col(2)).toBeGreaterThan(col(61));
    const colour = applyLook(disc(40, 40, 20, 20, 10), spec({}));
    expect(colour.kind).toBe("rgba");
  });

  it("removes a plain background and finds the subject", () => {
    const img = disc(100, 80, 30, 50, 15);
    const out = applyLook(img, spec({ bg: true, tol: 0.18 }));
    if (out.kind !== "rgba") throw new Error();
    expect([...out.img.data.subarray(0, 4)]).toEqual([255, 255, 255, 255]);
    const c = (50 * 100 + 30) * 4;
    expect([...out.img.data.subarray(c, c + 3)]).toEqual([150, 20, 30]);
    const s = subjectOf(disc(100, 80, 30, 50, 15), 0.18)!;
    expect(s.u).toBeCloseTo(30.5 / 100, 2);
    expect(s.v).toBeCloseTo(50.5 / 80, 2);
    expect(s.h).toBeCloseTo(31 / 80, 2);
    expect(s.face).toBe(false);
    // A noisy photo has no clear subject.
    let seed = 7;
    const noise = { width: 60, height: 60, data: new Uint8ClampedArray(60 * 60 * 4).map((_, i) => (i % 4 === 3 ? 255 : (seed = (seed * 1103515245 + 12345) % 2147483648) % 256)) };
    expect(subjectOf(noise, 0.05)).toBeNull();
  });
});

describe("shadow box photo", () => {
  const raw = { stack: { count: 6, back: false }, frame: { width: 200, height: 160, border: 12 }, photo: { image: JPG, aspect: 1.5 } };

  it("sizes the stored photo for the look and reports its dpi", () => {
    const p = mergeShadowBox(raw), w = windowBox(p)!;
    expect(photoSpec(p, w).side).toBe(PRINT_SIDE);
    const at = photoPlace(p, w);
    const eng = mergeShadowBox({ ...raw, photo: { ...raw.photo, look: "engrave", dpi: "254" } });
    expect(photoSpec(eng, w).side).toBe(Math.round((Math.max(at.iw, at.ih) / 25.4) * 254));
    const big = mergeShadowBox({ ...raw, photo: { ...raw.photo, look: "engrave", dpi: "318", zoom: 300 } });
    expect(photoSpec(big, w).side).toBe(MAX_ENGRAVE_SIDE);
    const px = mergeShadowBox({ ...raw, photo: { ...raw.photo, px: 1600 } });
    expect(photoDpi(px, w)).toBeCloseTo((1600 / at.iw) * 25.4, 6);
    const out = build({ ...raw, photo: { ...raw.photo, px: 1600 } });
    expect(out.info!.photoDpi).toBe(Math.round((1600 / at.iw) * 25.4));
    expect(out.stats.find((s) => s.label === "Photo print")?.value).toMatch(/^\d+ dpi$/);
    // A small stored photo on the board gets a note about the sharp print.
    const soft = mergeShadowBox({ ...raw, photo: { ...raw.photo, px: 400 } });
    expect(SHADOWBOX.check(soft, SHADOWBOX.build(soft, CTX)).map((i) => i.code)).toContain("PHOTO_SOFT");
  });

  it("centres a subject or a face in the window", () => {
    const p = mergeShadowBox(raw), w = windowBox(p)!;
    const sub = centreOn(p, w, { u: 0.25, v: 0.5, h: 0.4, face: false });
    const at = photoPlace(sub, w), bh = at.bh;
    expect(at.x + 0.25 * at.iw).toBeCloseTo(w.cx, 0);
    expect(at.y + 0.5 * at.ih).toBeCloseTo(w.cy, 0);
    expect((0.4 * at.ih) / bh).toBeCloseTo(0.75, 1);
    const face = centreOn(p, w, { u: 0.6, v: 0.3, h: 0.1, face: true });
    const f = photoPlace(face, w);
    expect(face.photo.zoom).toBeGreaterThan(100);
    expect(f.x + 0.6 * f.iw).toBeCloseTo(w.cx, 0);
    expect(f.y + 0.3 * f.ih).toBeCloseTo(w.cy - 0.06 * f.bh, 0);
    // Limits: never past the photo's edge and zoom 100–300 %.
    const edge = centreOn(p, w, { u: 0.01, v: 0.99, h: 0.01, face: true });
    expect(edge.photo).toMatchObject({ zoom: 300, x: 100, y: -100 });
  });

  it("a slotted photo gets a holder and stays out of the cut file", () => {
    const board = build(raw);
    const slot = build({ ...raw, photo: { ...raw.photo, mount: "slot" } });
    const holder = slot.parts.find((p) => p.id === "holder")!;
    expect(holder.name).toBe("Photo holder");
    expect(holder.place!.z).toBe(slot.parts[0].place!.z + mergeShadowBox(raw).T);
    expect(slot.parts.filter((p) => p.id.startsWith("layer"))).toHaveLength(6);
    expect(slot.info!.depth).toBeCloseTo(board.info!.depth + mergeShadowBox(raw).T, 6);
    const im = slot.parts[0].images![0];
    expect(im.only3d).toBe(true);
    // The print is the window plus its bleed; the holder's channel is open at the top.
    const c = bboxOf([im.clip!]), hb = bboxOf([holder.outer]);
    expect(c.x1 - c.x0).toBeCloseTo(176 + 6, 6);
    expect(holder.outer.some(([, y]) => y <= hb.y0 + 0.01)).toBe(true);
    const p = mergeShadowBox({ ...raw, photo: { ...raw.photo, mount: "slot" } });
    const svg = genSVG(SHADOWBOX, p, arrangeGenerator(SHADOWBOX, p, CTX).lay!);
    expect(svg).not.toMatch(/<image /);
    expect(svg).toContain("Photo holder");
    expect(slot.assembly!.some((a) => /slide it into the holder/.test(a))).toBe(true);
  });

  it("keeps only valid photo settings", () => {
    expect(mergeShadowBox({ photo: { look: "neon", dither: "x", dpi: "999", mount: "wall", paper: "a3", bright: 500, contrast: -500, tones: 20, tol: 0, bg: "yes", src: "../x", name: "<b>\u0000a.jpg", px: -5 } }).photo)
      .toMatchObject({ look: "colour", dither: "floyd", dpi: "254", mount: "board", paper: "a4", bright: 100, contrast: -100, tones: 8, tol: 2, bg: false, src: "", px: 0 });
    expect(mergeShadowBox({ photo: { look: "engrave", src: "p1a2-b3", name: "cat.jpg", px: 1200 } }).photo).toMatchObject({ look: "engrave", src: "p1a2-b3", name: "cat.jpg", px: 1200 });
    expect(mergeShadowBox({ photo: { image: "data:image/png;base64," + "A".repeat(1_300_000) } }).photo.image).toBe("");
    expect(mergeShadowBox({ photo: { image: "data:image/png;base64,AAAA" } }).photo.image).toBe("data:image/png;base64,AAAA");
  });

  it("re-makes the photo when a look setting changes", () => {
    const f = SHADOWBOX.sections.flatMap((s) => s.fields).find((x) => x.key === "photo.image") as ImageSpec<ReturnType<typeof mergeShadowBox>>;
    expect(f.look!.keys).toEqual(expect.arrayContaining(["photo.look", "photo.bright", "photo.contrast", "photo.tones", "photo.dither", "photo.dpi", "photo.bg", "photo.tol"]));
    const p = mergeShadowBox({ ...raw, photo: { ...raw.photo, look: "poster", tones: 5, bg: true, tol: 30 } });
    expect(f.look!.spec(p)).toMatchObject({ look: "poster", tones: 5, bg: true, tol: 0.3, side: PRINT_SIDE });
    expect(f.look!.paper!(p)).toBe("a4");
    const centred = f.look!.centre!(p, { u: 0.5, v: 0.5, h: 0.5, face: false });
    expect(centred.photo.zoom).toBeGreaterThanOrEqual(100);
  });
});
