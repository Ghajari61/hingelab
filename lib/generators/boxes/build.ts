/**
 * The Boxes set: one build per design. Sizes are mm; parts are cut at their nominal size (the shell
 * adds the kerf, which tightens every finger, tab and slot by the same amount). 3D places follow the
 * contract in types.ts: upright parts hang from their top edge, `yaw` turns side walls, `tilt` leans
 * roofs and the phone rest.
 */
import { differenceShapes, makeShape, offsetShapes, shapeContours, unionShapes } from "@/lib/letters/polygon";
import { circle, deg, rect, roundedRect, stadium } from "../geom";
import { tagItem } from "../items";
import type { BuildContext, Contour, GenOutput, GenPart, Pt } from "../types";
import { boxPanels, fingerCount } from "./joints";
import { buildBoxV2, buildDrawer, buildHex, buildInsert, buildMoney, buildStack, buildTrayV2, hasArt } from "./more";
import { pierce, pierceLid, pierceWalls, pierced } from "./pierce";
import { FRET_NAMES, type KeepOut } from "../fretwork";
import { buildBook } from "./book";
import { DESIGN_NAMES, FIT_MM, FIT_NAMES, type BoxesParams } from "./params";
import { patternUnit } from "../pattern";

export interface BoxesInfo {
  /** Outside size of the finished piece, mm. */
  size: [number, number, number];
  /** Narrowest compartment (trays), mm. */
  compartment?: number;
  /** Text wider than its plate. */
  textWidth?: number;
  textRoom?: number;
  /** Hook spacing (key holder), mm. */
  spacing?: number;
  /** Shortest jointed edge inside the corners, mm. */
  minEdge?: number;
  /** Lid art and the room for it, mm. */
  artHeight?: number;
  artRoom?: number;
  drawerH?: number;
  slotRoom?: number;
  plugRoom?: number;
  pinNeed?: number;
  pinRoom?: number;
}
export type BoxesOutput = GenOutput & { info?: BoxesInfo };

type Place = NonNullable<GenPart["place"]>;
const wall = (x: number, top: number, y: number, yaw = 0): Place => ({ x, y: -top, z: y, upright: true, ...(yaw ? { yaw } : {}) });
const flat = (x: number, y: number, z: number): Place => ({ x, y, z });
const r1 = (v: number) => Math.round(v * 10) / 10;
const move = (cs: Contour[], dx: number, dy: number) => cs.map((c) => c.map(([x, y]) => [x + dx, y + dy] as Pt));
const outerOf = (cs: Contour[], evenOdd = false) => {
  const s = unionShapes(cs, [], evenOdd, true);
  return s.reduce((a, b) => (b.area > a.area ? b : a), s[0]).outer;
};
/** Polygon given y up, in a frame of height h (v = h - y). */
const yUp = (pts: Pt[], h: number): Contour => pts.map(([x, y]) => [x, h - y] as Pt);

/** Lines of text centred on (cx, cy). */
function textBlock(ctx: BuildContext, text: string, fontId: string, size: number, cx: number, cy: number, missing: string[]) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const cs: Contour[] = [];
  let width = 0, loading = false;
  if (!lines.length) return { cs, width, loading };
  if (!ctx.text) return { cs, width, loading: true };
  const lead = size * 1.35;
  lines.forEach((line, k) => {
    const t = ctx.text!(line, fontId, size);
    if (!t) { loading = true; return; }
    for (const c of t.missing) if (!missing.includes(c)) missing.push(c);
    width = Math.max(width, t.width);
    cs.push(...move(t.contours, cx, cy + (k - (lines.length - 1) / 2) * lead));
  });
  return { cs, width, loading };
}

/** Outside size from the entered size (inside sizes add a wall each side). */
const outside = (p: BoxesParams, v: number, walls = 2) => (p.joint.outside ? v : v + walls * p.T);

