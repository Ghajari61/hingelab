import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { bboxOfContours, makeShape, pointInShape, signedArea } from "@/lib/letters/polygon";
import { BOARD_ID } from "../backboard";
import { mergeParametricParams, tabDepthOf } from "../defaults";
import { computeParametric, loadSource } from "../engine";
import { assemblyGuideSVG, exportZip, sheetSVG } from "../export";
import { kerfPart, rect, tabCenters } from "../joints";
import { bridgeIslands } from "../methods/parallel";
import { nestParts, toSheet } from "../nest";
import { compileFormula } from "../source/formula";
import type { Contour, ParametricParams, Part, Point, SliceResult } from "../types";
import { manifold } from "./helpers";

const apply = (m: number[], x: number, y: number, z: number) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];

async function run(p: ParametricParams): Promise<SliceResult> {
  return computeParametric(p, await loadSource(p), await manifold());
}

/** Invariant 3: every tab lands, through the placements, in exactly one board slot of nominal size, centred on it. */
function checkTabsAndSlots(p: ParametricParams, r: SliceResult) {
  const board = r.parts.find(q => q.id === BOARD_ID);
  expect(board).toBeDefined();
  const T = p.material.T, c = p.joints.slotClearance, tw = p.joints.tabWidth, depth = tabDepthOf(p);
  let tabs = 0;
  for (const part of r.parts) {
    if (!part.tabs) continue;
    for (const [x0, x1] of part.tabs) {
      expect(x1 - x0).toBeCloseTo(tw, 9);
      expect(pointInShape([(x0 + x1) / 2, -depth / 2], part.shape), `${part.id} keeps its tab at ${x0.toFixed(2)}`).toBe(true);
      const [X, Y, Z] = apply(part.placement, (x0 + x1) / 2, -depth / 2, 0);
      expect(Z).toBeCloseTo(-depth / 2, 9);
      const at: Point = [X, -Y];
      const hits = board!.innerCuts.filter(s => pointInShape(at, makeShape(signedArea(s) > 0 ? s : [...s].reverse(), [])));
      expect(hits, `${part.id} tab at ${x0.toFixed(2)}`).toHaveLength(1);
      const b = bboxOfContours(hits);
      const dims = [b.x1 - b.x0, b.y1 - b.y0].sort((a, q) => a - q);
      expect(dims[0]).toBeCloseTo(T + c, 6);
      expect(dims[1]).toBeCloseTo(tw + c, 6);
      expect((b.x0 + b.x1) / 2).toBeCloseTo(at[0], 6);
      expect((b.y0 + b.y1) / 2).toBeCloseTo(at[1], 6);
      for (const q of hits[0]) expect(pointInShape(q, board!.shape)).toBe(true);
      tabs++;
    }
  }
  expect(tabs).toBe(board!.innerCuts.length);
  expect(tabs).toBeGreaterThan(10);
}

/** Invariant 4: parts stay inside their sheet's margins and never come closer than the part gap. */
function checkNesting(p: ParametricParams, r: SliceResult) {
  const m = p.material;
  const parts = new Map(r.parts.map(q => [q.id, q]));
  const placed = r.sheets.flatMap(s => s.items.map(it => it.partId));
  expect([...placed].sort()).toEqual(r.parts.map(q => q.id).sort());
  for (const sheet of r.sheets) {
    const boxes = sheet.items.map(it => bboxOfContours(parts.get(it.partId)!.cut!.outline.map(c => c.map(q => toSheet(q, it)))));
    for (const b of boxes) {
      expect(b.x0).toBeGreaterThanOrEqual(m.sheetMargin - 1e-6);
      expect(b.y0).toBeGreaterThanOrEqual(m.sheetMargin - 1e-6);
      expect(b.x1).toBeLessThanOrEqual(sheet.width - m.sheetMargin + 1e-6);
      expect(b.y1).toBeLessThanOrEqual(sheet.height - m.sheetMargin + 1e-6);
      if (!sheet.oversize) {
        expect(sheet.width).toBe(m.sheetW);
        expect(sheet.height).toBe(m.sheetH);
      }
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const apart = Math.max(b.x0 - a.x1, a.x0 - b.x1, b.y0 - a.y1, a.y0 - b.y1);
      expect(apart, `${sheet.items[i].partId} / ${sheet.items[j].partId}`).toBeGreaterThanOrEqual(m.partGap - 1e-6);
    }
  }
}

