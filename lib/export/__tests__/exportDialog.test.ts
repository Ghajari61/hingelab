import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync, zlibSync } from "fflate";
import { computeModel, exportSVG, layoutParts, mergeParams } from "@/lib/hinge";
import { arrangeGenerator, genSVG } from "@/lib/generators/output";
import { CTX } from "@/lib/generators/__tests__/ctx";
import { ALL_GENERATORS } from "@/lib/generators/all";
import { addWatermark } from "@/lib/plans";
import { makeExport } from "../bundle";
import { flattenPath, svgToDXF } from "../dxf";
import { cutIndex, sceneLBRN } from "../lbrn2";
import { pdfImage, scenePDF } from "../pdfVector";
import { bedOf, cleanExport, CUSTOM_MACHINE, defaultExport, HAIRLINE_MM, overBed, type ExportSettings } from "../profiles";
import { readScene } from "../scene";
import { sceneSVG, sheetOf, sheetRects } from "../sheets";

const PT = 72 / 25.4;

function hingeSVG() {
  const p = mergeParams({});
  const model = computeModel(p);
  if ("error" in model) throw new Error(model.error);
  return exportSVG(model, layoutParts(model.parts, p.bedW, p.gap), p);
}

/** A generator's preset laid out on its sheets. */
function genOf(gen: string, id: string) {
  const def = ALL_GENERATORS.find((d) => d.id === gen)!;
  const pr = def.presets.find((q) => q.id === id)!;
  const p = def.merge(pr.params);
  const a = arrangeGenerator(def, p, CTX);
  return { svg: genSVG(def, p, a.lay!), sheets: a.sheets! };
}
const boxSVG = (id: string) => genOf("shadowbox", id);