function buildBox(p: BoxesParams): BoxesOutput {
  const T = p.T, f = p.joint.finger, b = p.box;
  const W = outside(p, b.width), D = outside(p, b.depth), H = outside(p, b.height, b.lid === "open" || b.lid === "liftoff" ? 1 : 2);
  const closed = b.lid === "closed";
  const k = boxPanels(W, D, H, T, f, closed);
  const parts: GenPart[] = [
    { id: "front", name: "Front", outer: k.face, holes: [], place: wall(0, H, D - T) },
    { id: "back", name: "Back", outer: k.face, holes: [], place: wall(0, H, 0) },
    { id: "left", name: "Left side", outer: k.side, holes: [], place: wall(T, H, 0, 90) },
    { id: "right", name: "Right side", outer: k.side, holes: [], place: wall(W, H, 0, 90) },
    { id: "bottom", name: "Bottom", outer: k.bottom, holes: [], place: flat(0, 0, 0) },
  ];
  if (k.top) parts.push({ id: "top", name: "Top", outer: k.top, holes: [], place: flat(0, 0, H - T) });
  if (b.lid === "liftoff") {
    const c = Math.max(0, b.clearance);
    parts.push({ id: "lid", name: "Lid", outer: rect(0, 0, W, D), holes: [], place: flat(0, 0, H) });
    parts.push({ id: "lip", name: "Lid lip", outer: rect(0, 0, W - 2 * T - 2 * c, D - 2 * T - 2 * c), holes: [], place: flat(T + c, T + c, H - T) });
  }
  return {
    parts,
    stats: [
      { label: "Outside", value: `${r1(W)} × ${r1(D)} × ${r1(H + (b.lid === "liftoff" ? T : 0))} mm` },
      { label: "Inside", value: `${r1(W - 2 * T)} × ${r1(D - 2 * T)} × ${r1(H - (closed ? 2 : 1) * T)} mm` },
      { label: "Fingers", value: `${fingerCount(W - 2 * T, f)} × ${fingerCount(D - 2 * T, f)} × ${fingerCount(H - 2 * T, f)}` },
    ],
    assembly: [
      "Dry-fit the four walls around the bottom first; every finger has one mate.",
      "Glue the joints with a thin bead of wood glue and clamp with tape or rubber bands until dry.",
      ...(b.lid === "liftoff" ? ["Glue the lip centred under the lid; it drops inside the walls and keeps the lid in place."] : []),
      ...(closed ? ["Glue the top last, or leave it dry as a press-fit lid."] : []),
    ],
    info: { size: [W, D, H], minEdge: Math.min(W, D, H) - 2 * T },
  };
}

function buildTray(p: BoxesParams): BoxesOutput {
  const T = p.T, f = p.joint.finger, t = p.tray;
  const W = outside(p, t.width), D = outside(p, t.depth), H = outside(p, t.height, 1);
  const k = boxPanels(W, D, H, T, f, false);
  const cols = Math.max(1, Math.round(t.cols)), rows = Math.max(1, Math.round(t.rows));
  const X = W - 2 * T, Y = D - 2 * T, hd = (H - T) * Math.min(100, Math.max(30, t.dividers)) / 100;
  const cx = (X - (cols - 1) * T) / cols, cy = (Y - (rows - 1) * T) / rows;
  const parts: GenPart[] = [
    { id: "front", name: "Front", outer: k.face, holes: [], place: wall(0, H, D - T) },
    { id: "back", name: "Back", outer: k.face, holes: [], place: wall(0, H, 0) },
    { id: "left", name: "Left side", outer: k.side, holes: [], place: wall(T, H, 0, 90) },
    { id: "right", name: "Right side", outer: k.side, holes: [], place: wall(W, H, 0, 90) },
    { id: "bottom", name: "Bottom", outer: k.bottom, holes: [], place: flat(0, 0, 0) },
  ];
  // Half-lap dividers: the long ones are slotted from below, the short ones from above.
  const xs = Array.from({ length: cols - 1 }, (_, i) => (i + 1) * cx + i * T);
  const ys = Array.from({ length: rows - 1 }, (_, i) => (i + 1) * cy + i * T);
  ys.forEach((y, i) => {
    const s = differenceShapes([rect(0, 0, X, hd)], xs.map((x) => rect(x, hd / 2, T, hd)));
    parts.push({ id: `divx${i + 1}`, name: `Divider ${i + 1} (across)`, outer: s[0].outer, holes: [], place: wall(T, T + hd, T + y) });
  });
  xs.forEach((x, i) => {
    const s = differenceShapes([rect(0, 0, Y, hd)], ys.map((y) => rect(y, -1, T, hd / 2 + 1)));
    parts.push({ id: `divy${i + 1}`, name: `Divider ${i + 1} (front to back)`, outer: s[0].outer, holes: [], place: wall(T + x + T, T + hd, T, 90) });
  });
  return {
    parts,
    stats: [
      { label: "Outside", value: `${r1(W)} × ${r1(D)} × ${r1(H)} mm` },
      { label: "Compartments", value: `${cols} × ${rows}, each ${r1(cx)} × ${r1(cy)} mm` },
      { label: "Dividers", value: String(cols + rows - 2) },
    ],
    assembly: [
      "Glue the walls around the bottom.",
      ...(cols > 1 && rows > 1 ? ["Stand the front-to-back dividers in with their slots up, then lower the dividers across onto them."] : cols + rows > 2 ? ["Stand the dividers in; they hold by friction, or add a dot of glue."] : []),
    ],
    info: { size: [W, D, H], compartment: Math.min(cx, cy), minEdge: Math.min(W, D, H) - 2 * T },
  };
}

