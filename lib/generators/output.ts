/**
 * What the shell does with any generator's output: kerf (once), sheets, canvas layers, the layered
 * SVG and the sheet checks. Generators only return nominal parts.
 */
import { arrangeFit, SHEET_EDGE, type Arranged } from "@/lib/fit/arrange";
import { outlinePacker } from "@/lib/fit/outlinePack";
import { CAL_H, CAL_STRIP, calibrationBar } from "@/lib/fit/calibration";
import { cleanFit, packBoxes, type Packed, type SheetSpec } from "@/lib/fit/fitToSheets";
import { EXPORT_LAYERS } from "@/lib/hinge/export";
import type { BBox, LayerContent, LayerKey, Layout } from "@/lib/hinge/types";
import { r3 } from "@/lib/hinge/util";
import type { Issue } from "@/lib/issues";
import { differenceShapes, offsetShapes, shapeContours, unionShapes } from "@/lib/letters/polygon";
import { offsetShapesXY } from "@/lib/materials/kerf";
import { rotatePoint } from "@/lib/nest/outline";
import { finLabel } from "@/lib/parametric/label";
import { isImageDataURL, xmlCommentText } from "@/lib/security/svg";
import { repairLayout, type RepairCount } from "@/lib/fab/repair";
import { bboxOf, pathD } from "./geom";
import { setPath } from "./path";
import { MAX_BATCH, MAX_BATCH_TEXT, MAX_COPIES, MAX_FEATURE, MAX_KERF, SHEET_EXTRAS, type BuildContext, type Contour, type GenBase, type GenImage, type GenOutput, type GenPart, type GeneratorDef, type JobExtras, type SheetExtras } from "./types";

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
  /** The part's material name, in designs that mix two materials. */
  tag?: string;
  /** Kerf across cuts along Y and along X, when they differ (a quarter turn compensates again). */
  kerf?: [number, number];
}

function compensate(outer: Contour, holes: Contour[], kx: number, ky: number) {
  if (kx <= 0 && ky <= 0) return { outline: [outer], inner: holes };
  const shapes = kx === ky
    ? offsetShapes(unionShapes([outer, ...holes], [], true), kx / 2)
    : offsetShapesXY(unionShapes([outer, ...holes], [], true), kx / 2, ky / 2);
  return { outline: shapes.map((s) => s.outer), inner: shapes.flatMap((s) => s.holes) };
}

/**
 * Kerf applied once: the part grows by K/2, so outlines move out and holes shrink. With `Ky` the
 * growth is K/2 across vertical edges and Ky/2 across horizontal ones.
 */
export function cutPart(p: GenPart, K: number, Ky = K): CutPart {
  const { outline, inner } = compensate(p.outer, p.holes, K, Ky);
  return {
    src: p, id: p.id, name: p.name, outline, inner,
    cuts: p.cuts ?? [], score: p.score ?? [], engrave: p.engrave ?? [], images: p.images ?? [],
    bbox: bboxOf(outline),
    ...(K !== Ky ? { kerf: [K, Ky] as [number, number] } : {}),
  };
}

export interface GenModel {
  parts: CutPart[];
  out: GenOutput;
}

/** `repaired`: what the clean-up removed, when it is on. */
export type GenArranged<P> = Arranged<P, GenModel, CutPart> & { repaired?: RepairCount };

/** A copy of the part turned by `angle` degrees about its origin (pictures cannot turn: such parts stay upright). */
export function turnCutPart(pt: CutPart, angle: number): CutPart {
  if (!angle) return pt;
  const r = (cs: Contour[]) => cs.map((c) => c.map((q) => rotatePoint(q, angle)));
  if (pt.kerf && angle % 180 !== 0) {
    // Its vertical edges become horizontal on the sheet: compensate the turned nominal part again.
    const [o] = r([pt.src.outer]);
    const { outline, inner } = compensate(o, r(pt.src.holes), pt.kerf[0], pt.kerf[1]);
    return { ...pt, outline, inner, cuts: r(pt.cuts), score: r(pt.score), engrave: r(pt.engrave), bbox: bboxOf(outline), turned: angle };
  }
  const outline = r(pt.outline);
  return { ...pt, outline, inner: r(pt.inner), cuts: r(pt.cuts), score: r(pt.score), engrave: r(pt.engrave), bbox: bboxOf(outline), turned: angle };
}