const visible = (svg: string) => svg.replace(/<defs>[\s\S]*?<\/defs>/g, "");
const pathDs = (svg: string) => [...visible(svg).matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
const subpaths = (svg: string) => pathDs(svg).reduce((n, d) => n + flattenPath(d).length, 0);
const set = (over: Partial<ExportSettings> = {}): ExportSettings => ({ ...defaultExport("co2-50"), format: "svg", ...over });

describe("export scene", () => {
  it("reads every layer and element of a product's SVG", () => {
    const svg = hingeSVG();
    const sc = readScene(svg);
    expect(sc.layers.length).toBe((svg.match(/inkscape:groupmode="layer"/g) ?? []).length);
    expect(sc.layers.reduce((n, l) => n + l.items.length, 0)).toBe((svg.match(/<(path|text) /g) ?? []).length);
    expect(sc.layers.reduce((n, l) => n + l.items.reduce((k, it) => k + it.polys.length, 0), 0)).toBe(subpaths(svg));
    expect(sc.layers.reduce((n, l) => n + l.items.reduce((k, it) => k + it.texts.length, 0), 0)).toBe((svg.match(/<text /g) ?? []).length);
    const outline = sc.layers.find((l) => l.label.startsWith("02"))!;
    expect(outline.color).toBe("#FF0000");
    expect(outline.fill).toBe(false);
  });

  it("puts every element on the sheet it sits on", () => {
    const { svg, sheets } = boxSVG("lit-forest-box");
    expect(sheets.length).toBeGreaterThan(1);
    const sc = readScene(svg);
    const rects = sheetRects(sc, sheets);
    for (const l of sc.layers) for (const it of l.items) {
      const r = rects[sheetOf(it, rects)];
      expect(it.box![0] >= r.x - 1e-6 && it.box![2] <= r.x + r.w + 1e-6 && it.box![1] >= r.y - 1e-6 && it.box![3] <= r.y + r.h + 1e-6, l.label).toBe(true);
    }
  });
});

describe("export files", () => {
  it("returns the editor's SVG unchanged when no option is changed", () => {
    for (const svg of [hingeSVG(), boxSVG("lit-forest-box").svg, addWatermark(hingeSVG())]) {
      const r = makeExport(svg, null, set(), "box");
      expect(r.file.data).toBe(svg);
      expect(r.file.name).toBe("box.svg");
    }
    const { svg, sheets } = boxSVG("lit-forest-box");
    expect(makeExport(svg, sheets, set(), "box").file.data).toBe(svg);
    // The default DXF is the DXF the editor's DXF button makes.
    expect(makeExport(svg, sheets, set({ format: "dxf" }), "box").file.data).toBe(svgToDXF(svg).dxf);
  });

  it("one file per sheet: a ZIP of sheet-sized SVGs with every path once, as written", () => {
    const { svg, sheets } = boxSVG("lit-forest-box");
    const r = makeExport(svg, sheets, set({ split: true }), "lit");
    expect(r.file.name).toBe("lit-sheets.zip");
    expect(r.count).toBe(sheets.length);
    const files = unzipSync(r.file.data as Uint8Array);
    const names = Object.keys(files);
    expect(names).toEqual(sheets.map((_, i) => `lit-sheet-${i + 1}-of-${sheets.length}.svg`));
    const all: string[] = [];
    names.forEach((n, i) => {
      const one = strFromU8(files[n]);
      expect(one).toContain(`viewBox="0 0 ${Math.round(sheets[i].w * 1000) / 1000} ${Math.round(sheets[i].h * 1000) / 1000}"`);
      all.push(...pathDs(one));
      const sc = readScene(one);
      for (const l of sc.layers) for (const it of l.items) for (const p of it.polys) for (const [x, y] of p.pts) {
        expect(x >= -1e-3 && x <= sheets[i].w + 1e-3 && y >= -1e-3 && y <= sheets[i].h + 1e-3, n).toBe(true);
      }
    });
    expect(all.sort()).toEqual(pathDs(svg).sort());
    // The same ZIP every time.
    expect(makeExport(svg, sheets, set({ split: true }), "lit").file.data).toEqual(r.file.data);
  });

  it("keeps the Free plan's mark under every sheet when sheets go in files of their own", () => {
    const { svg, sheets } = genOf("clock", "wall-roman");
    const marked = addWatermark(svg);
    for (const format of ["svg", "pdf", "dxf"] as const) {
      const files = unzipSync(makeExport(marked, sheets, set({ format, split: true }), "c").file.data as Uint8Array);
      expect(Object.keys(files).length).toBe(sheets.length);
      Object.values(files).forEach((b, i) => {
        const t = strFromU8(b, format === "pdf");
        expect(t, format).toContain("Made with HingeLab");
        if (format === "svg") {
          const sc = readScene(t);
          expect(sc.H).toBeCloseTo(sheets[i].h + 8, 3);
          const mark = sc.layers.find((l) => l.label.includes("Made with"))!.items[0];
          // The mark sits in the strip under the sheet, inside the file.
          const y = mark.texts[0].y;
          expect(y > sheets[i].h && y < sheets[i].h + 8, `${y} under a ${sheets[i].h} mm sheet`).toBe(true);
        }
      });
    }
  });

  it("mirrors left to right and writes hairlines", () => {
    const svg = hingeSVG();
    const sc = readScene(svg);
    const out = makeExport(svg, null, set({ mirror: true, hairline: true }), "box").file.data as string;
    expect(out).toContain(`stroke-width="${HAIRLINE_MM}"`);
    expect(out).not.toContain(`stroke-width="0.1"`);
    const back = readScene(out);
    const a = sc.layers[1].items[0].polys[0].pts[0], b = back.layers[1].items[0].polys[0].pts[0];
    expect(b[0]).toBeCloseTo(sc.W - a[0], 6);
    expect(b[1]).toBeCloseTo(a[1], 6);
    // Engraved fills keep no stroke.
    const { svg: clock } = genOf("clock", "wall-roman");
    const fills = makeExport(clock, null, set({ hairline: true }), "x").file.data as string;
    expect(fills).toMatch(/inkscape:label="00 [^"]*" fill="#000000" fill-rule="evenodd" stroke="none">/);
  });

  it("DXF in inches", () => {
    const svg = hingeSVG();
    const mm = svgToDXF(svg).dxf, inch = makeExport(svg, null, set({ format: "dxf", inches: true }), "box").file.data as string;
    expect(inch).toContain("$INSUNITS\n70\n1\n");
    expect(mm).toContain("$INSUNITS\n70\n4\n");
    const first = (s: string) => /VERTEX\n8\n[^\n]+\n10\n([-\d.]+)\n20\n([-\d.]+)/.exec(s)!.slice(1).map(Number);
    const [x, y] = first(mm), [xi, yi] = first(inch);
    expect(xi).toBeCloseTo(x / 25.4, 3);
    expect(yi).toBeCloseTo(y / 25.4, 3);
  });
});

/** Objects and pages of a PDF, checking every cross-reference offset. */
function readPDF(b: Uint8Array) {
  const s = strFromU8(b, true);
  expect(s.startsWith("%PDF-1.4")).toBe(true);
  const xref = Number(/startxref\n(\d+)/.exec(s)![1]);
  expect(s.slice(xref, xref + 4)).toBe("xref");
  const rows = s.slice(xref).split("\n");
  const count = Number(rows[1].split(" ")[1]);
  for (let k = 1; k < count; k++) {
    const off = Number(rows[2 + k].slice(0, 10));
    expect(s.slice(off, off + `${k} 0 obj`.length), `object ${k}`).toBe(`${k} 0 obj`);
  }
  const boxes = [...s.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
  return { s, boxes };
}

describe("PDF", () => {
  it("one page per sheet at actual size, layers in their colours", () => {
    const { svg, sheets } = genOf("clock", "wall-roman");
    expect(sheets.length).toBe(2);
    const r = makeExport(svg, sheets, set({ format: "pdf" }), "lit");
    expect(r.file.name).toBe("lit.pdf");
    const { s, boxes } = readPDF(r.file.data as Uint8Array);
    expect(boxes.length).toBe(sheets.length);
    boxes.forEach(([w, h], i) => { expect(w).toBeCloseTo(sheets[i].w * PT, 2); expect(h).toBeCloseTo(sheets[i].h * PT, 2); });
    expect(s).toContain("1 0 0 RG");
    expect(s).toContain("f*");
    expect(s).toMatch(/\/Count \d+/);
  });

  it("puts the hinge labels in as Helvetica text", () => {
    const sc = readScene(hingeSVG());
    const rect = { x: 0, y: 0, w: sc.W, h: sc.H };
    const r = scenePDF(sc, [rect], [{ rect, sheet: null, mirror: false }], 0.1);
    const { s } = readPDF(r.pdf);
    expect(s).toContain("/BaseFont /Helvetica");
    expect((s.match(/\) Tj ET/g) ?? []).length).toBe(sc.layers.reduce((n, l) => n + l.items.reduce((k, it) => k + it.texts.length, 0), 0));
    // Lines 0.1 mm wide, round caps and joins.
    expect(s).toContain(`${Math.round(0.1 * PT * 1000) / 1000} w 1 J 1 j`);
  });

  it("embeds JPEGs as they are and grey PNGs with the PNG predictor", () => {
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 20, 0, 30, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
    const j = pdfImage(`data:image/jpeg;base64,${btoa(String.fromCharCode(...jpeg))}`)!;
    expect(j.dict).toContain("/Width 30 /Height 20 /ColorSpace /DeviceRGB");
    expect(j.dict).toContain("/DCTDecode");
    expect(j.data).toEqual(jpeg);
    // A 4 × 2 grey PNG (filter byte + 4 pixels per row).
    const raw = Uint8Array.from([0, 0, 85, 170, 255, 0, 255, 170, 85, 0]);
    const chunk = (k: string, d: Uint8Array) => { const u = new Uint8Array(12 + d.length); new DataView(u.buffer).setUint32(0, d.length); u.set([...k].map((c) => c.charCodeAt(0)), 4); u.set(d, 8); return u; };
    const ihdr = new Uint8Array(13); new DataView(ihdr.buffer).setUint32(0, 4); new DataView(ihdr.buffer).setUint32(4, 2); ihdr[8] = 8; ihdr[9] = 0;
    const z = zlibSync(raw);
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...chunk("IHDR", ihdr), ...chunk("IDAT", z), ...chunk("IEND", new Uint8Array(0))]);
    const p = pdfImage(`data:image/png;base64,${btoa(String.fromCharCode(...png))}`)!;
    expect(p.dict).toContain("/Width 4 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 1 /BitsPerComponent 8 /Columns 4 >>");
    expect(p.data).toEqual(z);
    // Transparent PNGs cannot go in as stored.
    ihdr[9] = 6;
    const rgba = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...chunk("IHDR", ihdr), ...chunk("IDAT", z), ...chunk("IEND", new Uint8Array(0))]);
    expect(pdfImage(`data:image/png;base64,${btoa(String.fromCharCode(...rgba))}`)).toBeNull();
  });
});