function buildBird(p: BoxesParams): BoxesOutput {
  const T = p.T, f = p.joint.finger, b = p.bird;
  const W = outside(p, b.width), D = outside(p, b.depth), H = outside(p, b.height, 1);
  const th = deg(Math.min(60, Math.max(20, b.pitch))), g = (W / 2) * Math.tan(th);
  const k = boxPanels(W, D, H, T, f, false);
  const gable = outerOf([k.face, [[0, 0], [W / 2, -g], [W, 0]]]);
  const hole = Math.max(20, b.hole), hc = Math.min(H * 0.35, H - T - hole / 2 - 40);
  const frontHoles: Contour[] = [circle(W / 2, hc, hole / 2)];
  if (b.perch) frontHoles.push(circle(W / 2, hc + hole / 2 + 14, 4));
  const vent = [circle(D / 2, 12, 4)];
  const drain = [circle(T + 10, T + 10, 3), circle(W - T - 10, T + 10, 3), circle(T + 10, D - T - 10, 3), circle(W - T - 10, D - T - 10, 3)];
  const ov = Math.max(0, b.overhang), Ls = W / 2 / Math.cos(th);
  // Below 45° the short panel starts a little down the slope so its top corner clears the long
  // panel, which reaches past the ridge far enough to cover it.
  const a0 = th < Math.PI / 4 ? T / Math.tan(2 * th) : 0, ext = th < Math.PI / 4 ? T / Math.sin(2 * th) : T;
  const parts: GenPart[] = [
    { id: "front", name: "Front", outer: gable, holes: frontHoles, place: wall(0, H, D - T) },
    { id: "back", name: "Back", outer: gable, holes: [], place: wall(0, H, 0) },
    { id: "left", name: "Left side", outer: k.side, holes: vent, place: wall(T, H, 0, 90) },
    { id: "right", name: "Right side", outer: k.side, holes: vent, place: wall(W, H, 0, 90) },
    { id: "bottom", name: "Floor", outer: k.bottom, holes: drain, place: flat(0, 0, 0) },
    { id: "roof-l", name: "Roof (short)", outer: rect(0, 0, D + 2 * ov, Ls - a0 + ov), holes: [], place: { x: W / 2 - a0 * Math.cos(th), y: -(H + g - a0 * Math.sin(th)), z: -ov, upright: true, yaw: 90, tilt: b.pitch } },
    { id: "roof-r", name: "Roof (long)", outer: rect(0, 0, D + 2 * ov, Ls + ov + ext), holes: [], place: { x: W / 2 - ext * Math.cos(th), y: -(H + g + ext * Math.sin(th)), z: D + ov, upright: true, yaw: -90, tilt: b.pitch } },
  ];
  return {
    parts,
    stats: [
      { label: "Outside", value: `${r1(W)} × ${r1(D)} × ${r1(H + g)} mm` },
      { label: "Floor inside", value: `${r1(W - 2 * T)} × ${r1(D - 2 * T)} mm` },
      { label: "Entrance", value: `${hole} mm, ${r1(H - T - hc)} mm above the floor` },
    ],
    assembly: [
      "Glue the walls around the floor; leave the roof dry-fitted on one side (or hinge it) so the box can be cleaned each autumn.",
      "Glue the long roof panel over the ridge edge of the short one.",
      ...(b.perch ? ["Push an 8 mm dowel into the perch hole."] : []),
      "Use untreated, exterior-grade wood, and hang it out of direct sun with the entrance away from the wind.",
    ],
    info: { size: [W, D, H + g], minEdge: Math.min(W, D, H) - 2 * T },
  };
}

