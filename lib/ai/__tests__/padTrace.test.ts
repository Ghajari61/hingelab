import { describe, expect, it } from "vitest";
import { Resvg } from "@resvg/resvg-js";
import { MockLanguageModelV4 } from "ai/test";
import { designWithAI } from "../design";
import { decodePhoto, inkBitmap, isTwoTone, padShapes } from "../padTrace";
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

  it("leaves colour photos to the designer as before", async () => {
    const { model, calls } = mock({ product: "parametric", preset: "slat-portrait", name: "Face", match: "exact", flat: false, brief: "Face" });
    const d = await designWithAI({ prompt: "", image: picture(`<circle cx="150" cy="100" r="80" fill="#e03020"/>`) }, "pro", "user-1", model);
    expect(d.product).toBe("parametric");
    expect(calls).toHaveLength(1);
  });
});
