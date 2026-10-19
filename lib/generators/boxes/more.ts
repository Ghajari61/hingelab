/**
 * Boxes version 2: a wall shell with finger or tab-and-slot joints, the newer lids (sliding, pin
 * hinge, inset with a knob), lid engraving, and the drawer, hexagon, insert, money-box and stacking
 * designs. Version 1 builds stay in build.ts untouched; they go through here only when a version 2
 * option is switched on.
 *
 * Plan coordinates as in build.ts: x to the right, y from the back (0) to the front, z up.
 */
import { differenceShapes, makeShape, offsetShapes, shapeContours, unionShapes } from "@/lib/letters/polygon";
import { circle, rect, regularPolygon, roundedRect, stadium } from "../geom";
import { blocksOf, tagByPlace, tagItem } from "../items";
import { isMotifKind, motif, motifSize } from "../motifs";
import { motifRef } from "../motifRef";
import type { BuildContext, Contour, GenOutput, GenPart, Pt } from "../types";
import { textBlock } from "../weld";
import { boxPanels, fingerCount, fingerPanel, type EdgeSpec } from "./joints";
import type { BoxesParams, LidKind } from "./params";
import { FRET_NAMES, type KeepOut } from "../fretwork";
import { labelBox, labelFrame, pierce, pierceLid, pierceWalls, pierced } from "./pierce";

type Place = NonNullable<GenPart["place"]>;
export interface V2Info {
  size: [number, number, number];
  compartment?: number;
  minEdge?: number;
  textWidth?: number;
  textRoom?: number;
  /** Lid art taller than the lid. */
  artHeight?: number;
  artRoom?: number;
  /** Drawer inside height, mm. */
  drawerH?: number;
  /** Coin slot length that fits the top, mm. */
  slotRoom?: number;
  /** Largest plug hole the bottom takes, mm. */
  plugRoom?: number;
  /** Room for the pin hinge: depth needed and depth available, mm. */
  pinNeed?: number;
  pinRoom?: number;
}
export type V2Output = GenOutput & { info?: V2Info };

export const wall = (x: number, top: number, y: number, yaw = 0): Place => ({ x, y: -top, z: y, upright: true, ...(yaw ? { yaw } : {}) });
export const flat = (x: number, y: number, z: number): Place => ({ x, y, z });
export const r1 = (v: number) => Math.round(v * 10) / 10;
const shiftC = (c: Contour, dx: number, dy: number): Contour => c.map(([x, y]) => [x + dx, y + dy] as Pt);
const outerOf = (cs: Contour[]) => {
  const s = unionShapes(cs, [], false, true);
  return s.reduce((a, b) => (b.area > a.area ? b : a), s[0]).outer;
};
const cut = (c: Contour, holes: Contour[]) => {
  const s = differenceShapes([c], holes);
  return s.reduce((a, b) => (b.area > a.area ? b : a), s[0]);
};
/** A contour flipped top to bottom in a frame of height h (winding kept). */
const flipV = (c: Contour, h: number): Contour => c.map(([x, y]) => [x, h - y] as Pt).reverse();
/** A contour with its axes swapped: (u, v) → (h - v, u) (winding kept). */
const turn = (c: Contour, h: number): Contour => c.map(([u, v]) => [h - v, u] as Pt).reverse();

/** Walls the lid takes out of the entered inside height (bottom plus a top, lid or nothing). */
export const lidWalls = (lid: LidKind | "none") => (lid === "closed" || lid === "pin" || lid === "inset" ? 2 : 1);

/** An engraved band `inset` mm in from the outline, `width` mm wide. */
function band(outline: Contour, inset: number, width = 1.2): Contour[] {
  const base = [makeShape(outline, [])];
  const outer = offsetShapes(base, -inset), inner = offsetShapes(base, -(inset + width));
  if (!outer.length) return [];
  return shapeContours(differenceShapes(shapeContours(outer), shapeContours(inner)));
}

export interface Art {
  cs: Contour[]; w: number; h: number; loading: boolean; missing: string[];
  /** How many of `cs` (from the start) are the motif; the rest are the text. */
  motifs?: number;
}

/** The engraving (motif above text), centred on (0, 0). */
export function lidArt(p: BoxesParams, ctx: BuildContext): Art {
  const e = p.engrave, missing: string[] = [];
  const tx = e.text.trim() ? textBlock(ctx, e.text, e.fontId, e.size, { missing }) : null;
  const mr = motifRef(e.motif, e.art, ctx, missing);
  const m = mr.ref;
  const ms = m ? motifSize(m, e.motifSize) : { w: 0, h: 0 };
  const th = tx?.height ?? 0, gap = m && th ? Math.max(3, e.size * 0.4) : 0;
  const H = ms.h + gap + th;
  const cs: Contour[] = [];
  if (m) cs.push(...motif(m, e.motifSize, 0, -H / 2 + ms.h / 2));
  const motifs = cs.length;
  if (tx) cs.push(...tx.contours.map((c) => shiftC(c, 0, H / 2 - th / 2)));
  return { cs, w: Math.max(ms.w, tx?.width ?? 0), h: H, loading: !!tx?.loading || mr.loading, missing, motifs };
}
export const hasArt = (p: BoxesParams) => !!p.engrave.text.trim() || isMotifKind(p.engrave.motif) || p.engrave.border > 0;

/** Engraving for a face of w × h whose outline is `outline`, art centred on (cx, cy). */
const engraveOn = (p: BoxesParams, art: Art, outline: Contour, cx: number, cy: number) => [
  ...(p.engrave.border > 0 ? band(outline, p.engrave.border) : []),
  ...art.cs.map((c, i) => tagItem([shiftC(c, cx, cy)], i < (art.motifs ?? 0) ? "Motif" : "Text")[0]),
];

