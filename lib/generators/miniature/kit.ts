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
import { clipLines } from "../textOps";

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
      const r = w / 2;
      if (h >= r) { const spring = z0 + h - r; return outerOf([rect(x0, z0, w, spring - z0 + 0.01), circle(cx, spring, r, 0.05)]); }
      // lower than a half circle: a segmental arch through both bottom corners and the top
      const R = (r * r + h * h) / (2 * h), zc = z0 + h - R, a0 = Math.asin(Math.min(1, r / R)), n = 24;
      const pts: Pt[] = [[x0, z0], [x0 + w, z0]];
      for (let i = 0; i <= n; i++) { const a = -a0 + (2 * a0 * i) / n; pts.push([cx + R * Math.sin(-a), zc + R * Math.cos(a)]); }
      return outerOf([pts]);
    }
    case "pointed": {
      // two arcs of radius w struck from the far springing points: an equilateral pointed arch
      // squashed to the height when that is less than the arch's own rise
      const r = w, rise = w * Math.sqrt(3) / 2, spring = z0 + Math.max(0, h - rise), k = Math.min(1, h / rise);
      const pts: Pt[] = [[x0, z0], [x0 + w, z0], [x0 + w, spring]];
      const n = 14;
      for (let i = 1; i <= n; i++) { const a = (Math.PI / 3) * (i / n); pts.push([x0 + r * Math.cos(a), spring + r * Math.sin(a) * k]); }
      for (let i = n - 1; i >= 0; i--) { const a = (Math.PI / 3) * (i / n); pts.push([x0 + w - r * Math.cos(a), spring + r * Math.sin(a) * k]); }
      return outerOf([pts]);
    }
    case "horseshoe": {
      // a circle wider than its opening, cut by the jambs below its centre
      const r = Math.min(w * 0.56, h / 1.7), c = z0 + Math.max(r * 0.7, h - r);
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

/** Points of a polyline that bend it: the clip samples every 0.4 mm, and straight runs need only their ends. */
export function straighten(c: Contour, tol = 1e-3): Contour {
  if (c.length < 3) return c;
  const out: Contour = [c[0]];
  for (let i = 1; i + 1 < c.length; i++) {
    const a = out[out.length - 1], b = c[i], d = c[i + 1];
    const cross = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
    if (Math.abs(cross) > tol * Math.hypot(d[0] - a[0], d[1] - a[1])) out.push(b);
  }
  out.push(c[c.length - 1]);
  return out;
}

/** Score lines kept to the wood (outside the holes), with their straight runs as single segments. */
export const clipScore = (lines: Contour[], outer: Contour, holes: Contour[]): Contour[] => clipLines(lines, outer, holes).map((c) => straighten(c));

// ------------------------------------------------------------------ railings, fences and crossed pairs

export type RailStyle = "balusters" | "bars" | "lattice" | "solid";
export const RAIL_STYLES: Record<RailStyle, string> = { balusters: "Balusters", bars: "Horizontal bars", lattice: "Lattice", solid: "Solid panel" };
export type FenceStyle = "picket" | "rail" | "lattice" | "wall";
export const FENCE_STYLES: Record<FenceStyle, string> = { picket: "Picket fence", rail: "Post and rail", lattice: "Lattice fence", wall: "Low stone wall" };

/** A shape with its holes, from the union of contours (gaps a union closes in become holes). */
function solidOf(cs: Contour[]): { outer: Contour; holes: Contour[] } {
  const s = biggest(unionShapes(cs.map(wound), [], false, true));
  return { outer: s.outer, holes: s.holes };
}

/**
 * A railing or fence panel L long and H tall, standing on its bottom edge with tabs T deep below it
 * (`tabs`), as a y-down outline (v = 0 at the top, the bottom edge at v = H). Every style keeps a
 * solid strip along the bottom, so the tabs always have wood above them.
 */
export function screenPanel(L: number, H: number, style: RailStyle | FenceStyle, T: number, tabs = true): { outer: Contour; holes: Contour[]; score: Contour[] } {
  const br = 2.6, tr = 2.2, post = 2.4;
  const tabRects = tabs ? tabSpans(0, L, T).map(([s, e]) => rect(s, -T, e - s, T + 0.01)) : [];
  let outer: Contour, holes: Contour[] = [], score: Contour[] = [];
  const inner = H - br - tr;
  switch (style) {
    case "picket": {
      const pw = 3.2, g = 2.4, n = Math.max(2, Math.round((L + g) / (pw + g))), step = (L - pw) / (n - 1);
      const pick = Array.from({ length: n }, (_, i): Contour => { const x = i * step; return [[x, 0], [x + pw, 0], [x + pw, H - 1.8], [x + pw / 2, H], [x, H - 1.8]]; });
      ({ outer, holes } = solidOf([rect(0, 0, L, br), rect(0, H * 0.62, L, 2.2), ...pick, ...tabRects]));
      break;
    }
    case "rail": {
      const n = Math.max(2, Math.round(L / 28) + 1), step = (L - 3.5) / (n - 1);
      const posts = Array.from({ length: n }, (_, i) => rect(i * step, 0, 3.5, H));
      ({ outer, holes } = solidOf([rect(0, 0, L, br), rect(0, H * 0.48, L, 2.4), rect(0, H - 2.6, L, 2.6), ...posts, ...tabRects]));
      break;
    }
    case "wall": {
      ({ outer } = solidOf([rect(0, 0, L, H), ...tabRects]));
      const lines = wallFinish("stone", 0, L, 0, H - 2.4);
      score = clipScore([...lines, [[0, H - 2.4], [L, H - 2.4]]], outer, []);
      break;
    }
    default: {
      ({ outer } = solidOf([rect(0, 0, L, H), ...tabRects]));
      if (inner < 3 || L < 3 * post) { if (style !== "solid") break; }
      if (style === "balusters" && inner >= 3) {
        const b = 1.4, g = 2.2, k = Math.max(1, Math.floor((L - 2 * post + b) / (g + b))), gw = (L - 2 * post - (k - 1) * b) / k;
        holes = Array.from({ length: k }, (_, i) => rect(post + i * (gw + b), br, gw, inner));
      } else if (style === "bars" && inner >= 3) {
        const b = 1.3, rows = Math.max(1, Math.floor((inner + b) / 4.2)), gh = (inner - (rows - 1) * b) / rows;
        holes = Array.from({ length: rows }, (_, i) => rect(post, br + i * (gh + b), L - 2 * post, gh));
      } else if (style === "lattice" && inner >= 4) {
        const clip = rect(post, br, L - 2 * post, inner);
        holes = fretHoles({ kind: "lattice", cell: clamp(inner / 2.2, 3.5, 9), bar: 1.2 }, post - 1, br - 1, L - post + 1, H - tr + 1, [], undefined, clip);
        if (!holes.length) holes = [clip];
      } else if (style === "solid") {
        const panes = Math.max(1, Math.round(L / 30)), pw = (L - 2 * post) / panes;
        for (let i = 0; i < panes; i++) { const r = rect(post + i * pw + 0.8, br, pw - 1.6, Math.max(1, inner)); score.push([...r, r[0]]); }
      }
    }
  }
  return { outer: yUp(outer, H), holes: holes.map((c) => yUp(c, H)), score: score.map((c) => yUp(c, H)) };
}

/**
 * Two identical profiles slotted halfway into each other at right angles (a half-lap cross): a tree,
 * a lamp post, a bush. `profile` is y up, centred on u = 0, standing on z = 0; `foot` is the half-width
 * of its foot. With `tabs`, the foot passes tabs T deep below z = 0 and `hole` is the plus-shaped
 * slot they need in whatever it stands on (plan coordinates). The first part runs along x, the
 * second along y; the first is slotted from the top, the second from the bottom.
 */
export function crossPair(profile: Contour, T: number, at: V3, id: string, name: string, foot: number, tabs: boolean): { parts: GenPart[]; hole: Contour[] } {
  const [cx, cy, z0] = at;
  const xs = profile.map((q) => q[0]), zs = profile.map((q) => q[1]);
  const w = 2 * Math.max(Math.abs(Math.min(...xs)), Math.max(...xs)), H = Math.max(...zs), Hm = H / 2;
  const f = Math.max(foot, T / 2 + 1.5);
  const tabA = tabs ? [rect(-f, -T, 2 * f, T + 0.01)] : [];
  const legsB = tabs ? [rect(-f, -T, f - T / 2 + 0.01, T + 0.01), rect(T / 2 - 0.01, -T, f - T / 2 + 0.01, T + 0.01)] : [];
  const a = biggest(differenceShapes([outerOf([profile, ...tabA])], [rect(-T / 2, Hm, T, H + 1)]));
  const b = biggest(differenceShapes([outerOf([profile, ...legsB])], [rect(-T / 2, -T - 1, T, Hm + T + 1)]));
  const shift = (c: Contour) => yUp(move(c, w / 2, 0), H);
  const parts: GenPart[] = [
    { id: `${id}-a`, name: `${name} (slotted from the top)`, outer: shift(a.outer), holes: a.holes.map(shift), place: { x: cx - w / 2, y: -(z0 + H), z: cy - T / 2, upright: true } },
    { id: `${id}-b`, name: `${name} (slotted from the bottom)`, outer: shift(b.outer), holes: b.holes.map(shift), place: { x: cx + T / 2, y: -(z0 + H), z: cy - w / 2, upright: true, yaw: 90 } },
  ];
  const hole = tabs ? [outerOf([rect(cx - f, cy - T / 2, 2 * f, T), rect(cx - T / 2, cy - f, T, 2 * f)])] : [];
  return { parts, hole };
}

export type CrossKind = "tree" | "pine" | "bush" | "lamp" | "column";
/** Profiles for crossed pairs, y up, centred on u = 0, H tall and about w wide; and the foot half-width. */
export function crossProfile(kind: CrossKind, H: number, w: number, T: number): { profile: Contour; foot: number } {
  const tw = Math.max(T + 5, w * 0.16);
  switch (kind) {
    case "pine": {
      const trunk = rect(-tw / 2, 0, tw, H * 0.2);
      const tiers = [0, 1, 2].map((i): Contour => { const z = H * (0.14 + i * 0.25), hw = (w / 2) * (1 - i * 0.22); return [[-hw, z], [hw, z], [0, Math.min(H, z + H * 0.42)]]; });
      return { profile: outerOf([trunk, ...tiers, [[-tw / 2, H * 0.1], [tw / 2, H * 0.1], [0, H]]]), foot: tw / 2 };
    }
    case "bush": {
      const r = w * 0.3;
      return { profile: outerOf([rect(-tw / 2, 0, tw, H * 0.3), circle(0, H - r, r, 0.05), circle(-w * 0.22, H * 0.48, r * 0.85, 0.05), circle(w * 0.22, H * 0.48, r * 0.85, 0.05), rect(-w * 0.3, H * 0.25, w * 0.6, H * 0.25)]), foot: tw / 2 };
    }
    case "lamp": {
      const pw = Math.max(T + 5, 6), lw = Math.max(pw + 6, w * 0.55), lh = Math.max(9, H * 0.16);
      const base = rect(-pw * 0.9, 0, pw * 1.8, Math.max(4, H * 0.06));
      const pole = rect(-pw / 2, 0, pw, H - lh - 2);
      const lantern: Contour = [[-lw * 0.32, H - lh - 2], [lw * 0.32, H - lh - 2], [lw / 2, H - 3], [-lw / 2, H - 3]];
      const cap: Contour = [[-lw / 2 - 1, H - 3.2], [lw / 2 + 1, H - 3.2], [0, H]];
      return { profile: outerOf([base, pole, lantern, cap]), foot: pw * 0.9 };
    }
    case "column": {
      const { outline } = columnProfile("classical", w, H);
      return { profile: move(outline, -w / 2, 0), foot: w / 2 };
    }
    default: {
      const r = w / 2;
      const crown = [circle(0, H - r * 0.9, r * 0.72, 0.05), circle(-r * 0.42, H - r * 1.2, r * 0.6, 0.05), circle(r * 0.42, H - r * 1.2, r * 0.6, 0.05), circle(-r * 0.2, H - r * 0.55, r * 0.5, 0.05), circle(r * 0.25, H - r * 0.6, r * 0.5, 0.05)];
      return { profile: outerOf([rect(-tw / 2, 0, tw, H - r * 1.1), [[-tw / 2, H * 0.12], [tw / 2, H * 0.12], [tw * 1.2, H * 0.02], [-tw * 1.2, H * 0.02]], ...crown]), foot: tw / 2 };
    }
  }
}

/** The convex hull of points (monotone chain), counter-clockwise. */
export function hull(pts: Pt[]): Contour {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [], up: Pt[] = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}

/** A contour grown by d (mitred), for clearance round a hole. */
export const grow = (c: Contour, d: number): Contour => { const g = offsetShapes([makeShape(wound(c), [])], d, "miter"); return g.length ? biggest(g).outer : c; };

// ------------------------------------------------------------------ columns

export type ColumnStyle = "plain" | "turned" | "classical";
export const COLUMN_STYLES: Record<ColumnStyle, string> = { plain: "Square posts", turned: "Turned posts", classical: "Classical columns" };

/**
 * A post or column's silhouette pw wide and H tall, y up (x from 0 to pw, z from 0 to H), with its
 * scored details. Every style is full width for the last few millimetres at the foot and the head,
 * so tabs there have wood beside them.
 */
export function columnProfile(style: ColumnStyle, pw: number, H: number): { outline: Contour; score: Contour[] } {
  const c = pw / 2;
  if (style === "plain" || H < 16) return { outline: rect(0, 0, pw, H), score: [[[0, 3], [pw, 3]], [[0, H - 4], [pw, H - 4]]] };
  const side: Pt[] = []; // the right-hand edge, bottom to top
  const score: Contour[] = [];
  if (style === "turned") {
    const z0 = 4, z1 = H - 4, n = 48;
    side.push([pw, 0], [pw, z0]);
    for (let i = 0; i <= n; i++) {
      const t = i / n, z = z0 + (z1 - z0) * t;
      // a vase low down, a run of beads above it, and a neck under the head
      const vase = t < 0.45 ? 0.3 * Math.sin((Math.PI * t) / 0.45) ** 2 : 0;
      const beads = t >= 0.5 && t < 0.9 ? 0.12 * Math.max(0, Math.cos(2 * Math.PI * ((t - 0.5) / 0.4) * 4)) : 0;
      side.push([c + c * (0.52 + vase + beads), z]);
    }
    side.push([pw, z1], [pw, H]);
    score.push([[0, z0], [pw, z0]], [[0, z1], [pw, z1]]);
  } else {
    const b = 2.5, tor = 4.5, ech = H - 6, ab = H - 2.5, n = 24;
    side.push([pw, 0], [pw, b], [c + c * 0.92, b], [c + c * 0.92, tor]);
    for (let i = 0; i <= n; i++) { const t = i / n, z = tor + (ech - tor) * t; side.push([c + c * (0.72 - 0.1 * t ** 1.5), z]); }
    for (let i = 1; i <= 6; i++) { const t = i / 6; side.push([c + c * (0.62 + 0.32 * Math.sin((Math.PI / 2) * t)), ech + (ab - ech) * t]); }
    side.push([pw, ab], [pw, H]);
    for (const f of [-0.35, 0, 0.35]) score.push([[c + c * f, tor + 1], [c + c * f * 0.88, ech - 1]]);
    score.push([[0, ab], [pw, ab]]);
  }
  const left = side.map(([x, z]) => [pw - x, z] as Pt).reverse();
  return { outline: outerOf([[...side, ...left]]), score };
}