/** An engraved band following `outline` at `inset` mm in from its edge, `width` mm wide (empty when it does not fit). */
export function borderBand(outline: Contour, inset: number, width: number): Contour[] {
  const base = [makeShape(outline, [])];
  const outer = offsetShapes(base, -inset);
  const inner = offsetShapes(base, -(inset + Math.max(0.2, width)));
  if (!outer.length) return [];
  return shapeContours(differenceShapes(shapeContours(outer), shapeContours(inner)));
}

function buildSign(p: BoxesParams, ctx: BuildContext): BoxesOutput {
  const T = p.T, s = p.sign, m = 15;
  const W = s.width, H = s.height, Db = Math.max(30, s.base);
  const tw = Math.min(40, Math.max(15, W * 0.15)), us = [W * 0.25, W * 0.75];
  const ys = Db * 0.55 - T / 2;
  const plate = outerOf([roundedRect(0, 0, W, H, s.corner), ...us.map((u) => rect(u - tw / 2, H - 1, tw, T + 1))]);
  const base = roundedRect(0, 0, W + 2 * m, Db, Math.min(8, Db / 4));
  const missing: string[] = [];
  const tx = textBlock(ctx, s.text, s.fontId, s.size, W / 2, H / 2, missing);
  const border = s.border > 0 ? borderBand(roundedRect(0, 0, W, H, s.corner), s.border, s.borderWidth) : [];
  return {
    parts: [
      { id: "plate", name: "Sign", outer: plate, holes: [], engrave: [...border, ...tagItem(tx.cs, "Text")], place: wall(0, T + H, ys) },
      { id: "base", name: "Base", outer: base, holes: us.map((u) => rect(m + u - tw / 2, ys, tw, T)), place: flat(-m, 0, 0) },
    ],
    stats: [{ label: "Sign", value: `${W} × ${H} mm` }, { label: "Base", value: `${W + 2 * m} × ${Db} mm` }],
    assembly: ["Engrave the text, then cut. Push the two tabs into the base slots; a drop of glue makes it permanent."],
    notice: tx.loading ? "Loading the font." : undefined,
    missing,
    info: { size: [W + 2 * m, Db, H + T], textWidth: tx.width, textRoom: W - 2 * Math.max(6, s.corner, s.border > 0 ? s.border + s.borderWidth + 3 : 0) },
  };
}

function buildFrame(p: BoxesParams): BoxesOutput {
  const T = p.T, fr = p.frame, c = 0.5;
  const PW = fr.photoW, PH = fr.photoH, b = fr.border, o = Math.max(0, fr.overlap);
  const OW = PW + 2 * b, OH = PH + 2 * b;
  const outer = roundedRect(0, 0, OW, OH, fr.corner);
  const windowR = Math.max(0, Math.min(fr.corner * 0.5, (PW - 2 * o) / 4));
  const middle = differenceShapes([outer], [rect(b - c, -1, PW + 2 * c, b + PH + c + 1)])[0].outer;
  const stand = fr.mount === "stand", m = 15, Db = Math.max(50, Math.min(90, OH * 0.35));
  const ys = Db * 0.55 - 1.5 * T;
  const backHoles: Contour[] = stand ? [] : [outerOf([circle(OW / 2, b * 0.5 + 8, 4), stadium(OW / 2, b * 0.5 + 8, OW / 2, b * 0.5, 3.6)])];
  const parts: GenPart[] = [
    { id: "front", name: "Front", outer, holes: [roundedRect(b + o, b + o, PW - 2 * o, PH - 2 * o, windowR)], place: wall(0, OH, (stand ? ys : 0) + 2 * T) },
    { id: "middle", name: "Photo layer", outer: middle, holes: [], place: wall(0, OH, (stand ? ys : 0) + T) },
    { id: "back", name: "Back", outer, holes: backHoles, place: wall(0, OH, stand ? ys : 0) },
  ];
  if (stand) parts.push({ id: "base", name: "Stand", outer: roundedRect(0, 0, OW + 2 * m, Db, 8), holes: [rect(m - 0.3, ys - 0.2, OW + 0.6, 3 * T + 0.4)], place: flat(-m, 0, 0) });
  return {
    parts,
    stats: [
      { label: "Photo", value: `${PW} × ${PH} mm` },
      { label: "Frame", value: `${r1(OW)} × ${r1(OH)} mm` },
      { label: "Window", value: `${r1(PW - 2 * o)} × ${r1(PH - 2 * o)} mm` },
    ],
    assembly: [
      "Glue the photo layer onto the back, then the front on top, keeping the edges flush.",
      "Slide the photo in from the top.",
      stand ? "Stand the frame in the slot of the stand." : "Hang it from the keyhole on the back.",
    ],
    info: { size: [OW, 3 * T, OH] },
  };
}

