import { describe, expect, it } from "vitest";
import { strFromU8 } from "fflate";
import { layeredSVG, mergeParams } from "@/lib/hinge";
import { arrangeGenerator, genSVG } from "@/lib/generators/output";
import { CTX } from "@/lib/generators/__tests__/ctx";
import { ALL_GENERATORS } from "@/lib/generators/all";
import { makeExport } from "../bundle";
import { defaultExport, type ExportSettings } from "../profiles";
import { readScene, type Poly, type Scene } from "../scene";
import { isCutLayer, mergeSharedCuts } from "../watertight";

const PT = 72 / 25.4;
const set = (over: Partial<ExportSettings> = {}): ExportSettings => ({ ...defaultExport("co2-50"), format: "svg", ...over });
const layers = mergeParams({}).layers;
const doc = (w: number, h: number, outline: string[], slots: string[] = [], labels = false) =>
  layeredSVG(w, h, "test", { outline, slots, hinge: [], labels: labels ? [{ x: 10, y: 10, text: "A", size: 3 }] : [], fills: [] }, layers, labels);
const sq = (x: number, y: number, w: number, h = w) => `M${x} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x} ${y + h} Z`;

const cutLength = (sc: Scene) => sc.layers.filter(isCutLayer).reduce((s, l) => s + l.items.reduce((t, it) => t + it.polys.reduce((u, p) => u + polyLength(p), 0), 0), 0);
function polyLength(p: Poly) {
  let L = 0;
  for (let i = 0; i + 1 < p.pts.length; i++) L += Math.hypot(p.pts[i + 1][0] - p.pts[i][0], p.pts[i + 1][1] - p.pts[i][1]);
  if (p.closed && p.pts.length > 2) L += Math.hypot(p.pts[0][0] - p.pts[p.pts.length - 1][0], p.pts[0][1] - p.pts[p.pts.length - 1][1]);
  return L;
}

describe("shared cut lines", () => {
  it("cuts the edge two touching parts share once", () => {
    const sc = readScene(doc(100, 50, [sq(0, 0, 50), sq(50, 0, 50)]));
    const m = mergeSharedCuts(sc);
    expect(m.removed).toBeCloseTo(50, 6);
    expect(cutLength(m.scene)).toBeCloseTo(350, 6);
    // Nothing is left to merge, and the first part is still a closed outline.
    expect(mergeSharedCuts(m.scene).removed).toBe(0);
    const outline = m.scene.layers.find((l) => /Outline/.test(l.label))!;
    expect(outline.items[0].polys[0].closed).toBe(true);
  });

  it("drops a path drawn twice, and only the shared part of an edge", () => {
    const twice = mergeSharedCuts(readScene(doc(60, 60, [sq(5, 5, 40), sq(5, 5, 40)])));
    expect(twice.removed).toBeCloseTo(160, 6);
    expect(twice.scene.layers.find((l) => /Outline/.test(l.label))!.items).toHaveLength(1);
    const part = mergeSharedCuts(readScene(doc(100, 60, [sq(0, 0, 50), sq(50, 10, 30, 20)])));
    expect(part.removed).toBeCloseTo(20, 6);
  });

  it("merges a slot that lies on an outline, within 0.01 mm, and leaves engraving alone", () => {
    const r = mergeSharedCuts(readScene(doc(60, 60, [sq(0, 0, 50)], ["M0.004 10 L0.004 20 L5 20 L5 10 Z"], true)));
    expect(r.removed).toBeCloseTo(10, 2);
    const near = mergeSharedCuts(readScene(doc(60, 60, [sq(0, 0, 50)], ["M0.05 10 L0.05 20 L5 20 L5 10 Z"])));
    expect(near.removed).toBe(0);
  });

  it("export: touching boxes give one cut per line in every format, and say so", () => {
    const svg = doc(100, 50, [sq(0, 0, 50), sq(50, 0, 50)]);
    const r = makeExport(svg, null, set(), "pair");
    expect(r.notes.join(" ")).toMatch(/50 mm of cut line .* cut once/);
    expect(mergeSharedCuts(readScene(String(r.file.data))).removed).toBe(0);
    expect(cutLength(readScene(String(r.file.data)))).toBeCloseTo(350, 3);
    expect(makeExport(svg, null, set({ merge: false }), "pair").file.data).toBe(svg);
    const lb = String(makeExport(svg, null, set({ format: "lbrn2" }), "pair").file.data);
    expect((lb.match(/<Shape /g) ?? []).length).toBe(2);
  });

  it("a generator packed with no gap exports without doubled lines", () => {
    const def = ALL_GENERATORS.find((d) => d.id === "boxes")!;
    const p = { ...def.merge({}), gap: 0 };
    const a = arrangeGenerator(def, p, CTX);
    const svg = genSVG(def, p, a.lay!);
    const out = String(makeExport(svg, a.sheets, set(), "box").file.data);
    expect(mergeSharedCuts(readScene(out)).removed).toBe(0);
  });
});