describe("LightBurn project", () => {
  it("one cut setting per layer on the LightBurn colours, outlines as paths, y up", () => {
    const svg = hingeSVG();
    const sc = readScene(svg);
    const rect = { x: 0, y: 0, w: sc.W, h: sc.H };
    const r = sceneLBRN(sc, [rect], { rect, sheet: null, mirror: false });
    const opens = (r.xml.match(/<(?!\/|\?)[A-Za-z]+[^>]*[^/]>/g) ?? []).length, closes = (r.xml.match(/<\/[A-Za-z]+>/g) ?? []).length;
    expect(opens).toBe(closes);
    expect(r.xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<LightBurnProject /);
    const idx = [...r.xml.matchAll(/<index Value="(\d+)"\/>/g)].map((m) => +m[1]);
    expect(idx).toContain(2);
    expect(idx).toContain(1);
    expect(r.shapes).toBe(subpaths(svg));
    expect(r.skipped).toBe((svg.match(/<text /g) ?? []).length);
    expect(r.xml).not.toMatch(/maxPower|speed/i);
    // The first outline's first point, y flipped.
    const first = /<path d="M\s*([-\d.]+)[\s,]+([-\d.]+)/.exec(svg.slice(svg.indexOf('id="outline"')))!;
    const shape = /CutIndex="2">\s*<XForm>[^<]*<\/XForm>\s*<VertList>V([-\d.]+) ([-\d.]+)/.exec(r.xml)!;
    expect(+shape[1]).toBeCloseTo(+first[1], 3);
    expect(+shape[2]).toBeCloseTo(sc.H - +first[2], 3);
  });

  it("matches layers by their number, else by colour", () => {
    expect(cutIndex("02 Outline cut", "#00FF00")).toBe(2);
    expect(cutIndex("Cut", "#0000FF")).toBe(1);
    expect(cutIndex("Engrave", "#000000")).toBe(0);
  });
});

