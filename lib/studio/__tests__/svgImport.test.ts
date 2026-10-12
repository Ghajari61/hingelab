import { describe, expect, it } from "vitest";
import { importSvg, parseColor, parsePathData, parseTransform, parseXml, SvgImportError } from "../svgImport";
import { segments, subpathsBox } from "../geom";
import { svgDocument } from "../svgProject";
import { documentArt } from "../thumbnailArt";
import { documentThumbnail } from "../thumbnail";
import { assertDocument } from "../doc";
import { inertSvgMarkup } from "@/lib/security/svg";
import type { PathNode, Subpath } from "../types";

let seq = 0;
const id = () => `n${++seq}`;
const imp = (svg: string, o = {}) => importSvg(svg, { id, ...o });
const paths = (svg: string, o = {}) => (imp(svg, o).group?.children ?? []) as PathNode[];
const box = (subs: Subpath[]) => {
  const b = subpathsBox(subs);
  return [b.minX, b.minY, b.maxX, b.maxY].map((v) => Math.round(v * 1000) / 1000);
};

describe("parseXml", () => {
  it("reads attributes, entities, CDATA and skips comments and DOCTYPE", () => {
    const doc = parseXml(`<?xml version="1.0"?><!DOCTYPE svg [ <!ENTITY ns "http://www.w3.org/2000/svg"> ]>
      <!-- note --><svg xmlns="&ns;" a='1 &amp; 2' b="&#x41;&#66;"><style><![CDATA[.c{fill:red}]]></style><g/></svg>`);
    const svg = doc.children[0];
    expect(svg.tag).toBe("svg");
    expect(svg.attrs).toMatchObject({ xmlns: "http://www.w3.org/2000/svg", a: "1 & 2", b: "AB" });
    expect(svg.children.map((c) => c.tag)).toEqual(["style", "g"]);
    expect(svg.children[0].text).toBe(".c{fill:red}");
  });

  it("strips the svg: prefix and tolerates unclosed tags", () => {
    const doc = parseXml(`<svg:svg><svg:g><svg:path d="M0 0"/>`);
    expect(doc.children[0].tag).toBe("svg");
    expect(doc.children[0].children[0].children[0].tag).toBe("path");
  });

  it("does not expand entities recursively and caps the element count", () => {
    const doc = parseXml(`<!DOCTYPE x [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;">]><svg t="&b;&a;"/>`);
    expect(doc.children[0].attrs.t).toBe("&b;aaaa");
    expect(() => parseXml("<svg>" + "<g/>".repeat(20) + "</svg>", 10)).toThrow(SvgImportError);
  });
});

describe("colours and transforms", () => {
  it("parses hex, rgb, hsl, names and transparency", () => {
    expect(parseColor("#f00")).toBe("#FF0000");
    expect(parseColor("#00e000")).toBe("#00E000");
    expect(parseColor("rgb(0, 0, 255)")).toBe("#0000FF");
    expect(parseColor("rgb(100%, 50%, 0%)")).toBe("#FF8000");
    expect(parseColor("hsl(120, 100%, 50%)")).toBe("#00FF00");
    expect(parseColor("Black")).toBe("#000000");
    expect(parseColor("none")).toBeNull();
    expect(parseColor("rgba(0,0,0,0)")).toBeNull();
    expect(parseColor("#12345")).toBeUndefined();
  });

  it("composes transform lists left to right", () => {
    const m = parseTransform("translate(10 20) scale(2)");
    expect(m).toEqual([2, 0, 0, 2, 10, 20]);
    const r = parseTransform("rotate(90 10 10)");
    expect(r.map((v) => Math.round(v * 1e9) / 1e9 + 0)).toEqual([0, 1, -1, 0, 20, 0]);
    expect(parseTransform("matrix(1,0,0,1,5,6) skewX(0)")).toEqual([1, 0, 0, 1, 5, 6]);
  });
});