function buildStand(p: BoxesParams): BoxesOutput {
  const T = p.T, s = p.stand;
  const W = s.width, a = deg(Math.min(80, Math.max(45, s.angle))), lip = s.lip, slot = s.slot, Hs = s.height;
  const ledgeH = 22, lipW = 10, xb = lipW + slot;
  const Ex = xb + (Hs - ledgeH) / Math.tan(a), Fx = Ex + 14, Bx = Fx + Hs * 0.3;
  const side = yUp([[0, 0], [Bx, 0], [Fx, Hs], [Ex, Hs], [xb, ledgeH], [lipW, ledgeH], [lipW, ledgeH + lip], [0, ledgeH + lip]], Hs);
  // Members: the ledge under the phone, a brace at the back, and the rest along the slope.
  const yL = ledgeH - 3 - T;
  const hb = 28, backAt = (y: number) => Bx - ((Bx - Fx) * y) / Hs, xr = backAt(6 + hb) - 8 - T;
  const hr = 36, d: Pt = [-Math.cos(a), -Math.sin(a)], n: Pt = [Math.sin(a), -Math.cos(a)];
  const S: Pt = [Ex + d[0] * 6, Hs + d[1] * 6];
  const along = (k: number, j: number): Pt => [S[0] + d[0] * k + n[0] * j, S[1] + d[1] * k + n[1] * j];
  const restHole = yUp([along(3, 0), along(hr - 3, 0), along(hr - 3, T), along(3, T)], Hs);
  const holes = [yUp([[lipW + 2, yL], [xb - 2, yL], [xb - 2, yL + T], [lipW + 2, yL + T]], Hs), rect(xr, Hs - (6 + hb - 3), T, hb - 6), restHole];
  const member = (h: number, inset: number) => outerOf([rect(T, 0, W, h), rect(0, inset, T + 1, h - 2 * inset), rect(W + T - 1, inset, T + 1, h - 2 * inset)]);
  // The profile runs from the lip (x = 0) to the back; in the assembly the lip faces the viewer, at y = Bx.
  const R0: Pt = [Bx - S[0] - T * Math.sin(a), S[1] - T * Math.cos(a)];
  const parts: GenPart[] = [
    { id: "side-l", name: "Left side", outer: side, holes, place: { x: 0, y: -Hs, z: Bx, upright: true, yaw: -90 } },
    { id: "side-r", name: "Right side", outer: side, holes, place: { x: W + T, y: -Hs, z: Bx, upright: true, yaw: -90 } },
    { id: "ledge", name: "Ledge", outer: member(slot, 2), holes: [], place: flat(0, Bx - xb, yL) },
    { id: "brace", name: "Back brace", outer: member(hb, 3), holes: [], place: wall(0, 6 + hb, Bx - xr - T) },
    { id: "rest", name: "Back rest", outer: member(hr, 3), holes: [], place: { x: 0, y: -R0[1], z: R0[0], upright: true, tilt: s.angle } },
  ];
  return {
    parts,
    stats: [
      { label: "Size", value: `${r1(W + 2 * T)} × ${r1(Bx)} × ${r1(Hs)} mm` },
      { label: "Lean", value: `${s.angle}°` },
      { label: "Phone slot", value: `${slot} mm` },
    ],
    assembly: ["Push the ledge, brace and rest through one side, then press the other side on; a drop of glue in each slot keeps it square."],
    info: { size: [W + 2 * T, Bx, Hs] },
  };
}

