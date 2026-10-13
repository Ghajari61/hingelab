import { MATERIALS } from "@/lib/hinge/defaults";
import { makeShape, offsetShapes, shapeContours, unionShapes } from "@/lib/letters/polygon";
import type { Shape } from "@/lib/letters/types";
import { bboxOf, transform } from "../geom";
import { material2 } from "../material2";
import { isMotifId, motif, motifSize, type MotifId } from "../motifs";
import { orient, shapeOutline, type ShapeKind } from "../shapes";
import type { BuildContext, Contour, GenOutput, GenPart, Pt } from "../types";
import { textBlock, weld, withSticks, type StickSpec } from "../weld";
import type { TopperParams } from "./params";

export interface TopperInfo {
  /** Main topper size, mm (0 when the kit has none). */
  width: number;
  height: number;
  /** Text and motif block, before any border. */
  contentW: number;
  contentH: number;
  /** Widest name on a cupcake pick and the room for it, mm. */
  cupText: number;
  cupRoom: number;
  picks: number;
}

export type TopperOutput = GenOutput & { info?: TopperInfo };

const r0 = (v: number) => Math.round(v);
const move = (cs: Contour[], dx: number, dy: number) => cs.map((c) => c.map(([x, y]) => [x + dx, y + dy] as Pt));
const closed = (c: Contour): Contour => [...c, c[0]];

/** Where the motif goes around a text block w × h (centred on 0, 0). */
function placeMotif(id: MotifId, p: TopperParams["motif"], w: number, h: number, hasText: boolean): Contour[] {
  const s = motifSize(id, p.size), g = p.gap;
  if (!hasText || p.place === "behind") return motif(id, p.size);
  switch (p.place) {
    case "above": return motif(id, p.size, 0, -h / 2 - g - s.h / 2);
    case "below": return motif(id, p.size, 0, h / 2 + g + s.h / 2);
    case "left": return motif(id, p.size, -w / 2 - g - s.w / 2, 0);
    case "right": return motif(id, p.size, w / 2 + g + s.w / 2, 0);
    case "both": return [...motif(id, p.size, -w / 2 - g - s.w / 2, 0), ...motif(id, p.size, w / 2 + g + s.w / 2, 0, true)];
  }
}

/** Stick centre lines spread across `w`. */
function sticksFor(n: number, w: number, spread: number, s: Omit<StickSpec, "x">, cx = 0): StickSpec[] {
  if (n <= 0) return [];
  if (n === 1) return [{ ...s, x: cx }];
  const span = (w * spread) / 100;
  return Array.from({ length: n }, (_, i) => ({ ...s, x: cx - span / 2 + (span * i) / (n - 1) }));
}

/** Height of a pick of `kind` that is `w` wide. */
function pickHeight(kind: ShapeKind, w: number): number {
  switch (kind) {
    case "circle": case "star": case "scalloped": case "octagon": case "diamond": return w;
    case "heart": return w * 0.9;
    case "hexagon": return w * 0.87;
    case "cloud": case "banner": case "ticket": case "pill": case "tag": return w * 0.62;
    default: return w * 0.78;
  }
}

/** A shape's outline centred on (0, 0). */
function centred(kind: ShapeKind, w: number, h: number, r: number): Contour {
  return transform(shapeOutline(kind, w, h, r), { x: -w / 2, y: -h / 2 });
}

const partFrom = (s: Shape, base: Omit<GenPart, "outer" | "holes">): GenPart => ({ ...base, outer: s.outer, holes: s.holes });

function marks(p: TopperParams, cs: Contour[]): Pick<GenPart, "engrave" | "score"> {
  if (!cs.length || p.style.mark === "none") return {};
  const u = shapeContours(unionShapes(cs));
  return p.style.mark === "engrave" ? { engrave: u } : { score: u.map(closed) };
}

