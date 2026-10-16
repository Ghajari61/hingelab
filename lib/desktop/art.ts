/**
 * The AI designer's drawings in the desktop workspace. A drawing travels as the designer wrote it
 * (shapes and texts in mm, see lib/ai/art.ts) and is rebuilt here on every change: scaled to the
 * width asked for, mirrored, with layers left out, and its closed cut outlines turned into parts of
 * the chosen material for the 3D view. The drawing itself is never changed here.
 */
import { artSchema, buildArt, cleanArt, svgOf, type Art, type ArtShape, type BuiltArt } from "@/lib/ai/art";
import { generatorScene } from "@/lib/generators/scene3d";
import type { Contour, GenPart } from "@/lib/generators/types";
import { MATERIALS } from "@/lib/hinge";
import { autoFixAll, type Issue } from "@/lib/issues";
import { addWatermark, needsWatermark, type Plan } from "@/lib/plans";
import { flatten, pathD, pointInRings, transformSubpaths } from "@/lib/studio/geom";
import { parsePathData } from "@/lib/studio/svgImport";
import type { Mat, Subpath, Vec } from "@/lib/studio/types";
import { applyFix, coerce, fileNameOf, modelPart, toIssues, type GenerateResult } from "./products";
import type { DField, DForm, DProduct, GenerateRequest, GenerateResponse } from "./types";

export interface ArtParams {
  name: string;
  art: Art;
  /** Width of the whole drawing in mm; the height follows. */
  width: number;
  mirror: boolean;
  engrave: boolean;
  score: boolean;
  material: string;
  T: number;
}

const MIN_W = 5;
const MAX_W = 3000;
const MAX_RINGS = 3000;

export const ART_PRODUCT: DProduct = {
  id: "art",
  name: "AI drawing",
  blurb: "An original design from the AI designer: resize it, choose the material and see its parts in 3D.",
  icon: "wand",
  presets: [],
  sections: [
    {
      id: "size", title: "Size", help: "The drawing scales as a whole, so width and height stay in proportion. Select a part in 3D and drag its handles to resize it.",
      fields: [
        { kind: "number", key: "width", label: "Width", unit: "mm", min: MIN_W, max: MAX_W, step: 1, help: "Width of the whole drawing. Everything scales with it, slots and holes too." },
        { kind: "number", key: "height", label: "Height", unit: "mm", min: MIN_W, max: MAX_W, step: 1, help: "Height of the whole drawing. The width follows, so the shape stays the same." },
        { kind: "toggle", key: "mirror", label: "Mirror", help: "Flip the drawing left to right, so engraving on the back of clear acrylic reads the right way from the front." },
      ],
    },
    {
      id: "layers", title: "Layers", help: "What goes into the file besides the cuts.",
      fields: [
        { kind: "toggle", key: "engrave", label: "Engraving", help: "Filled areas burned into the surface (black)." },
        { kind: "toggle", key: "score", label: "Score lines", help: "Thin lines marked on the surface (blue)." },
      ],
    },
    {
      id: "material", title: "Material", help: "The sheet you cut. Its thickness sets the parts in 3D and is checked against the slots the drawing was made for.",
      fields: [
        { kind: "choice", key: "material", label: "Material", options: Object.entries(MATERIALS).map(([v, m]) => ({ v, text: m.name })) },
        { kind: "number", key: "T", label: "Thick", unit: "mm", min: 0.5, max: 30, step: 0.1, help: "Thickness of the sheet. Slots between parts must be as wide as the sheet is thick." },
      ],
    },
  ],
};

const round = (n: number, k = 100) => Math.round(n * k) / k;
const words = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2 && w !== "brittle");

/** The catalog material of this thickness that shares the most words with `like`, or Custom. */
function materialOf(T: number, like: string): string {
  const want = new Set(words(like));
  let best = "custom", score = 0;
  for (const [id, m] of Object.entries(MATERIALS)) {
    if (m.T == null || Math.abs(m.T - T) > 0.01) continue;
    const s = words(m.name).filter((w) => want.has(w)).length;
    if (s > score) { best = id; score = s; }
  }
  return best;
}

