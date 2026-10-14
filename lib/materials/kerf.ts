/**
 * Kerf compensation that differs by machine axis: shapes grow by an ellipse with half-axes kx/2 and
 * ky/2 (see axes.ts), so each edge moves by half the cut width across it.
 */
import { makeShape, offsetShapes } from "@/lib/letters/polygon";
import type { Contour, Point, Shape } from "@/lib/letters/types";

export { ellipse, kerfAcross, kerfPoint } from "./axes";

/** The larger half-axis is at most this many times the smaller one (a zero kerf on one axis is clamped). */
export const MAX_KERF_RATIO = 20;

const scaled = (shapes: Shape[], sx: number, sy: number): Shape[] =>
  shapes.map((s) => {
    const f = (c: Contour) => c.map(([x, y]) => [x * sx, y * sy] as Point);
    return makeShape(f(s.outer), s.holes.map(f), s.group);
  });

/**
 * Offset filled shapes by an ellipse with half-axes `dx` and `dy` (both the same sign): outers grow
 * and holes shrink for positive values. Equal values are the ordinary round offset. Done exactly by
 * stretching one axis so the ellipse becomes a circle, offsetting, and stretching back.
 */
export function offsetShapesXY(shapes: Shape[], dx: number, dy: number, join: "round" | "miter" = "round"): Shape[] {
  if (Math.abs(dx - dy) < 1e-9) return offsetShapes(shapes, dx, join);
  const sign = dx + dy < 0 ? -1 : 1;
  let a = Math.abs(dx), b = Math.abs(dy);
  if (a > b) b = Math.max(b, a / MAX_KERF_RATIO);
  else a = Math.max(a, b / MAX_KERF_RATIO);
  if (a >= b) {
    const s = a / b;
    return scaled(offsetShapes(scaled(shapes, 1, s), sign * a, join), 1, 1 / s);
  }
  const s = b / a;
  return scaled(offsetShapes(scaled(shapes, s, 1), sign * b, join), 1 / s, 1);
}
