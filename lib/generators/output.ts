/**
 * What the shell does with any generator's output: kerf (once), sheets, canvas layers, the layered
 * SVG and the sheet checks. Generators only return nominal parts.
 */
import { arrangeFit, type Arranged } from "@/lib/fit/arrange";
import { cleanFit } from "@/lib/fit/fitToSheets";
import { EXPORT_LAYERS } from "@/lib/hinge/export";
import type { BBox, LayerContent, LayerKey, Layout } from "@/lib/hinge/types";
import { r3 } from "@/lib/hinge/util";
import type { Issue } from "@/lib/issues";
import { offsetShapes, unionShapes } from "@/lib/letters/polygon";
import { bboxOf, pathD } from "./geom";
import type { BuildContext, Contour, GenBase, GenOutput, GenPart, GeneratorDef } from "./types";

/** Layer names in the generators' panels and SVG files (keys and colours shared with every product). */
export const GEN_LAYER_NAMES: Record<LayerKey, string> = {
  outline: "Outline cut",
  slots: "Inner cuts",
  hinge: "Score lines",
  labels: "Engrave",
};

export interface CutPart {
  src: GenPart;
  id: string;
  name: string;
  /** Outer cuts after kerf. */
  outline: Contour[];
  /** Closed inner cuts after kerf. */
  inner: Contour[];
  cuts: Contour[];
  score: Contour[];
  engrave: Contour[];
  bbox: BBox;
}

/** Kerf applied once: the part grows by K/2, so outlines move out and holes shrink. */
export function cutPart(p: GenPart, K: number): CutPart {
  let outline: Contour[] = [p.outer], inner: Contour[] = p.holes;
  if (K > 0) {
    const shapes = offsetShapes(unionShapes([p.outer, ...p.holes], [], true), K / 2);
    outline = shapes.map((s) => s.outer);
    inner = shapes.flatMap((s) => s.holes);
  }
  return {
    src: p, id: p.id, name: p.name, outline, inner,
    cuts: p.cuts ?? [], score: p.score ?? [], engrave: p.engrave ?? [],
    bbox: bboxOf(outline),
  };
}

export interface GenModel {
  parts: CutPart[];
  out: GenOutput;
}

export type GenArranged<P> = Arranged<P, GenModel, CutPart>;

/** Build at a scale and lay the parts out on sheets (Fit "off" packs at design size, like Auto). */
export function arrangeGenerator<P extends GenBase>(def: GeneratorDef<P>, p: P, ctx: BuildContext): GenArranged<P> {
  const fit = cleanFit(p.fit);
  const mode = fit.mode === "sheets" && def.scale ? "sheets" : "auto";
  return arrangeFit<P, GenModel, CutPart>({ mode, sheets: fit.sheets }, { w: p.bedW, h: p.bedH, gap: p.gap }, (s) => {
    const q = s === 1 || !def.scale ? p : def.scale(p, s);
    const out = def.build(q, ctx);
    if (out.error) return { params: q, result: { error: out.error } };
    return { params: q, result: { parts: out.parts.map((pt) => cutPart(pt, q.K)), out } };
  });
}

/** Canvas layers plus the engraved fills, in sheet coordinates. */
export function genContent(lay: Layout<CutPart>): LayerContent & { engrave: string[] } {
  const L: LayerContent & { engrave: string[] } = { outline: [], slots: [], hinge: [], labels: [], fills: [], engrave: [] };
  for (const { pt, ox, oy } of lay.items) {
    for (const c of pt.outline) L.outline.push(pathD(c, true, ox, oy));
    for (const c of pt.inner) L.slots.push(pathD(c, true, ox, oy));
    for (const c of pt.cuts) L.slots.push(pathD(c, false, ox, oy));
    for (const c of pt.score) L.hinge.push(pathD(c, false, ox, oy));
    L.fills.push([...pt.outline, ...pt.inner].map((c) => pathD(c, true, ox, oy)).join(" "));
    if (pt.engrave.length) L.engrave.push(pt.engrave.map((c) => pathD(c, true, ox, oy)).join(" "));
  }
  return L;
}

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

/**
 * One SVG for all sheets (stacked as on the canvas), in mm, one Inkscape layer per cut type in the
 * order a laser should run them: engrave, score, inner cuts, outline.
 */
export function genSVG<P extends GenBase>(def: GeneratorDef<P>, p: P, lay: Layout<CutPart>, comment = ""): string {
  const W = r3(lay.width), H = r3(lay.height);
  const C = genContent(lay);
  const parts = lay.items.map((it) => it.pt.name).join(", ");
  const note = `HingeLab ${def.name}: ${p.name}. ${def.summary(p)}. Material ${p.T} mm, kerf ${p.K} mm (compensated). Parts: ${parts}.${comment ? " " + comment : ""}`;
  let s = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">\n`;
  s += `<!-- ${esc(note).replace(/--/g, "- -")} -->\n`;
  const layer = (key: LayerKey, paths: string[], fill: boolean) => {
    if (!p.layers[key].exp || !paths.length) return;
    const def = EXPORT_LAYERS.find((l) => l.key === key)!;
    s += fill
      ? `<g id="${key}" inkscape:groupmode="layer" inkscape:label="${def.code} ${GEN_LAYER_NAMES[key]}" fill="${def.color}" fill-rule="evenodd" stroke="none">\n`
      : `<g id="${key}" inkscape:groupmode="layer" inkscape:label="${def.code} ${GEN_LAYER_NAMES[key]}" fill="none" stroke="${def.color}" stroke-width="0.1">\n`;
    for (const d of paths) s += `  <path d="${d}"/>\n`;
    s += `</g>\n`;
  };
  layer("labels", C.engrave, true);
  layer("hinge", C.hinge, false);
  layer("slots", C.slots, false);
  layer("outline", C.outline, false);
  return s + `</svg>\n`;
}

/** Checks every generator gets: parts larger than the sheet. */
export function sheetIssues<P extends GenBase>(def: GeneratorDef<P>, p: P, arranged: GenArranged<P>): Issue<P>[] {
  const out: Issue<P>[] = [];
  const fit = arranged.fit;
  if (fit && !fit.fits && arranged.lay) {
    const fixes: Issue<P>["fixes"] = [];
    if (def.scale) fixes.push({ id: "fit-1", label: "Fit to 1 sheet", safe: true, apply: (q) => ({ ...q, fit: { mode: "sheets", sheets: 1 } }) });
    fixes.push({ id: "big-sheet", label: "Use a 600 × 400 mm sheet", safe: false, apply: (q) => ({ ...q, bedW: Math.max(q.bedW, 600), bedH: Math.max(q.bedH, 400) }) });
    out.push({ code: "TOO_BIG", level: "error", message: "A part is larger than the sheet.", fixes });
  }
  return out;
}

/** Parts in sheet coordinates for the "lay flat" 3D view. */
export function flatOf(lay: Layout<CutPart>) {
  return lay.items.map(({ pt, ox, oy }) => ({
    name: pt.name,
    outer: (pt.outline[0] ?? []).map(([x, y]) => [x + ox, y + oy] as [number, number]),
    holes: [...pt.outline.slice(1), ...pt.inner].map((c) => c.map(([x, y]) => [x + ox, y + oy] as [number, number])),
  }));
}
