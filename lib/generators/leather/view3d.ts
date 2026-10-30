/**
 * The 3D preview of leather goods: where the loose pieces go once the product is put together
 * (handles arched over the top, straps on their rings, linings and pockets inside, tabs on the
 * gusset), how flaps and folded goods open and close (the Fold slider), the leather's colour, and
 * the metal fittings.
 *
 * Everything here only places pieces for the preview; the cut parts are not changed. Bends are
 * drawn as short flat pieces, and leather's drape and stretch are not simulated.
 */
import { bboxOf, rect } from "../geom";
import type { Contour, GenPart, Hardware3D, Pt } from "../types";
import type { Pattern } from "./kit";

export type V3 = [number, number, number];
type View = NonNullable<GenPart["views3d"]>[number];

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const unit = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const UP: V3 = [0, 0, 1];

/** A row-major 3 × 4 placement from a part's (u, v, through) to the plan: axes U, V, their normal, origin O. */
export function frameOf(U: V3, V: V3, O: V3): number[] {
  const N = cross(U, V);
  return [U[0], V[0], N[0], O[0], U[1], V[1], N[1], O[1], U[2], V[2], N[2], O[2]];
}
export const axesOf = (m: number[]) => ({ U: [m[0], m[4], m[8]] as V3, V: [m[1], m[5], m[9]] as V3, N: [m[2], m[6], m[10]] as V3, O: [m[3], m[7], m[11]] as V3 });
export const at = (m: number[], u: number, v: number, h = 0): V3 => [m[0] * u + m[1] * v + m[2] * h + m[3], m[4] * u + m[5] * v + m[6] * h + m[7], m[8] * u + m[9] * v + m[10] * h + m[11]];

/** 3 × 4 rigid placements: a ∘ b, and the inverse. */
export function compose(a: number[], b: number[]): number[] {
  const r = (i: number, j: number) => a[i * 4] * b[j] + a[i * 4 + 1] * b[4 + j] + a[i * 4 + 2] * b[8 + j];
  const out: number[] = [];
  for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) out.push(r(i, j)); out.push(a[i * 4] * b[3] + a[i * 4 + 1] * b[7] + a[i * 4 + 2] * b[11] + a[i * 4 + 3]); }
  return out;
}
export function invert(m: number[]): number[] {
  const R = [[m[0], m[1], m[2]], [m[4], m[5], m[6]], [m[8], m[9], m[10]]], t = [m[3], m[7], m[11]];
  const out: number[] = [];
  for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) out.push(R[j][i]); out.push(-(R[0][i] * t[0] + R[1][i] * t[1] + R[2][i] * t[2])); }
  return out;
}

/** Rotates a placement about the line through `p` along `axis` by `a` radians. */
export function turn(m: number[], p: V3, axis: V3, a: number): number[] {
  const k = unit(axis), c = Math.cos(a), s = Math.sin(a);
  const rot = (v: V3): V3 => add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
  const { U, V, O } = axesOf(m);
  return frameOf(rot(U), rot(V), add(rot(sub(O, p)), p));
}

/** Frames from angle a0 to a1 about an axis, evenly, so the slider moves along the real turn. */
export const turning = (m: number[], p: V3, axis: V3, a0: number, a1: number, n = 10) =>
  Array.from({ length: n + 1 }, (_, i) => turn(m, p, axis, a0 + ((a1 - a0) * i) / n));

/** Where a part's own point (u, v) is in the plan: through its placement, or the 3D piece that holds it. */
export function placeOf(part: GenPart, u: number, v: number): number[] | null {
  // the 3D pieces first: a part folded into pieces may keep a whole-part placement that is not used
  for (const vw of part.views3d ?? []) {
    const b = bboxOf([vw.outer]);
    if (u >= b.x0 - 0.5 && u <= b.x1 + 0.5 && v >= b.y0 - 0.5 && v <= b.y1 + 0.5 && vw.place.m) return vw.place.m;
  }
  if (part.place?.m) return part.place.m;
  if (part.place) return frameOf([1, 0, 0], [0, 1, 0], [part.place.x, part.place.y, part.place.z]);
  return null;
}

/** A point on a part's surface with its normal, `out` of the product (away from `centre`). */
export function surface(part: GenPart, u: number, v: number, centre: V3, T: number): { p: V3; n: V3; m: number[] } | null {
  const m = placeOf(part, u, v);
  if (!m) return null;
  const { N } = axesOf(m);
  const p0 = at(m, u, v, 0);
  const out = dot(N, sub(p0, centre)) >= 0;
  const t = part.t ?? T;
  // the leather lies on +N from its plane: the outside surface is t further out when N points out
  return { p: out ? at(m, u, v, t) : p0, n: out ? N : mul(N, -1), m };
}

/**
 * A strip laid along a polyline in the plan (its centre line), `width` across it in the direction
 * `across` gives at each segment; the pieces carry the strip's own u range so the cut outline maps on.
 */
export function stripAlong(name: string, path: V3[], width: number, across: (i: number, U: V3) => V3, u0 = 0, offset = 0): View[] {
  const out: View[] = [];
  let u = u0;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1], L = len(sub(b, a));
    if (L < 1e-6) continue;
    const U = unit(sub(b, a));
    let W = across(i, U);
    W = unit(sub(W, mul(U, dot(W, U))));
    const O = sub(sub(a, mul(U, u)), mul(W, width / 2 - offset));
    out.push({ name, outer: rect(u, 0, L, width), holes: [], soft: true, place: { x: 0, y: 0, z: 0, m: frameOf(U, W, O) } });
    u += L;
  }
  return out;
}

