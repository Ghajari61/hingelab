import { describe, expect, it } from "vitest";
import { Resvg } from "@resvg/resvg-js";
import { MockLanguageModelV4 } from "ai/test";
import { designWithAI } from "../design";
import { decodePhoto, inkBitmap, isFlatArt, isTwoTone, padFromPicture, padShapes } from "../padTrace";
import { reviseOf } from "../types";
import { parsePathData } from "@/lib/studio/svgImport";
import type { Subpath } from "@/lib/studio/types";

const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 20, text: 20, reasoning: undefined } };

function mock(...answers: unknown[]) {
  const calls: { prompt: unknown }[] = [];
  let i = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async (opts) => {
      calls.push({ prompt: opts.prompt });
      const a = answers[Math.min(i++, answers.length - 1)];
      return { content: [{ type: "text", text: JSON.stringify(a) }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] } as never;
    },
  });
  return { model, calls };
}

/** A picture drawn from SVG markup, as a PNG data URL. */
const picture = (body: string, w = 300, h = 200, bg = "#ffffff") =>
  "data:image/png;base64," + Buffer.from(new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${bg}"/>${body}</svg>`, { font: { loadSystemFonts: false } }).render().asPng()).toString("base64");

const TWO_DOTS = picture(`<circle cx="70" cy="100" r="40"/><circle cx="230" cy="100" r="40"/>`);
const square = (x: number, y: number, s: number): Subpath => ({ closed: true, nodes: [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }] });
const box = (d: string) => {
  const pts = parsePathData(d).flatMap((s) => s.nodes);
  return { x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) };
};

describe("black-and-white pictures", () => {
  it("reads a picture at its own proportions", () => {
    const r = decodePhoto(TWO_DOTS)!;
    expect([r.width, r.height]).toEqual([300, 200]);
    expect(decodePhoto("data:text/plain;base64,AAAA")).toBeNull();
  });

  it("tells artwork from photos", () => {
    expect(isTwoTone(decodePhoto(TWO_DOTS)!)).toBe(true);
    const grey = picture(`<defs><linearGradient id="g"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect width="300" height="200" fill="url(#g)"/>`);
    expect(isTwoTone(decodePhoto(grey)!)).toBe(false);
    expect(isTwoTone(decodePhoto(picture(`<circle cx="150" cy="100" r="80" fill="#e03020"/>`))!)).toBe(false);
    expect(isTwoTone(decodePhoto(picture(""))!)).toBe(false);
  });

  it("traces the light figure on a dark ground", () => {
    const r = decodePhoto(picture(`<circle cx="150" cy="100" r="50" fill="#fff"/>`, 300, 200, "#000"))!;
    expect(isTwoTone(r)).toBe(true);
    const b = inkBitmap(r);
    const ink = b.bits.reduce((n, v) => n + v, 0) / b.bits.length;
    expect(ink).toBeGreaterThan(0.1);
    expect(ink).toBeLessThan(0.2);
  });

  it("traces straight edges of a noisy picture as straight lines", async () => {
    const r = decodePhoto(picture(`<polygon points="60,40 250,70 220,170 40,140"/>`))!;
    let seed = 7;
    const d = r.data as Uint8Array;
    for (let i = 0; i < d.length; i += 4) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const v = Math.max(0, Math.min(255, d[i] + ((seed % 61) - 30)));
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    const { built } = await padFromPicture(r, [{ type: "text", text: "a plate" }], async () => { throw new Error("offline"); });
    const nodes = built.art.shapes.filter((s) => s.layer === "engrave").flatMap((s) => parsePathData(s.d)).flatMap((s) => s.nodes);
    expect(nodes.length).toBeGreaterThanOrEqual(4);
    expect(nodes.length).toBeLessThanOrEqual(20);
  });
});

