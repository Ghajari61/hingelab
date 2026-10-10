import type { Plane, Vec3 } from "../types";

export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * In-plane frame for parallel fins: N is the stacking axis, U runs along the wall (part-local x),
 * W points out of the wall (part-local y). U × W = N.
 */
export function parallelFrame(axis: "X" | "Y"): { u: Vec3; w: Vec3; n: Vec3 } {
  return axis === "X"
    ? { n: [1, 0, 0], u: [0, 1, 0], w: [0, 0, 1] }
    : { n: [0, 1, 0], u: [-1, 0, 0], w: [0, 0, 1] };
}

/**
 * Planes p_i = min + phase · spacing + i · spacing that lie strictly inside (min, max).
 */
export function parallelOffsets(min: number, max: number, spacing: number, phase: number): number[] {
  const out: number[] = [];
  const eps = 1e-9;
  for (let p = min + phase * spacing; p < max - eps; p += spacing) if (p > min + eps) out.push(p);
  return out;
}

export function parallelPlanes(axis: "X" | "Y", min: number, max: number, spacing: number, phase: number): Plane[] {
  const f = parallelFrame(axis);
  return parallelOffsets(min, max, spacing, phase).map(offset => ({ normal: f.n, offset, u: f.u, w: f.w }));
}

/**
 * Column-major 4×4 that maps model space into the frame rows [U; W; N]: local = (U·p, W·p, N·p).
 * Slicing the transformed mesh at height `offset` gives the section in (u, w).
 */
export const toFrameMatrix = (u: Vec3, w: Vec3, n: Vec3): number[] => [u[0], w[0], n[0], 0, u[1], w[1], n[1], 0, u[2], w[2], n[2], 0, 0, 0, 0, 1];

/** Column-major placement: part-local (x, y, z) → O + x U + y W + z N, with O = offset · N. */
export const placementOf = (pl: Plane): number[] => {
  const { u, w, normal: n, offset: d } = pl;
  return [u[0], u[1], u[2], 0, w[0], w[1], w[2], 0, n[0], n[1], n[2], 0, n[0] * d, n[1] * d, n[2] * d, 1];
};
