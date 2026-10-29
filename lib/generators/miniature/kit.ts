/**
 * The construction kit of the World Miniature studio: pure geometry, millimetres throughout.
 *
 * Coordinate conventions (shared with the rest of the generators, see types.ts and place.ts):
 * - Plan: x to the right, y from the back (0) toward the viewer, z up. Parts are cut flat; `place`
 *   puts them in the assembly.
 * - A *profile* is drawn y up in the (y, z) plane of an end panel: y along the plan's y, z up from the
 *   frame's floor. `yUp` turns it into the part's y-down outline.
 * - Upright parts across the frame (a back wall, a shelf back) run along x and stand at a plan y;
 *   end panels and dividers run along y and stand at a plan x.
 *
 * The tabbed frame is the joint the miniatures share: two end panels (house side walls, a bookcase's
 * sides, a bed's head and foot boards, a stair's stringers) with members between them (floors,
 * shelves, treads as flat plates; walls and backs as uprights) that pass a tab at each end through a
 * slot in each end panel. Caps sit on (or under) the end panels, which pass tabs up (or down) through
 * them. Dividers stand between two flat members, tabbed into both. Every tab is the material's
 * thickness deep, so it ends flush with the far face, and every slot is exactly its tab; the fit
 * setting (build.ts) tightens or loosens them all by the same amount.
 */
import { differenceShapes, makeShape, offsetShapes, unionShapes } from "@/lib/letters/polygon";
import type { Shape } from "@/lib/letters/types";
import { circle, rect, signedArea } from "../geom";
import { fretHoles } from "../fretwork";
import type { FretKind } from "../fretKinds";
import type { Contour, GenPart, Pt } from "../types";

export type Place = NonNullable<GenPart["place"]>;
export type V3 = [number, number, number];

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const r1 = (v: number) => Math.round(v * 10) / 10;
export const biggest = (s: Shape[]) => s.reduce((a, b) => (b.area > a.area ? b : a), s[0]);
/** Contours wound alike, so a union never cancels where they overlap. */
export const wound = (c: Contour): Contour => (signedArea(c) < 0 ? c.slice().reverse() : c);
export const outerOf = (cs: Contour[]): Contour => biggest(unionShapes(cs.map(wound), [], false, true)).outer;
/** A y-up polygon in a frame of height h, as a y-down outline (v = h - y). */
export const yUp = (pts: Contour, h: number): Contour => pts.map(([x, y]) => [x, h - y] as Pt);
export const move = (c: Contour, dx: number, dy: number): Contour => c.map(([x, y]) => [x + dx, y + dy] as Pt);
const len = (c: Contour) => c.slice(1).reduce((n, q, i) => n + Math.hypot(q[0] - c[i][0], q[1] - c[i][1]), 0);

/** Tab spans along [a, b]: one tab on a short edge, two or three on longer ones, clear of the ends. */
export function tabSpans(a: number, b: number, T: number): [number, number][] {
  const L = b - a;
  if (L < 3 * T) return [];
  const n = L < 70 ? 1 : L < 200 ? 2 : 3;
  const w = clamp(L / (2 * n + 1), Math.min(2 * T, L * 0.4), 24);
  return Array.from({ length: n }, (_, i) => { const c = a + (L * (i + 0.5)) / n; return [c - w / 2, c + w / 2] as [number, number]; });
}

// ------------------------------------------------------------------ the tabbed frame

/** A plate between the end panels, lying flat with its underside at z, from y0 to y1. */
export interface FlatMember { id: string; name: string; y0: number; y1: number; z: number; holes?: Contour[]; engrave?: Contour[]; score?: Contour[]; tabs?: boolean }
/** A plate between the end panels, standing with its back face at y, from z0 up to z1. `top` raises its top edge (u from 0 to W). */
export interface UprightMember { id: string; name: string; y: number; z0: number; z1: number; holes?: Contour[]; engrave?: Contour[]; score?: Contour[] }
/**
 * A plate parallel to the end panels with its -x face at frame x (the left end panel fills 0 to T), between two flat members: `outline`
 * y up in the (y, z) plane; tabs go down into the flat member whose top is at z0 and up into the one
 * whose underside is at z1, where those exist.
 */
