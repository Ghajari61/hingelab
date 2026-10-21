/**
 * The assembled box from its flat net: every face turned about its crease by its fold angle,
 * starting from the face nothing folds from, then the whole box stood on its bottom with its front
 * toward the viewer. Gives each face a 3 × 4 matrix from the sheet (x, y, through-thickness) to the
 * plan (x right, y toward the viewer, z up), for the 3D view and the thumbnails.
 */
import type { Dieline, DielinePart, Face, Pt } from "./types";

/** Row-major 3 × 4 affine: [r00 r01 r02 tx, r10 r11 r12 ty, r20 r21 r22 tz]. */
export type Mat = number[];
type V = [number, number, number];

const ID: Mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
/** Faces that end up behind another (glued, tucked or rolled in), by name. */
const TUCKED = /tab|tuck|dust|flap|ear|inner|lock|glue/i;
/** A face hidden inside the assembled box (glue and lock tabs, tucks, dust flaps, rolled walls). */
export const tucked = (f: Face) => !!f.parent && !f.printable && TUCKED.test(f.name);

export function apply(m: Mat, p: V): V {
  return [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]];
}

/** a ∘ b (b first). */
export function compose(a: Mat, b: Mat): Mat {
  const r: Mat = new Array(12).fill(0);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) r[i * 4 + j] = a[i * 4] * b[j] + a[i * 4 + 1] * b[4 + j] + a[i * 4 + 2] * b[8 + j];
    r[i * 4 + 3] = a[i * 4] * b[3] + a[i * 4 + 1] * b[7] + a[i * 4 + 2] * b[11] + a[i * 4 + 3];
  }
  return r;
}

/** Rotation by `th` about the unit axis k through point o. */
function rotation(k: V, th: number, o: V = [0, 0, 0]): Mat {
  const c = Math.cos(th), s = Math.sin(th), t = 1 - c, [x, y, z] = k;
  const R = [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
  const ro: V = [R[0] * o[0] + R[1] * o[1] + R[2] * o[2], R[3] * o[0] + R[4] * o[1] + R[5] * o[2], R[6] * o[0] + R[7] * o[1] + R[8] * o[2]];
  return [R[0], R[1], R[2], o[0] - ro[0], R[3], R[4], R[5], o[1] - ro[1], R[6], R[7], R[8], o[2] - ro[2]];
}

const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V): V => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const centroid = (pts: Pt[]): Pt => { let x = 0, y = 0; for (const [a, b] of pts) { x += a; y += b; } return [x / pts.length, y / pts.length]; };

/** A flat polygon in 3D as a 2D outline and the matrix that puts it back (for a part's surface). */
export function piece(P: V[]): { outer: Pt[]; m: Mat } {
  const o = P[0], u = norm(sub(P[1], o));
  let n: V = [0, 0, 0];
  for (let i = 2; i < P.length && Math.hypot(...n) < 1e-9; i++) n = cross(sub(P[1], o), sub(P[i], o));
  n = norm(n);
  const v = cross(n, u);
  return { outer: P.map((q) => { const d = sub(q, o); return [dot(d, u), dot(d, v)] as Pt; }), m: [u[0], v[0], n[0], o[0], u[1], v[1], n[1], o[1], u[2], v[2], n[2], o[2]] };
}

/**
 * The matrix of every face of one part. A face's own fold: about its hinge, by its angle (degrees,
 * positive lifting it off the sheet toward +z), after its parent's.
 */
export function foldedFaces(part: DielinePart, amount = 1): Map<string, Mat> {
  const byId = new Map(part.faces.map((f) => [f.id, f]));
  const out = new Map<string, Mat>();
  const of = (f: Face, seen: Set<string>): Mat => {
    const hit = out.get(f.id);
    if (hit) return hit;
    const parent = f.parent ? byId.get(f.parent) : undefined;
    if (!parent || !f.hinge || seen.has(f.id)) { out.set(f.id, ID); return ID; }
    seen.add(f.id);
    const a: V = [f.hinge[0][0], f.hinge[0][1], 0], b: V = [f.hinge[1][0], f.hinge[1][1], 0];
    const u = norm(sub(b, a));
    // The face's side of its hinge, in the sheet: it lifts toward +z.
    const c = centroid(f.poly), toC = sub([c[0], c[1], 0], a);
    const d = norm(sub(toC, [u[0] * dot(toC, u), u[1] * dot(toC, u), 0]));
    const k = cross(d, [0, 0, 1]);
    const m = compose(of(parent, seen), rotation(k, ((f.angle ?? 90) * amount * Math.PI) / 180, a));
    out.set(f.id, m);
    return m;
  };
  for (const f of part.faces) of(f, new Set());
  return out;
}

/**
 * The parts' faces folded and stood up: bottom face down (named Bottom or Base, else the face the
 * net starts from), the front toward the viewer, centred on the origin, resting on z = 0. Several
 * parts (a base and its lid, a sleeve and its tray) stand side by side, `gap` mm apart, unless
 * posed together. Flaps (faces that are not printed) sit one board thickness `t` inside the face
 * they lie against, as glued or tucked.
 */
