import { describe, expect, it } from "vitest";
import { computeModel, exportSVG, layoutParts, mergeParams } from "@/lib/hinge";
import { ALL_GENERATORS } from "@/lib/generators/all";
import { arrangeGenerator, genSVG } from "@/lib/generators/output";
import { CTX } from "@/lib/generators/__tests__/ctx";
import { mergeParametricParams } from "@/lib/parametric/defaults";
import { computeParametric, loadSource } from "@/lib/parametric/engine";
import { allSheetsSVG, sheetSVG } from "@/lib/parametric/export";
import { manifold } from "@/lib/parametric/__tests__/helpers";
import { layoutSheets } from "@/lib/parametric/sheetLayout";
import { addWatermark } from "@/lib/plans";
import { aciOf, flattenPath, svgToDXF } from "../dxf";

interface Ent { type: string; layer: string; closed: boolean; pts: [number, number][]; text?: string; height?: number; rot?: number }

/** A small DXF reader: group code / value pairs, layers from the LAYER table, POLYLINE and TEXT entities. */
function readDXF(dxf: string) {
  const lines = dxf.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  expect(lines.length % 2).toBe(0);
  const pairs: [number, string][] = [];
  let badCode = -1;
  for (let i = 0; i < lines.length; i += 2) {
    const code = Number(lines[i]);
    if (!Number.isInteger(code) && badCode < 0) badCode = i;
    pairs.push([code, lines[i + 1]]);
  }
  expect(badCode, "first line with a bad group code").toBe(-1);
  expect(pairs[pairs.length - 1]).toEqual([0, "EOF"]);
  const layers = new Map<string, number>();
  const ents: Ent[] = [];
  let section = "", cur: Ent | null = null, inPoly = false, vx = 0, layerName = "", inLayer = false;
  for (let i = 0; i < pairs.length; i++) {
    const [c, v] = pairs[i];
    if (c === 0) {
      if (inLayer) { inLayer = false; }
      if (v === "SECTION") { section = pairs[i + 1][1]; continue; }
      if (section === "TABLES" && v === "LAYER") { inLayer = true; layerName = ""; continue; }
      if (section !== "ENTITIES") continue;
      if (v === "POLYLINE") { cur = { type: "POLYLINE", layer: "", closed: false, pts: [] }; ents.push(cur); inPoly = true; continue; }
      if (v === "VERTEX") { cur!.pts.push([NaN, NaN]); continue; }
      if (v === "SEQEND") { inPoly = false; cur = null; continue; }
      if (v === "TEXT") { cur = { type: "TEXT", layer: "", closed: false, pts: [[NaN, NaN]] }; ents.push(cur); continue; }
      continue;
    }
    if (inLayer) {
      if (c === 2) layerName = v;
      if (c === 62) layers.set(layerName, Number(v));
      continue;
    }
    if (!cur) continue;
    if (c === 8 && !cur.layer) cur.layer = v;
    if (cur.type === "POLYLINE") {
      if (c === 70 && cur.pts.length === 0) cur.closed = (Number(v) & 1) === 1;
      if (cur.pts.length) {
        const last = cur.pts[cur.pts.length - 1];
        if (c === 10) { vx = Number(v); last[0] = vx; }
        if (c === 20) last[1] = Number(v);
      }
    } else {
      if (c === 10) cur.pts[0][0] = Number(v);
      if (c === 20) cur.pts[0][1] = Number(v);
      if (c === 1) cur.text = v;
      if (c === 40) cur.height = Number(v);
      if (c === 50) cur.rot = Number(v);
    }
  }
  expect(inPoly).toBe(false);
  return { layers, ents };
}

const visiblePaths = (svg: string) => {
  const body = svg.replace(/<defs>[\s\S]*?<\/defs>/g, "");
  return [...body.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
};
const subpaths = (svg: string) => visiblePaths(svg).reduce((n, d) => n + flattenPath(d).length, 0);
const dims = (svg: string) => {
  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)!;
  return { W: parseFloat(vb[1]), H: parseFloat(vb[2]) };
};

function checkAgainst(svg: string, tag: string) {
  const out = svgToDXF(svg);
  const { layers, ents } = readDXF(out.dxf);
  const polys = ents.filter((e) => e.type === "POLYLINE");
  expect(polys.length, tag).toBe(subpaths(svg));
  expect(out.polylines, tag).toBe(polys.length);
  const { W, H } = dims(svg);
  // one assertion per check, not per point: a sheet with scored brick has tens of thousands
  const badLayer = polys.find((e) => !layers.has(e.layer));
  expect(badLayer?.layer, `${tag}: layer`).toBeUndefined();
  const outside: string[] = [];
  for (const e of polys) {
    for (const [x, y] of e.pts) {
      if (!(Number.isFinite(x) && Number.isFinite(y) && x >= -1e-3 && x <= W + 1e-3 && y >= -1e-3 && y <= H + 1e-3) && outside.length < 3) outside.push(`${x}, ${y}`);
    }
  }
  expect(outside, `${tag}: points in ${W} × ${H}`).toEqual([]);
  const texts = ents.filter((e) => e.type === "TEXT");
  expect(texts.length, tag).toBe((svg.replace(/<defs>[\s\S]*?<\/defs>/g, "").match(/<text /g) ?? []).length);
  return { out, layers, ents };
}

