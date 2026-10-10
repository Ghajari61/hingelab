/**
 * Tabs, slots and kerf. Joints are drawn at nominal size; kerf is applied once, at the very end
 * (outlines grow by K/2, inner cuts shrink by K/2).
 */
import { makeShape, offsetShapes, shapeContours, signedArea, unionShapes } from "@/lib/letters/polygon";
import type { Contour, Part, Shape } from "./types";

/** Tabs are spread about this far apart along a wall edge, mm. */
export const TAB_PITCH = 60;
const EPS = 1e-6;

export const rect = (x0: number, y0: number, x1: number, y1: number): Contour => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

/** Intervals of the outer contour that lie on y = 0 (the wall edge), merged and sorted. */
export function wallIntervals(s: Shape): [number, number][] {
  const out: [number, number][] = [];
  const c = s.outer;
  for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length];
    if (Math.abs(a[1]) < EPS && Math.abs(b[1]) < EPS && Math.abs(a[0] - b[0]) > EPS) out.push(a[0] < b[0] ? [a[0], b[0]] : [b[0], a[0]]);
  }
  out.sort((p, q) => p[0] - q[0]);
  const merged: [number, number][] = [];
  for (const iv of out) {
    const last = merged[merged.length - 1];
    if (last && iv[0] <= last[1] + EPS) last[1] = Math.max(last[1], iv[1]);
    else merged.push([...iv]);
  }
  return merged;
}

/**
 * Tab centres along a wall edge of length `len`: about every 60 mm, at least two, one when the
 * edge is shorter than 2.5 tab widths, none when even one tab does not fit with 1 mm to spare.
 */
export function tabCenters(len: number, tabWidth: number, pitch = TAB_PITCH): number[] {
  if (len < tabWidth + 2) return [];
  const n = len < 2.5 * tabWidth ? 1 : Math.max(2, Math.round(len / pitch));
  return Array.from({ length: n }, (_, k) => ((k + 0.5) * len) / n);
}

/** Tab x ranges for every wall interval of the shape. */
export function finTabs(s: Shape, tabWidth: number): [number, number][] {
  const tabs: [number, number][] = [];
  for (const [a, b] of wallIntervals(s)) for (const c of tabCenters(b - a, tabWidth)) tabs.push([a + c - tabWidth / 2, a + c + tabWidth / 2]);
  return tabs;
}

/** The shape with its tabs (reaching from y = 0 down to y = -depth) unioned on. */
export function withTabs(s: Shape, tabs: [number, number][], depth: number): Shape {
  if (!tabs.length) return s;
  const merged = unionShapes([...shapeContours([s]), ...tabs.map(([x0, x1]) => rect(x0, -depth, x1, 0))]);
  return merged.length === 1 ? merged[0] : merged.sort((a, b) => b.area - a.area)[0];
}

/** Kerf-compensated cut paths for a part. */
export function kerfPart(part: Part, K: number): { outline: Contour[]; inner: Contour[] } {
  const h = K / 2;
  const outline = shapeContours(offsetShapes([part.shape], h, "miter"));
  const inner = part.innerCuts.flatMap(c => {
    const filled = signedArea(c) < 0 ? [...c].reverse() : c;
    return shapeContours(offsetShapes([makeShape(filled, [])], -h, "miter"));
  });
  return { outline, inner };
}
