/**
 * Every product's export read back: the size in mm (and inches for DXF), closed outlines, text as
 * outlines, one layer per kind of cut, part and sheet ids, the kerf applied once, no toolpath twice,
 * and the file's paths the same as the preview's.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as hb from "harfbuzzjs";
import { describe, expect, it } from "vitest";
import { ALL_GENERATORS } from "@/lib/generators/all";
import { STRIPS } from "./strips";
import { arrangeGenerator, genContent, genSVG } from "@/lib/generators/output";
import { CTX } from "@/lib/generators/__tests__/ctx";
import { computeModel, exportSVG, layoutParts, mergeParams } from "@/lib/hinge";
import { LETTER_DEFAULTS, computeLetterModel, exportLetterSVG, layoutLetters, loadFont } from "@/lib/letters";
import { mergeParametricParams } from "@/lib/parametric/defaults";
import { computeParametric, loadSource } from "@/lib/parametric/engine";
import { allSheetsSVG } from "@/lib/parametric/export";
import { manifold } from "@/lib/parametric/__tests__/helpers";
import { fabFromGenerator } from "@/lib/fab/adapters";
import { sharedLines } from "@/lib/fab/validate";
import { makeExport } from "../bundle";
import { svgToDXF } from "../dxf";
import { defaultExport, FORMAT_INFO, EXPORT_FORMATS } from "../profiles";
import { readScene, type Scene } from "../scene";
import { strFromU8 } from "fflate";

type Pt = [number, number];

/** POLYLINE entities of an R12 DXF: layer, closed flag and vertices; plus the header's extents and units. */
function readDXF(dxf: string) {
  const rows = dxf.split("\n");
  const pairs: [string, string][] = [];
  for (let i = 0; i + 1 < rows.length; i += 2) pairs.push([rows[i].trim(), rows[i + 1]]);
  const polys: { layer: string; closed: boolean; pts: Pt[] }[] = [];
  let cur: (typeof polys)[number] | null = null, inVertex = false, x = 0;
  let ext: Pt = [0, 0], units = 0, inExt = false;
  for (const [g, v] of pairs) {
    if (g === "9") { inExt = v === "$EXTMAX"; if (v === "$INSUNITS") units = -1; continue; }
    if (units === -1 && g === "70") { units = +v; continue; }
    if (inExt && g === "10") { ext = [+v, ext[1]]; continue; }
    if (inExt && g === "20") { ext = [ext[0], +v]; inExt = false; continue; }
    if (g === "0") {
      if (v === "POLYLINE") { cur = { layer: "", closed: false, pts: [] }; polys.push(cur); inVertex = false; }
      else if (v === "VERTEX") inVertex = true;
      else if (v === "SEQEND") { cur = null; inVertex = false; }
      continue;
    }
    if (!cur) continue;
    if (g === "8" && !inVertex) cur.layer = v;
    if (g === "70" && !inVertex) cur.closed = (+v & 1) === 1;
    if (inVertex && g === "10") x = +v;
    if (inVertex && g === "20") cur.pts.push([x, +v]);
  }
  return { polys, ext, units };
}

const visible = (svg: string) => svg.replace(/<defs>[\s\S]*?<\/defs>/g, "").replace(/<!--[\s\S]*?-->/g, "");
const sizeOf = (svg: string) => {
  const m = /<svg\b[^>]*\bwidth="([\d.]+)mm" height="([\d.]+)mm" viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)!;
  return { w: +m[1], h: +m[2], vw: +m[3], vh: +m[4] };
};
const isOutline = (label: string) => /outline/i.test(label);
const cutPolys = (sc: Scene) => sc.layers.filter((l) => !l.fill && !/score|label|engrave|mark/i.test(l.label)).flatMap((l) => l.items.flatMap((it) => it.polys));