describe("SVG path flattening", () => {
  it("keeps straight paths exact and closes Z subpaths", () => {
    const s = flattenPath("M0 0 L10 0 L10 10 Z M20 20 h5 v5");
    expect(s).toEqual([
      { pts: [[0, 0], [10, 0], [10, 10]], closed: true },
      { pts: [[20, 20], [25, 20], [25, 25]], closed: false },
    ]);
    expect(flattenPath("m1 1 l2 0 l0 2 z")[0]).toEqual({ pts: [[1, 1], [3, 1], [3, 3]], closed: true });
  });

  it("flattens arcs and curves within 0.03 mm", () => {
    const arc = flattenPath("M0 0 A10 10 0 0 1 20 0")[0].pts;
    expect(arc[arc.length - 1]).toEqual([20, 0]);
    for (const [x, y] of arc) expect(Math.abs(Math.hypot(x - 10, y) - 10)).toBeLessThan(0.03);
    expect(arc.every(([, y]) => y <= 1e-9)).toBe(true);
    const k = 0.5522847498 * 10;
    const quarter = flattenPath(`M10 0 C10 ${k} ${k} 10 0 10`)[0].pts;
    for (const [x, y] of quarter) expect(Math.abs(Math.hypot(x, y) - 10)).toBeLessThan(0.03);
  });

  it("maps the laser colours to the standard DXF colours", () => {
    expect(aciOf("#FF0000")).toBe(1);
    expect(aciOf("#00E000")).toBe(3);
    expect(aciOf("#0000FF")).toBe(5);
    expect(aciOf("#000000")).toBe(7);
    expect(aciOf(undefined)).toBe(7);
  });
});

describe("DXF export", () => {
  it("Hinge Box: every path and label, on layers of the right colours, y up", () => {
    const p = mergeParams({});
    const model = computeModel(p);
    if ("error" in model) throw new Error(model.error);
    const svg = exportSVG(model, layoutParts(model.parts, p.bedW, p.gap), p);
    const { layers, ents } = checkAgainst(svg, "hinge");
    const colour = (code: string) => [...layers].find(([n]) => n.startsWith(code))?.[1];
    expect(colour("02")).toBe(1);
    expect(colour("01")).toBe(5);
    // The first path's first point, flipped: DXF y = height - SVG y.
    const first = /<path d="M\s*([-\d.]+)[\s,]+([-\d.]+)/.exec(svg)!;
    const { H } = dims(svg);
    const e = ents.find((q) => q.type === "POLYLINE")!;
    expect(e.pts[0][0]).toBeCloseTo(parseFloat(first[1]), 3);
    expect(e.pts[0][1]).toBeCloseTo(H - parseFloat(first[2]), 3);
  });

  it("keeps the Free plan's mark as text", () => {
    const p = mergeParams({});
    const model = computeModel(p);
    if ("error" in model) throw new Error(model.error);
    const svg = addWatermark(exportSVG(model, layoutParts(model.parts, p.bedW, p.gap), p));
    const { ents } = checkAgainst(svg, "watermark");
    expect(ents.some((e) => e.type === "TEXT" && e.text === "Made with HingeLab")).toBe(true);
  });

  for (const def of ALL_GENERATORS) {
    it(`${def.id}: every preset converts`, () => {
      for (const pr of def.presets) {
        const p = def.merge(pr.params);
        const a = arrangeGenerator(def, p, CTX);
        const svg = genSVG(def, p, a.lay!);
        const { out } = checkAgainst(svg, pr.id);
        expect(out.skipped, pr.id).toBe((svg.match(/<image /g) ?? []).length);
      }
    }, 60_000);
  }

  it("Parametric: all sheets in one SVG, in Lay Flat rows, and as DXF", async () => {
    const d = mergeParametricParams();
    const p = mergeParametricParams({ method: "folded", source: { kind: "library", id: "torus" }, material: { ...d.material, T: 0.3, K: 0.05, sheetW: 300, sheetH: 200 } });
    const r = computeParametric(p, await loadSource(p), await manifold());
    expect(r.sheets.length).toBeGreaterThan(1);
    const all = allSheetsSVG(r, p);
    const { W, H } = dims(all);
    // sheets sit in the same rows as Lay Flat (1.24.1), not in one tall stack
    const grid = layoutSheets(r.sheets);
    expect(W).toBeCloseTo(grid.W, 3);
    expect(H).toBeCloseTo(grid.H, 3);
    expect(W).toBeGreaterThanOrEqual(Math.max(...r.sheets.map((s) => s.width)) - 1e-3);
    const per = r.sheets.reduce((a, _, i) => a + visiblePaths(sheetSVG(r, i, p)).length, 0);
    expect(visiblePaths(all).length).toBe(per);
    expect(all).not.toMatch(/NaN|undefined/);
    checkAgainst(all, "parametric");
  }, 30000);
});