const materialName = (p: ArtParams) => p.material !== "custom" && MATERIALS[p.material] ? MATERIALS[p.material].name : Math.abs(p.T - p.art.thickness) < 0.01 ? p.art.material : `${p.T} mm material`;

/** The settings sent by the app, each checked; the drawing must be one the designer could have made. */
async function readParams(raw: Record<string, unknown>): Promise<{ p: ArtParams; b: BuiltArt } | { error: string }> {
  const parsed = artSchema.safeParse(raw.art);
  if (!parsed.success) return { error: "This drawing could not be read. Open it again from the AI designer." };
  const art = cleanArt(parsed.data);
  if (!art.shapes.length && !art.texts.length) return { error: "This drawing is empty." };
  const b = await buildArt(art);
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const name = typeof raw.name === "string" ? raw.name.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120) : "";
  return {
    b,
    p: {
      name: name || art.name, art,
      width: round(num(raw.width, MIN_W, MAX_W, b.width)),
      mirror: bool(raw.mirror, false), engrave: bool(raw.engrave, true), score: bool(raw.score, true),
      material: typeof raw.material === "string" && Object.hasOwn(MATERIALS, raw.material) ? raw.material : materialOf(art.thickness, art.material),
      T: num(raw.T, 0.5, 30, art.thickness),
    },
  };
}

function changeArt(p: ArtParams, change: { key: string; value: unknown }): ArtParams | { error: string } {
  const f: DField | undefined = ART_PRODUCT.sections.flatMap((s) => s.fields).find((x) => x.key === change.key);
  if (!f) return { error: "Unknown setting." };
  const c = coerce(f, change.value);
  if ("error" in c) return c;
  if (change.key === "material") {
    const m = MATERIALS[c.v as string];
    return { ...p, material: c.v as string, ...(m?.T != null ? { T: m.T } : {}) };
  }
  if (change.key === "T") {
    const T = c.v as number;
    return { ...p, T, material: MATERIALS[p.material]?.T === T ? p.material : materialOf(T, MATERIALS[p.material]?.name ?? p.art.material) };
  }
  return { ...p, [change.key]: c.v };
}

// ---------------------------------------------------------------- Geometry

type Ring = { pts: Vec[]; area: number; box: [number, number, number, number] };

function ringOf(s: Subpath): Ring | null {
  const pts = flatten(s, 0.1);
  if (pts.length > 2 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-6) pts.pop();
  if (pts.length < 3) return null;
  let a = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  pts.forEach((q, i) => {
    const n = pts[(i + 1) % pts.length];
    a += q.x * n.y - n.x * q.y;
    x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y);
  });
  return { pts, area: Math.abs(a) / 2, box: [x0, y0, x1, y1] };
}

/** A subpath that ends where it starts is closed even without Z. */
const isClosed = (s: Subpath) => s.closed || (s.nodes.length > 2 && Math.hypot(s.nodes[0].x - s.nodes[s.nodes.length - 1].x, s.nodes[0].y - s.nodes[s.nodes.length - 1].y) < 0.01);

const boxIn = (a: Ring["box"], b: Ring["box"]) => a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3];

/** The smallest ring of `among` (sorted largest first, only those before `before`) holding ring `r`. */
function holder(r: Ring, among: Ring[], before = among.length): number {
  for (let j = before - 1; j >= 0; j--) {
    if (among[j].area > r.area && boxIn(r.box, among[j].box) && pointInRings(r.pts[0], [among[j].pts])) return j;
  }
  return -1;
}

export interface ArtGeometry {
  /** Parts at the drawing's own size: every outermost closed cut with everything cut inside it as holes. */
  parts: GenPart[];
  openCuts: number;
  cutRings: number;
}

