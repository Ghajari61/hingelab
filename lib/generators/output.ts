/**
 * What the shell does with any generator's output: kerf (once), sheets, canvas layers, the layered
 * SVG and the sheet checks. Generators only return nominal parts.
 */
import { arrangeFit, SHEET_EDGE, type Arranged } from "@/lib/fit/arrange";
import { outlinePacker } from "@/lib/fit/outlinePack";
import { CAL_H, CAL_STRIP, calibrationBar } from "@/lib/fit/calibration";
import { cleanFit } from "@/lib/fit/fitToSheets";
import { EXPORT_LAYERS } from "@/lib/hinge/export";
import type { BBox, LayerContent, LayerKey, Layout } from "@/lib/hinge/types";
import { r3 } from "@/lib/hinge/util";
import type { Issue } from "@/lib/issues";
import { differenceShapes, offsetShapes, shapeContours, unionShapes } from "@/lib/letters/polygon";
import { rotatePoint } from "@/lib/nest/outline";
import { finLabel } from "@/lib/parametric/label";
import { bboxOf, pathD } from "./geom";
import { MAX_COPIES, type BuildContext, type Contour, type GenBase, type GenImage, type GenOutput, type GenPart, type GeneratorDef, type SheetExtras } from "./types";

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
  images: GenImage[];
  bbox: BBox;
  /** Set on copies turned for outline nesting, degrees. */
  turned?: number;
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
    cuts: p.cuts ?? [], score: p.score ?? [], engrave: p.engrave ?? [], images: p.images ?? [],
    bbox: bboxOf(outline),
  };
}

export interface GenModel {
  parts: CutPart[];
  out: GenOutput;
}

export type GenArranged<P> = Arranged<P, GenModel, CutPart>;

/** A copy of the part turned by `angle` degrees about its origin (pictures cannot turn: such parts stay upright). */
export function turnCutPart(pt: CutPart, angle: number): CutPart {
  if (!angle) return pt;
  const r = (cs: Contour[]) => cs.map((c) => c.map((q) => rotatePoint(q, angle)));
  const outline = r(pt.outline);
  return { ...pt, outline, inner: r(pt.inner), cuts: r(pt.cuts), score: r(pt.score), engrave: r(pt.engrave), bbox: bboxOf(outline), turned: angle };
}

/** Saved sheet extras, cleaned (old saves have none). */
export function cleanExtras(x: unknown): SheetExtras {
  const q = (x && typeof x === "object" ? x : {}) as Partial<SheetExtras>;
  const copies = typeof q.copies === "number" && Number.isFinite(q.copies) ? Math.max(1, Math.min(MAX_COPIES, Math.round(q.copies))) : 1;
  return { nest: q.nest === "outline" ? "outline" : "box", calibration: q.calibration === true, labels: q.labels === true, copies };
}

/** The part's name in the single-stroke font, placed where it fits clear of cuts and engraving. */
export function partLabel(pt: CutPart): Contour[] {
  if (pt.cuts.length) return [];
  let shapes = unionShapes([...pt.outline, ...pt.inner], [], true);
  if (pt.engrave.length) shapes = differenceShapes(shapeContours(shapes), pt.engrave);
  if (!shapes.length) return [];
  const s = shapes.reduce((a, b) => (b.area > a.area ? b : a));
  return finLabel(s, pt.name, { arrow: false, nearWall: false }) ?? [];
}

/** `n` sets of the parts, set by set (ids stay unique; names stay the same, so labels match the assembly). */
export function copiesOf(parts: CutPart[], n: number): CutPart[] {
  const out: CutPart[] = [];
  for (let k = 0; k < n; k++) for (const pt of parts) out.push(k ? { ...pt, id: `${pt.id}~${k + 1}` } : pt);
  return out;
}

