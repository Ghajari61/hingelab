/**
 * What goes round the layers: a light box behind them (rings that hold an LED strip, a diffuser),
 * a back board (glued or screwed), ways to hang or stand the box, a finger-jointed box around it all,
 * and aids that line the layers up (pin holes through every part, layer numbers on the border).
 * Holes and marks sit in the border band every layer shares, so they never cut into the pattern.
 */
import { differenceShapes, makeShape, offsetShapes, unionShapes } from "@/lib/letters/polygon";
import type { Shape } from "@/lib/letters/types";
import { fingerPanel, type EdgeSpec } from "../boxes/joints";
import { bboxOf, circle, rect, stadium } from "../geom";
import type { Contour, GenPart, Pt } from "../types";
import type { ShadowBoxParams } from "./params";

/** Room left between the stack and a box's walls, each side, mm. */
export const WALL_PLAY = 0.5;
/** Play across the slot of a stand's foot, mm. */
export const FOOT_PLAY = 0.2;
/** Least material round a hole in the border, mm. */
export const MIN_WALL = 1.5;
/** Pilot holes for screws are this share of the screw's size. */
const PILOT = 0.7;
/** Depth a screw head needs behind a keyhole, mm. */
const HEAD_ROOM = 4;
const FOOT_H = 30;
const FOOT_GRIP = 10;
const FOOT_REACH = 30;

const biggest = (s: Shape[]) => s.reduce((a, b) => (b.area > a.area ? b : a));

/** Where a ray from (cx, cy) at angle `a` first crosses the contour, or null. */
export function rayHit(c: Contour, cx: number, cy: number, a: number): Pt | null {
  const dx = Math.cos(a), dy = Math.sin(a);
  let best = Infinity;
  for (let i = 0; i < c.length; i++) {
    const [x1, y1] = c[i], [x2, y2] = c[(i + 1) % c.length];
    const ex = x2 - x1, ey = y2 - y1, den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((x1 - cx) * ey - (y1 - cy) * ex) / den, s = ((x1 - cx) * dy - (y1 - cy) * dx) / den;
    if (t > 1e-9 && s >= 0 && s <= 1 && t < best) best = t;
  }
  return Number.isFinite(best) ? [cx + dx * best, cy + dy * best] : null;
}

/** A hole made for some parts of the stack: those whose material lies between z0 and z1. */
export interface Drill { c: Contour; z0: number; z1: number }

/** The part with the hole cut in, or unchanged when the hole would not stay a hole inside it. */
export function drillPart(pt: GenPart, c: Contour): GenPart {
  const before = makeShape(pt.outer, pt.holes);
  const after = differenceShapes([pt.outer, ...pt.holes], [c]);
  if (after.length !== 1) return pt;
  const hole = Math.abs(makeShape(c, []).area);
  if (Math.abs(before.area - after[0].area - hole) > hole * 0.02 + 0.05) return pt;
  return { ...pt, outer: after[0].outer, holes: after[0].holes };
}

/** Seven-segment strokes of a number, `h` tall, centred on (x, y), as scored lines. */
export function digits(n: number, x: number, y: number, h: number): Contour[] {
  const SEG: Record<string, string> = { "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc", "5": "afgcd", "6": "afgedc", "7": "abc", "8": "abcdefg", "9": "abcdfg" };
  const s = String(n), w = h * 0.5, gap = h * 0.25, total = s.length * w + (s.length - 1) * gap;
  const out: Contour[] = [];
  [...s].forEach((d, i) => {
    const x0 = x - total / 2 + i * (w + gap), x1 = x0 + w, y0 = y - h / 2, ym = y, y1 = y + h / 2;
    const seg: Record<string, Contour> = {
      a: [[x0, y0], [x1, y0]], b: [[x1, y0], [x1, ym]], c: [[x1, ym], [x1, y1]], d: [[x0, y1], [x1, y1]],
      e: [[x0, ym], [x0, y1]], f: [[x0, y0], [x0, ym]], g: [[x0, ym], [x1, ym]],
    };
    for (const k of SEG[d]) out.push(seg[k]);
  });
  return out;
}

export interface Band {
  /** The frame's outline, its window and the band every part shares (its width), mm. */
  frame: Contour;
  win: Contour;
  width: number;
  cx: number;
  cy: number;
}

/** The middle of the shared band along a ray from the window's centre. */
export function bandPoint(b: Band, a: number): Pt | null {
  const inner = offsetShapes([makeShape(b.frame, [])], -b.width / 2);
  if (!inner.length) return null;
  return rayHit(biggest(inner).outer, b.cx, b.cy, a);
}