export interface Divider {
  id: string; name: string; x: number; outline: Contour; z0: number; z1: number; holes?: Contour[]; engrave?: Contour[]; score?: Contour[];
  /** The face its marks are on: -x (the default) or +x (it is then cut mirrored). */
  face?: "-x" | "+x";
  /** Tabs up into the member above (default true); off where another divider tabs down into it. */
  up?: boolean;
}
/** A plate on top of the end panels (underside at z) or under them (top at z), overhanging them. */
export interface Cap { id: string; name: string; at: "top" | "bottom"; z: number; x0: number; x1: number; y0: number; y1: number; holes?: Contour[]; engrave?: Contour[]; score?: Contour[] }

export interface FrameSpec {
  T: number;
  /** Clear width between the end panels, mm. */
  W: number;
  /** Where the frame sits in the plan (its left end panel's -x face, its y = 0, its z = 0). */
  at?: V3;
  /** The end panels' outline, y up (the right one's, when it differs: a bed's foot board). */
  profile: Contour;
  rightProfile?: Contour;
  /** Openings and marks on the end panels, y up (both ends unless `right*` is given). */
  endHoles?: Contour[]; rightHoles?: Contour[];
  endScore?: Contour[]; endEngrave?: Contour[];
  ends: [string, string];
  idPrefix?: string;
  flats?: FlatMember[]; uprights?: UprightMember[]; dividers?: Divider[]; caps?: Cap[];
}

/**
 * The parts of a tabbed frame. Tabs reach through their slots exactly; a member (or divider) with no
 * room for a tab is left to be glued. Returns the parts in a stable order: ends, flats, uprights,
 * dividers, caps.
 */