export const pathLen = (p: V3[]) => p.reduce((k, q, i) => (i ? k + len(sub(q, p[i - 1])) : 0), 0);

/**
 * A circular arch from A to B with length L, bulging along `up`: straight when L is about the chord,
 * more than a half circle when L is long.
 */
export function arch(A: V3, B: V3, L: number, up: V3 = UP, n = 24): V3[] {
  const chord = sub(B, A), s = len(chord);
  if (s < 1e-6) return [A, B];
  const X = unit(chord);
  const Z = unit(sub(up, mul(X, dot(up, X))));
  if (L <= s * 1.01) return [A, B];
  // solve L = s θ / (2 sin(θ/2)) for the arc's angle θ in (0, 2π)
  let lo = 1e-4, hi = 2 * Math.PI - 1e-4;
  for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if ((s * mid) / (2 * Math.sin(mid / 2)) < L) lo = mid; else hi = mid; }
  const th = (lo + hi) / 2, R = s / (2 * Math.sin(th / 2));
  const M = add(A, mul(chord, 0.5)), C = sub(M, mul(Z, R * Math.cos(th / 2)));
  return Array.from({ length: n + 1 }, (_, i) => {
    const f = -th / 2 + (th * i) / n;
    return add(C, add(mul(X, R * Math.sin(f)), mul(Z, R * Math.cos(f))));
  });
}

/** A flat piece lying on a surface at p with normal n, its u along `dir`, lifted `lift` off it. */
export function lying(name: string, outer: Contour, p: V3, n: V3, dir: V3, lift = 0, anchor: Pt = [0, 0]): View {
  const U = unit(sub(dir, mul(n, dot(dir, n))));
  const V = cross(n, U); // so that U × V = n: the piece's thickness grows outwards
  const O = sub(add(p, mul(n, lift)), add(mul(U, anchor[0]), mul(V, anchor[1])));
  return { name, outer, holes: [], place: { x: 0, y: 0, z: 0, m: frameOf(U, V, O) } };
}

/** The middle of every positioned piece of the product, for deciding which way is out. */
export function centreOf(parts: GenPart[]): V3 {
  let lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const q of parts) for (const vw of q.views3d?.length ? q.views3d : q.place?.m ? [{ outer: q.outer, place: q.place }] : []) {
    if (!vw.place.m) continue;
    for (const [u, v] of vw.outer) { const w = at(vw.place.m, u, v); lo = lo.map((x, i) => Math.min(x, w[i])) as V3; hi = hi.map((x, i) => Math.max(x, w[i])) as V3; }
  }
  return lo[0] === Infinity ? [0, 0, 0] : mul(add(lo, hi), 0.5);
}

/** A strip bent from flat (0) to its curve (1), drawn as pieces; `curve(t)` is the centre line at bend t. */
export function bending(name: string, width: number, curve: (t: number) => V3[], across: (t: number, i: number, U: V3) => V3, steps = 8): View[] {
  const shapes = Array.from({ length: steps + 1 }, (_, k) => stripAlong(name, curve(k / steps), width, (i, U) => across(k / steps, i, U)));
  return shapes[steps].map((vw, i) => ({ ...vw, frames: shapes.map((sh) => sh[i]?.place.m ?? vw.place.m!) }));
}

/** Colours of the leathers in the preview (approximate, for telling the materials apart). */
export const LEATHER_COLOR: Record<string, string> = {
  vegtan: "#93603a", fullgrain: "#6f4127", topgrain: "#623a22", chrome: "#3e281c", suede: "#7f6046", nubuck: "#876447",
  board: "#7a7368", synthetic: "#3f312a", pu: "#272321", leatherette: "#312822", pvc: "#1d1d1d",
};
export const LINING_COLOR = "#b9a787";
export const BOARD_COLOR = "#7a7368";

/** Metal fittings as hardware: a short cylinder on the surface for rivets, snaps and feet, a ring for D-rings. */
export function fitting(kind: string, p: V3, n: V3, r: number): Hardware3D | null {
  switch (kind) {
    case "rivet": case "chicago": case "snap": case "magnet": case "grommet": case "eyelet":
      return { kind: "cylinder", at: p, r: Math.max(1.5, r), h: kind === "magnet" ? 2.2 : 1.4, color: "#b8963f", metal: true, axis: n };
    case "foot":
      return { kind: "cylinder", at: p, r: Math.max(3, r * 0.6), h: 4, color: "#b8963f", metal: true, axis: n };
    default: return null;
  }
}

/** The pattern's fittings on positioned parts, as hardware for the preview. */
export function fittingsOf(pat: Pattern, centre: V3, T: number): Hardware3D[] {
  const out: Hardware3D[] = [];
  for (const part of pat.parts) {
    if (part.material === "second") continue;
    for (const f of pat.fittings.get(part.id) ?? []) {
      if (!part.place?.m && !part.views3d?.length) continue;
      const s = surface(part, f.pt[0], f.pt[1], centre, T);
      if (!s) continue;
      const h = fitting(f.kind, s.p, s.n, Math.min(f.r, 9));
      if (h) out.push(h);
    }
  }
  return out;
}
