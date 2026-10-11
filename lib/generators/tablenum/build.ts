import { MATERIALS } from "@/lib/hinge/defaults";
import { differenceShapes, makeShape, offsetShapes, shapeContours, unionShapes } from "@/lib/letters/polygon";
import { bboxOf, circle, rect, transform } from "../geom";
import { material2 } from "../material2";
import { isMotifId, motif, motifSize } from "../motifs";
import { orient, shapeOutline, type ShapeKind } from "../shapes";
import type { BuildContext, Contour, GenOutput, GenPart, Pt } from "../types";
import { tabsUnder, textBlock, weld, withSticks } from "../weld";
import { MAX_TABLES, tableList, type TablenumParams } from "./params";

export interface TablenumInfo {
  tables: number;
  /** Tables asked for, before the cap. */
  asked: number;
  W: number;
  H: number;
  /** Widest and tallest table content, and the room for it. */
  contentW: number;
  contentH: number;
  roomW: number;
  roomH: number;
  /** Range mode: names given, tables numbered. */
  names: number;
  /** Height of the plate above the base over the base's depth. */
  tip: number;
  /** Length of the tabs below the plate, mm. */
  tab: number;
}

export type TablenumOutput = GenOutput & { info?: TablenumInfo };

const r0 = (v: number) => Math.round(v);
const move = (cs: Contour[], dx: number, dy: number) => cs.map((c) => c.map(([x, y]) => [x + dx, y + dy] as Pt));
const closed = (c: Contour): Contour => [...c, c[0]];
const rot180 = (cs: Contour[], cx: number, cy: number) => cs.map((c) => c.map(([x, y]) => [2 * cx - x, 2 * cy - y] as Pt));

/** Shapes a tent card can use: its fold edge must be straight. */
const TENT_SHAPES: ShapeKind[] = ["rect", "rounded"];
const TAB_W = 14;
const CLEAR = 0.1;

/** Rows of hinge slits across a band from y0 to y1, w wide: alternate rows offset by half a period, solid at both edges. */
export function hingeSlits(w: number, y0: number, y1: number, h: TablenumParams["hinge"]): Contour[] {
  const cuts: Contour[] = [];
  const period = h.slit + h.bridge;
  const pitch = Math.max(0.8, h.pitch);
  const rows = Math.max(1, Math.floor((y1 - y0) / pitch));
  const top = y0 + ((y1 - y0) - (rows - 1) * pitch) / 2;
  for (let r = 0; r < rows; r++) {
    const y = top + r * pitch;
    const shift = r % 2 ? period / 2 : 0;
    for (let x = h.bridge - shift; x < w - h.bridge; x += period) {
      const a = Math.max(h.bridge, x), b = Math.min(w - h.bridge, x + h.slit);
      if (b - a > 1) cuts.push([[a, y], [b, y]]);
    }
  }
  return cuts;
}

