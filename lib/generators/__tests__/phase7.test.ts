import { readFileSync } from "node:fs";
import { join } from "node:path";
import { zlibSync } from "fflate";
import * as hb from "harfbuzzjs";
import { describe, expect, it } from "vitest";
import { fontUploads, MAX_REQUEST_FONTS, serverBuildContext } from "@/lib/billing/exportGenerator";
import { loadFont } from "@/lib/letters/fonts";
import { unionShapes } from "@/lib/letters/polygon";
import { fontSignature, woffToSfnt } from "@/lib/letters/woff";
import { bboxOf } from "../geom";
import { SHADOWBOX } from "../shadowbox";
import { buildShadowBox, textLayer } from "../shadowbox/build";
import { mergeShadowBox, type ShadowBoxParams } from "../shadowbox/params";
import { SIGN } from "../sign";
import { mergeSign } from "../sign/params";
import { makeTextFn } from "../text";
import { cleanTextForm, stencilContours, TEXT_FORM } from "../textStyle";
import type { Contour, GenPart } from "../types";
import { textBlock } from "../weld";
import { CTX } from "./ctx";

const TTF = readFileSync(join(__dirname, "../../../public/fonts/ArchivoBlack-Regular.ttf"));
const ttfBuffer = () => TTF.buffer.slice(TTF.byteOffset, TTF.byteOffset + TTF.byteLength) as ArrayBuffer;

/** A WOFF 1.0 file of a TrueType font: each table zlib-compressed on its own. */
function toWoff(sfnt: ArrayBuffer): ArrayBuffer {
  const v = new DataView(sfnt), n = v.getUint16(4);
  const tables = Array.from({ length: n }, (_, i) => {
    const d = 12 + i * 16, off = v.getUint32(d + 8), len = v.getUint32(d + 12);
    const raw = new Uint8Array(sfnt, off, len), z = zlibSync(raw);
    return { tag: v.getUint32(d), sum: v.getUint32(d + 4), orig: len, data: z.length < len ? z : raw };
  });
  const pad = (k: number) => (k + 3) & ~3;
  const size = tables.reduce((s, t) => s + pad(t.data.length), 44 + 20 * n);
  const out = new Uint8Array(size), w = new DataView(out.buffer);
  w.setUint32(0, 0x774f4646);
  w.setUint32(4, v.getUint32(0));
  w.setUint32(8, size);
  w.setUint16(12, n);
  let at = 44 + 20 * n;
  tables.forEach((t, i) => {
    const d = 44 + i * 20;
    w.setUint32(d, t.tag);
    w.setUint32(d + 4, at);
    w.setUint32(d + 8, t.data.length);
    w.setUint32(d + 12, t.orig);
    w.setUint32(d + 16, t.sum);
    out.set(t.data, at);
    at += pad(t.data.length);
  });
  return out.buffer;
}

const holes = (cs: Contour[]) => unionShapes(cs).reduce((a, s) => a + s.holes.length, 0);
const areaOf = (cs: Contour[]) => unionShapes(cs).reduce((a, s) => a + s.area, 0);

