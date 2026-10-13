/**
 * Affine 3D placements as 3 × 4 row-major matrices: p' = R·p + t, [r00 r01 r02 tx, r10 r11 r12 ty, r20 r21 r22 tz].
 * The assembly works in a right-handed frame with x right, y away from the viewer and z up.
 */
export type V3 = [number, number, number];
export type M34 = number[];

export const I34: M34 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** The matrix whose columns are the images of x, y and z, with origin o. */
export const fromCols = (x: V3, y: V3, z: V3, o: V3): M34 => [x[0], y[0], z[0], o[0], x[1], y[1], z[1], o[1], x[2], y[2], z[2], o[2]];

export const translation = (t: V3): M34 => [1, 0, 0, t[0], 0, 1, 0, t[1], 0, 0, 1, t[2]];

/** a ∘ b: b first. */
export function mul(a: M34, b: M34): M34 {
  const r: M34 = new Array(12);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) {
      r[i * 4 + j] = a[i * 4] * b[j] + a[i * 4 + 1] * b[4 + j] + a[i * 4 + 2] * b[8 + j] + (j === 3 ? a[i * 4 + 3] : 0);
    }
  }
  return r;
}

export const apply = (m: M34, p: V3): V3 => [
  m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
  m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
  m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
];

/** Only the linear part (directions). */
export const applyDir = (m: M34, p: V3): V3 => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2], m[4] * p[0] + m[5] * p[1] + m[6] * p[2], m[8] * p[0] + m[9] * p[1] + m[10] * p[2]];

export function rotation(axis: 0 | 1 | 2, deg: number): M34 {
  const a = (deg * Math.PI) / 180, c = Math.round(Math.cos(a) * 1e12) / 1e12, s = Math.round(Math.sin(a) * 1e12) / 1e12;
  if (axis === 0) return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0];
  if (axis === 1) return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0];
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0];
}

/** Turns about x, then y, then z (degrees), around the point c. */
export function turnAbout(c: V3, deg: V3): M34 {
  let r = I34;
  ([0, 1, 2] as const).forEach((ax) => { if (deg[ax]) r = mul(rotation(ax, deg[ax]), r); });
  return mul(translation(c), mul(r, translation(scale(c, -1))));
}

/** Inverse of a rigid motion (rotation plus translation). */
export function invRigid(m: M34): M34 {
  const t: V3 = [m[3], m[7], m[11]];
  const r = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]];
  return [
    r[0], r[1], r[2], -(r[0] * t[0] + r[1] * t[1] + r[2] * t[2]),
    r[3], r[4], r[5], -(r[3] * t[0] + r[4] * t[1] + r[5] * t[2]),
    r[6], r[7], r[8], -(r[6] * t[0] + r[7] * t[1] + r[8] * t[2]),
  ];
}

export const det = (m: M34) =>
  m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8]);