export function buildTablenum(p: TablenumParams, ctx: BuildContext): TablenumOutput {
  if (!(p.T > 0)) return { parts: [], stats: [], error: "Set the material thickness." };
  const T = p.T, missing: string[] = [];
  const tables = tableList(p);
  const asked = p.batch.mode === "range" ? Math.abs(p.batch.to - p.batch.from) + 1 : p.batch.list.split(/\r?\n/).filter((s) => s.trim()).length;
  if (!tables.length) return { parts: [], stats: [], error: "Add at least one table to the list." };
  const m2 = material2(p.mat.mat2);
  const second = (pt: GenPart): GenPart => ({ ...pt, material: "second", color: m2.color, t: p.mat.T2 });
  const tent = p.build.kind === "tent";
  const shape: ShapeKind = tent && !TENT_SHAPES.includes(p.plate.shape) ? "rounded" : p.plate.shape;

  // Each table's content, centred on (0, 0).
  let loading = false;
  const blocks = tables.map(({ main, sub }) => {
    const lab = p.text.label.trim() ? textBlock(ctx, p.text.label, p.text.labelFont, p.text.labelSize, { missing }) : null;
    const num = textBlock(ctx, main, p.text.fontId, p.text.size, { spacing: p.text.spacing, missing });
    const nm = sub ? textBlock(ctx, sub, p.text.labelFont, p.text.nameSize, { missing }) : null;
    for (const b of [lab, num, nm]) if (b?.loading) loading = true;
    const stack = (p.text.labelBelow ? [num, lab, nm] : [lab, num, nm]).filter((b): b is NonNullable<typeof b> => !!b && b.contours.length > 0);
    const gaps = stack.map((b) => Math.max(3, b.height * 0.28));
    let y = 0, numY = 0;
    const placed: Contour[] = [];
    stack.forEach((b, i) => {
      if (i) y += gaps[i];
      placed.push(...move(b.contours, 0, y + b.height / 2));
      if (b === num) numY = y + b.height / 2;
      y += b.height;
    });
    let cs = move(placed, 0, -y / 2);
    numY -= y / 2;
    if (isMotifId(p.motif.kind) && cs.length) {
      const bb = bboxOf(cs), s = motifSize(p.motif.kind, p.motif.size), g = p.motif.gap;
      if (p.motif.place === "above") cs.push(...motif(p.motif.kind, p.motif.size, 0, bb.y0 - g - s.h / 2));
      if (p.motif.place === "below") cs.push(...motif(p.motif.kind, p.motif.size, 0, bb.y1 + g + s.h / 2));
      if (p.motif.place === "both") {
        const nb = bboxOf(num.contours.length ? num.contours : cs);
        const half = (nb.x1 - nb.x0) / 2;
        cs.push(...motif(p.motif.kind, p.motif.size, -half - g - s.w / 2, numY), ...motif(p.motif.kind, p.motif.size, half + g + s.w / 2, numY, true));
      }
    }
    if (cs.length) {
      const bb = bboxOf(cs);
      cs = move(cs, -(bb.x0 + bb.x1) / 2, -(bb.y0 + bb.y1) / 2);
    }
    return cs;
  });
  if (loading) return { parts: [], stats: [], notice: "Loading the font." };

  let contentW = 0, contentH = 0;
  for (const cs of blocks) {
    if (!cs.length) continue;
    const b = bboxOf(cs);
    contentW = Math.max(contentW, b.x1 - b.x0);
    contentH = Math.max(contentH, b.y1 - b.y0);
  }

  // One plate size for every table.
  const arch = shape === "arch" ? 0.22 : 0;
  let W = p.plate.auto ? contentW + 2 * p.plate.pad : p.plate.width;
  let H = p.plate.auto ? contentH + 2 * p.plate.pad + W * arch : p.plate.height;
  if (p.plate.auto && ["circle", "star", "scalloped", "octagon", "hexagon", "heart", "diamond"].includes(shape)) {
    const k = shape === "star" ? 1.9 : shape === "diamond" ? 1.6 : shape === "heart" ? 1.35 : 1.15;
    W = H = Math.max(W, H) * k;
  }
  const pad = Math.max(5, p.plate.pad * 0.6);
  const info: TablenumInfo = { tables: tables.length, asked, W, H, contentW, contentH, roomW: W - 2 * pad, roomH: H - 2 * pad - (p.plate.auto ? 0 : H * arch * 0.5), names: 0, tip: 0, tab: 0 };
  if (p.batch.mode === "range") info.names = p.batch.names.split(/\r?\n/).filter((s) => s.trim()).length;
  const face = orient(shapeOutline(shape, W, H, p.plate.corner));
  const contentY = H / 2 + (p.plate.auto ? (W * arch) / 2 : 0);

  const border: Pick<GenPart, "engrave" | "score"> = {};
  if (p.border.kind !== "none") {
    const inset = offsetShapes([makeShape(face, [])], -Math.max(1, p.border.inset));
    if (p.border.kind === "score") border.score = shapeContours(inset).map(closed);
    else border.engrave = shapeContours(differenceShapes(shapeContours(inset), shapeContours(offsetShapes(inset, -2.5))));
  }

  const marks = (cs: Contour[]): Pick<GenPart, "engrave" | "score"> => {
    if (!cs.length || p.text.mark === "raised") return {};
    const u = shapeContours(unionShapes(cs));
    return p.text.mark === "engrave" ? { engrave: u } : { score: u.map(closed) };
  };
  const join = (a: Pick<GenPart, "engrave" | "score">, b: Pick<GenPart, "engrave" | "score">) => ({
    engrave: [...(a.engrave ?? []), ...(b.engrave ?? [])],
    score: [...(a.score ?? []), ...(b.score ?? [])],
  });

  const parts: GenPart[] = [];
  const layers = p.base.layers;
  const tabLen = layers === 1 ? T : T * (layers - 1);
  info.tab = tabLen;
  const baseL = Math.max(p.base.width, 2 * TAB_W + 30);
  const tabs = tabsUnder(face, W, H, Math.min(W * 0.28, baseL * 0.3), TAB_W);
  const tabXs = tabs.xs;
  const plates = p.build.double ? 2 : 1;
  const slotW = plates * T + CLEAR;
  const depth = Math.max(25, p.base.depth);
  info.tip = p.build.kind === "stand" ? H / depth : 0;
  const pitchX = Math.max(W, baseL) + 30;

  tables.forEach((t, i) => {
    const cs = move(blocks[i], W / 2, contentY);
    const X = i * pitchX;
    const tag = tables.length > 1 ? ` ${t.main}` : "";
    const id = (s: string) => `${s}-${i + 1}`;
    if (p.build.kind === "tent") {
      const band = Math.max(6, p.hinge.band);
      const A = transform(face, { x: 0, y: 0 });
      const B = transform(face, { x: 0, y: H + band });
      const outer = unionShapes([orient(rot180([A], W / 2, H / 2)[0]), orient(rect(0, H - 1, W, band + 2)), orient(B)]).reduce((a, b) => (b.area > a.area ? b : a)).outer;
      const front = move(cs, 0, H + band);
      const back = rot180(cs, W / 2, H / 2);
      const bA = border.score ? { score: rot180(border.score, W / 2, H / 2) } : border.engrave ? { engrave: rot180(border.engrave, W / 2, H / 2) } : {};
      const bB = border.score ? { score: move(border.score, 0, H + band) } : border.engrave ? { engrave: move(border.engrave, 0, H + band) } : {};
      const m = join(join(marks(front), marks(back)), join(bA, bB));
      parts.push({ id: id("card"), name: `Tent card${tag}`, outer, holes: [], cuts: hingeSlits(W, H + 1, H + band - 1, p.hinge), ...m, place: { x: X, y: 0, z: 0 } });
      if (p.text.mark === "raised" && cs.length) {
        const s = weld(front, { border: 0.6, minHole: 2 });
        const s2 = weld(back, { border: 0.6, minHole: 2 });
        if (s) parts.push(second({ id: id("front"), name: `Front number${tag}`, outer: s.outer, holes: s.holes, place: { x: X, y: 0, z: T } }));
        if (s2) parts.push(second({ id: id("back"), name: `Back number${tag}`, outer: s2.outer, holes: s2.holes, place: { x: X, y: 0, z: T } }));
      }
      return;
    }

    const plaque = p.build.kind === "plaque";
    let outer = face, holes: Contour[] = [];
    if (plaque) {
      if (p.plaque.holes === "top") holes = [circle(W / 2, Math.max(8, H * 0.07), 2.5)];
      if (p.plaque.holes === "two") holes = [circle(W * 0.2, Math.max(8, H * 0.08), 2.5), circle(W * 0.8, Math.max(8, H * 0.08), 2.5)];
    } else {
      const s = withSticks(makeShape(face, []), tabXs.map((x) => ({ x, length: tabLen, width: tabs.w, tip: 0 })));
      outer = s.outer;
    }
    const lift = plaque ? 0 : layers * T;
    const z0 = plaque ? 0 : depth / 2 - (plates * T) / 2;
    const place = (z: number) => ({ x: X, y: -H - lift, z, upright: true });
    const m = join(marks(cs), border);
    for (let k = 0; k < plates; k++) {
      const z = z0 + (plates === 2 ? (k ? 0 : T) : 0);
      parts.push({ id: id(k ? "back" : "plate"), name: `${k ? "Back" : "Plate"}${tag}`, outer, holes, ...m, place: place(z) });
      if (p.text.mark === "raised" && cs.length) {
        const s = weld(cs, { border: 0.6, minHole: 2 });
        if (s) parts.push(second({ id: id(k ? "back-number" : "number"), name: `${k ? "Back number" : "Number"}${tag}`, outer: s.outer, holes: s.holes, place: place(k ? z0 - p.mat.T2 : z + T) }));
      }
    }
    if (!plaque) {
      for (let l = 0; l < layers; l++) {
        const inset = l * Math.max(0, p.base.step);
        const bl = baseL - 2 * inset, bd = depth - 2 * inset;
        const ox = (W - baseL) / 2 + inset;
        const slotted = layers === 1 || l > 0;
        const slots = slotted ? tabXs.map((x) => rect(x - ox - tabs.w / 2 - CLEAR / 2, bd / 2 - slotW / 2, tabs.w + CLEAR, slotW)) : [];
        parts.push({ id: id(`base${l + 1}`), name: `Base${layers > 1 ? ` layer ${l + 1}` : ""}${tag}`, outer: orient(shapeOutline("rounded", bl, bd, Math.min(p.base.corner, bd / 2 - 1))), holes: slots, place: { x: X + ox, y: inset, z: l * T } });
      }
    }
  });

  const mixed = parts.some((pt) => pt.material === "second");
  const mat = MATERIALS[p.material]?.name ?? `Main material ${T} mm`;
  const each = p.build.kind === "tent" ? "tent card" : p.build.kind === "plaque" ? "plaque" : "stand";
  return {
    parts,
    stats: [
      { label: "Tables", value: tables.length > 1 ? `${tables.length} (${tables[0].main} to ${tables.at(-1)!.main})` : tables[0].main },
      { label: "Plate", value: `${r0(W)} × ${r0(H)} mm` },
      ...(p.build.kind === "stand" ? [{ label: "Base", value: `${r0(baseL)} × ${r0(depth)} mm, ${layers} layer${layers > 1 ? "s" : ""}` }] : []),
      ...(mixed ? [{ label: "Second material", value: `${m2.name} ${p.mat.T2} mm` }] : []),
      { label: "Parts", value: String(parts.length) },
    ],
    assembly: [
      ...(mixed ? [`Cut the ${mat} sheets, then the ${m2.name} sheets.`, "Glue each number onto its plate with clear epoxy or double-sided tape."] : []),
      ...(p.build.kind === "stand" ? [
        ...(layers > 1 ? ["Glue the base layers into a block with the slotted layers on top, keeping the slots lined up."] : []),
        p.build.double ? "Glue each pair of plates back to back, then push their tabs into the base's slots." : "Push each plate's tabs into its base's slots; a drop of glue makes it permanent.",
      ] : []),
      ...(p.build.kind === "tent" ? ["Bend each card slowly along the slits until both halves stand as a tent; warm the hinge band with a hair dryer if the wood is stiff."] : []),
      ...(p.build.kind === "plaque" && p.plaque.holes !== "none" ? ["Hang each plaque on a table stand or a ribbon through its holes."] : []),
      `Check the ${each}s against your seating plan before the event.`,
    ],
    info,
    missing: missing.length ? missing : undefined,
    materials: mixed ? { main: mat, second: `${m2.name} ${p.mat.T2} mm`, secondK: m2.K } : undefined,
  };
}

export { MAX_TABLES };