export function tabbedFrame(f: FrameSpec): GenPart[] {
  const T = f.T, W = f.W, [ox, oy, oz] = f.at ?? [0, 0, 0], pre = f.idPrefix ?? "";
  const flats = f.flats ?? [], ups = f.uprights ?? [], divs = f.dividers ?? [], caps = f.caps ?? [];
  const Hp = Math.max(...f.profile.map((q) => q[1]), ...caps.filter((c) => c.at === "top").map((c) => c.z + T));
  const endSlots: Contour[] = [];
  const parts: GenPart[] = [];
  const endTab = (v0: number, v1: number): Contour[] => [rect(0, v0, T + 0.01, v1 - v0), rect(T + W - 0.01, v0, T + 0.01, v1 - v0)];

  const flatParts = flats.map((m): GenPart => {
    const spans = m.tabs === false ? [] : tabSpans(m.y0, m.y1, T);
    for (const [s, e] of spans) endSlots.push(rect(s, m.z, e - s, T));
    const holes = [...(m.holes ?? [])];
    return { id: pre + m.id, name: m.name, outer: outerOf([rect(T, m.y0, W, m.y1 - m.y0), ...spans.flatMap(([s, e]) => endTab(s, e))]), holes, ...(m.engrave?.length ? { engrave: m.engrave } : {}), ...(m.score?.length ? { score: m.score } : {}), place: { x: ox, y: oy, z: oz + m.z } };
  });
  const upParts = ups.map((m): GenPart => {
    const spans = tabSpans(m.z0, m.z1, T);
    for (const [s, e] of spans) endSlots.push(rect(m.y, s, T, e - s));
    // y down from the member's top (z1)
    const tabs = spans.flatMap(([s, e]) => endTab(m.z1 - e, m.z1 - s));
    return { id: pre + m.id, name: m.name, outer: outerOf([rect(T, 0, W, m.z1 - m.z0), ...tabs]), holes: m.holes ?? [], ...(m.engrave?.length ? { engrave: m.engrave } : {}), ...(m.score?.length ? { score: m.score } : {}), place: { x: ox, y: -(oz + m.z1), z: oy + m.y, upright: true } };
  });
  // Dividers: tabs into the flat members they stand on and hang from.
  const divParts = divs.map((d): GenPart => {
    const below = flats.findIndex((m) => Math.abs(m.z + T - d.z0) < 1e-6 && m.y0 - 1e-6 <= Math.min(...d.outline.map((q) => q[0])) && m.y1 + 1e-6 >= Math.max(...d.outline.map((q) => q[0])));
    const above = flats.findIndex((m) => Math.abs(m.z - d.z1) < 1e-6 && m.y0 - 1e-6 <= Math.min(...d.outline.map((q) => q[0])) && m.y1 + 1e-6 >= Math.max(...d.outline.map((q) => q[0])));
    const ys = d.outline.map((q) => q[0]), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const add: Contour[] = [];
    for (const [k, zz, up] of [[below, d.z0, false], [above, d.z1, true]] as const) {
      if (k < 0 || (up && d.up === false)) continue;
      for (const [s, e] of tabSpans(y0, y1, T)) {
        add.push(up ? rect(s, zz - 0.01, e - s, T + 0.01) : rect(s, zz - T, e - s, T + 0.01));
        flatParts[k].holes.push(rect(d.x, s, T, e - s));
      }
    }
    const Hd = Math.max(...[...d.outline, ...add.flat()].map((q) => q[1]));
    // Marks face -x as cut; for +x the part is cut mirrored (u = y1 - y) and turned the other way.
    const flip = d.face === "+x";
    const fy = (c: Contour): Contour => (flip ? c.map(([y, z]) => [y1 - y, z] as Pt).reverse() : c);
    const conv = (c: Contour) => yUp(fy(c), Hd);
    return {
      id: pre + d.id, name: d.name, outer: yUp(fy(outerOf([d.outline, ...add])), Hd), holes: (d.holes ?? []).map(conv),
      ...(d.engrave?.length ? { engrave: d.engrave.map(conv) } : {}), ...(d.score?.length ? { score: d.score.map(conv) } : {}),
      place: flip ? { x: ox + d.x, y: -(oz + Hd), z: oy + y1, upright: true, yaw: -90 } : { x: ox + d.x + T, y: -(oz + Hd), z: oy, upright: true, yaw: 90 },
    };
  });
  // Caps: the end panels pass tabs through them.
  const ys = f.profile.map((q) => q[0]), py0 = Math.min(...ys), py1 = Math.max(...ys);
  const capTabs: Contour[] = [];
  const capParts = caps.map((c): GenPart => {
    const holes = [...(c.holes ?? [])];
    for (const [s, e] of tabSpans(py0, py1, T)) {
      capTabs.push(c.at === "top" ? rect(s, c.z - 0.01, e - s, T + 0.01) : rect(s, c.z - T, e - s, T + 0.01));
      for (const x of [0, T + W]) holes.push(rect(x, s, T, e - s));
    }
    return { id: pre + c.id, name: c.name, outer: rect(c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0), holes, ...(c.engrave?.length ? { engrave: c.engrave } : {}), ...(c.score?.length ? { score: c.score } : {}), place: { x: ox, y: oy, z: oz + (c.at === "top" ? c.z : c.z - T) } };
  });
  const HpR = f.rightProfile ? Math.max(...f.rightProfile.map((q) => q[1]), ...caps.filter((c) => c.at === "top").map((c) => c.z + T)) : Hp;
  const endOuter = yUp(outerOf([f.profile, ...capTabs]), Hp);
  const endOuterR = f.rightProfile ? yUp(outerOf([f.rightProfile, ...capTabs]), HpR) : endOuter;
  const holesL = [...endSlots, ...(f.endHoles ?? [])].map((h) => yUp(h, Hp));
  const holesR = [...endSlots, ...(f.rightHoles ?? f.endHoles ?? [])].map((h) => yUp(h, HpR));
  const marksOf = (H: number) => ({ ...(f.endScore?.length ? { score: f.endScore.map((c) => yUp(c, H)) } : {}), ...(f.endEngrave?.length ? { engrave: f.endEngrave.map((c) => yUp(c, H)) } : {}) });
  const marks = marksOf(Hp);
  parts.push(
    { id: pre + "end-l", name: f.ends[0], outer: endOuter, holes: holesL, ...marks, place: { x: ox + T, y: -(oz + Hp), z: oy, upright: true, yaw: 90 } },
    { id: pre + "end-r", name: f.ends[1], outer: endOuterR, holes: holesR, ...(f.rightProfile ? marksOf(HpR) : marks), place: { x: ox + 2 * T + W, y: -(oz + HpR), z: oy, upright: true, yaw: 90 } },
    ...flatParts, ...upParts, ...divParts, ...capParts,
  );
  return parts;
}

// ------------------------------------------------------------------ parts lying on a 3D plane