/** Puts the lid art on a part: engraved, or its outlines scored. */
function markLid(part: GenPart, p: BoxesParams, cs: Contour[]) {
  if (p.engrave.mark !== "score") { part.engrave = cs; return; }
  if (cs.length) part.score = [...(part.score ?? []), ...tagByPlace(shapeContours(unionShapes(cs)).map((c) => [...c, c[0]]), blocksOf(cs))];
}

/** Tabs along an edge of length L (tab-and-slot joints): centres and width. */
function tabsAlong(L: number, T: number) {
  const n = L < 90 ? 1 : L < 220 ? 2 : 3;
  const w = Math.min(30, Math.max(8, (L - 2 * T) / (2 * n + 1)));
  return { w, us: Array.from({ length: n }, (_, i) => T + ((L - 2 * T) * (i + 0.5)) / n) };
}

export interface Shell {
  parts: GenPart[];
  /** How far the bottom (and top) overhang the walls, mm (tab-and-slot only). */
  m: number;
  minEdge: number;
}

/**
 * The walls, bottom and (when `top`) top of a W × D box whose walls reach z = H. `sideUp` raises the
 * two side walls above the front and back by that much (the pin hinge's lid sits between them).
 */
export function shell(p: BoxesParams, W: number, D: number, H: number, top: boolean, sideUp = 0): Shell {
  const T = p.T, f = p.joint.finger, Hp = H - sideUp;
  const raise = (side: Contour) => (sideUp > 0 ? outerOf([shiftC(side, 0, sideUp), rect(0, 0, D, sideUp), rect(T, 0, D - 2 * T, sideUp + 0.5)]) : side);
  if (p.joint.style !== "tabs") {
    const k = boxPanels(W, D, Hp, T, f, top);
    const side = raise(k.side);
    const parts: GenPart[] = [
      { id: "front", name: "Front", outer: k.face, holes: [], place: wall(0, Hp, D - T) },
      { id: "back", name: "Back", outer: k.face, holes: [], place: wall(0, Hp, 0) },
      { id: "left", name: "Left side", outer: side, holes: [], place: wall(T, H, 0, 90) },
      { id: "right", name: "Right side", outer: side, holes: [], place: wall(W, H, 0, 90) },
      { id: "bottom", name: "Bottom", outer: k.bottom, holes: [], place: flat(0, 0, 0) },
    ];
    if (k.top) parts.push({ id: "top", name: "Top", outer: k.top, holes: [], place: flat(0, 0, Hp - T) });
    return { parts, m: 0, minEdge: Math.min(W, D, Hp) - 2 * T };
  }
  // Tab and slot: the walls stand on the bottom (and under the top) with tabs through slots; the
  // corners between walls keep their fingers.
  const m = Math.max(4, 1.5 * T), Hw = Hp - T - (top ? T : 0);
  const N: EdgeSpec = { mate: false, ends: true };
  const E = (ends: boolean): EdgeSpec => ({ mate: true, ends });
  const tf = tabsAlong(W, T), ts = tabsAlong(D, T);
  const withTabs = (c: Contour, t: { w: number; us: number[] }) => {
    const rs = [c];
    for (const u of t.us) {
      rs.push(rect(u - t.w / 2, Hw - 0.5, t.w, T + 0.5));
      if (top) rs.push(rect(u - t.w / 2, -T, t.w, T + 0.5));
    }
    const o = outerOf(rs);
    return top ? shiftC(o, 0, T) : o;
  };
  const face = withTabs(fingerPanel(W, Hw, T, f, [N, E(true), N, E(true)], [true, true, true, true]), tf);
  const side = raise(withTabs(fingerPanel(D, Hw, T, f, [N, E(false), N, E(false)], [false, false, false, false]), ts));
  const plate = (): { outer: Contour; holes: Contour[] } => {
    const holes: Contour[] = [];
    for (const u of tf.us) holes.push(rect(m + u - tf.w / 2, m, tf.w, T), rect(m + u - tf.w / 2, m + D - T, tf.w, T));
    for (const u of ts.us) holes.push(rect(m, m + u - ts.w / 2, T, ts.w), rect(m + W - T, m + u - ts.w / 2, T, ts.w));
    return { outer: roundedRect(0, 0, W + 2 * m, D + 2 * m, Math.min(m, 3)), holes };
  };
  const parts: GenPart[] = [
    { id: "front", name: "Front", outer: face, holes: [], place: wall(0, Hp, D - T) },
    { id: "back", name: "Back", outer: face, holes: [], place: wall(0, Hp, 0) },
    { id: "left", name: "Left side", outer: side, holes: [], place: wall(T, H, 0, 90) },
    { id: "right", name: "Right side", outer: side, holes: [], place: wall(W, H, 0, 90) },
    { id: "bottom", name: "Bottom", ...plate(), place: flat(-m, -m, 0) },
  ];
  if (top) parts.push({ id: "top", name: "Top", ...plate(), place: flat(-m, -m, Hp - T) });
  return { parts, m, minEdge: Hw - 2 * T };
}

export interface LidKit {
  parts: GenPart[];
  /** Highest z inside the box that stays clear of the lid and its fittings. */
  ceiling: number;
  /** Height of the closed box. */
  total: number;
  assembly: string[];
  /** Lid face for the engraving: part id, outline, and the art centre on it. */
  face?: { id: string; outline: Contour; cx: number; cy: number; w: number; h: number };
  pinNeed?: number;
}