function buildKeys(p: BoxesParams, ctx: BuildContext): BoxesOutput {
  const T = p.T, k = p.keys;
  const W = k.width, H = k.height, N = Math.max(1, Math.round(k.hooks));
  const tabW = 16, armH = 24, tipH = 10, tipW = 6, L = Math.max(15, k.reach);
  const vm = H * 0.66;
  const us = Array.from({ length: N }, (_, i) => (W * (i + 0.5)) / N);
  const s = (armH - tabW) / 2;
  const hook = outerOf([
    rect(-T, armH + tipH - (s + tabW), T + 1, tabW),
    rect(0, tipH, L, armH),
    rect(L - tipW, 0, tipW, tipH + 1),
  ]);
  const missing: string[] = [];
  const tx = textBlock(ctx, k.text, k.fontId, k.size, W / 2, (vm - tabW / 2) / 2 + 4, missing);
  const pyC = tipH + armH - s - tabW / 2;
  const parts: GenPart[] = [
    {
      id: "plate", name: "Board", outer: roundedRect(0, 0, W, H, k.corner),
      holes: [circle(14, 14, 2.5), circle(W - 14, 14, 2.5), ...us.map((u) => rect(u - T / 2, vm - tabW / 2, T, tabW))],
      engrave: tagItem(tx.cs, "Text"), place: wall(0, H, 0),
    },
    ...us.map((u, i): GenPart => ({ id: `hook${i + 1}`, name: `Hook ${i + 1}`, outer: hook, holes: [], place: { x: u + T / 2, y: -pyC - (H - vm), z: T, upright: true, yaw: 90 } })),
  ];
  return {
    parts,
    stats: [{ label: "Board", value: `${W} × ${H} mm` }, { label: "Hooks", value: `${N}, ${r1(W / N)} mm apart` }],
    assembly: ["Push each hook's tab through the board from the front and glue it.", "Screw the board to the wall through the two holes at the top."],
    notice: tx.loading ? "Loading the font." : undefined,
    missing,
    info: { size: [W, L + T, H], spacing: W / N, textWidth: tx.width, textRoom: W - 2 * Math.max(10, k.corner) },
  };
}

/** Boxes that version 1 could make, built exactly as it did. */
const isV1Box = (p: BoxesParams) => (p.box.lid === "closed" || p.box.lid === "open" || p.box.lid === "liftoff") && p.joint.style !== "tabs" && !(p.box.notch && p.box.lid === "open") && !(hasArt(p) && p.box.lid !== "open") && !pierced(p);

export function buildBoxes(p: BoxesParams, ctx: BuildContext): BoxesOutput {
  if (!(p.T > 0)) return { parts: [], stats: [], error: "Set the material thickness." };
  // A motif pattern's tile (a library shape, or the user's picture or words) for this build.
  if (p.pierce.pattern === "motif") p = { ...p, pierce: { ...p.pierce, unit: patternUnit(p.pierce, ctx) } };
  const out = pierced(p) && !out0Pierced(p) ? piercePanels(p, buildDesign(p, ctx)) : buildDesign(p, ctx);
  const d = FIT_MM[p.joint.fit] ?? 0;
  if (!d || out.error || !JOINTED.has(p.design)) return out;
  return { ...out, parts: out.parts.map((pt) => fitPart(pt, d / 2)), stats: [...out.stats, { label: "Fit", value: `${FIT_NAMES[p.joint.fit]} (${d > 0 ? "+" : ""}${d} mm on every joint)` }] };
}

/** Designs that place their own pattern (round the lid's label and so on). */
const out0Pierced = (p: BoxesParams) => p.design === "box" || p.design === "tray" || p.design === "book";

/**
 * The pattern's panels for the other designs, by part id: the walls, the lid (or what stands for
 * it: a roof, a cabinet top) and the front. Ids ending in "*" match every tier or drawer.
 */
const PANELS: Partial<Record<BoxesParams["design"], { walls: string[]; lid: string[]; front: string[] }>> = {
  hex: { walls: ["wall*"], lid: ["lid"], front: ["wall1"] },
  stack: { walls: ["t*-front", "t*-back", "t*-left", "t*-right"], lid: ["lid"], front: ["t*-front"] },
  drawer: { walls: ["cab-left", "cab-right", "cab-back", "d*-front"], lid: ["cab-top"], front: ["d*-front"] },
  money: { walls: ["front", "back", "left", "right"], lid: ["top"], front: ["front"] },
  bird: { walls: ["front", "back", "left", "right"], lid: ["roof-l", "roof-r"], front: ["front"] },
  stand: { walls: ["side-l", "side-r"], lid: [], front: ["side-l", "side-r"] },
  keys: { walls: ["plate"], lid: [], front: ["plate"] },
  sign: { walls: ["plate"], lid: [], front: ["plate"] },
  insert: { walls: ["div*"], lid: [], front: ["div*"] },
  frame: { walls: ["front"], lid: [], front: ["front"] },
};
const matches = (id: string, pats: string[]) => pats.some((q) => {
  const [a, b = ""] = q.split("*");
  return q.includes("*") ? id.startsWith(a) && id.endsWith(b) && id.length >= a.length + b.length : id === q;
});