function checkCommon(name: string, svg: string, o: { text: boolean }) {
  const { w, h, vw, vh } = sizeOf(svg);
  // Physical size: the viewBox is in mm, 1:1.
  expect(w, name).toBe(vw);
  expect(h, name).toBe(vh);
  const sc = readScene(svg);
  // One layer per kind of cut, each written once, filled (engrave) or stroked, not both.
  const labels = sc.layers.map((l) => l.label);
  expect(new Set(labels).size, name).toBe(labels.length);
  // Outlines are closed.
  for (const l of sc.layers.filter((q) => isOutline(q.label))) for (const it of l.items) for (const p of it.polys) expect(p.closed, `${name}: ${l.label}`).toBe(true);
  // Text is outlines: only the Hinge Box's labels stay as text (on their own layer).
  const texts = (visible(svg).match(/<text\b/g) ?? []).length;
  if (!o.text) expect(texts, name).toBe(0);
  else for (const l of sc.layers) if (l.items.some((it) => it.texts.length)) expect(l.label, name).toMatch(/label|engrave/i);
  // DXF: the same size in mm and in inches, the same layers, outlines closed.
  const d = readDXF(svgToDXF(svg).dxf);
  expect(d.units, name).toBe(4);
  expect(d.ext[0]).toBeCloseTo(w, 3);
  expect(d.ext[1]).toBeCloseTo(h, 3);
  const di = readDXF(svgToDXF(svg, { inches: true }).dxf);
  expect(di.units).toBe(1);
  expect(di.ext[0]).toBeCloseTo(w / 25.4, 4);
  expect(new Set(d.polys.map((p) => p.layer)).size, name).toBe(sc.layers.filter((l) => l.items.some((it) => it.polys.length)).length);
  for (const p of d.polys) if (isOutline(p.layer)) expect(p.closed, `${name} DXF ${p.layer}`).toBe(true);
  expect(d.polys.length, name).toBe(sc.layers.reduce((n, l) => n + l.items.reduce((k, it) => k + it.polys.length, 0), 0));
  // No toolpath twice: no subpath repeated in the file.
  const seen = new Set<string>();
  for (const p of cutPolys(sc)) {
    const k = p.pts.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).sort().join(" ");
    expect(seen.has(k), `${name}: a toolpath written twice`).toBe(false);
    seen.add(k);
  }
  return sc;
}

