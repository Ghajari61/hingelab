/**
 * Path geometry for leather patterns, millimetres, y down (a part's own frame: v = 0 at its top).
 *
 * Stitching runs along *paths*: open polylines a fixed distance inside a part's edge. Seams are
 * matched by arc length along those paths, so a curved edge and the straight gusset it joins get the
 * same number of holes at the same spacing.
 */
import { makeShape, offsetShapes, unionShapes } from "@/lib/letters/polygon";
import { signedArea } from "../geom";
import type { Contour, Pt } from "../types";

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const r1 = (v: number) => Math.round(v * 10) / 10;
export const ccw = (c: Contour): Contour => (signedArea(c) < 0 ? c.slice().reverse() : c);

export function pathLength(p: Pt[]): number {
  let n = 0;
  for (let i = 1; i < p.length; i++) n += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return n;
}

/** The point and unit tangent at arc length s along an open path (clamped to its ends). */
export function pointAt(p: Pt[], s: number): { pt: Pt; t: Pt } {
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-9) continue;
    if (acc + L >= s || i === p.length - 1) {
      const k = clamp((s - acc) / L, 0, 1);
      return { pt: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], t: [(b[0] - a[0]) / L, (b[1] - a[1]) / L] };
    }
    acc += L;
  }
  return { pt: p[0], t: [1, 0] };
}

/** The part of an open path between arc lengths s0 and s1. */
export function subPath(p: Pt[], s0: number, s1: number): Pt[] {
  const out: Pt[] = [pointAt(p, s0).pt];
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    acc += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    if (acc > s0 + 1e-9 && acc < s1 - 1e-9) out.push(p[i]);
  }
  out.push(pointAt(p, s1).pt);
  return out;
}

/** A closed contour grown (d > 0) or shrunk (d < 0), round joins; the largest piece. */
export function offsetContour(c: Contour, d: number): Contour | null {
  const s = offsetShapes([makeShape(ccw(c), [])], d, "round");
  if (!s.length) return null;
  return s.reduce((a, b) => (b.area > a.area ? b : a)).outer;
}

/**
 * The run of a closed contour on one side of the line v = cut (the side where v > cut, i.e. below
 * it), as an open path from its end nearer x = 0 to the other, with the crossing points included.
 * This is the stitch path of a bag face that is open at the top.
 */
export function runBelow(c: Contour, cut: number): Pt[] | null {
  const pts = ccw(c);
  const n = pts.length;
  const start = pts.findIndex((q) => q[1] < cut);
  if (start < 0) return null;
  const ring = [...pts.slice(start), ...pts.slice(0, start)];
  const runs: Pt[][] = [];
  let cur: Pt[] | null = null;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    const aIn = a[1] >= cut, bIn = b[1] >= cut;
    if (aIn && cur) cur.push(a);
    if (aIn !== bIn) {
      const k = (cut - a[1]) / (b[1] - a[1]);
      const x: Pt = [a[0] + (b[0] - a[0]) * k, cut];
      if (!aIn) cur = [x];
      else if (cur) { cur.push(x); runs.push(cur); cur = null; }
    }
  }
  if (!runs.length) return null;
  const run = runs.reduce((a, b) => (pathLength(b) > pathLength(a) ? b : a));
  return run[0][0] <= run[run.length - 1][0] ? run : run.slice().reverse();
}

/** A closed contour as an open path starting at the point nearest `at`, once round (back to it). */
export function loopFrom(c: Contour, at: Pt): Pt[] {
  const pts = ccw(c).slice();
  // the nearest point on the outline, not just the nearest corner, so the loop starts where asked
  let best = 0, bd = Infinity, bq: Pt = pts[0], bt = 0;
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((at[0] - a[0]) * dx + (at[1] - a[1]) * dy) / L2)) : 0;
    const q: Pt = [a[0] + dx * t, a[1] + dy * t], d = Math.hypot(q[0] - at[0], q[1] - at[1]);
    if (d < bd - 1e-9) { bd = d; best = i; bq = q; bt = t; }
  });
  const L = Math.hypot(pts[(best + 1) % pts.length][0] - pts[best][0], pts[(best + 1) % pts.length][1] - pts[best][1]);
  if (bt * L > 0.01 && (1 - bt) * L > 0.01) { pts.splice(best + 1, 0, bq); best++; }
  else if ((1 - bt) * L <= 0.01) best = (best + 1) % pts.length;
  const ring = [...pts.slice(best), ...pts.slice(0, best)];
  return [...ring, ring[0]];
}

/** A rectangle with its own radius at each corner (top-left, top-right, bottom-right, bottom-left), y down. */
export function roundRect(x: number, y: number, w: number, h: number, r: [number, number, number, number], seg = 10): Contour {
  const [tl, tr, br, bl] = r.map((v) => clamp(v, 0, Math.min(w, h) / 2));
  const out: Contour = [];
  const arc = (cx: number, cy: number, rr: number, a0: number, a1: number) => {
    if (rr <= 0) { out.push([cx, cy]); return; }
    for (let i = 0; i <= seg; i++) { const a = a0 + ((a1 - a0) * i) / seg; out.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
  };
  arc(x + tl, y + tl, tl, Math.PI, 1.5 * Math.PI);
  arc(x + w - tr, y + tr, tr, 1.5 * Math.PI, 2 * Math.PI);
  arc(x + w - br, y + h - br, br, 0, 0.5 * Math.PI);
  arc(x + bl, y + h - bl, bl, 0.5 * Math.PI, Math.PI);
  return out;
}

export const move = (c: Contour, dx: number, dy: number): Contour => c.map(([x, y]) => [x + dx, y + dy] as Pt);
export const mirrorX = (c: Contour, x0: number): Contour => c.map(([x, y]) => [2 * x0 - x, y] as Pt).reverse();
export const mirrorY = (c: Contour, y0: number): Contour => c.map(([x, y]) => [x, 2 * y0 - y] as Pt).reverse();
export const line = (a: Pt, b: Pt): Pt[] => [a, b];

/** The union of contours, the largest piece's outline. */
export function unite(cs: Contour[]): Contour {
  const s = unionShapes(cs.map(ccw), [], false, true);
  return s.reduce((a, b) => (b.area > a.area ? b : a)).outer;
}

/** The run of a closed contour left of x = cut (x < cut), as an open path from top to bottom. */
export function runLeftOf(c: Contour, cut: number): Pt[] | null {
  // turn the contour so "left of x = cut" becomes "below v = -cut", take that run, turn it back
  const r = runBelow(c.map(([x, y]) => [y, -x] as Pt), -cut);
  if (!r) return null;
  const back = r.map(([a, b]) => [-b, a] as Pt);
  return back[0][1] <= back[back.length - 1][1] ? back : back.slice().reverse();
}

/** The run of a closed contour right of x = cut (x > cut), as an open path from top to bottom. */
export function runRightOf(c: Contour, cut: number): Pt[] | null {
  const r = runBelow(c.map(([x, y]) => [-y, x] as Pt), cut);
  if (!r) return null;
  const back = r.map(([a, b]) => [b, -a] as Pt);
  return back[0][1] <= back[back.length - 1][1] ? back : back.slice().reverse();
}