const LEDGE = 5;
/**
 * Pin hinge sizes for a pin of diameter d in material T. The lid's back edge sits over the pin, a
 * below the lid; the gap g to the hinge strip lets the lid swing a little past upright, where it
 * comes to rest against the strip.
 */
export function pinGeometry(T: number, d: number) {
  const a = d / 2 + 4, Rc = d / 2 + 3.5, sw = T + 4;
  const g = a + T + 0.6;
  return { a, Rc, sw, g, ya: sw + g, Lf: 2 * Rc + 10 };
}

/**
 * Lid parts for walls W × D reaching z = H (sides; the front and back reach H − T for a pin hinge).
 * The shell's parts are adjusted in place (pin holes, the finger notch).
 */
export function lidKit(p: BoxesParams, kind: LidKind, W: number, D: number, H: number, sh: Shell, c: number, notch: boolean): LidKit {
  const T = p.T, parts: GenPart[] = [];
  const get = (id: string) => sh.parts.find((q) => q.id === id)!;
  const notchFront = (top: number) => {
    const fr = get("front");
    const r = Math.min(12, (W - 2 * T) / 5, top / 3);
    fr.outer = cut(fr.outer, [circle(W / 2, 0, r)]).outer;
  };
  switch (kind) {
    case "closed": {
      const t = get("top");
      return { parts, ceiling: H - T, total: H, assembly: ["Glue the top last, or leave it dry as a press-fit lid."], face: { id: "top", outline: t.outer, cx: W / 2 + sh.m, cy: D / 2 + sh.m, w: W - 2 * T, h: D - 2 * T } };
    }
    case "open":
      if (notch) notchFront(H);
      return { parts, ceiling: H, total: H, assembly: [] };
    case "liftoff": {
      const lid = rect(0, 0, W, D);
      parts.push({ id: "lid", name: "Lid", outer: lid, holes: [], place: flat(0, 0, H) });
      parts.push({ id: "lip", name: "Lid lip", outer: rect(0, 0, W - 2 * T - 2 * c, D - 2 * T - 2 * c), holes: [], place: flat(T + c, T + c, H - T) });
      return { parts, ceiling: H - T, total: H + T, assembly: ["Glue the lip centred under the lid; it drops inside the walls and keeps the lid in place."], face: { id: "lid", outline: lid, cx: W / 2, cy: D / 2, w: W - 2 * T, h: D - 2 * T } };
    }
    case "sliding": {
      const o = 6, Lw = W - 2 * T - 2 * c, Ld = D - T - c;
      let lid = rect(0, 0, Lw, Ld);
      if (notch) lid = cut(lid, [circle(Lw / 2, Ld, Math.min(10, Lw / 5))]).outer;
      parts.push(
        { id: "ledge-l", name: "Lid ledge (left)", outer: rect(0, 0, LEDGE, D - 2 * T), holes: [], place: flat(T, T, H - T) },
        { id: "ledge-r", name: "Lid ledge (right)", outer: rect(0, 0, LEDGE, D - 2 * T), holes: [], place: flat(W - T - LEDGE, T, H - T) },
        { id: "ledge-b", name: "Lid ledge (back)", outer: rect(0, 0, W - 2 * T - 2 * LEDGE, LEDGE), holes: [], place: flat(T + LEDGE, T, H - T) },
        { id: "runner", name: "Lid runner", outer: cut(rect(0, 0, W, D), [rect(T, T, W - 2 * T, D)]).outer, holes: [], place: flat(0, 0, H) },
        { id: "lid", name: "Sliding lid", outer: lid, holes: [], place: flat(T + c, T + c, H) },
        { id: "cap", name: "Lid cap", outer: cut(rect(0, 0, W, D), [rect(T + o, T + o, W - 2 * T - 2 * o, D)]).outer, holes: [], place: flat(0, 0, H + T) },
      );
      return {
        parts, ceiling: H - T, total: H + 2 * T,
        assembly: [
          "Glue the three ledges inside the walls, flush with the top edge.",
          "Glue the runner on the walls and the cap on the runner, open side to the front; slide the lid in before the glue sets to check it runs freely.",
        ],
        face: { id: "lid", outline: lid, cx: Lw / 2, cy: Ld / 2 - (notch ? 5 : 0), w: Lw - 2 * o, h: Ld - o - (notch ? 20 : 0) },
      };
    }
    case "pin": {
      const g = pinGeometry(T, p.box.pin), Hp = H - T, hole = p.box.pin / 2 + 0.1;
      const Lw = W - 2 * T - 2 * c, Ld = D - g.ya;
      const za = Hp - g.a;
      for (const id of ["left", "right"]) get(id).holes.push(circle(g.ya, H - za, hole));
      // Cheeks hang inside the side walls, 2 mm in from the lid edge, and carry the pin.
      const tabU = [g.Rc + g.Lf * 0.35, g.Rc + g.Lf * 0.8], tw = 6;
      const cheek = outerOf([circle(g.Rc, g.a + T, g.Rc), rect(g.Rc, T, g.Lf, g.a), ...tabU.map((u) => rect(u - tw / 2, 0, tw, T + 0.5))]);
      const y0 = g.ya - g.Rc, inset = 2;
      const slots = (u0: number) => tabU.map((u) => rect(u0, u - g.Rc - tw / 2, T, tw));
      const lid = rect(0, 0, Lw, Ld);
      if (notch) notchFront(Hp);
      parts.push(
        { id: "strip", name: "Hinge strip", outer: rect(0, 0, W - 2 * T, g.sw), holes: [], place: flat(T, 0, Hp) },
        { id: "lid", name: "Hinged lid", outer: lid, holes: [...slots(inset), ...slots(Lw - inset - T)], place: flat(T + c, g.ya, Hp) },
        { id: "cheek-l", name: "Hinge cheek (left)", outer: cheek, holes: [circle(g.Rc, g.a + T, hole)], place: wall(2 * T + c + inset, H, y0, 90) },
        { id: "cheek-r", name: "Hinge cheek (right)", outer: cheek, holes: [circle(g.Rc, g.a + T, hole)], place: wall(W - T - c - inset, H, y0, 90) },
      );
      return {
        parts, ceiling: za - g.Rc - 1, total: H, pinNeed: g.ya + g.Lf + 10,
        assembly: [
          "Glue the hinge strip on the back wall between the sides, and the two cheeks into the slots under the lid.",
          `Set the lid in place and push a ${p.box.pin} mm pin (dowel, nail or filament) through each side wall into its cheek; glue the pins in the walls only so the lid turns.`,
        ],
        face: { id: "lid", outline: lid, cx: Lw / 2, cy: Ld / 2, w: Lw - 12, h: Ld - 8 },
      };
    }
    case "inset": {
      const Lw = W - 2 * T - 2 * c, Ld = D - 2 * T - 2 * c, lid = rect(0, 0, Lw, Ld);
      parts.push(
        { id: "ledge-l", name: "Lid ledge (left)", outer: rect(0, 0, LEDGE, D - 2 * T), holes: [], place: flat(T, T, H - 2 * T) },
        { id: "ledge-r", name: "Lid ledge (right)", outer: rect(0, 0, LEDGE, D - 2 * T), holes: [], place: flat(W - T - LEDGE, T, H - 2 * T) },
        { id: "ledge-b", name: "Lid ledge (back)", outer: rect(0, 0, W - 2 * T - 2 * LEDGE, LEDGE), holes: [], place: flat(T + LEDGE, T, H - 2 * T) },
        { id: "ledge-f", name: "Lid ledge (front)", outer: rect(0, 0, W - 2 * T - 2 * LEDGE, LEDGE), holes: [], place: flat(T + LEDGE, D - T - LEDGE, H - 2 * T) },
        { id: "lid", name: "Inset lid", outer: lid, holes: [], place: flat(T + c, T + c, H - T) },
      );
      const art = hasArt(p), kr = Math.min(11, Lw / 5, Ld / 5);
      const ky = art ? Ld - kr - 6 : Ld / 2;
      parts.push(
        { id: "knob-neck", name: "Knob neck", outer: circle(kr * 0.6, kr * 0.6, kr * 0.6), holes: [], place: flat(T + c + Lw / 2 - kr * 0.6, T + c + ky - kr * 0.6, H) },
        { id: "knob", name: "Knob", outer: circle(kr, kr, kr), holes: [], place: flat(T + c + Lw / 2 - kr, T + c + ky - kr, H + T) },
      );
      return {
        parts, ceiling: H - 2 * T, total: H + 2 * T,
        assembly: ["Glue the four ledges inside the walls one thickness below the top, so the lid sits flush.", "Glue the knob neck and knob together, then onto the lid."],
        face: { id: "lid", outline: lid, cx: Lw / 2, cy: art ? (Ld - 2 * kr - 12) / 2 : Ld / 2, w: Lw - 8, h: art ? Ld - 2 * kr - 16 : Ld - 8 },
      };
    }
  }
}