describe("uploaded fonts", () => {
  it("unpacks a WOFF font to the same font", () => {
    const woff = toWoff(ttfBuffer());
    expect(fontSignature(woff)).toBe("woff");
    expect(fontSignature(ttfBuffer())).toBe("sfnt");
    const font = loadFont(hb, "upload:woff", "Archivo Black", woffToSfnt(woff));
    const ctx = { text: makeTextFn(hb, (id) => (id === "upload:woff" ? font : null)) };
    const a = textBlock(ctx, "HOME 42", "upload:woff", 20, {}), b = textBlock(CTX, "HOME 42", "archivo-black", 20, {});
    expect(a.contours.length).toBe(b.contours.length);
    expect(a.width).toBeCloseTo(b.width, 6);
    expect(a.height).toBeCloseTo(b.height, 6);
  });

  it("refuses WOFF2 and damaged files with a readable message", () => {
    const woff2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0]).buffer;
    expect(() => woffToSfnt(woff2)).toThrow(/WOFF2/);
    const broken = new Uint8Array(toWoff(ttfBuffer()).slice(0, 200));
    expect(() => woffToSfnt(broken.buffer)).toThrow(/damaged/);
    expect(() => loadFont(hb, "x", "x", woff2)).toThrow(/unpacked first/);
  });

  it("a request carries at most two well-formed fonts", () => {
    const f = { id: "upload:a", name: "A", data: "AAAA" };
    expect(fontUploads("nope")).toEqual([]);
    expect(fontUploads([f, { id: 3, data: "x" }, null, { ...f, id: "upload:b" }, { ...f, id: "upload:c" }])).toHaveLength(MAX_REQUEST_FONTS);
    expect(fontUploads([{ id: "upload:a", data: "AAAA" }])).toEqual([{ id: "upload:a", name: "", data: "AAAA" }]);
  });

  it("the server builds with an uploaded font from the request, and refuses one that is not a font", async () => {
    const p = mergeSign({ text: { text: "Hi", fontId: "upload:abc" } });
    const data = TTF.toString("base64");
    const ctx = await serverBuildContext(SIGN, p, [{ id: "upload:abc", name: "Mine", data }]);
    expect(ctx && !("error" in ctx) && ctx.text).toBeTruthy();
    expect(await serverBuildContext(SIGN, p, [])).toBeNull();
    const bad = await serverBuildContext(SIGN, p, [{ id: "upload:abc", name: "Mine", data: Buffer.from("not a font at all").toString("base64") }]);
    expect(bad && "error" in bad).toBe(true);
  });
});

describe("text form", () => {
  it("cleans saved values and changes nothing by default", () => {
    expect(cleanTextForm(undefined)).toEqual(TEXT_FORM);
    expect(cleanTextForm({ circle: 5000, stencil: -2 })).toEqual({ circle: 2000, stencil: 0 });
    expect(cleanTextForm({ circle: "x", stencil: 1.5 })).toEqual({ circle: 0, stencil: 1.5 });
    expect(mergeSign({}).textForm).toEqual(TEXT_FORM);
    const a = textBlock(CTX, "Welcome", "pacifico", 30, {});
    expect(textBlock(CTX, "Welcome", "pacifico", 30, { style: { ...TEXT_FORM } })).toEqual(a);
  });

  it("stencil bridges open the closed middles of letters and keep most of the letters", () => {
    const o = textBlock(CTX, "OAB", "archivo-black", 30, {});
    expect(holes(o.contours)).toBeGreaterThanOrEqual(3);
    const s = stencilContours(o.contours, 1.5);
    expect(holes(s)).toBe(0);
    expect(areaOf(s)).toBeLessThan(areaOf(o.contours));
    expect(areaOf(s)).toBeGreaterThan(areaOf(o.contours) * 0.85);
    const styled = textBlock(CTX, "OAB", "archivo-black", 30, { style: { stencil: 1.5 } });
    expect(holes(styled.contours)).toBe(0);
    // Letters without middles are left alone.
    const l = textBlock(CTX, "LIT", "archivo-black", 30, {});
    expect(stencilContours(l.contours, 1.5)).toBe(l.contours);
  });

  it("round a circle sets the baseline on a circle of that diameter, widening it for long text", () => {
    const text = "HAPPY BIRTHDAY";
    const flat = textBlock(CTX, text, "archivo-black", 20, {});
    const H = flat.height;
    expect(flat.width).toBeLessThan(0.97 * Math.PI * 120);
    const ring = textBlock(CTX, text, "archivo-black", 20, { style: { circle: 120 } });
    const b = bboxOf(ring.contours);
    expect(b.x1 - b.x0).toBeGreaterThan(120 * 0.95);
    expect(b.x1 - b.x0).toBeLessThan(120 + 2 * H + 1);
    expect(b.y1 - b.y0).toBeGreaterThan(120 * 0.7);
    // A circle too small for the text grows to 97 % of the way round instead of overlapping.
    const tight = bboxOf(textBlock(CTX, text, "archivo-black", 20, { style: { circle: 10 } }).contours);
    const R = flat.width / (0.97 * 2 * Math.PI);
    expect(tight.x1 - tight.x0).toBeGreaterThan(2 * R * 0.95);
    expect(tight.x1 - tight.x0).toBeLessThan(2 * (R + H) + 1);
  });
});

