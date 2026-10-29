/**
 * Stitching: hole placement along paths, hole shapes, and thread estimates.
 *
 * A seam joins two paths of the same length (or as near as the construction makes them). The hole
 * count is set once, from the first path's length and the pitch, and both paths get that many holes
 * evenly by arc length, from end to end: the counts always match, and any difference in length
 * shows as a difference in spacing, which the checks report.
 */
import { circle } from "../geom";
import type { Contour, Pt } from "../types";
import { pathLength, pointAt } from "./path";

export type StitchType = "saddle" | "running" | "cross" | "whip" | "box" | "baseball" | "lacing" | "double";
export const STITCH_NAMES: Record<StitchType, string> = {
  saddle: "Saddle stitch", running: "Running stitch", cross: "Cross stitch", whip: "Whip stitch", box: "Box stitch",
  baseball: "Baseball stitch", lacing: "Decorative lacing", double: "Double-row saddle stitch",
};
export type HoleShape = "round" | "slanted";
export type CutMode = "laser" | "marks" | "manual";
export const CUT_MODES: Record<CutMode, string> = { laser: "Laser-cut holes", marks: "Laser-marked stitch guide", manual: "Hand-cutting template" };

export interface StitchSpec {
  type: StitchType;
  /** Distance between hole centres, mm. */
  pitch: number;
  /** Hole diameter (round) or slit length (slanted), mm. */
  hole: number;
  shape: HoleShape;
  /** Distance from the edge to the hole centres, mm. */
  edge: number;
  /** Gap between the two rows of a double-row stitch, mm. */
  rowGap: number;
  mode: CutMode;
}

export interface HolePlace { pt: Pt; t: Pt }

/** n intervals (n + 1 holes) evenly along a path by arc length. */
export function placeHoles(path: Pt[], n: number): HolePlace[] {
  const L = pathLength(path);
  return Array.from({ length: n + 1 }, (_, i) => pointAt(path, (L * i) / n));
}

/** How many intervals a path of this length gets at this pitch (at least one). */
export const intervals = (L: number, pitch: number) => Math.max(1, Math.round(L / Math.max(0.5, pitch)));

/** Lacing uses slots along the seam; everything else the chosen hole shape. */
export function holeOutline(h: HolePlace, s: StitchSpec): Contour {
  const [x, y] = h.pt, [tx, ty] = h.t;
  if (s.type === "lacing") {
    const L = Math.max(2.5, s.hole * 2.4) / 2, w = Math.max(0.8, s.hole * 0.6) / 2;
    return [[x - tx * L - ty * w, y - ty * L + tx * w], [x + tx * L - ty * w, y + ty * L + tx * w], [x + tx * L + ty * w, y + ty * L - tx * w], [x - tx * L + ty * w, y - ty * L - tx * w]];
  }
  if (s.shape === "round") return circle(x, y, Math.max(0.3, s.hole / 2), 0.05); // 8 sides at 1.2 mm: within 0.05 mm of round
  // a slit at 45 degrees to the seam, as a diamond pricking iron leaves
  const a = Math.atan2(ty, tx) + Math.PI / 4, L = Math.max(1, s.hole) / 2, w = Math.max(0.35, s.hole * 0.22) / 2;
  const ux = Math.cos(a), uy = Math.sin(a);
  return [[x - ux * L, y - uy * L], [x - uy * w, y + ux * w], [x + ux * L, y + uy * L], [x + uy * w, y - ux * w]];
}

/** A mark for a hole (the guide and template modes): a small cross, as two scored lines. */
export function holeMark(h: HolePlace, s: StitchSpec): Contour[] {
  const [x, y] = h.pt, r = Math.max(0.6, s.hole * 0.6);
  return [[[x - r, y], [x + r, y]], [[x, y - r], [x, y + r]]];
}

/** Thread for a seam of `holes` holes at this pitch through `stack` mm of material, with 150 mm tails. */
export function threadFor(type: StitchType, holes: number, pitch: number, stack: number, edge: number): number {
  const n = Math.max(0, holes - 1), tails = 300;
  switch (type) {
    case "running": return n * (pitch + stack) + tails;
    case "whip": return n * (pitch + 2 * stack + 2 * edge) + tails;
    case "cross": case "baseball": return n * 2 * (Math.hypot(pitch, 2 * edge) + stack) + tails;
    case "lacing": return n * (pitch + 2 * stack + 2 * edge) * 1.1 + tails;
    case "double": return 2 * (n * 2 * (pitch + stack)) + 2 * tails;
    default: return n * 2 * (pitch + stack) + tails;
  }
}

/** The stitch's rows at an edge: one, or two for the double-row stitch (the second further in). */
export const rowsOf = (s: StitchSpec): number[] => (s.type === "double" ? [s.edge, s.edge + s.rowGap] : [s.edge]);