/** Adds the engraving to the lid face; returns the text and art sizes for the checks. */
function engraveLid(p: BoxesParams, kit: LidKit, all: GenPart[], art: Art) {
  if (!kit.face || !hasArt(p)) return {};
  const f = kit.face, part = all.find((q) => q.id === f.id);
  if (!part) return {};
  markLid(part, p, engraveOn(p, art, f.outline, f.cx, f.cy));
  return { textWidth: art.w, textRoom: f.w, artHeight: art.h, artRoom: f.h };
}

/**
 * The pattern through the walls and the lid face. On the lid a label is left solid round the
 * engraving, in a double frame; a lift-off lid's lip becomes a frame so the holes stay open.
 */
export function pierceBox(p: BoxesParams, parts: GenPart[], kit: LidKit, art: Art, lid: LidKind | "none"): { label: string; value: string }[] {
  if (!pierced(p)) return [];
  const T = p.T, edge = T + Math.max(1, p.pierce.bar) + 1;
  let walls = 0, top = 0;
  if (pierceWalls(p)) for (const id of ["front", "back", "left", "right"]) { const w = parts.find((q) => q.id === id); if (w) walls += pierce(p, w, edge); }
  if (pierceLid(p) && kit.face && lid !== "inset" && lid !== "open" && lid !== "none") {
    const part = parts.find((q) => q.id === kit.face!.id);
    if (part) {
      const keep: KeepOut[] = [];
      if (art.cs.length) {
        const k = labelBox(kit.face.cx, kit.face.cy, art.w, art.h);
        keep.push(k);
        part.engrave = [...(part.engrave ?? []), ...labelFrame(k)];
      }
      top = pierce(p, part, edge, keep);
      const lip = parts.find((q) => q.id === "lip");
      if (lip && top) {
        const xs = lip.outer.map((q) => q[0]), ys = lip.outer.map((q) => q[1]), w = Math.max(6, 2 * T);
        const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
        if (x1 - x0 > 3 * w && y1 - y0 > 3 * w) { lip.holes.push(rect(x0 + w, y0 + w, x1 - x0 - 2 * w, y1 - y0 - 2 * w)); lip.name = "Lid lip (frame)"; }
      }
    }
  }
  return [{ label: "Pattern", value: `${FRET_NAMES[p.pierce.pattern]}: ${walls} holes in the walls, ${top} in the lid` }];
}

