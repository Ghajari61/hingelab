/**
 * The AI designer's example library, without storage: an uploaded cut file becomes a clean drawing
 * in mm (only geometry and layer colours survive), a PNG the model can look at, and the examples
 * that fit a request are chosen by their words.
 */
import { Resvg } from "@resvg/resvg-js";
import type { UserContent } from "ai";
import { importSvg, SvgImportError } from "@/lib/studio/svgImport";
import { pathD } from "@/lib/studio/geom";
import { LAYER_COLORS } from "@/lib/studio/cutLayers";
import { escapeXml, inertSvgMarkup } from "@/lib/security/svg";

export class ExampleError extends Error {}

export interface CleanExample {
  svg: string;
  /** Size of the drawing, mm. */
  width: number;
  height: number;
  objects: number;
  warnings: string[];
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** The cut file redrawn from its geometry: fills engrave in black, strokes keep their LightBurn layer colour. */
export function cleanExampleSvg(src: string, title: string): CleanExample {
  let imp;
  try {
    imp = importSvg(src, { maxObjects: 20_000, maxAnchors: 200_000 });
  } catch (e) {
    if (e instanceof SvgImportError) throw new ExampleError("This file is not an SVG drawing.");
    throw e;
  }
  if (!imp.group) throw new ExampleError("The SVG has no shapes the laser can use. Convert text to paths and try again.");
  const b = imp.box;
  const w = b.maxX - b.minX, h = b.maxY - b.minY;
  if (!(w >= 1 && h >= 1 && w <= 5000 && h <= 5000)) throw new ExampleError("The drawing's size looks wrong. Save the SVG with its real size in mm.");
  const pad = Math.max(w, h) * 0.02;
  const stroke = r3(Math.max(w, h) / 250);
  const paths = imp.group.children.map((c) => {
    if (c.type !== "path") return "";
    const d = pathD(c.subpaths, 2);
    return c.layer === 0
      ? `<path d="${d}" fill="#000000" fill-rule="evenodd"/>`
      : `<path d="${d}" fill="none" stroke="${LAYER_COLORS[c.layer] ?? "#FF0000"}" stroke-width="${stroke}"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${r1(w + 2 * pad)}mm" height="${r1(h + 2 * pad)}mm" viewBox="${r3(b.minX - pad)} ${r3(b.minY - pad)} ${r3(w + 2 * pad)} ${r3(h + 2 * pad)}">`
    + `<title>${escapeXml(title)}</title>${paths}</svg>`;
  if (!inertSvgMarkup(svg)) throw new Error("example svg is not inert");
  return { svg, width: r1(w), height: r1(h), objects: imp.objects, warnings: imp.warnings };
}

/** The drawing as a PNG on white, at most `px` on its longest side. */
export function renderExample(svg: string, width: number, height: number, px = 768): Buffer {
  const img = new Resvg(svg, { fitTo: { mode: width >= height ? "width" : "height", value: px }, background: "#ffffff" }).render();
  return Buffer.from(img.asPng());
}

const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "about", "your", "you", "are", "was", "has", "have", "its", "his", "her",
  "make", "made", "want", "need", "like", "please", "some", "one", "two", "set", "size", "sized", "wide", "tall", "high", "long",
  "laser", "cut", "cuts", "cutting", "engrave", "engraved", "engraving", "score", "design", "designs", "file", "svg", "product",
  "wood", "wooden", "plywood", "mdf", "acrylic", "material", "thick", "thickness", "mm", "cm", "inch", "inches", "edit", "current", "brief", "name",
]);

/** Meaningful words of a text, lower case, simple plurals folded. */
export function exampleWords(s: string): string[] {
  return s.toLowerCase().split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !STOP.has(w))
    .map((w) => (/^[a-z]{3,}s$/.test(w) && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

/** The examples that fit a request best: title and tag words count double; at least one must clearly match. */
export function pickExamples<T extends { title: string; description: string; tags: string }>(list: T[], query: string, n = 2): T[] {
  const q = new Set(exampleWords(query));
  if (!q.size) return [];
  return list
    .map((e) => {
      let s = 0;
      for (const w of new Set(exampleWords(`${e.title} ${e.tags}`))) if (q.has(w)) s += 2;
      for (const w of new Set(exampleWords(e.description))) if (q.has(w)) s += 1;
      return { e, s };
    })
    .filter((x) => x.s >= 2)
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.e);
}

export interface ExampleShown {
  title: string;
  description: string;
  width: number;
  height: number;
  /** Base64 PNG of the cut file. */
  render: string;
  /** Base64 JPEG of the finished product. */
  photo?: string;
}

/** The examples as message parts that go before the customer's request. */
export function exampleContent(list: ExampleShown[]): UserContent {
  if (!list.length) return [];
  const parts: Exclude<UserContent, string> = [{
    type: "text",
    text: "Examples from this shop's library: finished products the shop made and sold, with a photo of the real product when there is one and its cut file (red cuts, blue scores, black engraves). "
      + "Learn from them how this shop designs: style, level of detail, proportions, sizes, how text sits, and what is cut, scored or engraved. "
      + "Do not copy an example; draw what the customer asks for below.",
  }];
  list.forEach((e, i) => {
    parts.push({ type: "text", text: `Example ${i + 1}: ${e.title} (${Math.round(e.width)} × ${Math.round(e.height)} mm)${e.description ? `. ${e.description}` : ""}` });
    if (e.photo) parts.push({ type: "text", text: "The finished product:" }, { type: "file", mediaType: "image/jpeg", data: e.photo });
    parts.push({ type: "text", text: "Its cut file:" }, { type: "file", mediaType: "image/png", data: e.render });
  });
  parts.push({ type: "text", text: "The customer's request:" });
  return parts;
}