describe("every generator's export, read back", () => {
  it.each(ALL_GENERATORS.map((g) => [g.id, g] as const))("%s", (id, def) => {
    const p = def.merge(def.presets[0]?.params ?? {});
    const a = arrangeGenerator(def, p, CTX);
    const svg = genSVG(def, a.params, a.lay!, "", a.sheets);
    const sc = checkCommon(id, svg, { text: false });
    // The file is the preview: the same paths, layer by layer.
    const C = genContent(a.lay!);
    const ds = (key: string) => [...svg.slice(svg.indexOf(`<g id="${key}"`)).split("</g>")[0].matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
    if (a.params.layers.outline.exp) expect(ds("outline"), id).toEqual(C.outline);
    if (a.params.layers.slots.exp && C.slots.length) expect(ds("slots"), id).toEqual(C.slots);
    if (a.params.layers.hinge.exp && C.hinge.length) expect(ds("hinge"), id).toEqual(C.hinge);
    // Part and sheet ids on every path, each path on the sheet it names.
    const tags = [...visible(svg).matchAll(/<path d="[^"]+"([^/]*)\/>/g)].map((m) => m[1]);
    expect(tags.every((t) => /data-part="[^"]+"/.test(t)), id).toBe(true);
    const n = a.sheets!.length;
    for (const l of sc.layers) for (const it of l.items) {
      const sheet = /data-sheet="(\d+)"/.exec(it.raw);
      expect(sheet, `${id}: ${l.label}`).not.toBeNull();
      const k = +sheet![1] - 1;
      expect(k >= 0 && k < n).toBe(true);
      const r = a.sheets![k];
      if (it.box) expect(it.box[1] >= r.y - 1e-3 && it.box[3] <= r.y + r.h + 1e-3, `${id} on sheet ${k + 1}`).toBe(true);
    }
    // Lines cut twice in the file are only those the design has (the export adds none).
    const fab = fabFromGenerator(id, a.params, a)!;
    const mv = (c: Pt[], ox: number, oy: number) => c.map(([x, y]) => [x + ox, y + oy] as Pt);
    const fromModel = sharedLines(fab.parts.flatMap((pt) => [...pt.ops!.outline, ...pt.ops!.inner].map((c) => ({ c: mv(c as Pt[], pt.ox, pt.oy), closed: true })).concat(pt.ops!.cuts.map((c) => ({ c: mv(c as Pt[], pt.ox, pt.oy), closed: false }))))).reduce((s, x) => s + x.len, 0);
    const fromFile = sharedLines(cutPolys(sc).map((q) => ({ c: q.pts, closed: q.closed }))).reduce((s, x) => s + x.len, 0);
    expect(fromFile, id).toBeLessThanOrEqual(fromModel + 0.5);
  }, 60_000);
});

describe("the kerf is applied once, in every format", () => {
  const K = 0.2, w = 10;
  const p = STRIPS.merge({ K, width: w });
  const a = arrangeGenerator(STRIPS, p, CTX);
  const svg = genSVG(STRIPS, a.params, a.lay!, "", a.sheets);
  const widths = (polys: { pts: Pt[] }[]) => polys.map((q) => Math.max(...q.pts.map((t) => t[0])) - Math.min(...q.pts.map((t) => t[0])));

  it("SVG and DXF strips measure the design width plus the kerf, not twice it", () => {
    const out = readScene(svg).layers.find((l) => isOutline(l.label))!.items.flatMap((it) => it.polys);
    for (const x of widths(out)) expect(x).toBeCloseTo(w + K, 2);
    const dxf = readDXF(svgToDXF(svg).dxf).polys.filter((q) => isOutline(q.layer));
    for (const x of widths(dxf)) expect(x).toBeCloseTo(w + K, 2);
  });

  it("LightBurn and PDF carry the same size", () => {
    const lb = makeExport(svg, a.sheets, { ...defaultExport("co2-50"), format: "lbrn2" }, "c").file.data as string;
    // Outline shapes only (LightBurn layer 02).
    const xs = [...lb.matchAll(/CutIndex="2">\s*<XForm>[^<]*<\/XForm>\s*<VertList>([^<]+)<\/VertList>/g)].map((m) => [...m[1].matchAll(/V([-\d.]+) ([-\d.]+)/g)].map((v) => +v[1]));
    expect(xs.length).toBe(2);
    for (const v of xs) expect(Math.max(...v) - Math.min(...v)).toBeCloseTo(w + K, 2);
    const pdf = strFromU8(makeExport(svg, a.sheets, { ...defaultExport("co2-50"), format: "pdf" }, "c").file.data as Uint8Array, true);
    const box = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(pdf)!;
    expect(+box[1]).toBeCloseTo(a.sheets![0].w * (72 / 25.4), 1);
  });
});

describe("the other products' exports, read back", () => {
  it("Hinge Box (its labels stay text, on their own layer)", () => {
    const hp = mergeParams({});
    const m = computeModel(hp);
    if ("error" in m) throw new Error(m.error);
    checkCommon("hinge", exportSVG(m, layoutParts(m.parts, hp.bedW, hp.gap), hp), { text: true });
  });

  it("Letters", () => {
    const b = readFileSync(join(__dirname, "../../letters/__tests__/fonts/Fredoka-Bold.ttf"));
    const font = loadFont(hb, "fredoka", "Fredoka Bold", b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    const lp = { ...LETTER_DEFAULTS, text: "HI", mode: "solid" as const, fontId: "fredoka", size: 120 };
    const m = computeLetterModel(lp, font, hb);
    if ("error" in m) throw new Error(m.error);
    checkCommon("letters", exportLetterSVG(layoutLetters(m, lp), lp, "Fredoka Bold"), { text: true });
  });

  it("Parametric", async () => {
    const pp = mergeParametricParams({ source: { kind: "library", id: "sphere", detail: 4 } });
    const r = computeParametric(pp, await loadSource(pp), await manifold());
    checkCommon("parametric", allSheetsSVG(r, pp), { text: false });
  }, 60_000);
});

describe("cut order", () => {
  it("each format says what it can make the laser software do", () => {
    for (const f of EXPORT_FORMATS) expect(FORMAT_INFO[f].order.length).toBeGreaterThan(20);
    expect(FORMAT_INFO.lbrn2.order).toMatch(/follows the order/);
    for (const f of ["svg", "dxf", "pdf"] as const) expect(FORMAT_INFO[f].order).toMatch(/inner cuts (run )?before outlines/);
  });

  it("the LightBurn file's layer priorities run engrave, score, inner cuts, outline", () => {
    const def = ALL_GENERATORS.find((g) => g.id === "clock")!;
    const p = def.merge(def.presets[0].params);
    const a = arrangeGenerator(def, p, CTX);
    const lb = makeExport(genSVG(def, a.params, a.lay!, "", a.sheets), a.sheets, { ...defaultExport("co2-50"), format: "lbrn2" }, "c").file.data as string;
    const order = [...lb.matchAll(/<name Value="([^"]+)"\/>\s*<priority Value="(\d+)"\/>/g)].sort((x, y) => +x[2] - +y[2]).map((m) => m[1]);
    const rank = (s: string) => (/engrave/i.test(s) ? 0 : /score/i.test(s) ? 1 : /inner/i.test(s) ? 2 : /outline/i.test(s) ? 3 : -1);
    const ranks = order.map(rank).filter((r) => r >= 0);
    expect(ranks).toEqual([...ranks].sort((x, y) => x - y));
    expect(ranks).toContain(3);
  });
});