describe("parsePathData", () => {
  it("handles absolute and relative lines, H/V and closing", () => {
    const s = parsePathData("M10 10 h20 v20 H10 z m5 5 l1 0 0 1 z");
    expect(s).toHaveLength(2);
    expect(s[0].closed).toBe(true);
    expect(s[0].nodes.map((a) => [a.x, a.y])).toEqual([[10, 10], [30, 10], [30, 30], [10, 30]]);
    expect(s[1].nodes.map((a) => [a.x, a.y])).toEqual([[15, 15], [16, 15], [16, 16]]);
  });

  it("turns quadratics into cubics and reflects S/T controls", () => {
    const [q] = parsePathData("M0 0 Q 30 30 60 0 T 120 0");
    expect(q.nodes).toHaveLength(3);
    expect(q.nodes[0].o).toEqual({ x: 20, y: 20 });
    expect(q.nodes[1].o!.y).toBeCloseTo(-20);
    const [c] = parsePathData("M0 0 C 0 10 10 10 10 0 S 20 -10 20 0");
    expect(c.nodes[1].o).toEqual({ x: 10, y: -10 });
  });

  it("converts arcs with packed flags and ends exactly on the target", () => {
    const [a] = parsePathData("M0 0a10 10 0 1110 10");
    const last = a.nodes[a.nodes.length - 1];
    expect([last.x, last.y]).toEqual([10, 10]);
    const [circle] = parsePathData("M-10 0 A10 10 0 1 0 10 0 A10 10 0 1 0 -10 0 Z");
    expect(circle.closed).toBe(true);
    expect(box([circle])).toEqual([-10, -10, 10, 10]);
  });

  it("keeps what came before an error", () => {
    const s = parsePathData("M0 0 L10 0 L10 x10 L0 10");
    expect(s[0].nodes).toHaveLength(2);
  });
});

describe("importSvg geometry and units", () => {
  it("maps width/height in mm through the viewBox", () => {
    const r = imp(`<svg width="100mm" height="50mm" viewBox="0 0 200 100"><rect x="20" y="20" width="100" height="40" stroke="#f00" fill="none"/></svg>`);
    expect(r.page).toEqual({ w: 100, h: 50 });
    expect(box((r.group!.children[0] as PathNode).subpaths)).toEqual([10, 10, 60, 30]);
  });

  it("reads px at 96 per inch, and at 72 for Illustrator files", () => {
    const plain = imp(`<svg width="96px" height="96px"><line x1="0" y1="0" x2="96" y2="0" stroke="#000"/></svg>`);
    expect(plain.page.w).toBeCloseTo(25.4);
    const ai = imp(`<!-- Generator: Adobe Illustrator 16.0.0, SVG Export Plug-In --><svg width="72px" height="72px" viewBox="0 0 72 72"><line x1="0" y1="0" x2="72" y2="0" stroke="#000"/></svg>`);
    expect(ai.dpi).toBe(72);
    expect(ai.page.w).toBeCloseTo(25.4);
    expect(box((ai.group!.children[0] as PathNode).subpaths)[2]).toBeCloseTo(25.4);
  });

  it("uses the viewBox size in px when width and height are missing", () => {
    const r = imp(`<svg viewBox="10 10 96 48"><circle cx="58" cy="34" r="10" stroke="red" fill="none"/></svg>`);
    expect(r.page.w).toBeCloseTo(25.4);
    expect(r.page.h).toBeCloseTo(12.7);
    const b = box((r.group!.children[0] as PathNode).subpaths);
    expect(b[0]).toBeCloseTo((38 * 25.4) / 96, 2);
  });

  it("applies nested group transforms, rounded rects, ellipses and polygons", () => {
    const ps = paths(`<svg width="200mm" height="200mm" viewBox="0 0 200 200" fill="none" stroke="#f00">
      <g transform="translate(100 0)"><g transform="scale(2)"><rect width="10" height="10" rx="2"/></g></g>
      <ellipse cx="50" cy="50" rx="20" ry="10"/><polygon points="0,0 10,0 5,8"/><polyline points="0 100 10 100 10 110"/></svg>`);
    expect(ps).toHaveLength(4);
    expect(box(ps[0].subpaths)).toEqual([100, 0, 120, 20]);
    expect(ps[0].subpaths[0].nodes).toHaveLength(8);
    expect(box(ps[1].subpaths)).toEqual([30, 40, 70, 60]);
    expect(ps[2].subpaths[0].closed).toBe(true);
    expect(ps[3].subpaths[0].closed).toBe(false);
    for (const p of ps) for (const s of p.subpaths) for (const seg of segments(s)) expect(Number.isFinite(seg.p3.x)).toBe(true);
  });

  it("instantiates <use> of elements and symbols, and ignores cycles and external references", () => {
    const ps = paths(`<svg width="100mm" height="100mm" viewBox="0 0 100 100" xmlns:xlink="http://www.w3.org/1999/xlink">
      <defs><rect id="r" width="10" height="10" stroke="red" fill="none"/><symbol id="s" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" stroke="blue" fill="none"/></symbol>
      <g id="loop"><use href="#loop"/></g></defs>
      <use xlink:href="#r" x="50" y="50"/><use href="#s" x="0" y="0" width="20" height="20"/><use href="#loop"/><use href="other.svg#x"/></svg>`);
    expect(ps).toHaveLength(2);
    expect(box(ps[0].subpaths)).toEqual([50, 50, 60, 60]);
    expect(box(ps[1].subpaths)).toEqual([0, 0, 20, 20]);
    expect(ps[1].layer).toBe(1);
  });
});