const insideH = (p: BoxesParams, h: number, lid: LidKind | "none") => (p.joint.outside ? h : h + lidWalls(lid) * p.T);

/** A box with any lid, finger or tab-and-slot joints, a finger notch and an engraved lid. */
export function buildBoxV2(p: BoxesParams, ctx: BuildContext): V2Output {
  const T = p.T, b = p.box, f = p.joint.finger;
  const W = p.joint.outside ? b.width : b.width + 2 * T, D = p.joint.outside ? b.depth : b.depth + 2 * T;
  const H = insideH(p, b.height, b.lid);
  const sh = shell(p, W, D, H, b.lid === "closed", b.lid === "pin" ? T : 0);
  const kit = lidKit(p, b.lid, W, D, H, sh, Math.max(0, b.clearance), b.notch);
  const parts = [...sh.parts, ...kit.parts];
  const art = lidArt(p, ctx);
  const sizes = engraveLid(p, kit, parts, art);
  const pattern = pierceBox(p, parts, kit, art, b.lid);
  return {
    parts,
    stats: [
      { label: "Outside", value: `${r1(W + 2 * sh.m)} × ${r1(D + 2 * sh.m)} × ${r1(kit.total)} mm` },
      { label: "Inside", value: `${r1(W - 2 * T)} × ${r1(D - 2 * T)} × ${r1(H - lidWalls(b.lid) * T)} mm` },
      ...pattern,
      { label: p.joint.style === "tabs" ? "Joints" : "Fingers", value: p.joint.style === "tabs" ? "Tabs through the bottom, fingers at the corners" : `${fingerCount(W - 2 * T, f)} × ${fingerCount(D - 2 * T, f)} × ${fingerCount(H - 2 * T, f)}` },
    ],
    assembly: [
      p.joint.style === "tabs" ? "Push the walls' tabs into the bottom's slots and close the corners; every finger has one mate." : "Dry-fit the four walls around the bottom first; every finger has one mate.",
      "Glue the joints with a thin bead of wood glue and clamp with tape or rubber bands until dry.",
      ...kit.assembly,
    ],
    notice: art.loading ? "Loading the font." : undefined,
    missing: art.missing,
    info: { size: [W + 2 * sh.m, D + 2 * sh.m, kit.total], minEdge: sh.minEdge, ...sizes, ...(kit.pinNeed ? { pinNeed: kit.pinNeed, pinRoom: D } : {}) },
  };
}

/** Half-lap dividers for an X × Y space, `hd` tall, standing at (x0, y0, z0). */
function dividers(T: number, X: number, Y: number, hd: number, cols: number, rows: number, x0: number, y0: number, z0: number) {
  const cx = (X - (cols - 1) * T) / cols, cy = (Y - (rows - 1) * T) / rows;
  const xs = Array.from({ length: cols - 1 }, (_, i) => (i + 1) * cx + i * T);
  const ys = Array.from({ length: rows - 1 }, (_, i) => (i + 1) * cy + i * T);
  const parts: GenPart[] = [];
  ys.forEach((y, i) => {
    const s = differenceShapes([rect(0, 0, X, hd)], xs.map((x) => rect(x, hd / 2, T, hd)));
    parts.push({ id: `divx${i + 1}`, name: `Divider ${i + 1} (across)`, outer: s[0].outer, holes: [], place: wall(x0, z0 + hd, y0 + y) });
  });
  xs.forEach((x, i) => {
    const s = differenceShapes([rect(0, 0, Y, hd)], ys.map((y) => rect(y, -1, T, hd / 2 + 1)));
    parts.push({ id: `divy${i + 1}`, name: `Divider ${i + 1} (front to back)`, outer: s[0].outer, holes: [], place: wall(x0 + x + T, z0 + hd, y0, 90) });
  });
  return { parts, cx, cy };
}

/** A tray with a lid (tea, card or jewellery box), or with tab-and-slot joints. */
export function buildTrayV2(p: BoxesParams, ctx: BuildContext): V2Output {
  const T = p.T, t = p.tray, lid: LidKind = t.lid === "none" ? "open" : t.lid;
  const W = p.joint.outside ? t.width : t.width + 2 * T, D = p.joint.outside ? t.depth : t.depth + 2 * T;
  const H = insideH(p, t.height, t.lid);
  const sh = shell(p, W, D, H, false, lid === "pin" ? T : 0);
  const kit = lidKit(p, lid, W, D, H, sh, 0.3, false);
  const cols = Math.max(1, Math.round(t.cols)), rows = Math.max(1, Math.round(t.rows));
  const room = kit.ceiling - T - 0.5;
  const hd = Math.min((H - T) * Math.min(100, Math.max(30, t.dividers)) / 100, room);
  const dv = dividers(T, W - 2 * T, D - 2 * T, hd, cols, rows, T, T, T);
  const parts = [...sh.parts, ...dv.parts, ...kit.parts];
  const art = lidArt(p, ctx);
  const sizes = engraveLid(p, kit, parts, art);
  const pattern = pierceBox(p, parts, kit, art, t.lid);
  return {
    parts,
    stats: [
      { label: "Outside", value: `${r1(W + 2 * sh.m)} × ${r1(D + 2 * sh.m)} × ${r1(kit.total)} mm` },
      ...pattern,
      { label: "Compartments", value: `${cols} × ${rows}, each ${r1(dv.cx)} × ${r1(dv.cy)} mm` },
      { label: "Dividers", value: `${cols + rows - 2}, ${r1(hd)} mm tall` },
    ],
    assembly: [
      "Glue the walls around the bottom.",
      ...(cols > 1 && rows > 1 ? ["Stand the front-to-back dividers in with their slots up, then lower the dividers across onto them."] : cols + rows > 2 ? ["Stand the dividers in; they hold by friction, or add a dot of glue."] : []),
      ...kit.assembly,
    ],
    notice: art.loading ? "Loading the font." : undefined,
    missing: art.missing,
    info: { size: [W + 2 * sh.m, D + 2 * sh.m, kit.total], compartment: Math.min(dv.cx, dv.cy), minEdge: sh.minEdge, ...sizes, ...(kit.pinNeed ? { pinNeed: kit.pinNeed, pinRoom: D } : {}) },
  };
}

