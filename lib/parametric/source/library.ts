/**
 * Built-in sample shapes, generated procedurally (no third-party models). Every mesh is closed,
 * with consistent outward-facing triangles, in mm, Y up, Z toward the viewer.
 */
import type { LibraryId, MeshData } from "../types";

export const LIBRARY: { id: LibraryId; name: string; note: string }[] = [
  { id: "abstract-head-cc0", name: "Abstract head", note: "Face relief, about 160 × 220 mm" },
  { id: "sphere", name: "Sphere", note: "Radius 100 mm" },
  { id: "torus", name: "Torus", note: "Ring around the wall normal" },
  { id: "wave-panel", name: "Wave panel", note: "Sine relief, 200 × 150 mm" },
  { id: "ripple", name: "Ripple", note: "Rings fading out from the centre" },
  { id: "vase", name: "Vase", note: "Turned profile around Y" },
];

class Builder {
  pos: number[] = [];
  idx: number[] = [];
  v(x: number, y: number, z: number) {
    this.pos.push(x, y, z);
    return this.pos.length / 3 - 1;
  }
  t(a: number, b: number, c: number) { this.idx.push(a, b, c); }
  q(a: number, b: number, c: number, d: number) { this.t(a, b, c); this.t(a, c, d); }
  done(): MeshData { return orientOutward({ positions: new Float32Array(this.pos), indices: new Uint32Array(this.idx) }); }
}

/** Signed volume of a closed mesh (positive when triangles face outward). */
export function signedVolume(m: MeshData) {
  const p = m.positions, ix = m.indices;
  let v = 0;
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return v / 6;
}

/** Flip every triangle when the mesh is inside out. */
export function orientOutward(m: MeshData): MeshData {
  if (signedVolume(m) >= 0) return m;
  const ix = m.indices.slice();
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  return { positions: m.positions, indices: ix };
}

/** Icosphere: an icosahedron subdivided `detail` times, vertices pushed onto the sphere. */
export function icosphere(r: number, detail: number): MeshData {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts: number[][] = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const norm = (q: number[]) => { const l = Math.hypot(q[0], q[1], q[2]); return [q[0] / l, q[1] / l, q[2] / l]; };
  verts = verts.map(norm);
  for (let d = 0; d < detail; d++) {
    const cache = new Map<string, number>();
    const mid = (a: number, b: number) => {
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      let i = cache.get(k);
      if (i === undefined) {
        i = verts.length;
        verts.push(norm([(verts[a][0] + verts[b][0]) / 2, (verts[a][1] + verts[b][1]) / 2, (verts[a][2] + verts[b][2]) / 2]));
        cache.set(k, i);
      }
      return i;
    };
    const next: number[][] = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  const B = new Builder();
  for (const q of verts) B.v(q[0] * r, q[1] * r, q[2] * r);
  for (const f of faces) B.t(f[0], f[1], f[2]);
  return B.done();
}

/** Torus around the Z axis (the wall normal), centred on the origin. */
export function torus(R: number, r: number, seg = 96, sides = 48): MeshData {
  const B = new Builder();
  for (let i = 0; i < seg; i++) {
    const u = (i / seg) * 2 * Math.PI;
    for (let j = 0; j < sides; j++) {
      const v = (j / sides) * 2 * Math.PI;
      B.v((R + r * Math.cos(v)) * Math.cos(u), (R + r * Math.cos(v)) * Math.sin(u), r * Math.sin(v));
    }
  }
  const at = (i: number, j: number) => (i % seg) * sides + (j % sides);
  for (let i = 0; i < seg; i++) for (let j = 0; j < sides; j++) B.q(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
  return B.done();
}

/**
 * A relief over an ellipse (half-axes rx, ry): top surface z = f(x, y) > 0, flat back at z = 0,
 * side wall around the rim. Polar grid, so the outline is a smooth oval.
 */
export function ovalRelief(rx: number, ry: number, f: (x: number, y: number) => number, rings = 72, sectors = 192): MeshData {
  const B = new Builder();
  const top: number[][] = [];
  const centre = B.v(0, 0, f(0, 0));
  for (let k = 1; k <= rings; k++) {
    const row: number[] = [];
    const rho = k / rings;
    for (let s = 0; s < sectors; s++) {
      const th = (s / sectors) * 2 * Math.PI;
      const x = rx * rho * Math.cos(th), y = ry * rho * Math.sin(th);
      row.push(B.v(x, y, f(x, y)));
    }
    top.push(row);
  }
  const rim = top[rings - 1];
  const bottom = rim.map((_, s) => { const th = (s / sectors) * 2 * Math.PI; return B.v(rx * Math.cos(th), ry * Math.sin(th), 0); });
  const back = B.v(0, 0, 0);
  for (let s = 0; s < sectors; s++) {
    const s1 = (s + 1) % sectors;
    B.t(centre, top[0][s], top[0][s1]);
    for (let k = 0; k < rings - 1; k++) B.q(top[k][s], top[k + 1][s], top[k + 1][s1], top[k][s1]);
    B.q(rim[s], bottom[s], bottom[s1], rim[s1]);
    B.t(back, bottom[s1], bottom[s]);
  }
  return B.done();
}

/** A rectangular relief block: top z = f(x, y) > 0 over [-w/2, w/2] × [-h/2, h/2], flat back at z = 0. */
export function heightfieldBlock(w: number, h: number, f: (x: number, y: number) => number, nx = 160, ny = 120): MeshData {
  const B = new Builder();
  const top: number[][] = [], bot: number[][] = [];
  for (let j = 0; j <= ny; j++) {
    const rt: number[] = [], rb: number[] = [];
    for (let i = 0; i <= nx; i++) {
      const x = -w / 2 + (w * i) / nx, y = -h / 2 + (h * j) / ny;
      rt.push(B.v(x, y, f(x, y)));
      rb.push(B.v(x, y, 0));
    }
    top.push(rt);
    bot.push(rb);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    B.q(top[j][i], top[j][i + 1], top[j + 1][i + 1], top[j + 1][i]);
    B.q(bot[j][i], bot[j + 1][i], bot[j + 1][i + 1], bot[j][i + 1]);
  }
  for (let i = 0; i < nx; i++) {
    B.q(top[0][i], bot[0][i], bot[0][i + 1], top[0][i + 1]);
    B.q(top[ny][i + 1], bot[ny][i + 1], bot[ny][i], top[ny][i]);
  }
  for (let j = 0; j < ny; j++) {
    B.q(top[j + 1][0], bot[j + 1][0], bot[j][0], top[j][0]);
    B.q(top[j][nx], bot[j][nx], bot[j + 1][nx], top[j + 1][nx]);
  }
  return B.done();
}

/** A solid of revolution around Y: radius r(h) for h in [0, H], closed top and bottom, centred on the origin. */
export function revolution(r: (h: number) => number, H: number, rings = 120, seg = 128): MeshData {
  const B = new Builder();
  const rows: number[][] = [];
  for (let k = 0; k <= rings; k++) {
    const h = (H * k) / rings, rad = Math.max(0.5, r(h));
    const row: number[] = [];
    for (let s = 0; s < seg; s++) {
      const th = (s / seg) * 2 * Math.PI;
      row.push(B.v(rad * Math.cos(th), h - H / 2, rad * Math.sin(th)));
    }
    rows.push(row);
  }
  const bc = B.v(0, -H / 2, 0), tc = B.v(0, H / 2, 0);
  for (let s = 0; s < seg; s++) {
    const s1 = (s + 1) % seg;
    for (let k = 0; k < rings; k++) B.q(rows[k][s], rows[k + 1][s], rows[k + 1][s1], rows[k][s1]);
    B.t(bc, rows[0][s], rows[0][s1]);
    B.t(tc, rows[rings][s1], rows[rings][s]);
  }
  return B.done();
}

const gauss = (x: number, y: number, cx: number, cy: number, sx: number, sy: number) => Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));