export function assembled(parts: DielinePart[], poses: NonNullable<Dieline["poses"]> = [], t = 0, gap = 30): { part: DielinePart; face: Face; m: Mat }[] {
  const stood = parts.map((part) => ({ part, ...standing(part, t) }));
  const out: { part: DielinePart; face: Face; m: Mat }[] = [];
  const at = new Map<string, Mat>();
  let x = 0;
  for (const s of stood) {
    if (poses.some((q) => q.part === s.part.id && stood.some((o) => o.part.id === q.on))) continue;
    const T: Mat = [1, 0, 0, x - s.box[0], 0, 1, 0, -(s.box[2] + s.box[3]) / 2, 0, 0, 1, -s.box[4]];
    at.set(s.part.id, T);
    x += s.box[1] - s.box[0] + gap;
  }
  // Posed parts, in order (one may sit on another posed before it).
  const extent = (s: (typeof stood)[number], T: Mat) => {
    const a = apply(T, [s.box[0], s.box[2], s.box[4]]), b = apply(T, [s.box[1], s.box[3], s.box[5]]);
    return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, z0: Math.min(a[2], b[2]), z1: Math.max(a[2], b[2]) };
  };
  for (const q of poses) {
    const s = stood.find((o) => o.part.id === q.part), base = stood.find((o) => o.part.id === q.on), BT = at.get(q.on);
    if (!s || !base || !BT) continue;
    const F = q.flip ? rotation([0, 1, 0], Math.PI) : ID;
    const own = extent(s, F), under = extent(base, BT), [dx, dy, dz] = q.shift ?? [0, 0, 0];
    const z = q.top !== undefined ? under.z1 + q.top - own.z1 : under.z0 + (q.bottom ?? 0) - own.z0;
    at.set(q.part, compose([1, 0, 0, under.x - own.x + dx, 0, 1, 0, under.y - own.y + dy, 0, 0, 1, z + dz], F));
  }
  for (const s of stood) {
    const T = at.get(s.part.id);
    if (T) for (const { f, m } of s.placed) out.push({ part: s.part, face: f, m: compose(T, m) });
  }
  return out;
}

/** One part folded, bottom down and front forward; with its extent [x0, x1, y0, y1, z0, z1]. */
function standing(part: DielinePart, t: number): { placed: { f: Face; m: Mat }[]; box: number[] } {
  {
    const ms = foldedFaces(part);
    const corners = (f: Face, m: Mat) => f.poly.map(([px, py]) => apply(m, [px, py, 0]));
    const all = part.faces.flatMap((f) => corners(f, ms.get(f.id)!));
    const C = all.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]] as V, [0, 0, 0] as V).map((v) => v / all.length) as V;
    const outward = (f: Face): V => {
      const m = ms.get(f.id)!, n = norm([m[2], m[6], m[10]]), q = corners(f, m)[0];
      return dot(n, sub(q, C)) >= 0 ? n : [-n[0], -n[1], -n[2]];
    };
    const panels = part.faces.filter((f) => !f.parent || f.printable);
    const bottom = part.faces.find((f) => /bottom|base/i.test(f.name) && !/tuck|flap|dust|tab/i.test(f.name)) ?? part.faces.find((f) => !f.parent) ?? part.faces[0];
    // Bottom's outward side down.
    const nb = outward(bottom), down: V = [0, 0, -1];
    const ax = cross(nb, down), s = Math.hypot(...ax), cth = dot(nb, down);
    let R = s < 1e-9 ? (cth > 0 ? ID : rotation([1, 0, 0], Math.PI)) : rotation(norm(ax), Math.atan2(s, cth));
    // The front toward the viewer (+y).
    const front = panels.find((f) => /front/i.test(f.name));
    if (front && front !== bottom) {
      const nf = apply([R[0], R[1], R[2], 0, R[4], R[5], R[6], 0, R[8], R[9], R[10], 0], outward(front));
      const yaw = Math.atan2(nf[0], nf[1]);
      R = compose(rotation([0, 0, 1], yaw), R);
    }
    const placed = part.faces.map((f) => {
      const m = compose(R, ms.get(f.id)!);
      if (!(t > 0) || !tucked(f)) return { f, m };
      // Its board reaches from its outline along its normal: inward by t, or by 2t when that faces out.
      const n = norm([m[2], m[6], m[10]]), q = apply(m, [f.poly[0][0], f.poly[0][1], 0]);
      const c = apply(R, C), k = dot(n, sub(c, q)) >= 0 ? t : -2 * t;
      return { f, m: [m[0], m[1], m[2], m[3] + n[0] * k, m[4], m[5], m[6], m[7] + n[1] * k, m[8], m[9], m[10], m[11] + n[2] * k] };
    });
    const box = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
    for (const { f, m } of placed) for (const p of corners(f, m)) for (let k = 0; k < 3; k++) { box[2 * k] = Math.min(box[2 * k], p[k]); box[2 * k + 1] = Math.max(box[2 * k + 1], p[k]); }
    return { placed, box };
  }
}
