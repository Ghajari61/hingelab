/**
 * Rounding a letter so every convex and concave corner has at least radius r.
 *
 * Opening (shrink by r, grow by r) rounds convex corners and removes features thinner than 2r;
 * closing (grow by r, shrink by r) rounds concave corners and fills gaps narrower than 2r.
 * The letter is opened, closed and opened again.
 */
import { cleanContour, differenceShapes, dropSpecks, makeShape, MIN_PIECE_AREA, offsetShapes, totalArea, shapeContours } from "./polygon";
import { turnAt } from "./path";
import type { Contour, Shape } from "./types";

/**
 * Clipper's integer rounding leaves micrometre-long edges next to long ones; the direction of
 * such an edge is noise, which upsets curvature estimates. Points closer than this are merged, mm.
 */
export const SMOOTH_POINT_DIST = 0.05;

/** The shapes with near-coincident points merged (see SMOOTH_POINT_DIST). */
export const smoothShapes = (shapes: Shape[]) =>
  shapes.map(s => makeShape(cleanContour(s.outer, SMOOTH_POINT_DIST), s.holes.map(h => cleanContour(h, SMOOTH_POINT_DIST)), s.group));

export interface FilletResult {
  shapes: Shape[];
  /** Area removed or added by more than r² somewhere (the letter visibly changed). */
  changed: boolean;
  /** Total area difference, mm². */
  delta: number;
}

/**
 * Polygonal arcs, and the small kinks where an offset arc meets a glyph curve, leave the outline
 * up to about 1 % tighter than the offset radius; rounding with this much more keeps the promise.
 */
const FILLET_MARGIN = 1.015;

/** A vertex turning more than this doubles back on itself: the tip of a needle, radians. */
const SPIKE_TURN = (150 * Math.PI) / 180;

/**
 * Where two parts almost touch after growing by r, shrinking back can leave a needle-thin crack
 * about r long. Its tip turns almost 180°; removing tips until none are left closes the needle.
 */
export function removeSpikes(c: Contour): Contour {
  const pts = c.slice();
  for (let i = 0; pts.length > 3 && i < pts.length; ) {
    if (Math.abs(turnAt(pts, i)) > SPIKE_TURN) {
      pts.splice(i, 1);
      i = Math.max(0, i - 1);
    } else i++;
  }
  return pts;
}

const despike = (shapes: Shape[]) =>
  shapes.map(s => makeShape(removeSpikes(s.outer), s.holes.map(removeSpikes), s.group));

/** Pieces and holes of a shape set, to compare topology. */
const topology = (s: Shape[]) => `${s.length}:${s.reduce((n, x) => n + x.holes.length, 0)}`;

/**
 * Round `shapes` so every corner has at least radius rMin. Opening first removes everything
 * thinner than 2r, so only the closing can create a thin web: where a gap just under 2r wide is
 * filled, the material across it can be arbitrarily thin. If any web is thinner than `minWeb`
 * (two walls back to back), the closing is repeated with a radius minWeb/2 larger, which fills the
 * gap more fully and only makes the concave arcs rounder.
 */
export function fillet(shapes: Shape[], rMin: number, minWeb = 0): FilletResult {
  if (rMin <= 0) return { shapes, changed: false, delta: 0 };
  const r = rMin * FILLET_MARGIN;
  const opened = dropSpecks(offsetShapes(offsetShapes(shapes, -r), r), MIN_PIECE_AREA);
  let closed: Shape[] = [];
  for (let k = 0; k < 5; k++) {
    const rho = r + (k * minWeb) / 2;
    closed = despike(smoothShapes(dropSpecks(offsetShapes(offsetShapes(opened, rho), -rho), MIN_PIECE_AREA)));
    if (minWeb <= 0 || topology(dropSpecks(offsetShapes(closed, -minWeb / 2), MIN_PIECE_AREA)) === topology(closed)) break;
  }
  const before = shapeContours(shapes), after = shapeContours(closed);
  const lost = dropSpecks(differenceShapes(before, after), MIN_PIECE_AREA);
  const gained = dropSpecks(differenceShapes(after, before), MIN_PIECE_AREA);
  const big = (s: Shape) => s.area > r * r;
  const area = totalArea(shapes);
  const delta = totalArea(lost) + totalArea(gained);
  return {
    shapes: closed,
    changed: lost.some(big) || gained.some(big) || delta > 0.05 * area,
    delta,
  };
}
