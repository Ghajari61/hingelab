import { markLetters } from "../textOps";
import { MATERIALS } from "@/lib/hinge/defaults";
import { differenceShapes, makeShape, offsetShapes, shapeContours, signedArea, unionShapes } from "@/lib/letters/polygon";
import type { Shape } from "@/lib/letters/types";
import { bboxOf, circle, customOutline, distToContour, pointInContour, rect, regularPolygon, roundCorners, roundedRect, transform } from "../geom";
import { topAt } from "../sign/build";
import { ledChannel, ledChannels, ledPocket } from "../sign/led";
import { tagMarks, type ItemBlock } from "../items";
import { material2 } from "../material2";
import { isMotifId, motif, type MotifRef } from "../motifs";
import { motifRef } from "../motifRef";
import { fitBox, orient, shapeOutline, starPolygon } from "../shapes";
import type { BuildContext, Contour, GenOutput, GenPart, Pt } from "../types";
import { bottomAt, bridgeIslands, tabsUnder, textBlock, weld, withSticks } from "../weld";
import type { BaseShape, TrophyParams } from "./params";

export interface TrophyInfo {
  /** The upright figure, without its tabs. */
  FW: number;
  FH: number;
  /** Figure thickness (the second material's in a mixed build). */
  Tf: number;
  /** Width of the figure's foot and of the base's top tier, mm. */
  foot: number;
  top: number;
  /** Emblem text width and the room for it, mm. */
  textW: number;
  room: number;
  /** Widest plate line, mm. */
  lineW: number;
  /** Figure height over base depth. */
  tip: number;
  tab: number;
  /** The custom path could not be read. */
  badPath: boolean;
  /** Plaque: figure points outside the backer, and hanging holes that run into the figure. */
  plaqueOut: number;
  holesOnFigure: number;
  /** Medal: width of the ribbon loop, mm. */
  loopW: number;
  /** LED base: the wall in front of and behind the LED pocket, mm (0 without one). */
  ledWall: number;
}

export type TrophyOutput = GenOutput & { info?: TrophyInfo };

const r0 = (v: number) => Math.round(v);
const move = (cs: Contour[], dx: number, dy: number) => cs.map((c) => c.map(([x, y]) => [x + dx, y + dy] as Pt));
const biggest = (s: Shape[]) => s.reduce((a, b) => (b.area > a.area ? b : a));
const TAB_W = 16;

/** `detail`: the motif's own regions on the emblem, to engrave or score (a traced picture, or a built-in motif without words). */
interface EmblemShape { shape: Shape; cx: number; cy: number; room: number; detail?: Contour[] }

/** Scale a 100-unit design to w × h. */
const fit100 = (c: Contour, w: number, h: number) => c.map(([x, y]) => [(x * w) / 100, (y * h) / 100] as Pt);