/**
 * A flat part whose underside is the planar polygon `pts` (in plan coordinates), its thickness
 * toward `out`. Returns its outline in its own frame (u along the first edge), the placement matrix
 * (a rotation, never a mirror) and a map from plan points on the plane to the outline's frame.
 */
export function planar(pts: V3[], out: V3): { outline: Contour; m: number[]; uv: (P: V3) => Pt } {
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const unit = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const O = pts[0], U = unit(sub(pts[1], O));
  let N: V3 = [0, 0, 0];
  for (let i = 2; i < pts.length && Math.hypot(...N) < 1e-9; i++) N = cross(sub(pts[1], O), sub(pts[i], O));
  N = unit(N);
  if (dot(N, out) < 0) N = [-N[0], -N[1], -N[2]];
  const V = cross(N, U);
  const uv = (P: V3): Pt => { const d = sub(P, O); return [dot(d, U), dot(d, V)]; };
  return { outline: pts.map(uv), m: [U[0], V[0], N[0], O[0], U[1], V[1], N[1], O[1], U[2], V[2], N[2], O[2]], uv };
}

// ------------------------------------------------------------------ doors and windows

export type OpeningShape = "rect" | "arch" | "pointed" | "horseshoe" | "round";
export type Panes = "none" | "cross" | "grid" | "shoji" | "lattice";
export const OPENING_SHAPES: Record<OpeningShape, string> = { rect: "Square", arch: "Round arch", pointed: "Pointed arch", horseshoe: "Horseshoe arch", round: "Round" };
export const PANES: Record<Panes, string> = { none: "Open", cross: "Cross bars", grid: "Grid", shoji: "Shoji grid", lattice: "Lattice screen" };

/** An opening w wide and h tall, its bottom centre at (cx, z0), y up. */
export function openingShape(shape: OpeningShape, cx: number, z0: number, w: number, h: number): Contour {
  const x0 = cx - w / 2;
  switch (shape) {
    case "rect": return rect(x0, z0, w, h);
    case "round": { const r = Math.min(w, h) / 2; return circle(cx, z0 + h / 2, r, 0.05); }
    case "arch": {
      const r = w / 2, spring = z0 + Math.max(0, h - r);
      return outerOf([rect(x0, z0, w, spring - z0 + 0.01), circle(cx, spring, r, 0.05)]);
    }
    case "pointed": {
      // two arcs of radius w struck from the far springing points: an equilateral pointed arch
      const r = w, rise = w * Math.sqrt(3) / 2, spring = z0 + Math.max(0, h - rise);
      const pts: Pt[] = [[x0, z0], [x0 + w, z0], [x0 + w, spring]];
      const n = 14;
      for (let i = 1; i <= n; i++) { const a = (Math.PI / 3) * (i / n); pts.push([x0 + r * Math.cos(a), spring + r * Math.sin(a)]); }
      for (let i = n - 1; i >= 0; i--) { const a = (Math.PI / 3) * (i / n); pts.push([x0 + w - r * Math.cos(a), spring + r * Math.sin(a)]); }
      return outerOf([pts]);
    }
    case "horseshoe": {
      // a circle wider than its opening, cut by the jambs below its centre
      const r = w * 0.56, c = z0 + Math.max(r * 0.7, h - r);
      return outerOf([rect(x0 + w * 0.06, z0, w * 0.88, c - z0 + 0.01), circle(cx, c, r, 0.05)]);
    }
  }
}

/** The holes an opening cuts: the whole shape, or the panes left between its bars. */
export function openingHoles(shape: Contour, panes: Panes, bar: number, lattice: FretKind = "lattice"): Contour[] {
  if (panes === "none") return [shape];
  const xs = shape.map((q) => q[0]), ys = shape.map((q) => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), w = x1 - x0, h = y1 - y0;
  if (panes === "lattice") {
    const holes = fretHoles({ kind: lattice, cell: clamp(w / 3, 4, 14), bar }, x0 - 1, y0 - 1, x1 + 1, y1 + 1, [], undefined, shape);
    return holes.length ? holes : [shape];
  }
  const v = panes === "cross" ? [0.5] : panes === "grid" ? [1 / 3, 2 / 3] : [0.25, 0.5, 0.75];
  const hz = panes === "cross" ? [0.58] : panes === "grid" ? [1 / 3, 2 / 3] : [1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6];
  const bars = [...v.map((t) => rect(x0 + w * t - bar / 2, y0 - 1, bar, h + 2)), ...hz.map((t) => rect(x0 - 1, y0 + h * t - bar / 2, w + 2, bar))];
  const left = differenceShapes([shape], bars).filter((s) => s.area > bar * bar);
  return left.length ? left.map((s) => s.outer) : [shape];
}