/** A divider grid that drops into a box or drawer you already have. */
export function buildInsert(p: BoxesParams): V2Output {
  const T = p.T, s = p.insert, c = Math.max(0, s.clearance);
  const X = s.width - 2 * c, Y = s.depth - 2 * c, hd = s.height;
  const cols = Math.max(1, Math.round(s.cols)), rows = Math.max(1, Math.round(s.rows));
  if (cols * rows < 2) return { parts: [], stats: [], error: "Add a column or a row: the insert needs at least one divider." };
  const dv = dividers(T, X, Y, hd, cols, rows, 0, 0, 0);
  return {
    parts: dv.parts,
    stats: [
      { label: "Fits inside", value: `${s.width} × ${s.depth} mm` },
      { label: "Compartments", value: `${cols} × ${rows}, each ${r1(dv.cx)} × ${r1(dv.cy)} mm` },
      { label: "Dividers", value: `${cols + rows - 2}, ${r1(hd)} mm tall` },
    ],
    assembly: [cols > 1 && rows > 1 ? "Slot the dividers together (front-to-back ones slots up) and drop the grid into the box." : "Stand the dividers in the box; they hold by friction."],
    info: { size: [X, Y, hd], compartment: Math.min(dv.cx, dv.cy) },
  };
}

/** A cabinet open at the front with 1 to 4 drawers stacked inside. */
export function buildDrawer(p: BoxesParams, ctx: BuildContext): V2Output {
  const T = p.T, f = p.joint.finger, d = p.drawer, c = Math.max(0, d.clearance);
  const W = p.joint.outside ? d.width : d.width + 2 * T, H = p.joint.outside ? d.height : d.height + 2 * T, D = p.joint.outside ? d.depth : d.depth + T;
  const N = Math.min(4, Math.max(1, Math.round(d.drawers)));
  // The cabinet is an open box lying on its back: its open top is the front.
  const k = boxPanels(W, H, D, T, f, false);
  const face = flipV(k.face, D), side = turn(k.side, D);
  const parts: GenPart[] = [
    { id: "cab-bottom", name: "Cabinet bottom", outer: face, holes: [], place: flat(0, 0, 0) },
    { id: "cab-top", name: "Cabinet top", outer: face, holes: [], place: flat(0, 0, H - T) },
    { id: "cab-back", name: "Cabinet back", outer: k.bottom, holes: [], place: wall(0, H, 0) },
    { id: "cab-left", name: "Cabinet left", outer: side, holes: [], place: wall(T, H, 0, 90) },
    { id: "cab-right", name: "Cabinet right", outer: side, holes: [], place: wall(W, H, 0, 90) },
  ];
  const bay = (H - 2 * T) / N, dw = W - 2 * T - 2 * c, dh = bay - c, dd = D - T - c;
  const kd = boxPanels(dw, dd, dh, T, f, false);
  for (let i = 0; i < N; i++) {
    const x0 = T + c, y0 = T + c, z0 = T + i * bay, n = N > 1 ? ` ${i + 1}` : "";
    let front = kd.face;
    const holes: Contour[] = [];
    if (d.pull === "hole") holes.push(circle(dw / 2, Math.min(dh * 0.4, 18), Math.min(11, dh * 0.22)));
    if (d.pull === "notch") front = cut(front, [circle(dw / 2, 0, Math.min(14, dh * 0.35))]).outer;
    parts.push(
      { id: `d${i + 1}-front`, name: `Drawer${n} front`, outer: front, holes, place: wall(x0, z0 + dh, y0 + dd - T) },
      { id: `d${i + 1}-back`, name: `Drawer${n} back`, outer: kd.face, holes: [], place: wall(x0, z0 + dh, y0) },
      { id: `d${i + 1}-left`, name: `Drawer${n} left`, outer: kd.side, holes: [], place: wall(x0 + T, z0 + dh, y0, 90) },
      { id: `d${i + 1}-right`, name: `Drawer${n} right`, outer: kd.side, holes: [], place: wall(x0 + dw, z0 + dh, y0, 90) },
      { id: `d${i + 1}-bottom`, name: `Drawer${n} bottom`, outer: kd.bottom, holes: [], place: flat(x0, y0, z0) },
    );
    if (d.pull === "knob") {
      const kr = Math.min(10, dh * 0.25), zc = z0 + dh / 2;
      parts.push(
        { id: `d${i + 1}-neck`, name: `Drawer${n} knob neck`, outer: circle(kr * 0.6, kr * 0.6, kr * 0.6), holes: [], place: wall(x0 + dw / 2 - kr * 0.6, zc + kr * 0.6, D) },
        { id: `d${i + 1}-knob`, name: `Drawer${n} knob`, outer: circle(kr, kr, kr), holes: [], place: wall(x0 + dw / 2 - kr, zc + kr, D + T) },
      );
    }
  }
  const art = lidArt(p, ctx);
  let sizes = {};
  if (hasArt(p)) {
    markLid(parts[1], p, engraveOn(p, art, rect(0, 0, W, D), W / 2, D / 2));
    sizes = { textWidth: art.w, textRoom: W - 12, artHeight: art.h, artRoom: D - 12 };
  }
  return {
    parts,
    stats: [
      { label: "Outside", value: `${r1(W)} × ${r1(D + (d.pull === "knob" ? 2 * T : 0))} × ${r1(H)} mm` },
      { label: "Drawers", value: `${N}, each ${r1(dw - 2 * T)} × ${r1(dd - 2 * T)} × ${r1(dh - T)} mm inside` },
      { label: "Fingers", value: `${fingerCount(W - 2 * T, f)} × ${fingerCount(H - 2 * T, f)} × ${fingerCount(D - 2 * T, f)}` },
    ],
    assembly: [
      "Glue the cabinet: the sides and back between the top and bottom, open side to the front.",
      "Glue each drawer's walls around its bottom, then slide the drawers in from the front.",
      ...(d.pull === "knob" ? ["Glue a knob neck and knob to the middle of each drawer front."] : []),
    ],
    notice: art.loading ? "Loading the font." : undefined,
    missing: art.missing,
    info: { size: [W, D, H], minEdge: Math.min(dh, dw, dd, W, H, D) - 2 * T, drawerH: dh - T, ...sizes },
  };
}