describe("Shadow Box words and word shapes", () => {
  const sb = (raw: Record<string, unknown>) => mergeShadowBox({ frame: { width: 160, height: 160 }, stack: { count: 6 }, ...raw });
  const layer = (parts: GenPart[], k: number) => parts.find((q) => q.id === `layer${k}`)!;
  const geo = (q: GenPart) => JSON.stringify([q.outer, q.holes]);

  it("puts the words on the layer chosen, counting from the back", () => {
    const plain = buildShadowBox(sb({}), CTX).parts;
    const front = buildShadowBox(sb({ text: { text: "Love" } }), CTX).parts;
    const third = buildShadowBox(sb({ text: { text: "Love", layer: 3 } }), CTX).parts;
    expect(geo(layer(front, 6))).not.toBe(geo(layer(plain, 6)));
    expect(geo(layer(third, 6))).toBe(geo(layer(plain, 6)));
    expect(geo(layer(third, 3))).not.toBe(geo(layer(plain, 3)));
    const out = buildShadowBox(sb({ text: { text: "Love", layer: 3 } }), CTX);
    expect(out.assembly!.join(" ")).toContain("across Layer 3");
  });

  it("cut words need a pattern layer; engraved ones may sit on the back board", () => {
    const p = sb({ text: { text: "Hi", layer: 1 } });
    expect(textLayer(p, 6, true, false)).toBe(1);
    expect(textLayer(p, 6, true, true)).toBe(0);
    expect(textLayer(p, 6, false, false)).toBe(0);
    expect(textLayer({ ...p, text: { ...p.text, layer: 0 } } as ShadowBoxParams, 6, true, false)).toBe(5);
    expect(mergeShadowBox({ stack: { count: 4 }, text: { layer: 9 } }).text.layer).toBe(4);
  });

  it("engraves the words on the layer's paper with a laser, cutting nothing", () => {
    const laser = { cutter: { kind: "laser" } };
    const plain = buildShadowBox(sb(laser), CTX).parts;
    const out = buildShadowBox(sb({ ...laser, text: { text: "Love", engrave: true } }), CTX);
    const f = layer(out.parts, 6);
    expect(geo(f)).toBe(geo(layer(plain, 6)));
    expect(f.engrave?.length).toBeGreaterThan(0);
    expect(out.assembly!.join(" ")).toContain("engraved on the front layer");
    // A blade cutter cannot engrave: the words are cut on their bar.
    const blade = buildShadowBox(sb({ text: { text: "Love", engrave: true } }), CTX).parts;
    expect(layer(blade, 6).engrave).toBeUndefined();
  });

  it("uses a word as the picture shape, in its own font", () => {
    const pic = { design: { pattern: "picture" }, picture: { mode: "scale" } };
    const sample = buildShadowBox(sb(pic), CTX);
    const word = sb({ ...pic, picture: { mode: "scale", word: "AB", wordFont: "anton" } });
    const out = buildShadowBox(word, CTX);
    expect(out.error).toBeUndefined();
    expect(geo(layer(out.parts, 4))).not.toBe(geo(layer(sample.parts, 4)));
    expect(SHADOWBOX.fonts!(word)).toEqual(["anton"]);
    expect(buildShadowBox(word).notice).toBe("Loading the font.");
    expect(mergeShadowBox({ picture: { word: "ABCDEFGHIJKLMNOP" } }).picture.word).toHaveLength(12);
  });
});