/** A part mirrored left to right (for engraving the back of clear acrylic). */
export function mirrorCutPart(pt: CutPart): CutPart {
  const m = (cs: Contour[]) => cs.map((c) => c.map(([x, y]) => [-x, y] as [number, number]).reverse());
  const outline = m(pt.outline);
  return {
    ...pt, outline, inner: m(pt.inner), cuts: m(pt.cuts), score: m(pt.score), engrave: m(pt.engrave),
    images: pt.images.map((im) => ({ ...im, x: -(im.x + im.w), clip: im.clip ? m([im.clip])[0] : undefined, flip: !im.flip })),
    bbox: bboxOf(outline),
  };
}

/** Saved job options, cleaned: the batch as a list of names. */
export function cleanJob(x: unknown): { mirror: boolean; names: string[] } {
  const q = (x && typeof x === "object" ? x : {}) as Partial<JobExtras>;
  const names = typeof q.names === "string" ? q.names.slice(0, MAX_BATCH_TEXT).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, MAX_BATCH) : [];
  return { mirror: q.mirror === true, names };
}

/** Saved sheet extras, cleaned (old saves have none). */
export function cleanExtras(x: unknown): SheetExtras {
  const q = (x && typeof x === "object" ? x : {}) as Partial<SheetExtras>;
  const copies = typeof q.copies === "number" && Number.isFinite(q.copies) ? Math.max(1, Math.min(MAX_COPIES, Math.round(q.copies))) : 1;
  const len = (v: unknown, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(hi, v)) : undefined);
  const out: SheetExtras = { nest: q.nest === "outline" ? "outline" : "box", calibration: q.calibration === true, labels: q.labels === true, copies };
  // The material settings stay missing in saves that never had them.
  if (q.kerfXY !== undefined) out.kerfXY = q.kerfXY === true;
  const ky = len(q.kerfY, MAX_KERF), mf = len(q.minFeature, MAX_FEATURE);
  if (ky !== undefined) out.kerfY = ky;
  if (mf !== undefined) out.minFeature = mf;
  if (q.rotate === "half" || q.rotate === "none") out.rotate = q.rotate;
  if (q.repair === true) out.repair = true;
  return out;
}

/** The turns outline nesting may give a part, by the material's grain. */
export const nestTurns = (x: SheetExtras): number[] => (x.rotate === "none" ? [0] : x.rotate === "half" ? [0, 180] : [0, 90, 180, 270]);

/**
 * The layout's parts at their nominal (design) size, before kerf: each rebuilt from its source and
 * mirrored and turned as on the sheet, in the same place. For the canvas's Nominal view; files are
 * always cut from the compensated parts.
 */
export function nominalLayout(lay: Layout<CutPart>, mirror = false): Layout<CutPart> {
  return {
    ...lay,
    items: lay.items.map((it) => {
      if (it.i < 0) return it;
      let n = cutPart(it.pt.src, 0, 0);
      if (mirror) n = mirrorCutPart(n);
      if (it.pt.turned) n = turnCutPart(n, it.pt.turned);
      return { ...it, pt: { ...it.pt, outline: n.outline, inner: n.inner } };
    }),
  };
}

