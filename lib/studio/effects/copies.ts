/**
 * Rotate Copies and Mirror: copies of the path under rotations about a centre / a reflection across an
 * axis, optionally fused into one area (closed parts united; open parts kept as they are).
 */
import { EPS, isEmptyBox, rotateAt, subpathsBox, transformSubpaths } from "../geom";
import type { Mat, MirrorParams, RotateCopiesParams, Subpath } from "../types";
import { openParts, uniteClosed } from "./clip";

const fused = (sets: Subpath[][]): Subpath[] => [...uniteClosed(sets), ...sets.flatMap(openParts)];

export function rotateCopiesCount(p: RotateCopiesParams) {
  return Math.max(1, Math.min(360, Math.round(p.count)));
}

export function applyRotateCopies(subs: Subpath[], p: RotateCopiesParams): Subpath[] {
  const n = rotateCopiesCount(p);
  const copies = Array.from({ length: n }, (_, k) => transformSubpaths(subs, rotateAt(p.start + (360 * k) / n, p.cx, p.cy)));
  return p.fuse ? fused(copies) : copies.flat();
}

/** Reflection across the line through (x1, y1) and (x2, y2). */
export function mirrorMatrix(x1: number, y1: number, x2: number, y2: number): Mat | null {
  const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy);
  if (l < EPS) return null;
  const ux = dx / l, uy = dy / l;
  const a = 2 * ux * ux - 1, b = 2 * ux * uy, d = 2 * uy * uy - 1;
  return [a, b, b, d, x1 - (a * x1 + b * y1), y1 - (b * x1 + d * y1)];
}

export function mirrorAxis(p: MirrorParams): [number, number, number, number] {
  if (p.axis === "vertical") return [p.x, 0, p.x, 1];
  if (p.axis === "horizontal") return [0, p.y, 1, p.y];
  return [p.x1, p.y1, p.x2, p.y2];
}

export function applyMirror(subs: Subpath[], p: MirrorParams): Subpath[] {
  const m = mirrorMatrix(...mirrorAxis(p));
  if (!m) return subs;
  const mirrored = transformSubpaths(subs, m);
  if (!p.keepOriginal) return mirrored;
  return p.fuse ? fused([subs, mirrored]) : [...subs, ...mirrored];
}

/** Default axis/centre values from the path's extent. */
export function boxOf(subs: Subpath[]) {
  const b = subpathsBox(subs);
  return isEmptyBox(b) ? { minX: 0, minY: 0, maxX: 0, maxY: 0 } : b;
}
