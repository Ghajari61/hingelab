/**
 * Rounding a letter so its convex corners have at least radius r and its concave corners at
 * least a concave radius ρ ≤ r.
 *
 * Opening (shrink by r, grow by r) rounds convex corners and removes features thinner than 2r;
 * closing (grow by ρ, shrink by ρ) rounds concave corners and fills gaps narrower than 2ρ.
 * The letter is opened, then closed.
 */
import { cleanContour, differenceShapes, dropSpecks, intersectShapes, makeShape, MIN_PIECE_AREA, offsetShapes, totalArea, shapeContours } from "./polygon";
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

/** Steps from the concave radius up to the convex one, when a smaller closing cannot restore a neck. */
const CONCAVE_STEPS = 3;
/** Letter material narrower than this that a closing leaves out is polygon noise, mm. */
const NECK_MIN_WIDTH = 0.5;

const close = (shapes: Shape[], rho: number) =>
  despike(smoothShapes(dropSpecks(offsetShapes(offsetShapes(shapes, rho), -rho), MIN_PIECE_AREA)));

/**
 * Close with radius rho; where that leaves a web thinner than `minWeb` (two walls back to back),
 * close again with a radius minWeb/2 larger, which fills the gap more fully and only makes the
 * concave arcs rounder.
 */
function closeWithWebs(opened: Shape[], rho: number, minWeb: number) {
  let closed: Shape[] = [];
  for (let k = 0; k < 5; k++) {
    closed = close(opened, rho + (k * minWeb) / 2);
    if (minWeb <= 0 || topology(dropSpecks(offsetShapes(closed, -minWeb / 2), MIN_PIECE_AREA)) === topology(closed)) break;
  }
  return closed;
}

/**
 * Round `shapes` so every convex corner has at least radius rMin and every concave corner (inside
 * corners and counters) at least rConcave, which defaults to rMin. Opening first removes everything
 * thinner than 2r, so only the closing can create a thin web: where a gap just under 2ρ wide is
 * filled, the material across it can be arbitrarily thin (see closeWithWebs).
 *
 * The opening also removes necks thinner than 2r, such as the bar of an "e". Closing with r grows
 * them back whole; a smaller concave radius grows them back only from both ends, which leaves a
 * sharp point where the two ends meet. Where letter material that closing with r keeps would be
 * lost, the concave radius is raised in steps up to r.
 */
export function fillet(shapes: Shape[], rMin: number, minWeb = 0, rConcave = rMin): FilletResult {
  if (rMin <= 0) return { shapes, changed: false, delta: 0 };
  const r = rMin * FILLET_MARGIN;
  const rc = Math.min(r, Math.max(0, rConcave) * FILLET_MARGIN);
  const opened = dropSpecks(offsetShapes(offsetShapes(shapes, -r), r), MIN_PIECE_AREA);
  const kept = rc < r ? shapeContours(intersectShapes(shapeContours(shapes), shapeContours(close(opened, r)))) : [];
  const losesNeck = (closed: Shape[]) =>
    dropSpecks(offsetShapes(differenceShapes(kept, shapeContours(closed)), -NECK_MIN_WIDTH / 2), MIN_PIECE_AREA).length > 0;
  let closed: Shape[] = [];
  for (let i = 0; i <= CONCAVE_STEPS; i++) {
    const rho = rc + ((r - rc) * i) / CONCAVE_STEPS;
    closed = closeWithWebs(opened, rho, minWeb);
    if (rho >= r || !losesNeck(closed)) break;
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