/** Build at a scale and lay the parts out on sheets (Fit "off" packs at design size, like Auto). */
export function arrangeGenerator<P extends GenBase>(def: GeneratorDef<P>, p: P, ctx: BuildContext): GenArranged<P> {
  const fit = cleanFit(p.fit);
  const x = cleanExtras(p.sheet);
  const mode = fit.mode === "sheets" && def.scale ? "sheets" : "auto";
  const a = arrangeFit<P, GenModel, CutPart>({ mode, sheets: fit.sheets }, { w: p.bedW, h: p.bedH, gap: p.gap }, (s) => {
    const q = s === 1 || !def.scale ? p : def.scale(p, s);
    const out = def.build(q, ctx);
    if (out.error) return { params: q, result: { error: out.error } };
    const parts = out.parts.map((pt) => cutPart(pt, q.K));
    return { params: q, result: { parts: x.copies > 1 ? copiesOf(parts, x.copies) : parts, out } };
  }, {
    pack: x.nest === "outline" ? outlinePacker<CutPart>((pt) => (pt.images.length ? [0] : [0, 90, 180, 270])) : undefined,
    turn: turnCutPart,
    reserve: x.calibration ? CAL_STRIP : 0,
  });
  if (!a.lay || !a.sheets || "error" in a.result) return a;
  if (x.labels) {
    a.lay = { ...a.lay, items: a.lay.items.map((it) => ({ ...it, pt: { ...it.pt, score: [...it.pt.score, ...partLabel(it.pt)] } })) };
  }
  if (x.calibration) {
    const items = [...a.lay.items];
    for (const sh of a.sheets) {
      const bar = calibrationBar(0, 0, sh.w - 2 * SHEET_EDGE, a.params.K);
      if (!bar.cut.length) continue;
      const pt: CutPart = {
        src: { id: "calibration", name: "Calibration bar", outer: bar.cut[0], holes: [] }, id: "calibration", name: "Calibration bar",
        outline: bar.cut, inner: [], cuts: [], score: bar.score, engrave: [], images: [], bbox: bboxOf([...bar.cut, ...bar.score]),
      };
      items.push({ pt, i: -1, w: pt.bbox.x1 - pt.bbox.x0, h: pt.bbox.y1 - pt.bbox.y0, ox: sh.x + SHEET_EDGE, oy: sh.y + sh.h - SHEET_EDGE - CAL_H });
    }
    a.lay = { ...a.lay, items };
  }
  return a;
}

export interface SheetImage { href: string; x: number; y: number; w: number; h: number; clip?: string }
export type GenContent = LayerContent & { engrave: string[]; images: SheetImage[] };

/** Canvas layers plus the engraved fills and pictures, in sheet coordinates. */
export function genContent(lay: Layout<CutPart>): GenContent {
  const L: GenContent = { outline: [], slots: [], hinge: [], labels: [], fills: [], engrave: [], images: [] };
  for (const { pt, ox, oy } of lay.items) {
    for (const c of pt.outline) L.outline.push(pathD(c, true, ox, oy));
    for (const c of pt.inner) L.slots.push(pathD(c, true, ox, oy));
    for (const c of pt.cuts) L.slots.push(pathD(c, false, ox, oy));
    for (const c of pt.score) L.hinge.push(pathD(c, false, ox, oy));
    L.fills.push([...pt.outline, ...pt.inner].map((c) => pathD(c, true, ox, oy)).join(" "));
    if (pt.engrave.length) L.engrave.push(pt.engrave.map((c) => pathD(c, true, ox, oy)).join(" "));
    for (const im of pt.images) L.images.push({ href: im.href, x: r3(im.x + ox), y: r3(im.y + oy), w: r3(im.w), h: r3(im.h), clip: im.clip ? pathD(im.clip, true, ox, oy) : undefined });
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
  let s = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"${C.images.length ? ' xmlns:xlink="http://www.w3.org/1999/xlink"' : ""} width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">\n`;
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
  if (p.layers.labels.exp && C.images.length) {
    const def = EXPORT_LAYERS.find((l) => l.key === "labels")!;
    s += `<defs>\n${C.images.map((im, i) => (im.clip ? `  <clipPath id="engrave-clip-${i}"><path d="${im.clip}"/></clipPath>\n` : "")).join("")}</defs>\n`;
    s += `<g id="labels-images" inkscape:groupmode="layer" inkscape:label="${def.code} ${GEN_LAYER_NAMES.labels} (picture)">\n`;
    C.images.forEach((im, i) => {
      s += `  <image x="${im.x}" y="${im.y}" width="${im.w}" height="${im.h}" preserveAspectRatio="none"${im.clip ? ` clip-path="url(#engrave-clip-${i})"` : ""} href="${im.href}" xlink:href="${im.href}"/>\n`;
    });
    s += `</g>\n`;
  }
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