/** Pin holes: two, at different angles so a layer cannot go in turned round. */
// Keep registration pins off the four screw rays; a pin must not enlarge a screw pilot.
export const PIN_ANGLES = [(-5 * Math.PI) / 9, Math.PI / 3];
/** Screws: four, toward the corners. */
export const SCREW_ANGLES = [(-3 * Math.PI) / 4, -Math.PI / 4, Math.PI / 4, (3 * Math.PI) / 4];

export interface Hang {
  /** Keyhole cuts in the back-most part and the clearance the heads need in the parts above it. */
  cuts: Contour[];
  room: Contour[];
  /** The band is too narrow for the keyholes: the border this needs, mm. */
  needBorder?: number;
}

/**
 * Two keyholes near the top: in the window of a back board with a light box over it (the heads go
 * into the light box), otherwise in the border band with room cut above them for the heads.
 */
export function keyholes(p: ShadowBoxParams, b: Band, inCavity: boolean): Hang {
  const h = p.box.head, fb = bboxOf([b.frame]), wb = bboxOf([b.win]);
  const slot = h * 0.5, travel = h;
  const key = (x: number, y: number) => {
    const u = unionShapes([circle(x, y, h / 2), stadium(x, y, x, y - travel, slot)]);
    return u.length ? biggest(u).outer : circle(x, y, h / 2);
  };
  const xs = [fb.x0 + (fb.x1 - fb.x0) * 0.25, fb.x0 + (fb.x1 - fb.x0) * 0.75];
  if (inCavity) {
    const y = wb.y0 + Math.max(travel + h, (wb.y1 - wb.y0) * 0.12);
    return { cuts: xs.map((x) => key(x, y)), room: [] };
  }
  // The heads' room (the keyhole and a margin) reaches (h + 1)/2 below the round end's centre and
  // travel + (h + 1)/2 above it; it is centred in the band.
  const need = travel + h + 1 + 2 * MIN_WALL;
  const cuts: Contour[] = [], room: Contour[] = [];
  let tight = false;
  for (const x of xs) {
    const top = rayHit(b.frame, x, wb.y0 + 1, -Math.PI / 2), bottom = rayHit(b.win, x, (wb.y0 + wb.y1) / 2, -Math.PI / 2);
    if (!top || !bottom) { tight = true; continue; }
    const band = bottom[1] - top[1];
    if (band < need) tight = true;
    const y = (top[1] + bottom[1]) / 2 + travel / 2;
    cuts.push(key(x, y));
    room.push(stadium(x, y, x, y - travel, h + 1));
  }
  const border = p.frame.border + Math.max(0, need - minBand(b, xs, wb));
  return tight ? { cuts, room, needBorder: Math.ceil(border) } : { cuts, room };
}

function minBand(b: Band, xs: number[], wb: ReturnType<typeof bboxOf>): number {
  let m = Infinity;
  for (const x of xs) {
    const top = rayHit(b.frame, x, wb.y0 + 1, -Math.PI / 2), bottom = rayHit(b.win, x, (wb.y0 + wb.y1) / 2, -Math.PI / 2);
    if (top && bottom) m = Math.min(m, bottom[1] - top[1]);
  }
  return Number.isFinite(m) ? m : 0;
}

/** Light box rings with the cable notch: enough rings from the back to let the cable through. */
export const notchedRings = (p: ShadowBoxParams) => (p.light.cable > 0 ? Math.max(1, Math.ceil(p.light.cable / p.T - 1e-6)) : 0);

/**
 * The light box's rings: the frame minus the window; the first few have a notch for the cable in the
 * middle of the bottom edge.
 */
export function lightRings(p: ShadowBoxParams, b: Band, n: number): Shape[] {
  const ring = differenceShapes([b.frame], [b.win]);
  if (!ring.length) return [];
  const one = biggest(ring), wb = bboxOf([b.win]), fb = bboxOf([b.frame]), mx = (fb.x0 + fb.x1) / 2;
  const notch = rect(mx - p.light.cable / 2, wb.y1 - 1, p.light.cable, fb.y1 - wb.y1 + 2);
  const cut = p.light.cable > 0 ? differenceShapes([one.outer, ...one.holes], [notch]) : [];
  const first = cut.length ? biggest(cut) : one;
  const k = notchedRings(p);
  return Array.from({ length: n }, (_, i) => (i < k ? first : one));
}