describe("export settings", () => {
  it("cleans stored settings and starts from the chosen machine", () => {
    expect(cleanExport(null, "co2-100").format).toBe("dxf");
    expect(cleanExport({ machine: "nope", format: "exe", split: "yes", bedW: -5 }, "k40")).toEqual(defaultExport("k40"));
    const c = cleanExport({ machine: CUSTOM_MACHINE, bedW: 900, bedH: 1e6, format: "lbrn2", mirror: true });
    expect(c).toMatchObject({ machine: CUSTOM_MACHINE, bedW: 900, bedH: 3000, format: "lbrn2", mirror: true, split: false });
    expect(bedOf(c)).toEqual({ w: 900, h: 3000, name: "Your machine" });
    expect(bedOf(defaultExport("glowforge"))).toMatchObject({ w: 495, h: 279 });
  });

  it("finds sheets larger than the bed either way round", () => {
    const bed = { w: 300, h: 200 };
    expect(overBed([{ x: 0, y: 0, w: 200, h: 300 }, { x: 0, y: 330, w: 300, h: 210 }, { x: 0, y: 600, w: 120, h: 80 }], bed)).toEqual([1]);
  });

  it("splits a mirrored sheet so it reads back as the mirror image", () => {
    const { svg, sheets } = boxSVG("lit-forest-box");
    const sc = readScene(svg);
    const rects = sheetRects(sc, sheets);
    const out = readScene(sceneSVG(sc, rects, { rect: rects[1], sheet: 1, mirror: true }));
    // The elements of each layer come back inside one placing group.
    const orig = sc.layers.flatMap((l) => l.items.filter((it) => sheetOf(it, rects) === 1).flatMap((it) => it.polys));
    const back = out.layers.flatMap((l) => l.items.flatMap((it) => it.polys));
    expect(back.length).toBe(orig.length);
    orig.forEach((p, i) => {
      const [a, b] = [p.pts[0], back[i].pts[0]];
      expect(b[0]).toBeCloseTo(rects[1].w - (a[0] - rects[1].x), 6);
      expect(b[1]).toBeCloseTo(a[1] - rects[1].y, 6);
    });
  });
});