/** The kerf across cuts along Y and along X. */
export function kerfOf(p: GenBase): [number, number] {
  const x = cleanExtras(p.sheet);
  return [p.K, x.kerfXY ? x.kerfY ?? p.K : p.K];
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

/** The first assembly step when parts are packed touching (Spacing 0). */
export const SHARED_LINES_STEP = "The parts touch on the sheet (Spacing 0), so their shared lines are cut once: lift each group out whole, then press the parts apart along those lines.";

/** A design's assembly steps as shown, with the shared-line step first when the parts touch. */
export function assemblySteps(steps: string[] | undefined, gap: number): string[] {
  return gap === 0 ? [SHARED_LINES_STEP, ...(steps ?? [])] : steps ?? [];
}

/** `n` sets of the parts, set by set (ids stay unique; names stay the same, so labels match the assembly). */
export function copiesOf(parts: CutPart[], n: number): CutPart[] {
  const out: CutPart[] = [];
  for (let k = 0; k < n; k++) for (const pt of parts) out.push(k ? { ...pt, id: `${pt.id}~${k + 1}` } : pt);
  return out;
}

const pid = (i: number) => String(i).padStart(4, "0");

type Packer = (parts: CutPart[], s: SheetSpec) => Packed;

/** The stock a part is cut from: the second material, or its own stock (a colour of card), else the main material. */
export const stockKey = (pt: CutPart) => (pt.src.material === "second" ? "\u0001second" : pt.src.stock ?? "");

/** Packs each stock's parts on their own sheets (main material first), tagging the sheets with the stock. */
export function byMaterial(base: Packer): Packer {
  return (parts, s) => {
    const keys = [...new Set(parts.map(stockKey))];
    if (keys.length < 2) return base(parts, s);
    // The main material first, its own stocks in the order they appear, the second material last.
    keys.sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.startsWith("\u0001") ? 1 : b.startsWith("\u0001") ? -1 : 0));
    const groups = keys.map((k) => parts.map((_, i) => i).filter((i) => stockKey(parts[i]) === k));
    const out: Packed = { sheets: [], tooBig: [] };
    for (const g of groups) {
      if (!g.length) continue;
      const r = base(g.map((i) => parts[i]), s);
      const map = (id: string) => pid(g[Number(id)]);
      const tag = parts[g[0]].tag;
      out.sheets.push(...r.sheets.map((sh) => ({ ...sh, tag, items: sh.items.map((it) => ({ ...it, id: map(it.id) })) })));
      out.tooBig.push(...r.tooBig.map(map));
    }
    return out;
  };
}

const MAX_BATCH_PARTS = 2000;

const boxPacker: Packer = (parts, s) => packBoxes(parts.map((pt, i) => ({ id: pid(i), w: pt.bbox.x1 - pt.bbox.x0, h: pt.bbox.y1 - pt.bbox.y0 })), s);

/**
 * The design built once, or once per name of a batch (each name in the generator's batch text
 * field): the parts of every build together, named after their line, with the first build's stats.
 */
export function buildBatch<P extends GenBase>(def: GeneratorDef<P>, q: P, ctx: BuildContext, names: string[]): GenOutput {
  const key = names.length ? def.batch?.(q) : null;
  if (!key) return def.build(q, ctx);
  const head = def.build(setPath(q, key, names[0]), ctx);
  if (head.error) return head;
  if (head.parts.length * names.length > MAX_BATCH_PARTS) {
    return { ...head, parts: [], error: `A batch of ${names.length} would cut ${head.parts.length * names.length} parts; the limit is ${MAX_BATCH_PARTS}. Use fewer names or a simpler design.` };
  }
  const outs = [head, ...names.slice(1).map((n) => def.build(setPath(q, key, n), ctx))];
  const bad = outs.find((o) => o.error);
  if (bad) return bad;
  const first = outs[0];
  const missing = [...new Set(outs.flatMap((o) => o.missing ?? []))];
  return {
    ...first,
    parts: outs.flatMap((o, k) => o.parts.map((pt) => ({ ...pt, id: `${pt.id}~n${k + 1}`, name: `${pt.name} (${names[k]})`, place: pt.place }))),
    stats: [...first.stats, { label: "Batch", value: `${names.length} name${names.length > 1 ? "s" : ""}, one set each` }],
    notice: outs.find((o) => o.notice)?.notice,
    missing,
  };
}