/** The parts the cut layer makes, with the engraving on each. */
export function artGeometry(shapes: ArtShape[]): ArtGeometry {
  const subs = (layer: ArtShape["layer"]) => shapes.filter((s) => s.layer === layer).flatMap((s) => parsePathData(s.d));
  const cut = subs("cut");
  const openCuts = cut.filter((s) => !isClosed(s)).length;
  const rings = cut.filter(isClosed).map(ringOf).filter((r): r is Ring => !!r).sort((a, b) => b.area - a.area);
  if (rings.length > MAX_RINGS) return { parts: [], openCuts, cutRings: rings.length };
  const top: number[] = [];
  const holes = new Map<number, Contour[]>();
  const rootOf: number[] = [];
  rings.forEach((r, i) => {
    const j = holder(r, rings, i);
    rootOf[i] = j < 0 ? i : rootOf[j];
    if (j < 0) { top.push(i); holes.set(i, []); } else holes.get(rootOf[i])!.push(r.pts.map((q) => [q.x, q.y]));
  });
  const outers = top.map((i) => rings[i]);
  const engrave = new Map<number, Contour[]>();
  for (const s of subs("engrave").filter(isClosed)) {
    const r = ringOf(s);
    const k = r ? holder(r, outers) : -1;
    if (k >= 0) engrave.set(k, [...(engrave.get(k) ?? []), r!.pts.map((q) => [q.x, q.y])]);
  }
  const parts = top.map((i, k): GenPart => ({
    id: `part-${k + 1}`, name: `Part ${k + 1}`,
    outer: rings[i].pts.map((q) => [q.x, q.y]), holes: holes.get(i)!, engrave: engrave.get(k) ?? [],
  }));
  return { parts, openCuts, cutRings: rings.length };
}

/** Where a point of the drawing lands in the file: moved to the origin, scaled and maybe mirrored. */
function placement(b: BuiltArt, p: ArtParams): { m: Mat; w: number; h: number } {
  const s = p.width / b.box.w;
  const { x, y, w, h } = b.box;
  return { m: p.mirror ? [-s, 0, 0, s, (x + w) * s, -y * s] : [s, 0, 0, s, -x * s, -y * s], w: w * s, h: h * s };
}

const movePart = (part: GenPart, m: Mat): GenPart => {
  const t = (c: Contour): Contour => c.map(([x, y]) => [m[0] * x + m[4], m[3] * y + m[5]]);
  return { ...part, outer: t(part.outer), holes: part.holes.map(t), engrave: part.engrave?.map(t) };
};

// ---------------------------------------------------------------- Checks

function artIssues(p: ArtParams, b: BuiltArt, g: ArtGeometry): Issue<ArtParams>[] {
  const list: Issue<ArtParams>[] = [];
  const s = p.width / b.box.w;
  const slot = round(p.art.thickness * s);
  if (g.parts.length >= 2 && Math.abs(slot - p.T) > 0.05) {
    const fit = round(Math.min(MAX_W, Math.max(MIN_W, b.box.w * p.T / p.art.thickness)), 10);
    list.push({
      code: "slots", level: "warn",
      message: `The slots were drawn for ${p.art.thickness} mm material${Math.abs(s - 1) > 0.001 ? ` and are ${slot} mm wide at this size` : ""}, but the material is ${p.T} mm, so the parts will not fit together.`,
      fixes: [
        { id: "thickness", label: `Use ${slot} mm material`, safe: true, apply: (q) => ({ ...q, T: slot, material: materialOf(slot, MATERIALS[q.material]?.name ?? q.art.material) }) },
        { id: "size", label: `Resize for ${p.T} mm`, safe: false, apply: (q) => ({ ...q, width: fit }) },
      ],
    });
  }
  if (g.openCuts) list.push({ code: "open", level: "warn", message: `${g.openCuts} cut line${g.openCuts > 1 ? "s are" : " is"} not closed, so the laser will not cut a part free there. Ask the AI designer to close ${g.openCuts > 1 ? "them" : "it"}.`, fixes: [] });
  if (!g.cutRings && !g.openCuts) list.push({ code: "nocut", level: "info", message: "There is no cut outline: the laser only marks the surface.", fixes: [] });
  if (g.cutRings > MAX_RINGS) list.push({ code: "big", level: "info", message: "This drawing has too many cut shapes to show in 3D.", fixes: [] });
  if (b.lostTexts.length) list.push({ code: "text", level: "warn", message: `Some text could not be drawn in its font: ${b.lostTexts.join(", ")}.`, fixes: [] });
  return list;
}