/** A hexagonal box: six walls with tabs through a hexagonal bottom, and a lift-off lid. */
export function buildHex(p: BoxesParams, ctx: BuildContext): V2Output {
  const T = p.T, h = p.hex, c = Math.max(0, h.clearance);
  const F = p.joint.outside ? h.width - 2 * T : h.width, Hh = p.joint.outside ? h.height : h.height + T;
  const a = F / Math.sqrt(3), Ro = F / 2 + T, m = Math.max(4, 1.5 * T), Rp = Ro + m;
  const C30 = Math.cos(Math.PI / 6), cx = Rp / C30, cy = Rp, Hw = Hh - T;
  const n = a < 60 ? 1 : 2, tw = Math.min(20, a * 0.28);
  const us = n === 1 ? [a / 2] : [a * 0.28, a * 0.72];
  const wallC = outerOf([rect(0, 0, a, Hw), ...us.map((u) => rect(u - tw / 2, Hw - 0.5, tw, T + 0.5))]);
  const parts: GenPart[] = [], slots: Contour[] = [];
  for (let k = 0; k < 6; k++) {
    const al = ((90 + 60 * k) * Math.PI) / 180, nx = Math.cos(al), ny = Math.sin(al);
    const ux = -ny, uy = nx;
    const Sx = cx + nx * Ro - (a / 2) * ux, Sy = cy + ny * Ro - (a / 2) * uy;
    const yaw = (90 + 60 * k + 90) % 360;
    parts.push({ id: `wall${k + 1}`, name: k === 0 ? "Front wall" : `Wall ${k + 1}`, outer: wallC, holes: [], place: { x: Sx, y: -Hh, z: Sy, upright: true, ...(yaw ? { yaw } : {}) } });
    for (const u of us) {
      const P = (uu: number, hh: number): Pt => [Sx + uu * ux - hh * nx, Sy + uu * uy - hh * ny];
      slots.push([P(u - tw / 2, 0), P(u + tw / 2, 0), P(u + tw / 2, T), P(u - tw / 2, T)]);
    }
  }
  parts.unshift({ id: "bottom", name: "Bottom", outer: regularPolygon(6, Rp / C30, 90, cx, cy), holes: slots, place: flat(0, 0, 0) });
  let total = Hh;
  const art = lidArt(p, ctx);
  let sizes = {};
  if (h.lid === "liftoff") {
    const lid = regularPolygon(6, Ro / C30, 90, cx, cy);
    parts.push(
      { id: "lid", name: "Lid", outer: lid, holes: [], place: flat(0, 0, Hh) },
      { id: "lip", name: "Lid lip", outer: regularPolygon(6, (F / 2 - c) / C30, 90, cx, cy), holes: [], place: flat(0, 0, Hh - T) },
    );
    total += T;
    if (hasArt(p)) {
      markLid(parts[parts.length - 2], p, engraveOn(p, art, lid, cx, cy));
      sizes = { textWidth: art.w, textRoom: a * 1.4, artHeight: art.h, artRoom: F * 0.8 };
    }
  }
  return {
    parts,
    stats: [
      { label: "Outside", value: `${r1(2 * Ro / C30)} × ${r1(2 * Ro)} × ${r1(total)} mm` },
      { label: "Inside", value: `${r1(F)} mm across the flats, ${r1(Hh - T)} mm deep` },
      { label: "Walls", value: `6 × ${r1(a)} mm` },
    ],
    assembly: [
      "Push the six walls' tabs into the bottom; their inside corners meet.",
      "Run a bead of glue down each outside corner; the small V between the walls fills with glue or wood filler.",
      ...(h.lid === "liftoff" ? ["Glue the lip centred under the lid."] : []),
    ],
    notice: art.loading ? "Loading the font." : undefined,
    missing: art.missing,
    info: { size: [2 * Rp / C30, 2 * Rp, total], ...sizes },
  };
}