/** The pattern on the design's panels, clear of each part's holes and engraved text. */
function piercePanels(p: BoxesParams, out: BoxesOutput): BoxesOutput {
  const set = PANELS[p.design];
  if (!set || out.error) return out;
  const ids = new Set<string>();
  const wallOnly = p.pierce.on === "front" || p.pierce.on === "front-lid";
  if (pierceWalls(p)) for (const pt of out.parts) if (matches(pt.id, wallOnly ? set.front : set.walls)) ids.add(pt.id);
  if (pierceLid(p)) for (const pt of out.parts) if (matches(pt.id, set.lid)) ids.add(pt.id);
  const edge = p.T + Math.max(1, p.pierce.bar) + 1;
  let shapes = 0, on = 0;
  const parts = out.parts.map((pt) => {
    if (!ids.has(pt.id)) return pt;
    const q: GenPart = { ...pt, holes: [...pt.holes], engrave: pt.engrave ? [...pt.engrave] : undefined, score: pt.score ? [...pt.score] : undefined };
    const keep: KeepOut[] = [];
    if (pt.engrave?.length) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const c of pt.engrave) for (const [x, y] of c) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      keep.push({ x0: x0 - 4, y0: y0 - 4, x1: x1 + 4, y1: y1 + 4 });
    }
    shapes += pierce(p, q, edge, keep);
    on++;
    return q;
  });
  const what = p.pierce.mark === "engrave" ? "engraved shapes" : p.pierce.mark === "score" ? "scored shapes" : "holes";
  return {
    ...out, parts,
    stats: [...out.stats, { label: "Pattern", value: `${FRET_NAMES[p.pierce.pattern]}: ${shapes} ${what} on ${on} ${on === 1 ? "panel" : "panels"}` }],
    pattern: { shapes, parts: on, windowed: p.pierce.shape !== "full" },
  };
}

/** Designs whose parts lock together with fingers, tabs or slots (the fit setting applies to them). */
const JOINTED = new Set<BoxesParams["design"]>(["box", "tray", "drawer", "hex", "insert", "money", "stack", "book", "bird", "sign", "stand"]);

/** A part grown by `e` mm on every edge (holes shrink by the same), so its joints go tighter. */
function fitPart(pt: GenPart, e: number): GenPart {
  const grown = offsetShapes([makeShape(pt.outer, [])], e, "miter");
  if (!grown.length) return pt;
  const outer = grown.reduce((a, b) => (b.area > a.area ? b : a)).outer;
  const holes = pt.holes.flatMap((h) => { const s = offsetShapes([makeShape(h, [])], -e, "miter"); return s.length ? s.map((x) => x.outer) : []; });
  return { ...pt, outer, holes };
}

function buildDesign(p: BoxesParams, ctx: BuildContext): BoxesOutput {
  switch (p.design) {
    case "box": return isV1Box(p) ? buildBox(p) : buildBoxV2(p, ctx);
    case "tray": return p.tray.lid === "none" && p.joint.style !== "tabs" && !pierced(p) ? buildTray(p) : buildTrayV2(p, ctx);
    case "book": return buildBook(p, ctx);
    case "drawer": return buildDrawer(p, ctx);
    case "hex": return buildHex(p, ctx);
    case "insert": return buildInsert(p);
    case "money": return buildMoney(p, ctx);
    case "stack": return buildStack(p, ctx);
    case "bird": return buildBird(p);
    case "sign": return buildSign(p, ctx);
    case "frame": return buildFrame(p);
    case "stand": return buildStand(p);
    case "keys": return buildKeys(p, ctx);
    default: return { parts: [], stats: [], error: `Unknown design ${DESIGN_NAMES[p.design as keyof typeof DESIGN_NAMES] ?? p.design}.` };
  }
}