describe("importSvg styles and layers", () => {
  it("resolves CSS classes, inline styles and inheritance like CorelDRAW exports", () => {
    const r = imp(`<svg width="10mm" height="10mm" viewBox="0 0 10 10"><style>.str0{stroke:#2B2A29;stroke-width:0.02}.fil0{fill:none}.fil1{fill:#2B2A29}</style>
      <path class="str0 fil0" d="M0 0 L10 0 L10 10 Z"/><path class="fil1" d="M2 2 L4 2 L4 4 Z"/><g style="stroke:#00E000;fill:none"><path d="M5 5 L6 6"/></g></svg>`);
    const ps = r.group!.children as PathNode[];
    expect(ps.map((p) => p.layer)).toEqual([2, 0, 3]);
    expect(r.layers.find((l) => l.color === "#2B2A29" && l.paint === "stroke")?.layer).toBe(2);
    expect(r.openCuts).toBe(1);
  });

  it("keeps LightBurn colours, puts black and other strokes on free cut layers and fills on C00", () => {
    const ps = paths(`<svg width="10mm" height="10mm" viewBox="0 0 10 10" fill="none">
      <path d="M0 0H1" stroke="black"/><path d="M0 1H1" stroke="#FF0000"/><path d="M0 2H1" stroke="#0000FF"/>
      <path d="M0 3H1" stroke="#123456"/><path d="M0 4H1V5Z" fill="#FF0000"/></svg>`);
    expect(ps.map((p) => p.layer)).toEqual([3, 2, 1, 4, 0]);
  });

  it("honours a fixed colour map", () => {
    const ps = paths(`<svg width="10mm" height="10mm" viewBox="0 0 10 10" fill="none"><path d="M0 0H1" stroke="#96d71d"/><path d="M0 1H1" stroke="#ff7f56"/></svg>`, {
      layerMap: { "#96D71D": 2, "#FF7F56": 1 },
    });
    expect(ps.map((p) => p.layer)).toEqual([2, 1]);
  });

  it("skips invisible, hidden and display:none objects", () => {
    const ps = paths(`<svg width="10mm" height="10mm" viewBox="0 0 10 10">
      <path d="M0 0H1V1Z" fill="none"/><path d="M0 0H1V1Z" style="display:none"/><g opacity="0"><path d="M0 0H1V1Z"/></g>
      <path d="M0 0H1V1Z" visibility="hidden"/><path d="M0 0H1V1Z" stroke="red" stroke-width="0" fill="none"/><path d="M0 0H2V2Z"/></svg>`);
    expect(ps).toHaveLength(1);
    expect(box(ps[0].subpaths)).toEqual([0, 0, 2, 2]);
  });
});