/** A closed box with a coin slot in the top and a plug in the bottom to empty it. */
export function buildMoney(p: BoxesParams, ctx: BuildContext): V2Output {
  const T = p.T, f = p.joint.finger, s = p.money;
  const W = p.joint.outside ? s.width : s.width + 2 * T, D = p.joint.outside ? s.depth : s.depth + 2 * T, H = insideH(p, s.height, "closed");
  const sh = shell(p, W, D, H, true);
  const top = sh.parts.find((q) => q.id === "top")!, bottom = sh.parts.find((q) => q.id === "bottom")!, front = sh.parts[0];
  const mx = sh.m + W / 2, my = sh.m + D / 2, L = Math.max(10, s.slot), sw = 4;
  top.holes.push(stadium(mx - (L - sw) / 2, my, mx + (L - sw) / 2, my, sw));
  const pr = Math.max(10, s.plug) / 2, cr = pr + 7;
  bottom.holes.push(circle(mx, my, pr));
  const parts: GenPart[] = [
    ...sh.parts,
    { id: "plug", name: "Plug", outer: circle(pr, pr, pr), holes: [], place: flat(W / 2 - pr, D / 2 - pr, 0) },
    { id: "plug-cap", name: "Plug cap", outer: cut(circle(cr, cr, cr), [circle(cr, 2 * cr, 4)]).outer, holes: [], place: flat(W / 2 - cr, D / 2 - cr, -T) },
  ];
  const art = lidArt(p, ctx);
  let sizes = {};
  if (hasArt(p)) {
    markLid(front, p, engraveOn(p, art, front.outer, W / 2, H / 2));
    sizes = { textWidth: art.w, textRoom: W - 4 * T, artHeight: art.h, artRoom: H - 4 * T };
  }
  return {
    parts,
    stats: [
      { label: "Outside", value: `${r1(W + 2 * sh.m)} × ${r1(D + 2 * sh.m)} × ${r1(H + T)} mm` },
      { label: "Coin slot", value: `${r1(L)} × ${sw} mm` },
      { label: "Plug", value: `${r1(2 * pr)} mm` },
    ],
    assembly: [
      "Glue the walls, bottom and top; every finger has one mate.",
      "Glue the plug centred on the plug cap. It presses into the bottom; pull it out by the notch to empty the box.",
    ],
    notice: art.loading ? "Loading the font." : undefined,
    missing: art.missing,
    info: { size: [W + 2 * sh.m, D + 2 * sh.m, H + T], minEdge: sh.minEdge, slotRoom: Math.min(W, D) - 2 * T - 12, plugRoom: Math.min(W, D) - 2 * T - 2 * f - 8, ...sizes },
  };
}

/** Open trays that stack: a ring under each one drops inside the tray below. */
export function buildStack(p: BoxesParams, ctx: BuildContext): V2Output {
  const T = p.T, f = p.joint.finger, s = p.stack, c = Math.max(0, s.clearance);
  const W = p.joint.outside ? s.width : s.width + 2 * T, D = p.joint.outside ? s.depth : s.depth + 2 * T, H = p.joint.outside ? s.height : s.height + T;
  const N = Math.min(5, Math.max(1, Math.round(s.trays)));
  const k = boxPanels(W, D, H, T, f, false);
  const RW = W - 2 * T - 2 * c, RD = D - 2 * T - 2 * c, band = Math.min(10, RW / 4, RD / 4);
  const ring = { outer: rect(0, 0, RW, RD), holes: [rect(band, band, RW - 2 * band, RD - 2 * band)] };
  const parts: GenPart[] = [];
  for (let i = 0; i < N; i++) {
    const z0 = i * H, n = ` ${i + 1}`;
    parts.push(
      { id: `t${i + 1}-front`, name: `Tray${n} front`, outer: k.face, holes: [], place: wall(0, z0 + H, D - T) },
      { id: `t${i + 1}-back`, name: `Tray${n} back`, outer: k.face, holes: [], place: wall(0, z0 + H, 0) },
      { id: `t${i + 1}-left`, name: `Tray${n} left`, outer: k.side, holes: [], place: wall(T, z0 + H, 0, 90) },
      { id: `t${i + 1}-right`, name: `Tray${n} right`, outer: k.side, holes: [], place: wall(W, z0 + H, 0, 90) },
      { id: `t${i + 1}-bottom`, name: `Tray${n} bottom`, outer: k.bottom, holes: [], place: flat(0, 0, z0) },
    );
    if (i > 0) parts.push({ id: `t${i + 1}-ring`, name: `Tray${n} stacking ring`, ...ring, place: flat(T + c, T + c, z0 - T) });
  }
  const art = lidArt(p, ctx);
  let sizes = {};
  if (s.lid) {
    const lid = rect(0, 0, W, D);
    parts.push(
      { id: "lid", name: "Lid", outer: lid, holes: [], place: flat(0, 0, N * H) },
      { id: "lid-ring", name: "Lid ring", ...ring, place: flat(T + c, T + c, N * H - T) },
    );
    if (hasArt(p)) {
      markLid(parts[parts.length - 2], p, engraveOn(p, art, lid, W / 2, D / 2));
      sizes = { textWidth: art.w, textRoom: W - 2 * T - 8, artHeight: art.h, artRoom: D - 2 * T - 8 };
    }
  }
  return {
    parts,
    stats: [
      { label: "Each tray", value: `${r1(W)} × ${r1(D)} × ${r1(H)} mm, ${r1(W - 2 * T)} × ${r1(D - 2 * T)} inside` },
      { label: "Stack", value: `${N} trays, ${r1(N * H + (s.lid ? T : 0))} mm tall` },
      { label: "Fingers", value: `${fingerCount(W - 2 * T, f)} × ${fingerCount(D - 2 * T, f)} × ${fingerCount(H - 2 * T, f)}` },
    ],
    assembly: [
      "Glue each tray's walls around its bottom.",
      "Glue a stacking ring centred under every tray but the lowest (and under the lid); the ring drops inside the tray below and keeps the stack from sliding.",
    ],
    notice: art.loading ? "Loading the font." : undefined,
    missing: art.missing,
    info: { size: [W, D, N * H + (s.lid ? T : 0)], minEdge: Math.min(W, D, H) - 2 * T, ...sizes },
  };
}