describe("the pad", () => {
  it("puts one cut outline round separate pieces, the pad wide, at the asked size", () => {
    const p = padShapes([square(0, 0, 10), square(30, 0, 10)], { size: 100, pad: 5, hole: false })!;
    expect(p.cut).toHaveLength(1);
    expect(parsePathData(p.cut[0])).toHaveLength(1);
    expect(Math.max(p.width, p.height)).toBeCloseTo(100, 0);
    const c = box(p.cut[0]), e = box(p.engrave);
    expect(e.x0 - c.x0).toBeCloseTo(5, 1);
    expect(c.y1 - e.y1).toBeCloseTo(5, 1);
    expect(parsePathData(p.engrave)).toHaveLength(2);
  });

  it("adds a hanging hole above the artwork, inside the piece", () => {
    const p = padShapes([square(0, 0, 40)], { size: 60, pad: 4, hole: true })!;
    expect(p.cut).toHaveLength(2);
    const outline = box(p.cut[0]), hole = box(p.cut[1]), art = box(p.engrave);
    expect(hole.x1 - hole.x0).toBeCloseTo(4.5, 1);
    expect(hole.y1).toBeLessThan(art.y0);
    expect(hole.y0).toBeGreaterThan(outline.y0 + 2);
    expect(Math.max(p.width, p.height)).toBeCloseTo(60, 0);
  });
});

describe("the AI designer with a black-and-white picture", () => {
  const answer = { name: "Paw keychain", summary: "", size: 50, pad: 3, hole: true, material: "3 mm birch plywood", thickness: 3, notes: [] };

  it("traces it with a pad instead of redrawing it", async () => {
    const { model, calls } = mock(answer);
    const d = await designWithAI({ prompt: "keychain", image: TWO_DOTS }, "pro", "user-1", model);
    expect(calls).toHaveLength(1);
    expect(d.product).toBe("art");
    expect(d.name).toBe("Paw keychain");
    expect(d.params.pad).toEqual({ size: 50, pad: 3, hole: true });
    expect(d.svg).toContain('id="cut"');
    expect(d.svg).toContain('id="engrave"');
    expect(Math.max(d.width!, d.height!)).toBeCloseTo(50, 0);
    expect(d.notes.join(" ")).toContain("traced as it is");
  });

  it("changes the size and the pad of a traced piece without redrawing it", async () => {
    const first = await designWithAI({ prompt: "keychain", image: TWO_DOTS }, "pro", "user-1", mock(answer).model);
    const { model, calls } = mock({ ...answer, size: 80, pad: 6, other: "" });
    const d = await designWithAI({ prompt: "make it 8 cm with a 6 mm border", revise: reviseOf(first) }, "pro", "user-1", model);
    expect(calls).toHaveLength(1);
    expect(d.params.pad).toEqual({ size: 80, pad: 6, hole: true });
    expect(Math.max(d.width!, d.height!)).toBeCloseTo(80, 0);
    const other = await designWithAI({ prompt: "add my name", revise: reviseOf(first) }, "pro", "user-1", mock({ ...answer, other: "add a name" }).model);
    expect(other.notes.join(" ")).toContain("open it in Studio");
  });

  it("traces a coloured drawing instead of redrawing it", async () => {
    const img = picture(`<path d="M30 120 C90 20 160 180 250 70" stroke="#20c4c8" stroke-width="26" fill="none" stroke-linecap="round"/><circle cx="250" cy="50" r="10" fill="#20c4c8"/>`);
    const r = decodePhoto(img)!;
    expect(isTwoTone(r)).toBe(false);
    expect(isFlatArt(r)).toBe(true);
    const ink = inkBitmap(r);
    const share = ink.bits.reduce((n, v) => n + v, 0) / ink.bits.length;
    expect(share).toBeGreaterThan(0.04);
    expect(share).toBeLessThan(0.35);
    const { model, calls } = mock(answer);
    const d = await designWithAI({ prompt: "vectorize", image: img }, "pro", "user-1", model);
    expect(calls).toHaveLength(1);
    expect(d.notes.join(" ")).toContain("traced as it is");
    expect(d.svg).toContain('id="engrave"');
  });

  it("leaves a many-coloured photo to the designer", async () => {
    const photo = picture(`<rect width="80" height="200" fill="#111"/><circle cx="140" cy="70" r="60" fill="#2a6"/><circle cx="210" cy="120" r="70" fill="#36c"/><circle cx="120" cy="150" r="50" fill="#e0c020"/>`, 300, 200, "#c45a3a");
    expect(isFlatArt(decodePhoto(photo)!)).toBe(false);
    const { model, calls } = mock({ product: "parametric", preset: "slat-portrait", name: "Face", match: "exact", flat: false, brief: "Face" });
    const d = await designWithAI({ prompt: "", image: photo }, "pro", "user-1", model);
    expect(d.product).toBe("parametric");
    expect(calls).toHaveLength(1);
  });
});