describe("svgDocument and thumbnail art", () => {
  const a = `<svg width="100mm" height="50mm" viewBox="0 0 100 50"><rect x="10" y="10" width="80" height="30" stroke="#f00" fill="none"/></svg>`;
  const b = `<svg width="40mm" height="40mm" viewBox="0 0 40 40"><circle cx="20" cy="20" r="15" stroke="#00f" fill="none"/></svg>`;

  it("puts each drawing on its own sheet with a margin, side by side", () => {
    const { doc, objects } = svgDocument([{ src: a, name: "Front" }, { src: b, name: "Wheel" }], { id: "local-x", name: "Kit", idFactory: id });
    expect(() => assertDocument(doc)).not.toThrow();
    expect(objects).toBe(2);
    expect(doc.sheets.map((s) => [s.name, s.x, s.w, s.h])).toEqual([["Front", 0, 110, 60], ["Wheel", 130, 50, 50]]);
    expect(doc.root.children.map((g) => g.transform)).toEqual([[1, 0, 0, 1, 5, 5], [1, 0, 0, 1, 135, 5]]);
  });

  it("sizes the sheet to the art when it spills over the page, and rejects empty drawings", () => {
    const spill = `<svg width="10mm" height="10mm" viewBox="0 0 10 10"><rect x="-20" y="0" width="50" height="5" stroke="red" fill="none"/></svg>`;
    const { doc } = svgDocument([{ src: spill }], { id: "local-y", name: "Spill", idFactory: id });
    expect([doc.sheets[0].w, doc.sheets[0].h]).toEqual([60, 15]);
    expect(doc.root.children[0].transform).toEqual([1, 0, 0, 1, 25, 5]);
    expect(() => svgDocument([{ src: `<svg width="5mm" height="5mm"><text>x</text></svg>` }], { id: "local-z", name: "Empty" })).toThrow(SvgImportError);
  });

  it("draws layer-coloured paths from numbers only", () => {
    const { doc } = svgDocument([{ src: a }], { id: "local-t", name: "T", idFactory: id });
    const art = documentArt(doc);
    expect(art).toMatch(/^<path d="M15 15L95 15L95 45L15 45(L15 15)?Z" fill="none" stroke="#FF0000"/);
    expect(inertSvgMarkup(documentThumbnail(doc, art))).toBeDefined();
  });
});

describe("importSvg safety and limits", () => {
  it("never carries scripts, handlers, foreignObject, text or images into the document", () => {
    const r = imp(`<svg width="10mm" height="10mm" viewBox="0 0 10 10" onload="alert(1)"><script>alert(1)</script>
      <foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject><text>Hi</text><image href="data:image/png;base64,AAAA"/>
      <path id="&lt;img src=x onerror=alert(1)&gt;" d="M0 0H5V5Z" onclick="alert(1)" stroke="red" fill="none"/></svg>`);
    expect(r.objects).toBe(1);
    const json = JSON.stringify(r.group);
    expect(json).not.toMatch(/script|onclick|onload|foreign|base64|[<>=]/i);
    expect(Object.keys(r.group!.children[0]).sort()).toEqual(["id", "layer", "name", "subpaths", "transform", "type"]);
    expect(r.warnings.join(" ")).toMatch(/1 text object was skipped/);
    expect(r.warnings.join(" ")).toMatch(/1 embedded image was skipped/);
  });

  it("rejects files that are not SVG and truncates huge drawings with a warning", () => {
    expect(() => imp("<html><body/></html>")).toThrow(SvgImportError);
    const many = `<svg width="10mm" height="10mm" viewBox="0 0 10 10">${'<path d="M0 0H1V1Z" stroke="red"/>'.repeat(30)}</svg>`;
    const r = imp(many, { maxObjects: 10 });
    expect(r.objects).toBe(10);
    expect(r.warnings[0]).toMatch(/only the first 10 objects/);
  });

  it("returns an empty import for a drawing with nothing to cut", () => {
    const r = imp(`<svg width="20mm" height="10mm"><text>only text</text></svg>`);
    expect(r.group).toBeNull();
    expect(r.page).toEqual({ w: 20, h: 10 });
  });
});