/** The emblem filling (0, 0)–(w, h), with where its text goes and how wide it may be; `own` is the user's picture or text motif. */
export function emblemShape(p: TrophyParams, badPath: { v: boolean }, own: MotifRef | null = null): EmblemShape {
  const { width: w, height: h } = p.emblem;
  const one = (cs: Contour[], holes: Contour[] = []) => biggest(holes.length ? differenceShapes(cs.map(orient), holes.map(orient)) : unionShapes(cs.map(orient)));
  switch (p.emblem.kind) {
    case "star": {
      const n = p.emblem.points;
      const raw = starPolygon(n, 50, n <= 5 ? 0.45 : 0.6, 50, 50);
      const b = bboxOf([raw]);
      const s = fitBox(roundCorners(raw, 2), w, h);
      const cy = ((50 - b.y0) / (b.y1 - b.y0)) * h;
      return { shape: one([s]), cx: w / 2, cy: cy + h * 0.04, room: Math.min(w, h) * (n <= 5 ? 0.36 : 0.5) };
    }
    case "cup": {
      const bowl: Contour = [[18, 0], [82, 0], [80, 22], [74, 40], [62, 54], [38, 54], [26, 40], [20, 22]];
      const parts = [roundCorners(bowl, 3), rect(44, 50, 12, 26), roundCorners([[30, 74], [70, 74], [74, 92], [26, 92]], 2), circle(12, 22, 12), circle(88, 22, 12)];
      const holes = [circle(12, 22, 7), circle(88, 22, 7)];
      const sx = (c: Contour) => c.map(([x, y]) => [(x * w) / 100, (y * h) / 92] as Pt);
      return { shape: one(parts.map(sx), holes.map(sx)), cx: w / 2, cy: (h * 24) / 92, room: w * 0.5 };
    }
    case "shield":
      return { shape: one([shapeOutline("shield", w, h, 3)]), cx: w / 2, cy: h * 0.42, room: Math.min(w * 0.38, h * 0.34) };
    case "medal": {
      const disc = circle(50, 62, 38);
      const left: Contour = [[16, 0], [38, 0], [60, 34], [42, 42]];
      const right: Contour = [[84, 0], [62, 0], [40, 34], [58, 42]];
      return { shape: one([disc, left, right].map((c) => fit100(c, w, h))), cx: w / 2, cy: h * 0.62, room: Math.min(w, h) * 0.34 };
    }
    case "flame": {
      const s = weld(motif("flame", Math.max(w, h), w / 2, h / 2), { border: 0, solid: true })!;
      const b = bboxOf([s.outer]);
      const f = transform(s.outer, { x: w / 2 - (b.x0 + b.x1) / 2, y: h - b.y1 });
      return { shape: makeShape(orient(f), []), cx: w / 2, cy: h * 0.64, room: w * 0.42 };
    }
    case "laurel": {
      const r = Math.min(w, h) / 2;
      const wreath = motif("laurel", Math.min(w, h), w / 2, h / 2);
      const s = weld([...wreath, circle(w / 2, h / 2, r * 0.62)], { border: 0.6, solid: true })!;
      return { shape: s, cx: w / 2, cy: h / 2, room: r * 1.1 };
    }
    case "motif": {
      const id: MotifRef = own ?? (isMotifId(p.emblem.motif) ? p.emblem.motif : "crown");
      const cs = motif(id, Math.max(w, h), w / 2, h / 2);
      const s = weld(cs, { border: 0.6, solid: true, bridge: Math.max(5, Math.min(w, h) * 0.06) })!;
      const b = bboxOf([s.outer]);
      // the emblem cuts as one solid piece; a traced picture, or a built-in motif with no words on it, is marked on it in full
      // (a built-in motif shows its openings, engraved, rather than being engraved all over)
      const marked = own ? (p.emblem.motif === "picture" ? cs : null) : isMotifId(p.emblem.motif) && !p.emblem.text.trim() ? cs.filter((c) => signedArea(c) < 0) : null;
      const detail = marked?.length ? move(marked, -b.x0, -b.y0) : undefined;
      return { shape: makeShape(transform(s.outer, { x: -b.x0, y: -b.y0 }), []), cx: (b.x1 - b.x0) / 2, cy: (b.y1 - b.y0) / 2, room: (b.x1 - b.x0) * 0.45, detail };
    }
    case "rosette": {
      // a scalloped disc with two ribbon tails, like a prize rosette
      const cs: Contour[] = [circle(50, 36, 30)];
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * 2 * Math.PI;
        cs.push(circle(50 + 30 * Math.cos(a), 36 + 30 * Math.sin(a), 6.2));
      }
      const tail: Contour = [[34, 56], [50, 62], [38, 100], [30, 92], [21, 100]];
      cs.push(tail, tail.map(([x, y]) => [100 - x, y] as Pt));
      const raw = biggest(unionShapes(cs.map(orient))).outer;
      const b = bboxOf([raw]);
      return { shape: one([fitBox(raw, w, h)]), cx: w / 2, cy: ((36 - b.y0) / (b.y1 - b.y0)) * h, room: Math.min(w * 0.3, h * 0.25) };
    }
    case "custom": {
      const c = customOutline(p.emblem.path, w, h);
      if (!c) {
        badPath.v = true;
        return { shape: one([starPolygon(5, 50, 0.45, 50, 50)].map((x) => fitBox(x, w, h))), cx: w / 2, cy: h * 0.55, room: w * 0.36 };
      }
      const b = bboxOf([c]);
      return { shape: makeShape(orient(transform(c, { x: -b.x0, y: -b.y0 })), []), cx: (b.x1 - b.x0) / 2, cy: (b.y1 - b.y0) / 2, room: (b.x1 - b.x0) * 0.45 };
    }
  }
}