/** A scored frame `gap` mm round an opening (its outline grown). */
export function trimLine(shape: Contour, gap: number): Contour {
  const g = offsetShapes([makeShape(wound(shape), [])], gap);
  const o = g.length ? biggest(g).outer : shape;
  return [...o, o[0]];
}

// ------------------------------------------------------------------ surface finishes (score lines)

export type WallFinish = "plain" | "brick" | "stone" | "timber" | "boards" | "stucco-bands";
export const WALL_FINISHES: Record<WallFinish, string> = { plain: "Plain", brick: "Brick", stone: "Stone blocks", timber: "Half-timber", boards: "Boards", "stucco-bands": "Bands" };
export type RoofFinish = "plain" | "shingles" | "tiles" | "seams";
export const ROOF_FINISHES: Record<RoofFinish, string> = { plain: "Plain", shingles: "Shingles", tiles: "Tiles", seams: "Standing seams" };

/** Lines of a wall finish over the box [x0, x1] × [z0, z1] (y up), floor heights for the timber frame. */
export function wallFinish(kind: WallFinish, x0: number, x1: number, z0: number, z1: number, floors: number[] = []): Contour[] {
  const out: Contour[] = [];
  switch (kind) {
    case "brick": case "stone": {
      const h = kind === "brick" ? 3.2 : 7, w = kind === "brick" ? 9 : 16;
      let k = 0;
      for (let z = z0; z < z1; z += h, k++) {
        if (z > z0) out.push([[x0, z], [x1, z]]);
        for (let x = x0 + (k % 2 ? w / 2 : 0); x < x1; x += w) if (x > x0) out.push([[x, z], [x, Math.min(z1, z + h)]]);
      }
      return out;
    }
    case "boards": { for (let x = x0 + 6; x < x1; x += 6) out.push([[x, z0], [x, z1]]); return out; }
    case "stucco-bands": { for (const z of floors) out.push([[x0, z - 1.5], [x1, z - 1.5]], [[x0, z + 1.5], [x1, z + 1.5]]); return out; }
    case "timber": {
      // posts, the floor beams and a brace in each bay: a simplified half-timber (Fachwerk/Tudor) frame
      const levels = [z0, ...floors.filter((z) => z > z0 + 4 && z < z1 - 4), z1];
      const bays = Math.max(2, Math.round((x1 - x0) / 32));
      const bw = (x1 - x0) / bays;
      for (const z of levels.slice(1, -1)) out.push([[x0, z], [x1, z]]);
      for (let i = 1; i < bays; i++) out.push([[x0 + i * bw, z0], [x0 + i * bw, z1]]);
      for (let l = 0; l + 1 < levels.length; l++) for (let i = 0; i < bays; i++) {
        const a = x0 + i * bw, b = a + bw;
        out.push(i % 2 ? [[a, levels[l]], [b, levels[l + 1]]] : [[a, levels[l + 1]], [b, levels[l]]]);
      }
      return out;
    }
    default: return out;
  }
}

/** Lines of a roof finish over the box [u0, u1] × [v0, v1] of a roof panel, rows running along u. */
export function roofFinish(kind: RoofFinish, u0: number, u1: number, v0: number, v1: number): Contour[] {
  const out: Contour[] = [];
  if (kind === "seams") { for (let u = u0 + 7; u < u1; u += 7) out.push([[u, v0], [u, v1]]); return out; }
  if (kind === "plain") return out;
  const h = kind === "shingles" ? 5 : 4, w = kind === "shingles" ? 7 : 5;
  let k = 0;
  for (let v = v0; v < v1; v += h, k++) {
    if (v > v0) out.push([[u0, v], [u1, v]]);
    if (kind === "shingles") for (let u = u0 + (k % 2 ? w / 2 : 0); u < u1; u += w) out.push([[u, v], [u, Math.min(v1, v + h)]]);
  }
  return out;
}

/** Total length of lines, mm. */
export const linesLength = (cs: Contour[]) => cs.reduce((n, c) => n + len(c), 0);