/** Build at a scale and lay the parts out on sheets (Fit "off" packs at design size, like Auto). */
export function arrangeGenerator<P extends GenBase>(def: GeneratorDef<P>, p: P, ctx: BuildContext): GenArranged<P> {
  const fit = cleanFit(p.fit);
  const x = cleanExtras(p.sheet);
  const job = cleanJob(p.job);
  const mode = fit.mode === "sheets" && def.scale ? "sheets" : "auto";
  const a: GenArranged<P> = arrangeFit<P, GenModel, CutPart>({ mode, sheets: fit.sheets }, { w: p.bedW, h: p.bedH, gap: p.gap }, (s) => {
    const q = s === 1 || !def.scale ? p : def.scale(p, s);
    const out = buildBatch(def, q, ctx, job.names);
    if (out.error) return { params: q, result: { error: out.error } };
    const mixed = out.parts.some((pt) => pt.material === "second") || new Set(out.parts.map((pt) => pt.stock ?? "")).size > 1;
    const names = { main: out.materials?.main ?? `Main material ${q.T} mm`, second: out.materials?.second ?? "Second material" };
    const [kx, ky] = kerfOf(q);
    let parts = out.parts.map((pt) => {
      if (!mixed) return cutPart(pt, kx, ky);
      const two = pt.material === "second";
      return { ...(two && out.materials?.secondK != null ? cutPart(pt, out.materials.secondK) : cutPart(pt, kx, ky)), tag: two ? names.second : pt.stock ?? names.main };
    });
    if (job.mirror) parts = parts.map(mirrorCutPart);
    return { params: q, result: { parts: x.copies > 1 ? copiesOf(parts, x.copies) : parts, out } };
  }, {
    pack: byMaterial(x.nest === "outline" ? outlinePacker<CutPart>((pt) => (pt.images.length || pt.src.upright ? [0] : nestTurns(x)), boxPacker) : boxPacker),
    turn: turnCutPart,
    reserve: x.calibration ? CAL_STRIP : 0,
  });
  if (!a.lay || !a.sheets || "error" in a.result) return a;
  if (x.repair) {
    const r = repairLayout(a.lay);
    a.lay = r.lay;
    a.repaired = r.count;
  }
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

export interface SheetImage { href: string; x: number; y: number; w: number; h: number; clip?: string; flip?: boolean }
/** SVG transform that mirrors a picture in place. */
export const flipTransform = (im: SheetImage) => `translate(${r3(2 * im.x + im.w)} 0) scale(-1 1)`;
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
    for (const im of pt.images) if (!im.only3d && isImageDataURL(im.href)) L.images.push({ href: im.href, x: r3(im.x + ox), y: r3(im.y + oy), w: r3(im.w), h: r3(im.h), clip: im.clip ? pathD(im.clip, true, ox, oy) : undefined, ...(im.flip ? { flip: true } : {}) });
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
  const tags = [...new Set(lay.items.map((it) => it.pt.tag).filter((t): t is string => !!t))];
  const untagged = lay.items.filter((it) => !it.pt.tag).map((it) => it.pt.name);
  const parts = tags.length > 1
    ? tags.map((t) => `${t}: ${lay.items.filter((it) => it.pt.tag === t).map((it) => it.pt.name).join(", ")}`).join("; ") + " (each material or stock on its own sheets)" + (untagged.length ? `; ${untagged.join(", ")}` : "")
    : lay.items.map((it) => it.pt.name).join(", ");
  const [kx, ky] = kerfOf(p);
  const kerf = kx === ky ? `kerf ${p.K} mm` : `kerf ${kx} mm across vertical edges and ${ky} mm across horizontal ones`;
  const tidy = cleanExtras(p.sheet).repair ? " Cut paths cleaned up (repeated points, empty shapes and lines cut twice removed)." : "";
  const note = `HingeLab ${def.name}: ${p.name}. ${def.summary(p)}. Material ${p.T} mm, ${kerf} (compensated). Parts: ${parts}.${tidy}${comment ? " " + comment : ""}`;
  let s = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"${C.images.length ? ' xmlns:xlink="http://www.w3.org/1999/xlink"' : ""} width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">\n`;
  s += `<!-- ${xmlCommentText(esc(note))} -->\n`;
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
      if (!im.flip) s += `  <image x="${im.x}" y="${im.y}" width="${im.w}" height="${im.h}" preserveAspectRatio="none"${im.clip ? ` clip-path="url(#engrave-clip-${i})"` : ""} href="${esc(im.href)}" xlink:href="${esc(im.href)}"/>\n`;
      // A clip on the image itself would be mirrored with it, so it goes on a group.
      else s += `  <g${im.clip ? ` clip-path="url(#engrave-clip-${i})"` : ""}><image x="${im.x}" y="${im.y}" width="${im.w}" height="${im.h}" preserveAspectRatio="none" transform="${flipTransform(im)}" href="${esc(im.href)}" xlink:href="${esc(im.href)}"/></g>\n`;
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
    // Nesting keeps the design's size; resizing changes what the design is, so it is never a safe fix.
    fixes.push({ id: "auto-sheets", label: "Nest on as many sheets as needed", safe: true, apply: (q) => ({ ...q, fit: { mode: "auto", sheets: 1 } }) });
    if (def.scale) fixes.push({ id: "fit-1", label: "Resize to fit 1 sheet", safe: false, apply: (q) => ({ ...q, fit: { mode: "sheets", sheets: 1 } }) });
    fixes.push({ id: "big-sheet", label: "Use a 600 × 400 mm sheet", safe: false, apply: (q) => ({ ...q, bedW: Math.max(q.bedW, 600), bedH: Math.max(q.bedH, 400) }) });
    const big = arranged.lay.items.filter((it) => it.w > p.bedW + 1e-6 || it.h > p.bedH + 1e-6).map((it) => it.pt.src.id);
    out.push({ code: "TOO_BIG", level: "error", message: "A part is larger than the sheet.", fixes, ...(big.length ? { partIds: [...new Set(big)] } : {}) });
  }
  const w = cleanExtras(p.sheet).minFeature ?? 0;
  if (w > 0 && arranged.result && !("error" in arranged.result)) {
    const found = thinPartList(arranged.result.parts, w);
    if (found.length) {
      const thin = found.map((t) => t.name);
      const list = thin.length > 4 ? `${thin.slice(0, 4).join(", ")} and ${thin.length - 4} more` : thin.join(", ");
      out.push({ code: "THIN", level: "warn", message: `Some features are narrower than the ${r3(w)} mm your material holds: ${list}. They may break or burn away.`, fixes: [], partIds: found.map((t) => t.id) });
    }
  }
  return out;
}

/** Most parts the narrow-feature check looks at (it offsets each part twice). */
const MAX_THIN_PARTS = 150;

/**
 * Names of parts with a bar, tab or spike narrower than `w`: opening the part (in by w/2, out again)
 * removes such features, so a removed piece larger than w² is one (a corner only loses ~0.05 w²).
 */
export function thinParts(parts: CutPart[], w: number): string[] {
  return thinPartList(parts, w).map((t) => t.name);
}

/** `thinParts` with each part's id (the part as built, shared by its copies). */
function thinPartList(parts: CutPart[], w: number): { name: string; id: string }[] {
  const out: { name: string; id: string }[] = [];
  const seen = new Set<string>();
  for (const pt of parts.slice(0, MAX_THIN_PARTS)) {
    const key = pt.src.id;
    if (seen.has(key) || pt.id.includes("~")) continue;
    seen.add(key);
    const shape = unionShapes([...pt.outline, ...pt.inner], [], true);
    const opened = offsetShapes(offsetShapes(shape, -w / 2), w / 2);
    const lost = differenceShapes(shapeContours(shape), shapeContours(opened));
    if (lost.some((s) => s.area > w * w)) out.push({ name: pt.name, id: key });
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