/**
 * The abstract head: a stylised face relief built from smooth bumps (forehead dome, brows, eye
 * sockets, nose, cheeks, lips, chin). Procedural, released by HingeLab under CC0.
 */
export function headHeight(x: number, y: number) {
  const rx = 80, ry = 110;
  const d = Math.max(0, 1 - (x / rx) ** 2 - (y / ry) ** 2);
  const dome = 46 * Math.pow(d, 0.45);
  const feat =
    24 * gauss(x, y, 0, -8, 8.5, 26) +
    7 * gauss(x, y, 0, -30, 11, 8) +
    7 * (gauss(x, y, -27, 33, 19, 7) + gauss(x, y, 27, 33, 19, 7)) -
    11 * (gauss(x, y, -29, 19, 13, 8) + gauss(x, y, 29, 19, 13, 8)) +
    6 * (gauss(x, y, -43, -16, 17, 18) + gauss(x, y, 43, -16, 17, 18)) +
    5 * gauss(x, y, 0, -51, 17, 4.5) + 5 * gauss(x, y, 0, -62, 14, 4.5) - 3 * gauss(x, y, 0, -56.5, 19, 1.6) +
    6 * gauss(x, y, 0, -88, 20, 12);
  return 3 + dome + feat * Math.min(1, d * 4);
}

export function libraryMesh(id: LibraryId, detail = 5): MeshData {
  switch (id) {
    case "sphere": return icosphere(100, detail);
    case "torus": return torus(90, 35);
    case "abstract-head-cc0": return ovalRelief(80, 110, headHeight);
    case "wave-panel": return heightfieldBlock(200, 150, (x, y) => 14 + 10 * Math.sin(x / 20) * Math.cos(y / 30));
    case "ripple": return heightfieldBlock(220, 220, (x, y) => { const r = Math.hypot(x, y); return 6 + 14 * Math.cos(r / 9) * Math.exp(-r / 70) + 14 * Math.exp(-r / 70); });
    case "vase": return revolution(h => 45 + 25 * Math.sin(h / 32) - 12 * Math.cos(h / 15), 240);
  }
}