const pathPoints = (d: string): Point[] => [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map(q => [Number(q[1]), Number(q[2])]);
const layerPaths = (svg: string, id: string) => {
  const g = svg.match(new RegExp(`<g id="${id}"[^>]*>([\\s\\S]*?)</g>`));
  return g ? [...g[1].matchAll(/<path d="([^"]+)"/g)].map(q => q[1]) : [];
};

describe("parametric P2: parallel fins complete", () => {
  it("formula heightfield: fins along Y follow z = 10·sin(x/20) within chordTolerance + 0.05", async () => {
    const p = mergeParametricParams({ source: { kind: "formula", type: "heightfield", expression: "10*sin(x/20)", domain: { x: [-100, 100], y: [-50, 50] } } as ParametricParams["source"] });
    p.parallel.axis = "Y";
    p.parallel.spacing = 12;
    const src = await loadSource(p);
    expect(src.openEdges).toBe(0);
    expect(src.lift).toBeGreaterThan(14.9);
    const r = computeParametric(p, src, await manifold());
    const fins = r.parts.filter(q => q.kind === "fin");
    expect(fins.length).toBeGreaterThanOrEqual(7);
    const tol = p.quality.chordTolerance + 0.05;
    let worst = 0, checked = 0;
    for (const part of fins) {
      expect(part.shape.bbox.x1 - part.shape.bbox.x0).toBeCloseTo(200, 1);
      for (const [u, w] of part.shape.outer) {
        // Part u runs along -X for planes stacked along Y; skip the side walls, the wall edge and the tabs.
        if (Math.abs(u) > 95 || w < 3) continue;
        worst = Math.max(worst, Math.abs(w - (10 * Math.sin(-u / 20) + src.lift!)));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(200);
    expect(worst).toBeLessThanOrEqual(tol);
  });

  it("invariant 3: every tab maps to exactly one centred slot of nominal size (plate and slats)", async () => {
    const plate = mergeParametricParams({});
    const r = await run(plate);
    checkTabsAndSlots(plate, r);
    expect(r.parts.at(-1)!.kind).toBe("backboard");
    expect(r.parts.filter(q => q.kind === "fin").every(q => q.neighbors.includes(BOARD_ID))).toBe(true);

    const slats = mergeParametricParams({});
    slats.parallel.backboard = "slats";
    const s = await run(slats);
    checkTabsAndSlots(slats, s);
    const board = s.parts.find(q => q.id === BOARD_ID)!;
    expect(board.shape.outer).toHaveLength(4);
    expect(s.parts.some(q => q.kind === "slat")).toBe(true);
    for (const q of s.parts.filter(q => q.kind !== "backboard")) expect(q.shape.bbox.y1).toBeGreaterThanOrEqual(slats.parallel.slatDepth - 1e-6);
  });

  it("tab count: Auto spreads one about every pitch, a set number is kept where it fits, with 1 mm to the ends and 2 mm between", () => {
    expect(tabCenters(11, 10)).toEqual([]);
    expect(tabCenters(23, 10)).toHaveLength(1);
    expect(tabCenters(108, 10)).toHaveLength(2);
    expect(tabCenters(200, 10)).toHaveLength(3);
    expect(tabCenters(108, 10, { pitch: 25 })).toHaveLength(4);
    expect(tabCenters(108, 10, { count: 1 })).toEqual([54]);
    expect(tabCenters(108, 10, { count: 20 })).toHaveLength(9);
    for (const [len, count] of [[108, 5], [108, 20], [30, 4], [500, 50]] as const) {
      const cs = tabCenters(len, 10, { count });
      expect(cs[0] - 5).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(len - cs.at(-1)! - 5).toBeGreaterThanOrEqual(1 - 1e-9);
      for (let i = 1; i < cs.length; i++) expect(cs[i] - cs[i - 1] - 10).toBeGreaterThanOrEqual(2 - 1e-9);
    }
  });

  it("a set number of tabs reaches every long fin, and every tab still has its slot (plate)", async () => {
    const auto = await run(mergeParametricParams({}));
    const p = mergeParametricParams({ joints: { tabCount: 6 } as ParametricParams["joints"] });
    const r = await run(p);
    checkTabsAndSlots(p, r);
    const fins = r.parts.filter(q => q.kind === "fin");
    expect(Math.max(...fins.map(q => q.tabs!.length))).toBe(6);
    expect(fins.filter(q => q.tabs!.length === 6).length).toBeGreaterThan(fins.length / 2);
    expect(r.parts.find(q => q.id === BOARD_ID)!.innerCuts.length).toBeGreaterThan(auto.parts.find(q => q.id === BOARD_ID)!.innerCuts.length);

    const dense = mergeParametricParams({ joints: { tabPitch: 25 } as ParametricParams["joints"] });
    const d = await run(dense);
    checkTabsAndSlots(dense, d);
    expect(d.parts.find(q => q.id === BOARD_ID)!.innerCuts.length).toBeGreaterThan(auto.parts.find(q => q.id === BOARD_ID)!.innerCuts.length);
  });

  it("invariant 4: nested parts fit their sheets and keep the part gap; oversize parts are reported", async () => {
    const p = mergeParametricParams({});
    const r = await run(p);
    checkNesting(p, r);
    expect(r.stats.sheetCount).toBe(r.sheets.length);
    expect(r.stats.materialUsage).toBeGreaterThan(0);
    expect(r.stats.materialUsage).toBeLessThanOrEqual(1);

    const small = mergeParametricParams({});
    small.material.sheetW = 300;
    small.material.sheetH = 200;
    const s = await run(small);
    expect(s.sheets.length).toBeGreaterThan(r.sheets.length);
    checkNesting(small, s);
    const big = s.warnings.find(w => w.code === "PART_TOO_BIG");
    expect(big?.partIds).toContain(BOARD_ID);
    expect(s.sheets.filter(q => q.oversize).flatMap(q => q.items.map(it => it.partId))).toEqual(big!.partIds);
  });

  it("invariant 5: kerf is applied once (outline +K, inner cuts −K), also in the sheet SVG", async () => {
    const K = 0.2;
    const plate: Part = {
      id: "P1", kind: "fin", innerCuts: [rect(60, 40, 63, 60)], engrave: [], placement: [], plane: 0, neighbors: [],
      shape: makeShape(rect(0, 0, 100, 100), [[...rect(20, 20, 40, 40)].reverse()]),
    };
    const cut = kerfPart(plate, K);
    const outer = cut.outline.filter(c => signedArea(c) > 0), holes = cut.outline.filter(c => signedArea(c) < 0);
    const size = (cs: Contour[]) => { const b = bboxOfContours(cs); return [b.x1 - b.x0, b.y1 - b.y0]; };
    expect(size(outer)[0]).toBeCloseTo(100 + K, 9);
    expect(size(outer)[1]).toBeCloseTo(100 + K, 9);
    expect(size(holes)[0]).toBeCloseTo(20 - K, 9);
    expect(size(cut.inner)[0]).toBeCloseTo(3 - K, 9);
    expect(size(cut.inner)[1]).toBeCloseTo(20 - K, 9);

    const p = mergeParametricParams({});
    p.material.K = K;
    const r = await run(p);
    const si = r.sheets.findIndex(s => s.items.some(it => it.partId === BOARD_ID));
    const slots = layerPaths(sheetSVG(r, si, p), "slots").map(pathPoints).filter(pts => pts.length === 4);
    expect(slots.length).toBe(r.parts.find(q => q.id === BOARD_ID)!.innerCuts.length);
    const c = p.joints.slotClearance;
    for (const pts of slots) {
      const sides = [0, 1].map(i => Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])).sort((a, b) => a - b);
      expect(Math.abs(sides[0] - (p.material.T + c - K))).toBeLessThan(2e-3);
      expect(Math.abs(sides[1] - (p.joints.tabWidth + c - K))).toBeLessThan(2e-3);
    }
  });

  it("invariant 6: sheet SVGs are in mm, finite, layered, with unique ids; the ZIP holds every file", async () => {
    const p = mergeParametricParams({});
    const r = await run(p);
    expect(r.sheets.length).toBeGreaterThan(0);
    for (let i = 0; i < r.sheets.length; i++) {
      const svg = sheetSVG(r, i, p, { watermark: true });
      expect(svg).toMatch(/width="[\d.]+mm" height="[\d.]+mm" viewBox="0 0 [\d.]+ [\d.]+"/);
      expect(svg).not.toMatch(/NaN|Infinity|undefined/);
      for (const id of ["slots", "labels", "outline"]) expect(svg).toContain(`<g id="${id}"`);
      const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map(q => q[1]);
      expect(new Set(ids).size).toBe(ids.length);
      expect(svg.indexOf('id="slots"')).toBeLessThan(svg.indexOf('id="outline"'));
    }
    const guide = assemblyGuideSVG(r, p);
    expect(guide).not.toMatch(/NaN|Infinity|undefined/);
    expect(guide).toContain(BOARD_ID);
    const files = unzipSync(exportZip(r, p));
    expect(Object.keys(files)).toEqual(expect.arrayContaining(["sheet-01.svg", "assembly-guide.svg", "project.hingelab.json"]));
    expect(Object.keys(files).filter(f => f.startsWith("sheet-")).length).toBe(r.sheets.length);
    expect(JSON.parse(strFromU8(files["project.hingelab.json"])).product).toBe("parametric");

    p.layers.labels.exp = false;
    expect(sheetSVG(r, 0, p)).not.toContain('<g id="labels"');
  });

  it("floating pieces get a bridge to the wall, even when the whole section floats", () => {
    const grounded = makeShape(rect(0, 0, 50, 20), []);
    const island = makeShape(rect(10, 40, 30, 60), []);
    const a = bridgeIslands([grounded, island], 4);
    expect(a.added).toBe(1);
    expect(a.floating).toBe(0);
    expect(a.shapes).toHaveLength(1);
    const b = bridgeIslands([island], 4);
    expect(b.shapes).toHaveLength(1);
    expect(b.shapes[0].bbox.y0).toBeCloseTo(0, 6);
    expect(b.shapes[0].area).toBeCloseTo(400 + 4 * 40, 3);
  });

  it("formulas only do arithmetic: anything else is rejected", () => {
    const f = compileFormula("10*sin(x/20) + max(y, 2) + k", ["x", "y"], ["k"]);
    expect(f({ x: 10 * Math.PI, y: 1, k: 3 })).toBeCloseTo(10 + 2 + 3, 9);
    for (const bad of ["import('fs')", "x.constructor", "evaluate(\"1\")", "a = 1", "f(x) = x", "z + 1", "[1, 2]", "x ? 1", "'text'", "cos", "sin(1, 2)"]) {
      expect(() => compileFormula(bad, ["x", "y"]), bad).toThrow();
    }
  });

  it("nesting respects the grain direction", () => {
    const parts = Array.from({ length: 6 }, (_, i) => ({ id: `F0${i + 1}`, outline: [rect(0, 0, 120, 20)], area: 2400 }));
    const base = mergeParametricParams({}).material;
    for (const [grain, angle] of [["along-x", 0], ["along-y", 90]] as const) {
      const { sheets, tooBig } = nestParts(parts, { ...base, grain });
      expect(tooBig).toEqual([]);
      expect(sheets.flatMap(s => s.items).every(it => it.angle === angle)).toBe(true);
    }
  });
});
