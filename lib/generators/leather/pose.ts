/**
 * Poses for the 3D preview of flat leather goods and straps: the cut outline is cut into pieces at
 * its folds (or along its length), and each piece gets frames from lying flat and open (Fold 0) to
 * folded or wrapped as used (Fold 1). The cut parts themselves are not changed.
 *
 * Bends are drawn as short flat pieces; the leather's own stiffness, stretch and drape are not
 * simulated, so this shows how the product goes together, not how it will sit exactly.
 */
import { rect, signedArea } from "../geom";
import type { Contour, GenPart, Pt } from "../types";
import { add, at, axesOf, compose, frameOf, invert, mul, sub, turn, unit, type V3 } from "./view3d";

type View = NonNullable<GenPart["views3d"]>[number];

/** The part of a contour on one side of the line `p[axis] = c` (Sutherland–Hodgman). */
export function clipHalf(c: Contour, axis: 0 | 1, at0: number, below: boolean): Contour {
  const inside = (p: Pt) => (below ? p[axis] <= at0 + 1e-9 : p[axis] >= at0 - 1e-9);
  const out: Contour = [];
  for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length], ia = inside(a), ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) {
      const t = (at0 - a[axis]) / (b[axis] - a[axis]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}
/** The part of a contour between two lines across an axis. */
export const clipBand = (c: Contour, axis: 0 | 1, lo: number, hi: number) => clipHalf(clipHalf(c, axis, lo, false), axis, hi, true);

const mid = (c: Contour): Pt => {
  let x = 0, y = 0;
  for (const q of c) { x += q[0]; y += q[1]; }
  return [x / (c.length || 1), y / (c.length || 1)];
};
const within = (c: Contour, x0: number, y0: number, x1: number, y1: number) => { const [x, y] = mid(c); return x >= x0 && x < x1 && y >= y0 && y < y1; };

/** A part's piece inside a box (its own coordinates), with the holes and marks whose middle is in it. */
export function piece(part: GenPart, x0: number, y0: number, x1: number, y1: number): Omit<View, "place"> | null {
  const outer = clipBand(clipBand(part.outer, 0, x0, x1), 1, y0, y1);
  if (outer.length < 3 || Math.abs(signedArea(outer)) < 0.5) return null;
  const keep = (cs?: Contour[]) => (cs ?? []).filter((h) => within(h, x0, y0, x1, y1));
  const edge = (q: Pt) => Math.min(Math.abs(q[0] - x0), Math.abs(q[0] - x1), Math.abs(q[1] - y0), Math.abs(q[1] - y1)) < 0.5;
  return {
    name: part.name, outer, holes: keep(part.holes),
    ...(part.engrave?.length ? { engrave: keep(part.engrave) } : {}),
    // fold lines on the cut between pieces are where it bends; they are not drawn on either piece
    ...(part.score?.length ? { score: keep(part.score).filter((l) => !l.every(edge)) } : {}),
  };
}
const BIG = 1e6;
export const band = (part: GenPart, axis: 0 | 1, lo: number, hi: number) => (axis === 0 ? piece(part, lo, -BIG, hi, BIG) : piece(part, -BIG, lo, BIG, hi));

/** A turn about a line in the plan (through `p` along `axis`) by `angle`, the way that lifts `probe`. */
export interface Hinge { p: V3; axis: V3; angle: number; probe: V3 }
const lifted = (h: Hinge) => {
  const up = at(turn(frameOf([1, 0, 0], [0, 1, 0], [0, 0, 0]), h.p, h.axis, 0.2), h.probe[0], h.probe[1], h.probe[2])[2];
  return up > h.probe[2] ? 1 : -1;
};

/**
 * Flat goods that fold: each region of the plan (a box) turns about its hinges, the one nearest it
 * first. Parts keep their stacked layers; exploded, the layers part along their normals.
 */
export interface Region { box: [number, number, number, number]; hinges: Hinge[] }
export function foldFlat(parts: GenPart[], regions: Region[], steps = 12) {
  const levels = [...new Set(parts.map((q) => q.place?.z ?? 0))].sort((a, b) => a - b);
  for (const part of parts) {
    const pl = part.place ?? { x: 0, y: 0, z: 0 };
    const base = frameOf([1, 0, 0], [0, 1, 0], [pl.x, pl.y, pl.z]);
    const views: View[] = [];
    for (const r of regions) {
      const [x0, y0, x1, y1] = r.box;
      const b = piece(part, x0 - pl.x, y0 - pl.y, x1 - pl.x, y1 - pl.y);
      if (!b) continue;
      const signs = r.hinges.map(lifted);
      const frames = Array.from({ length: steps + 1 }, (_, k) => {
        let m = base;
        r.hinges.forEach((h, j) => { m = turn(m, h.p, h.axis, signs[j] * h.angle * (k / steps)); });
        return m;
      });
      const closed = frames[steps];
      const k = levels.indexOf(pl.z);
      const N = axesOf(closed).N;
      const apart = mul(N, 22 * (k - (levels.length - 1)));
      views.push({ ...b, place: { x: 0, y: 0, z: 0, m: closed }, ...(r.hinges.length ? { frames } : {}), apart });
      // a fold right over (the outside layer): the leather rounds the fold on a half circle about the hinge
      const h = r.hinges[0];
      if (r.hinges.length === 1 && k === 0 && h.angle > 3) views.push(...spine(part, h, signs[0], pl.z, steps, apart));
    }
    if (views.length) part.views3d = views;
  }
}
/** The rounded fold of the outside layer, as short pieces round the hinge; they lie folded together when open. */
function spine(part: GenPart, h: Hinge, sign: number, z0: number, steps: number, apart: V3): View[] {
  const pl = part.place ?? { x: 0, y: 0, z: 0 };
  const A = unit(h.axis), along = Math.abs(A[0]) > 0.5 ? 0 : 1;
  // the part's extent along the hinge, in the plan
  const vs = part.outer.map((q) => q[along] + (along ? pl.y : pl.x)), a0 = Math.min(...vs), a1 = Math.max(...vs);
  const rho = h.p[2] - z0, K = 8;
  if (rho <= 0.2) return [];
  const start: V3 = along ? [h.p[0], 0, z0] : [0, h.p[1], z0];
  const rot = (q: V3, a: number) => at(turn(frameOf([1, 0, 0], [0, 1, 0], [0, 0, 0]), h.p, A, a), q[0], q[1], q[2]);
  const d = 2 * rho * Math.sin(Math.PI / (2 * K));
  const away = unit(sub([h.probe[0], h.probe[1], 0], start)), flatU = unit(sub(away, mul(A, away[0] * A[0] + away[1] * A[1] + away[2] * A[2])));
  const out: View[] = [];
  for (let j = 0; j < K; j++) {
    const frames = Array.from({ length: steps + 1 }, (_, k) => {
      const a = sign * h.angle * (k / steps), Q0 = rot(start, (a * j) / K), Q1 = rot(start, (a * (j + 1)) / K);
      const ch = sub(Q1, Q0), L = Math.hypot(...ch);
      const U = L > 1e-3 ? unit(ch) : flatU;
      // its inside toward the hinge, like the layer it joins
      let V = A;
      const toward = sub(h.p, Q0);
      const N0 = [U[1] * V[2] - U[2] * V[1], U[2] * V[0] - U[0] * V[2], U[0] * V[1] - U[1] * V[0]];
      if (N0[0] * toward[0] + N0[1] * toward[1] + N0[2] * toward[2] < 0) V = mul(A, -1);
      const m = frameOf(U, V, Q0), N = axesOf(m).N;
      // a hair inside the layer, so lying folded together (open) it does not flicker on its face
      return frameOf(U, V, add(Q0, mul(N, 0.04)));
    });
    const flip = frames[steps][1] * A[0] + frames[steps][5] * A[1] + frames[steps][9] * A[2] < 0;
    out.push({ name: part.name, outer: flip ? rect(0, -a1, d, a1 - a0) : rect(0, a0, d, a1 - a0), holes: [], place: { x: 0, y: 0, z: 0, m: frames[steps] }, frames, apart, soft: true });
  }
  return out;
}

/** A hinge along a line of the plan: x = c (axis 0) or y = c (axis 1), at height h, turning `angle`, lifting `probe`. */
export const hinge = (axis: 0 | 1, c: number, h: number, angle: number, probe: Pt): Hinge =>
  axis === 0 ? { p: [c, 0, h], axis: [0, 1, 0], angle, probe: [probe[0], probe[1], 0] } : { p: [0, c, h], axis: [1, 0, 0], angle, probe: [probe[0], probe[1], 0] };
export const OPEN = BIG;

/**
 * A strap bent along its length (u) in a plane. `curl(s)` is the curvature that comes with wearing
 * it, scaled from 0 (laid out, Fold 0) to 1 (worn, Fold 1); `fixed(s)` is curvature that stays (folds
 * held by rivets or stitching). The strap's point at u = `anchor.s` stays at `anchor.p`, heading
 * `anchor.U`, its width along `anchor.V`; the bend turns from U toward U × V... (its inner side).
 */
export function bendStrap(part: GenPart, o: {
  len: number; width: number; curl?: (s: number) => number; fixed?: (s: number) => number;
  anchor: { s: number; p: V3; U: V3; V: V3 }; piece?: number; steps?: number;
}) {
  const L = o.len, w = o.width, steps = o.steps ?? 12;
  const curl = o.curl ?? (() => 0), fixed = o.fixed ?? (() => 0);
  // cuts: every `piece` mm, finer where it bends
  const cuts: number[] = [0];
  for (let s = 0; s < L - 1e-6;) {
    const k = Math.max(Math.abs(curl(s)), Math.abs(fixed(s)), Math.abs(curl(s + 2)), Math.abs(fixed(s + 2)));
    const d = k > 1 / 12 ? 2 : k > 1 / 40 ? 4 : k > 1 / 150 ? 8 : o.piece ?? 16;
    s = Math.min(L, s + d);
    cuts.push(s);
  }
  // the centre line at bend t, in a local x–z plane (width along y), and its heading at each cut
  const lineAt = (t: number) => {
    const P: V3[] = [], H: V3[] = [];
    let th = 0, x = 0, z = 0, ci = 0;
    const ds = 0.25;
    for (let s = 0; ci < cuts.length; s += ds) {
      while (ci < cuts.length && cuts[ci] <= s + 1e-9) { P.push([x, 0, z]); H.push([Math.cos(th), 0, Math.sin(th)]); ci++; }
      th += (curl(s + ds / 2) * t + fixed(s + ds / 2)) * ds;
      x += Math.cos(th) * ds; z += Math.sin(th) * ds;
    }
    return { P, H };
  };
  const W: V3 = [0, 1, 0];
  const ia = cuts.reduce((b, c, i) => (Math.abs(c - o.anchor.s) < Math.abs(cuts[b] - o.anchor.s) ? i : b), 0);
  const target = frameOf(unit(o.anchor.U), unit(o.anchor.V), o.anchor.p);
  const shapes = Array.from({ length: steps + 1 }, (_, k) => {
    const { P, H } = lineAt(k / steps);
    const G = compose(target, invert(frameOf(H[ia], W, P[ia])));
    return { P, G };
  });
  const views: View[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const b = band(part, 0, cuts[i], cuts[i + 1]);
    if (!b) continue;
    const frames = shapes.map(({ P, G }) => {
      const U = unit(sub(P[i + 1], P[i]));
      const O = sub(sub(P[i], mul(U, cuts[i])), mul(W, w / 2));
      return compose(G, frameOf(U, W, O));
    });
    views.push({ ...b, place: { x: 0, y: 0, z: 0, m: frames[steps] }, frames, soft: true });
  }
  if (views.length) part.views3d = views;
}

/** Curvature that turns `angle` over `length` mm centred on `at` (a fold round a bar or a ring). */
export const bendAt = (at0: number, length: number, angle: number) => (s: number) => (Math.abs(s - at0) <= length / 2 ? angle / length : 0);
/** The sum of several curvature profiles. */
export const curls = (...fs: ((s: number) => number)[]) => (s: number) => fs.reduce((k, f) => k + f(s), 0);

export { add };
