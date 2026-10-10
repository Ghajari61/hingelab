/**
 * Finger joints, worked out as ownership of the box's edges. Panels are cut at their outside size;
 * along each edge where two panels meet, the T × T column of material is split into an odd number of
 * equal fingers that the two panels own in turn, so each finger belongs to exactly one panel. The
 * T × T × T corner cubes go to the front and back. With an odd count both ends of an edge go to the
 * same panel, so the pattern reads the same from either end and the two panels always agree.
 */
import { unionShapes } from "@/lib/letters/polygon";
import { rect } from "../geom";
import type { Contour } from "../types";

/** Fingers along an edge of inner length L: odd, as close to width f as possible. */
export function fingerCount(L: number, f: number): number {
  if (!(L > 0) || !(f > 0)) return 1;
  const k = L / f;
  let n = Math.max(1, Math.round(k));
  if (n % 2 === 0) n += k > n ? 1 : -1;
  return Math.max(1, n);
}

/** One edge of a panel: whether a panel mates there, and whether this panel owns the end fingers. */
export interface EdgeSpec {
  mate: boolean;
  ends: boolean;
}

/** Owned spans [a, b] along an edge of inner length L that starts at `from`. */
export function ownedSpans(L: number, f: number, e: EdgeSpec, from: number): [number, number][] {
  if (!e.mate) return [[from, from + L]];
  const n = fingerCount(L, f), s = L / n;
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) if ((i % 2 === 0) === e.ends) out.push([from + i * s, from + (i + 1) * s]);
  return out;
}

/**
 * A panel U × V (its frame: u right, v down) with finger edges [top, right, bottom, left] and its
 * corner cubes [top-left, top-right, bottom-right, bottom-left].
 */
export function fingerPanel(U: number, V: number, T: number, f: number, edges: [EdgeSpec, EdgeSpec, EdgeSpec, EdgeSpec], corners: [boolean, boolean, boolean, boolean]): Contour {
  // Fingers reach into the body and corner cubes into the next finger, so the union never has to
  // join rectangles that only touch.
  const rs: Contour[] = [rect(T, T, U - 2 * T, V - 2 * T)];
  const [top, right, bottom, left] = edges;
  const e = Math.min(T, 0.5);
  for (const [a, b] of ownedSpans(U - 2 * T, f, top, T)) rs.push(rect(a, 0, b - a, 2 * T));
  for (const [a, b] of ownedSpans(U - 2 * T, f, bottom, T)) rs.push(rect(a, V - 2 * T, b - a, 2 * T));
  for (const [a, b] of ownedSpans(V - 2 * T, f, left, T)) rs.push(rect(0, a, 2 * T, b - a));
  for (const [a, b] of ownedSpans(V - 2 * T, f, right, T)) rs.push(rect(U - 2 * T, a, 2 * T, b - a));
  const [tl, tr, br, bl] = corners;
  if (tl) rs.push(rect(0, 0, T + e, T + e));
  if (tr) rs.push(rect(U - T - e, 0, T + e, T + e));
  if (br) rs.push(rect(U - T - e, V - T - e, T + e, T + e));
  if (bl) rs.push(rect(0, V - T - e, T + e, T + e));
  const shapes = unionShapes(rs);
  return shapes.reduce((a, s) => (s.area > a.area ? s : a), shapes[0]).outer;
}

/** The six panels of a box W × D × H (outside), with or without a top. */
export function boxPanels(W: number, D: number, H: number, T: number, f: number, top: boolean) {
  const E = (mate: boolean, ends: boolean): EdgeSpec => ({ mate, ends });
  const face = fingerPanel(W, H, T, f, [E(top, true), E(true, true), E(true, true), E(true, true)], [true, true, true, true]);
  const side = fingerPanel(D, H, T, f, [E(top, true), E(true, false), E(true, true), E(true, false)], [false, false, false, false]);
  const lid = fingerPanel(W, D, T, f, [E(true, false), E(true, false), E(true, false), E(true, false)], [false, false, false, false]);
  return { face, side, bottom: lid, top: top ? lid : null };
}

/** A tab of width w and depth d on a straight edge, as a rectangle centred at u along the edge. */
export const tabRect = (u: number, v: number, w: number, d: number): Contour => rect(u - w / 2, v, w, d);