function formOf(b: BuiltArt, p: ArtParams): DForm {
  const has = (layer: ArtShape["layer"]) => b.shapes.some((s) => s.layer === layer);
  const hidden = [...(has("engrave") ? [] : ["engrave"]), ...(has("score") ? [] : ["score"])];
  return { hidden, hiddenSections: hidden.length === 2 ? ["layers"] : [], labels: {}, values: { height: drawnHeight(b, p.width) } };
}

/** Height in mm when the drawing is scaled to `width`. */
function drawnHeight(b: BuiltArt, width: number): number {
  return b.box.h > 0 ? round(width * b.box.h / b.box.w) : round(width);
}

/** Width that gives the drawing this height, keeping its proportions. */
function widthForHeight(b: BuiltArt, height: number): number {
  const w = b.box.h > 0 ? height * b.box.w / b.box.h : height;
  return round(Math.min(MAX_W, Math.max(MIN_W, w)));
}

// ---------------------------------------------------------------- Generate

export async function generateArt(r: GenerateRequest, plan: Plan): Promise<GenerateResult> {
  if (typeof r.preset === "string") return { status: 400, body: { error: "Unknown preset." } };
  if (!r.params || typeof r.params !== "object") return { status: 400, body: { error: "Open an AI drawing from the AI designer." } };
  const read = await readParams(r.params as Record<string, unknown>);
  if ("error" in read) return { status: 400, body: { error: read.error } };
  const { b } = read;
  let p = read.p;
  if (r.change?.key === "height") {
    const f = ART_PRODUCT.sections.flatMap((s) => s.fields).find((x) => x.key === "height")!;
    const c = coerce(f, r.change.value);
    if ("error" in c) return { status: 400, body: { error: c.error } };
    p = { ...p, width: widthForHeight(b, c.v as number) };
  } else if (r.change) {
    const q = changeArt(p, r.change);
    if ("error" in q) return { status: 400, body: { error: q.error } };
    p = q;
  }
  const g = artGeometry(b.shapes);
  const issuesOf = (q: ArtParams) => artIssues(q, b, g);
  let applied: string[] = [];
  if (r.autofix) {
    const res = autoFixAll(p, issuesOf);
    p = res.params;
    applied = res.applied;
  } else if (r.fix) {
    ({ p, applied } = applyFix(p, issuesOf(p), r.fix));
  }

  const { m, w, h } = placement(b, p);
  const shapes = b.shapes
    .filter((s) => s.layer === "cut" || p[s.layer])
    .map((s) => ({ layer: s.layer, d: pathD(transformSubpaths(parsePathData(s.d), m), 2) }));
  const raw = svgOf({ name: p.name, material: materialName(p) }, shapes, { x: 0, y: 0, w, h });
  const watermark = needsWatermark(plan);
  const parts = g.parts.map((part) => movePart(p.engrave ? part : { ...part, engrave: [] }, m));
  const body: GenerateResponse = {
    product: "art", params: p as unknown as Record<string, unknown>, form: formOf(b, p),
    issues: toIssues(issuesOf(p)),
    stats: [
      { label: "Size", value: `${Math.round(w)} × ${Math.round(h)} mm` },
      { label: "Parts", value: String(g.parts.length) },
      { label: "Material", value: materialName(p) },
    ],
    summary: `${Math.round(w)} × ${Math.round(h)} mm · ${g.parts.length} part${g.parts.length === 1 ? "" : "s"}`,
    applied,
    svg: watermark ? addWatermark(raw) : raw, fileName: fileNameOf(p.name, "ai-design"),
    width: round(w), height: round(h), watermark,
    ...(parts.length ? modelPart(r, (e) => generatorScene({ parts, stats: [] }, p.T, e)) : {}),
  };
  return { status: 200, body };
}