function baseOutline(kind: BaseShape, w: number, d: number, r: number): Contour {
  if (kind === "circle") return orient(shapeOutline("circle", w, d));
  if (kind === "hexagon" || kind === "octagon") {
    const n = kind === "hexagon" ? 6 : 8;
    return orient(fitBox(regularPolygon(n, 50, n === 6 ? 0 : Math.PI / 8), w, d));
  }
  return orient(shapeOutline("rounded", w, d, Math.min(r, d / 2 - 1, w / 2 - 1)));
}

export function buildTrophy(p: TrophyParams, ctx: BuildContext): TrophyOutput {
  if (!(p.T > 0)) return { parts: [], stats: [], error: "Set the material thickness." };
  const T = p.T, missing: string[] = [];
  const m2 = material2(p.mat.mat2);
  const mixed = p.build.kind === "mixed";
  const Tf = mixed ? p.mat.T2 : T;
  const second = (pt: GenPart): GenPart => ({ ...pt, material: "second", color: m2.color, t: p.mat.T2 });
  const bad = { v: false };
  let loading = false;

  // The emblem.
  const own = p.emblem.kind === "motif" ? motifRef(p.emblem.motif, p.emblem.art, ctx, missing) : null;
  if (own?.loading) return { parts: [], stats: [], notice: "Loading the font." };
  const em = emblemShape(p, bad, own && typeof own.ref === "object" ? own.ref : null);
  const eb = bboxOf([em.shape.outer]);
  const EW = eb.x1 - eb.x0, EH = eb.y1 - eb.y0;

  // Plate text.
  const lines = p.plate.on ? [
    p.plate.title.trim() ? textBlock(ctx, p.plate.title, p.plate.titleFont, p.plate.titleSize, { missing }) : null,
    p.plate.name.trim() ? textBlock(ctx, p.plate.name, p.plate.fontId, p.plate.nameSize, { missing }) : null,
    p.plate.year.trim() ? textBlock(ctx, p.plate.year, p.plate.fontId, p.plate.nameSize * 0.8, { missing }) : null,
  ].filter((b): b is NonNullable<typeof b> => !!b) : [];
  const et = p.emblem.text.trim() ? textBlock(ctx, p.emblem.text, p.emblem.fontId, p.emblem.size, { missing }) : null;
  const bt = p.base.text.trim() ? textBlock(ctx, p.base.text, p.plate.fontId, Math.min(8, p.base.depth * 0.12), { missing }) : null;
  for (const b of [...lines, et, bt]) if (b?.loading) loading = true;
  if (loading) return { parts: [], stats: [], notice: "Loading the font." };

  const gap = 2.2;
  const textH = lines.reduce((a, b) => a + b.height, 0) + Math.max(0, lines.length - 1) * gap * 1.4;
  const lineW = Math.max(0, ...lines.map((b) => b.width));
  const plateH = lines.length ? textH + 2 * p.plate.pad : 0;
  const plateW = p.plate.on ? Math.max(p.plate.width, 20, lineW + 2 * p.plate.pad) : 0;
  const stemH = Math.max(0, p.stem.height);
  const stemW = Math.max(6, p.stem.width);
  const FW = Math.max(EW, plateW, stemH > 0 ? stemW : 0);
  const ex = (FW - EW) / 2;
  const plateTop = EH + stemH;
  const FH = plateTop + plateH;

  // The figure in one frame: emblem, stem, plate.
  const emHoles = em.shape.holes.map((c) => transform(c, { x: ex - eb.x0, y: -eb.y0 }));
  const emOuter = transform(em.shape.outer, { x: ex - eb.x0, y: -eb.y0 });
  const outerParts = [emOuter];
  const stemTop = Math.min(EH - Math.min(6, EH * 0.1), (bottomAt(emOuter, FW / 2) ?? EH) - 4);
  if (stemH > 0 || plateH) outerParts.push(orient(rect(FW / 2 - stemW / 2, stemTop, stemW, plateTop - stemTop + (plateH ? 2 : 0))));
  if (plateH) outerParts.push(orient(shapeOutline("rounded", plateW, plateH, p.plate.corner).map(([x, y]) => [x + FW / 2 - plateW / 2, y + plateTop] as Pt)));
  let shapes = emHoles.length ? differenceShapes(outerParts.map(orient), emHoles.map(orient)) : unionShapes(outerParts.map(orient));
  if (shapes.length > 1) shapes = bridgeIslands(shapes, stemW);
  let figure = biggest(shapes);
  const disp = p.display.kind;
  const onBase = disp === "base";

  // Medal: a loop on top with a slot the ribbon threads through.
  let loopW = 0;
  if (disp === "medal") {
    const rw = Math.max(6, p.display.ribbon), lh = 14;
    loopW = rw + 12;
    const top = topAt(figure.outer, FW / 2) ?? 0;
    let d = 2;
    while (d < EH / 3 && ![FW / 2 - 5, FW / 2 + 5].every((x) => pointInContour([x, top + d], figure.outer))) d += 1;
    const y1 = top + d + 2;
    const loop = orient(roundedRect(FW / 2 - loopW / 2, y1 - lh, loopW, lh, 5));
    const slot = orient(rect(FW / 2 - (rw + 1) / 2, y1 - lh + 4, rw + 1, 4));
    figure = biggest(differenceShapes([...shapeContours([figure]), loop], [slot]));
  }
  const fb = bboxOf([figure.outer]);
  const footY = fb.y1;

  // Tabs into the base.
  const tiers = p.base.tiers;
  const bottomW = Math.max(p.base.width, 30);
  const topW = bottomW - 2 * (tiers - 1) * p.base.step;
  const led = onBase && p.base.led;
  const ch = led ? ledChannels(T) : 0;
  // with an LED base every tier is slotted and the tabs reach down to the LEDs
  const tabLen = led ? tiers * T : tiers === 1 ? T : T * (tiers - 1);
  const tabs = tabsUnder(figure.outer, FW, footY, Math.min(FW * 0.3, topW * 0.3), TAB_W);
  if (onBase) figure = withSticks(figure, tabs.xs.map((x) => ({ x, length: tabLen, width: tabs.w, tip: 0 })));
  const foot = tabs.xs.length > 1 ? tabs.xs[1] - tabs.xs[0] + tabs.w : tabs.w;

  // Engraving.
  const marks: Contour[] = [];
  // each glyph's outlines (the emblem's detail and the wreath are one glyph each), for No Weld scoring
  const markGlyphs: Contour[][] = [];
  const glyphsOf = (b: { contours: Contour[]; glyphs?: Contour[][] }, dx: number, dy: number) => (b.glyphs?.length ? b.glyphs : [b.contours]).map((g) => move(g, dx, dy));
  const blocks: ItemBlock[] = [];
  if (em.detail) { const d = move(em.detail, ex - eb.x0, -eb.y0); marks.push(...d); markGlyphs.push(d); }
  if (et) {
    const cs = move(et.contours, ex + em.cx, em.cy);
    blocks.push({ item: "Emblem text", cs });
    marks.push(...cs);
    markGlyphs.push(...glyphsOf(et, ex + em.cx, em.cy));
  }
  if (p.emblem.laurel) {
    const r = em.room * 0.95;
    const wreath = motif("laurel", r * 2, ex + em.cx, em.cy);
    const w = shapeContours(differenceShapes(wreath.map(orient), et ? shapeContours(offsetShapes(unionShapes(move(et.contours, ex + em.cx, em.cy)), 2)) : []));
    marks.push(...w);
    markGlyphs.push(w);
  }
  const plateMarks: Contour[] = [];
  const plateGlyphs: Contour[][] = [];
  if (lines.length) {
    let y = plateTop + p.plate.pad;
    const kinds = [p.plate.title.trim() && "Title", p.plate.name.trim() && "Name", p.plate.year.trim() && "Year"].filter((k): k is string => !!k);
    lines.forEach((b, i) => {
      const cs = move(b.contours, FW / 2, y + b.height / 2);
      blocks.push({ item: kinds[i], cs });
      plateMarks.push(...cs);
      plateGlyphs.push(...glyphsOf(b, FW / 2, y + b.height / 2));
      y += b.height + gap * 1.4;
    });
  }
  const layered = p.build.kind === "layered";
  const faceMarks = layered ? [] : [...marks, ...plateMarks];
  const faceGlyphs = layered ? [] : [...markGlyphs, ...plateGlyphs];
  const markOf = (cs: Contour[], items: ItemBlock[] = [], glyphs?: Contour[][]): Pick<GenPart, "engrave" | "score"> => {
    if (!cs.length) return {};
    return tagMarks(markLetters({ contours: cs, glyphs }, p.mark.kind, p.mark.noWeld), items);
  };

  // Base tiers.
  const parts: GenPart[] = [];
  const depth = Math.max(25, p.base.depth);
  const slotW = Tf + p.base.fit;
  const bx = (bottomW - FW) / 2;
  for (let k = 0; onBase && k < tiers; k++) {
    const inset = k * p.base.step;
    const w = bottomW - 2 * inset, d = depth - 2 * inset;
    const slotted = led || tiers === 1 || k > 0;
    const holes = slotted ? tabs.xs.map((x) => rect(x + bx - inset - tabs.w / 2 - p.base.fit / 2, d / 2 - slotW / 2, tabs.w + p.base.fit, slotW)) : [];
    const top = k === tiers - 1;
    const by = d / 2 + slotW / 2 + Math.max(4, (d / 2 - slotW / 2) * 0.45);
    const baseMarks = top && bt ? markOf(move(bt.contours, w / 2, by), [], glyphsOf(bt, w / 2, by)) : {};
    parts.push({ id: `tier${k + 1}`, name: tiers > 1 ? `Base tier ${k + 1}` : "Base", outer: baseOutline(p.base.shape, w, d, p.base.corner), holes, ...baseMarks, place: { x: inset, y: inset, z: (k + (led ? ch + 1 : 0)) * T } });
  }
  let ledWall = 0;
  if (led) {
    // under the tiers: a solid bottom plate and channel layers with a pocket for the LEDs below the slot
    const outline = baseOutline(p.base.shape, bottomW, depth, p.base.corner);
    const pocket = ledPocket(slotW);
    const x0 = Math.min(...tabs.xs) + bx - tabs.w / 2, x1 = Math.max(...tabs.xs) + bx + tabs.w / 2;
    parts.unshift({ id: "led-bottom", name: "LED base bottom", outer: outline, holes: [], place: { x: 0, y: 0, z: 0 } });
    for (let k = 0; k < ch; k++) {
      const c = ledChannel(outline, x0 - 1, x1 + 1, depth / 2, pocket, depth);
      parts.splice(1 + k, 0, { id: `led-channel${k + 1}`, name: `LED channel${ch > 1 ? ` ${k + 1}` : ""}`, outer: c.outer, holes: c.holes, place: { x: 0, y: 0, z: (k + 1) * T } });
    }
    ledWall = (depth - pocket) / 2;
  }

  // The figure, standing in the slot, glued on a plaque, or on its own as a medal.
  const lift = onBase ? (tiers + (led ? ch + 1 : 0)) * T : 0;
  let fz = depth / 2 - Tf / 2;
  let figPlace = { x: bx, y: -(footY + lift), z: fz, upright: true };
  let plaqueOut = 0, holesOnFigure = 0, BW = 0, BH = 0;
  if (disp === "plaque") {
    // a backer board round the figure, with two hanging holes in its top margin
    const m = Math.max(5, p.display.margin), shape = p.display.shape;
    const fh = fb.y1 - fb.y0;
    const archTop = shape === "arch" ? FW * 0.16 : 0, shieldFoot = shape === "shield" ? fh * 0.3 : 0;
    const k = shape === "octagon" ? 1.18 : 1;
    BW = (FW + 2 * m) * k; BH = (fh + 2 * m) * k + archTop + shieldFoot;
    const backer = orient(shapeOutline(shape, BW, BH, 8));
    const fx = (BW - FW) / 2, fy = archTop + (BH - archTop - shieldFoot - fh) / 2 - fb.y0;
    for (const [x, y] of figure.outer) if (!pointInContour([x + fx, y + fy], backer)) plaqueOut++;
    const holes: Contour[] = [];
    for (const x of [BW * 0.2, BW * 0.8]) {
      const y = (topAt(backer, x) ?? 0) + Math.max(7, m * 0.45), r = 2.25;
      holes.push(circle(x, y, r));
      const local: Pt = [x - fx, y - fy];
      if (pointInContour(local, figure.outer) || distToContour(local, figure.outer) < r + 1.5 || !pointInContour([x, y - r - 1], backer)) holesOnFigure++;
    }
    parts.push({ id: "backer", name: "Plaque", outer: backer, holes, place: { x: 0, y: -BH, z: 0, upright: true } });
    fz = T;
    figPlace = { x: fx, y: -BH + fy, z: fz, upright: true };
  } else if (disp === "medal") {
    fz = 0;
    figPlace = { x: 0, y: -footY, z: 0, upright: true };
  }
  const fig: GenPart = { id: "figure", name: "Figure", outer: figure.outer, holes: figure.holes, ...markOf(faceMarks, blocks, faceGlyphs), place: figPlace };
  parts.unshift(mixed ? second(fig) : fig);
  if (layered) {
    const inset = Math.max(2, Math.min(EW, EH) * 0.05);
    const front = offsetShapes([makeShape(transform(em.shape.outer, { x: ex - eb.x0, y: -eb.y0 }), [])], -inset);
    if (front.length) {
      const f = biggest(front);
      parts.splice(1, 0, second({ id: "emblem", name: "Emblem front", outer: f.outer, holes: emHoles, ...markOf(marks, blocks, markGlyphs), place: { ...figPlace, z: fz + Tf } }));
    }
    if (plateH) {
      const pl = orient(shapeOutline("rounded", plateW - 6, plateH - 6, Math.max(0, p.plate.corner - 2)).map(([x, y]) => [x + FW / 2 - plateW / 2 + 3, y + plateTop + 3] as Pt));
      parts.splice(2, 0, second({ id: "plate", name: "Name plate", outer: pl, holes: [], ...markOf(plateMarks, blocks, plateGlyphs), place: { ...figPlace, z: fz + Tf } }));
    }
  }

  const info: TrophyInfo = {
    FW, FH: footY, Tf, foot, top: topW, textW: et?.width ?? 0, room: em.room,
    lineW, tip: onBase ? footY / depth : 0, tab: onBase ? tabLen : 0, badPath: bad.v, plaqueOut, holesOnFigure, loopW, ledWall,
  };
  const anySecond = parts.some((pt) => pt.material === "second");
  const mat = MATERIALS[p.material]?.name ?? `Main material ${T} mm`;
  return {
    parts,
    stats: [
      { label: "Figure", value: `${r0(FW)} × ${r0(footY - Math.min(0, fb.y0))} mm` },
      ...(onBase ? [
        { label: "Base", value: `${r0(bottomW)} × ${r0(depth)} mm, ${tiers} tier${tiers > 1 ? "s" : ""}${led ? `, LED (${ch + 1} more layer${ch ? "s" : ""})` : ""}` },
        { label: "Height", value: `${r0(footY + lift)} mm` },
      ] : disp === "plaque" ? [{ label: "Plaque", value: `${r0(BW)} × ${r0(BH)} mm` }] : [{ label: "Ribbon slot", value: `${r0(Math.max(6, p.display.ribbon) + 1)} mm` }]),
      ...(anySecond ? [{ label: "Second material", value: `${m2.name} ${p.mat.T2} mm` }] : []),
    ],
    assembly: [
      ...(anySecond ? [`Cut the ${mat} sheets, then the ${m2.name} sheets.`] : []),
      ...(onBase && led ? ["Glue the LED bottom plate and the channel layers in a stack, pockets lined up, and lay a 10 mm LED strip (or a USB LED board) in the pocket facing up, its cable out through the notch at the back."] : []),
      ...(onBase && tiers > 1 ? [`Glue the base tiers into a stepped block, largest at the bottom, keeping the slots lined up${led ? ", on top of the LED layers" : ""}.`] : []),
      ...(layered ? ["Glue the emblem front and the name plate onto the figure with clear epoxy."] : []),
      ...(onBase ? ["Push the figure's tabs into the slot; if it is loose, add a drop of glue, and if it is tight, sand the tabs lightly."] : []),
      ...(onBase && led ? ["The tabs' ends sit on the LEDs; an acrylic figure glows along its edges and its engraving."] : []),
      ...(disp === "plaque" ? ["Glue the figure onto the plaque with its margin even all round (clear epoxy for acrylic, wood glue for wood), then hang the plaque on two screws through the top holes."] : []),
      ...(disp === "medal" ? [`Thread a ${r0(Math.max(6, p.display.ribbon))} mm ribbon through the slot in the loop and sew or staple its ends together.`] : []),
    ],
    info,
    missing: missing.length ? missing : undefined,
    materials: anySecond ? { main: mat, second: `${m2.name} ${p.mat.T2} mm`, secondK: m2.K } : undefined,
  };
}