describe("units and scale", () => {
  const svg = doc(100, 100, [sq(0, 0, 100)]);

  it("SVG: 100 mm wide and tall, one user unit per mm", () => {
    expect(svg).toMatch(/width="100mm" height="100mm" viewBox="0 0 100 100"/);
    const out = String(makeExport(svg, null, set({ mirror: true }), "sq").file.data);
    expect(out).toMatch(/width="100mm" height="100mm" viewBox="0 0 100 100"/);
  });

  it("DXF: millimetres ($INSUNITS 4) with a 100 mm square, or inches when asked", () => {
    const span = (dxf: string) => {
      const xs: number[] = [], ys: number[] = [];
      const ln = dxf.split("\n");
      let inVertex = false;
      for (let i = 0; i + 1 < ln.length; i += 2) {
        if (ln[i] === "0") inVertex = ln[i + 1] === "VERTEX";
        else if (inVertex && ln[i] === "10") xs.push(Number(ln[i + 1]));
        else if (inVertex && ln[i] === "20") ys.push(Number(ln[i + 1]));
      }
      return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
    };
    const mm = String(makeExport(svg, null, set({ format: "dxf" }), "sq").file.data);
    expect(mm).toContain("$INSUNITS\n70\n4\n");
    expect(span(mm)).toEqual([100, 100]);
    const inch = String(makeExport(svg, null, set({ format: "dxf", inches: true }), "sq").file.data);
    expect(inch).toContain("$INSUNITS\n70\n1\n");
    span(inch).forEach((v) => expect(v).toBeCloseTo(100 / 25.4, 4));
  });

  it("PDF: a 283.465 pt page (100 mm) with the square at full size", () => {
    const pdf = makeExport(svg, null, set({ format: "pdf" }), "sq").file.data as Uint8Array;
    const text = strFromU8(pdf, true);
    const [, w, h] = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(text)!;
    expect(Number(w)).toBeCloseTo(100 * PT, 2);
    expect(Number(h)).toBeCloseTo(100 * PT, 2);
    // The page content draws the square's corners 283.465 pt apart.
    const at = text.indexOf("stream\n");
    const body = text.slice(at + 7, text.indexOf("\nendstream", at));
    const nums = [...body.matchAll(/([\d.]+) ([\d.]+) [ml]\b/g)].flatMap((m) => [Number(m[1]), Number(m[2])]);
    expect(nums).toHaveLength(8);
    expect(Math.max(...nums) - Math.min(...nums)).toBeCloseTo(100 * PT, 2);
  });

  it("LightBurn: the square's vertices 100 mm apart", () => {
    const xml = String(makeExport(svg, null, set({ format: "lbrn2" }), "sq").file.data);
    const v = [...xml.matchAll(/V([-\d.]+) ([-\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const xs = v.map((p) => p[0]), ys = v.map((p) => p[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(100);
    expect(Math.max(...ys) - Math.min(...ys)).toBe(100);
  });
});