export function buildTopper(p: TopperParams, ctx: BuildContext): TopperOutput {
  if (!(p.T > 0)) return { parts: [], stats: [], error: "Set the material thickness." };
  const missing: string[] = [];
  const parts: GenPart[] = [];
  const m2 = material2(p.mat.mat2);
  const second = (pt: GenPart): GenPart => ({ ...pt, material: "second", color: m2.color, t: p.mat.T2 });
  const info: TopperInfo = { width: 0, height: 0, contentW: 0, contentH: 0, cupText: 0, cupRoom: 0, picks: 0 };
  let loading = false;
  let right = 0;

  if (p.kit.kind !== "cupcake") {
    const t = textBlock(ctx, p.text.text, p.text.fontId, p.text.size, { spacing: p.text.spacing, lead: p.text.lead, missing, style: p.textStyle });
    if (t.loading) loading = true;
    else {
      const mot = isMotifId(p.motif.kind) ? placeMotif(p.motif.kind, p.motif, t.width, t.height, t.contours.length > 0) : [];
      const all = [...t.contours, ...mot];
      if (!all.length) return { parts: [], stats: [], error: "Type some text or pick a motif." };
      const cb = bboxOf(all);
      info.contentW = cb.x1 - cb.x0;
      info.contentH = cb.y1 - cb.y0;
      const stick = { length: p.sticks.length, width: p.sticks.width, tip: p.sticks.tip };
      const cx = (cb.x0 + cb.x1) / 2;
      let back: Shape | null = null;
      let front: Shape | null = null;
      let faceMarks: Pick<GenPart, "engrave" | "score"> = {};
      switch (p.style.kind) {
        case "letters":
          back = weld(all, { border: Math.max(0.2, p.style.weld), minHole: 2, bridge: Math.max(2.5, p.style.weld * 2.5) });
          break;
        case "outline":
          back = weld(all, { border: Math.max(1, p.style.border), solid: true });
          faceMarks = marks(p, all);
          break;
        case "layered":
          back = weld(all, { border: Math.max(1.5, p.style.border), solid: true });
          front = weld(all, { border: Math.max(0.2, p.style.weld), minHole: 2, bridge: Math.max(2.5, p.style.weld * 2.5) });
          break;
        case "plate": {
          const pw = p.plate.auto ? info.contentW + 2 * p.plate.pad : p.plate.width;
          const ph = p.plate.auto ? info.contentH + 2 * p.plate.pad + (p.plate.shape === "arch" ? info.contentW * 0.12 : 0) : p.plate.height;
          const oy = p.plate.shape === "arch" && p.plate.auto ? -info.contentW * 0.06 : 0;
          const outline = orient(transform(shapeOutline(p.plate.shape, pw, ph, p.plate.corner), { x: cx - pw / 2, y: (cb.y0 + cb.y1) / 2 - ph / 2 + oy }));
          back = makeShape(outline, []);
          faceMarks = marks(p, all);
          if (p.plate.frame) {
            const inset = offsetShapes([back], -Math.max(3, Math.min(pw, ph) * 0.04));
            const ring = shapeContours(inset).map(closed);
            faceMarks = { ...faceMarks, score: [...(faceMarks.score ?? []), ...ring] };
          }
          break;
        }
      }
      if (back) {
        back = withSticks(back, sticksFor(p.sticks.count, info.contentW, p.sticks.spread, stick, cx));
        const b = bboxOf([back.outer]);
        info.width = b.x1 - b.x0;
        info.height = b.y1 - b.y0;
        right = b.x1;
        parts.push(partFrom(back, { id: "topper", name: p.style.kind === "layered" ? "Back layer" : "Topper", ...faceMarks, place: { x: 0, y: 0, z: 0 } }));
        if (front) parts.push(second(partFrom(front, { id: "front", name: "Front letters", place: { x: 0, y: 0, z: p.T } })));
      }
    }
  }

  if (p.kit.kind !== "topper") {
    const c = p.cupcake;
    const names = c.text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const icon = isMotifId(c.motif) ? c.motif : null;
    const silhouette = c.shape === "motif";
    const w = c.size;
    const h = silhouette ? motifSize(icon ?? "heart", w).h : pickHeight(c.shape as ShapeKind, w);
    const room = Math.min(w, h) * (silhouette ? 0.62 : 0.78);
    info.cupRoom = room;
    info.picks = c.count;
    const x0 = parts.length ? right + 30 : 0;
    const blank = silhouette ? weld(motif(icon ?? "heart", w), { border: 1.2, solid: true }) : makeShape(orient(centred(c.shape as ShapeKind, w, h, Math.min(w, h) * 0.06)), []);
    const disc = blank && withSticks(blank, sticksFor(1, w, 0, { length: c.stick, width: Math.max(4, p.sticks.width * 0.8), tip: 10 }));
    for (let i = 0; disc && i < c.count; i++) {
      const name = names.length ? names[i % names.length] : "";
      const content: Contour[] = [];
      if (name) {
        const t = textBlock(ctx, name, c.fontId, c.textSize, { spacing: 0, lead: 1.2, missing });
        if (t.loading) loading = true;
        info.cupText = Math.max(info.cupText, t.width);
        const ty = icon && !silhouette ? room * 0.26 : 0;
        content.push(...move(t.contours, 0, ty));
      }
      if (icon && !silhouette) {
        const size = name ? room * 0.5 : room * 0.78;
        content.push(...motif(icon, size, 0, name ? -room * 0.2 : 0));
      }
      const cols = Math.min(c.count, 6);
      const at = { x: x0 + (i % cols) * (w + 10), y: Math.floor(i / cols) * (h + c.stick + 20), z: 0 };
      if (c.layered && content.length) {
        parts.push(partFrom(disc, { id: `pick-${i + 1}`, name: `Pick ${i + 1}`, place: at }));
        const f = weld(content, { border: 0.6, minHole: 2 });
        if (f) parts.push(second(partFrom(f, { id: `pick-${i + 1}-front`, name: `Pick ${i + 1} front`, place: { ...at, z: p.T } })));
      } else {
        const u = content.length ? shapeContours(unionShapes(content)) : [];
        const m = !u.length ? {} : p.style.mark === "score" ? { score: u.map(closed) } : { engrave: u };
        parts.push(partFrom(disc, { id: `pick-${i + 1}`, name: name ? `Pick ${name}` : `Pick ${i + 1}`, ...m, place: at }));
      }
    }
  }

  const mixed = parts.some((pt) => pt.material === "second");
  const stats = [
    ...(info.width ? [{ label: "Topper", value: `${r0(info.width)} × ${r0(info.height)} mm` }] : []),
    ...(p.kit.kind !== "topper" ? [{ label: "Cupcake picks", value: String(info.picks) }] : []),
    { label: "Parts", value: String(parts.length) },
    ...(mixed ? [{ label: "Second material", value: `${m2.name} ${p.mat.T2} mm` }] : []),
  ];
  const assembly = [
    ...(mixed ? [`Cut the ${MATERIALS[p.material]?.name ?? "main"} sheets, then the ${m2.name} sheets.`, "Glue each front layer onto its back with a thin line of clear epoxy or acrylic cement; press flat for an hour."] : []),
    ...(p.style.mark === "engrave" && p.style.kind !== "letters" ? ["Engrave first, then cut without moving the sheet."] : []),
    "Peel any masking, wipe the topper and slide the sticks straight down into the cake.",
  ];
  return {
    parts, stats, assembly, missing: missing.length ? missing : undefined, info,
    notice: loading ? "Loading the font." : undefined,
    materials: mixed ? { main: MATERIALS[p.material]?.name ?? `Main material ${p.T} mm`, second: `${m2.name} ${p.mat.T2} mm`, secondK: m2.K } : undefined,
  };
}