/** Light box rings: enough of the material to make the light depth. */
export const ringCount = (p: ShadowBoxParams) => (p.light.on ? Math.max(1, Math.ceil(Math.max(p.light.depth, p.light.cable) / p.T - 1e-6)) : 0);

/**
 * Four finger-jointed walls round the stack (and its light box and back), `D` deep: the top and
 * bottom walls own the corner cubes; the bottom wall has a hole for the LED cable at `cableZ`.
 */
export function walls(p: ShadowBoxParams, fb: ReturnType<typeof bboxOf>, D: number, cableZ: number | null): GenPart[] {
  const T = p.T, c = WALL_PLAY, f = p.box.finger;
  const W = fb.x1 - fb.x0 + 2 * c + 2 * T, H = fb.y1 - fb.y0 + 2 * c + 2 * T;
  const N: EdgeSpec = { mate: false, ends: true };
  const E = (ends: boolean): EdgeSpec => ({ mate: true, ends });
  const across = fingerPanel(W, D, T, f, [N, E(true), N, E(true)], [true, true, true, true]);
  const down = fingerPanel(H, D, T, f, [N, E(false), N, E(false)], [false, false, false, false]);
  const x0 = fb.x0 - c - T, y0 = fb.y0 - c - T;
  const hole = cableZ !== null && p.light.cable > 0 ? [circle(W / 2, D - cableZ, p.light.cable / 2)] : [];
  // A cable opening at the rear edge is a notch, not an invalid interior contour.
  const bottom = hole.length ? differenceShapes([across], hole) : [];
  const bottomShape = bottom.length === 1 ? bottom[0] : makeShape(across, []);
  return [
    { id: "wall-top", name: "Box top", outer: across, holes: [], place: { x: x0, y: -D, z: y0, upright: true } },
    { id: "wall-bottom", name: "Box bottom", outer: bottomShape.outer, holes: bottomShape.holes, place: { x: x0, y: -D, z: fb.y1 + c, upright: true } },
    { id: "wall-left", name: "Box left side", outer: down, holes: [], place: { x: fb.x0 - c, y: -D, z: y0, upright: true, yaw: 90 } },
    { id: "wall-right", name: "Box right side", outer: down, holes: [], place: { x: fb.x1 + c + T, y: -D, z: y0, upright: true, yaw: 90 } },
  ];
}

/**
 * Two feet the box stands in: each a block with a slot the box's depth wide, cut deeper where the
 * box's lower edge is higher so both feet stand level.
 */
export function feet(p: ShadowBoxParams, outline: Contour, D: number): GenPart[] {
  const fb = bboxOf([outline]), wide = fb.x1 - fb.x0, L = D + 2 * FOOT_REACH, slotW = D + FOOT_PLAY;
  const out: GenPart[] = [];
  [0.25, 0.75].forEach((k, i) => {
    const x = fb.x0 + wide * k;
    const low = rayHit(outline, x, (fb.y0 + fb.y1) / 2, Math.PI / 2)?.[1] ?? fb.y1;
    const grip = FOOT_GRIP + (fb.y1 - low), Hf = FOOT_H + (fb.y1 - low);
    const body = differenceShapes([rect(0, 0, Hf, L)], [rect(-1, (L - slotW) / 2, grip + 1, slotW)]);
    if (!body.length) return;
    const s = biggest(body);
    // Upright and turned a quarter: its x runs down the face from the box's edge, its y through the depth.
    out.push({ id: `foot${i + 1}`, name: `Foot ${i + 1}`, outer: s.outer, holes: s.holes, place: { x: x + p.T / 2, y: -(D / 2 + L / 2), z: low - grip, upright: true, yaw: 90 } });
  });
  return out;
}

/** Screw holes in the back board, and pilot holes in what the screws go into. */
export function screwHoles(p: ShadowBoxParams, b: Band): { clear: Contour[]; pilot: Contour[] } {
  const pts = SCREW_ANGLES.map((a) => bandPoint(b, a)).filter((q): q is Pt => !!q);
  const d = p.box.screw;
  return { clear: pts.map(([x, y]) => circle(x, y, d / 2)), pilot: pts.map(([x, y]) => circle(x, y, (d * PILOT) / 2)) };
}

export const pinHoles = (p: ShadowBoxParams, b: Band): Contour[] =>
  PIN_ANGLES.map((a) => bandPoint(b, a)).filter((q): q is Pt => !!q).map(([x, y]) => circle(x, y, p.box.pin / 2));

/** Depth the keyhole heads need above the back-most part. */
export const HEAD_DEPTH = HEAD_ROOM;
