/**
 * More built-in sample shapes: wall reliefs (faces, nature, patterns) and turned lamp and vessel
 * bodies. All procedural, written for HingeLab and released under CC0; no third-party models.
 * Every mesh is closed with outward-facing triangles, in mm, Y up, Z toward the viewer. Reliefs
 * have their flat back on z = 0 and a top that never drops below ~1 mm.
 */
import type { LibraryId, MeshData } from "../types";

export interface ReliefInfo {
  id: LibraryId;
  name: string;
  note: string;
  /** Authored with the flat back on the wall (false: a solid centred on the origin). */
  wall: boolean;
}

export const RELIEF_LIBRARY: ReliefInfo[] = [
  { id: "face-cc0", name: "Serene face", note: "Calm face with closed eyes, about 180 × 300 mm", wall: true },
  { id: "veiled-face-cc0", name: "Veiled face", note: "Face with strands sweeping to one side, 340 × 460 mm board", wall: true },
  { id: "profile-face-cc0", name: "Face in profile", note: "Side view of a face, 260 × 340 mm", wall: true },
  { id: "terrain", name: "Mountain range", note: "Ridged peaks and valleys, 260 × 170 mm", wall: true },
  { id: "sand-dunes", name: "Sand dunes", note: "Wind-blown dunes with steep lee faces, 260 × 180 mm", wall: true },
  { id: "ocean-wave", name: "Ocean wave", note: "A rolling swell with smaller waves behind, 280 × 180 mm", wall: true },
  { id: "diagonal-waves", name: "Diagonal waves", note: "Waves at 45° that swell and fade, 240 × 180 mm", wall: true },
  { id: "sound-wave", name: "Sound wave", note: "An audio waveform, 300 × 130 mm", wall: true },
  { id: "flow-lines", name: "Flow lines", note: "Marbled ridges that bend round each other, 240 × 180 mm", wall: true },
  { id: "hex-bumps", name: "Hexagon domes", note: "A honeycomb of soft domes, 240 × 180 mm", wall: true },
  { id: "pebbles", name: "Pebbles", note: "A cluster of smooth river stones, 260 × 180 mm", wall: true },
  { id: "rose", name: "Rose", note: "Layered petals in a spiral, 220 mm across", wall: true },
  { id: "lotus", name: "Lotus", note: "Two rings of pointed petals, 230 mm across", wall: true },
  { id: "shell-spiral", name: "Spiral shell", note: "Logarithmic spiral ridges, 220 mm across", wall: true },
  { id: "mandala", name: "Mandala", note: "Rings of petals and beads, 230 mm across", wall: true },
  { id: "moon", name: "Moon", note: "Full moon with craters, 220 mm across", wall: true },
  { id: "heart", name: "Heart", note: "A puffy heart, about 220 mm wide", wall: true },
  { id: "star", name: "Star", note: "A five-pointed star with ridged arms, 230 mm across", wall: true },
  { id: "globe-lamp", name: "Globe lamp", note: "Round shade with a neck, 220 mm tall", wall: false },
  { id: "teardrop-lamp", name: "Teardrop lamp", note: "Pendant shade, 260 mm tall", wall: false },
  { id: "bell-lamp", name: "Bell lamp", note: "Flared bell shade, 200 mm tall", wall: false },
  { id: "bulb-vase", name: "Bulb vase", note: "Round belly, slim neck, 240 mm tall", wall: false },
];

export const RELIEF_IDS: LibraryId[] = RELIEF_LIBRARY.map(r => r.id);
export const WALL_RELIEF_IDS: LibraryId[] = RELIEF_LIBRARY.filter(r => r.wall).map(r => r.id);

/* ---------- mesh builders ---------- */

class MeshBuilder {
  pos: number[] = [];
  idx: number[] = [];
  v(x: number, y: number, z: number) {
    this.pos.push(x, y, z);
    return this.pos.length / 3 - 1;
  }
  t(a: number, b: number, c: number) { this.idx.push(a, b, c); }
  q(a: number, b: number, c: number, d: number) { this.t(a, b, c); this.t(a, c, d); }
  done(): MeshData {
    const positions = new Float32Array(this.pos), indices = new Uint32Array(this.idx);
    let vol = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
      vol += positions[a] * (positions[b + 1] * positions[c + 2] - positions[b + 2] * positions[c + 1])
        - positions[a + 1] * (positions[b] * positions[c + 2] - positions[b + 2] * positions[c])
        + positions[a + 2] * (positions[b] * positions[c + 1] - positions[b + 1] * positions[c]);
    }
    if (vol < 0) for (let i = 0; i < indices.length; i += 3) { const t = indices[i + 1]; indices[i + 1] = indices[i + 2]; indices[i + 2] = t; }
    return { positions, indices };
  }
}

const MIN_TOP = 0.8;

/**
 * A rectangular relief over [-w/2, w/2] × [-h/2, h/2]: top z = height(i, j) at grid node (i, j),
 * side walls, and a flat back on z = 0 fanned from its centre (far fewer triangles than a grid).
 */
function gridMesh(w: number, h: number, nx: number, ny: number, height: (i: number, j: number) => number): MeshData {
  const B = new MeshBuilder();
  const top: number[][] = [];
  for (let j = 0; j <= ny; j++) {
    const row: number[] = [];
    for (let i = 0; i <= nx; i++) row.push(B.v(-w / 2 + (w * i) / nx, -h / 2 + (h * j) / ny, Math.max(MIN_TOP, height(i, j))));
    top.push(row);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) B.q(top[j][i], top[j][i + 1], top[j + 1][i + 1], top[j + 1][i]);
  const ring: [number, number][] = [];
  for (let i = 0; i < nx; i++) ring.push([i, 0]);
  for (let j = 0; j < ny; j++) ring.push([nx, j]);
  for (let i = nx; i > 0; i--) ring.push([i, ny]);
  for (let j = ny; j > 0; j--) ring.push([0, j]);
  const tops = ring.map(([i, j]) => top[j][i]);
  const bots = ring.map(([i, j]) => B.v(-w / 2 + (w * i) / nx, -h / 2 + (h * j) / ny, 0));
  const c = B.v(0, 0, 0);
  for (let k = 0; k < ring.length; k++) {
    const k1 = (k + 1) % ring.length;
    B.q(tops[k], bots[k], bots[k1], tops[k1]);
    B.t(c, bots[k1], bots[k]);
  }
  return B.done();
}

/** gridMesh for a height function of x, y in mm. About `cell` mm between samples (at most 360 per side). */
function heightfield(w: number, h: number, f: (x: number, y: number) => number, cell = 2): MeshData {
  const nx = Math.min(360, Math.max(16, Math.round(w / cell))), ny = Math.min(360, Math.max(16, Math.round(h / cell)));
  return gridMesh(w, h, nx, ny, (i, j) => f(-w / 2 + (w * i) / nx, -h / 2 + (h * j) / ny));
}

/**
 * A relief inside a star-shaped outline r = R(θ) round the origin: top z = f(x, y), side wall at
 * the rim, flat back. Polar grid, so the outline is smooth.
 */
function polarRelief(R: (th: number) => number, f: (x: number, y: number) => number, rings = 80, sectors = 240): MeshData {
  const B = new MeshBuilder();
  const radius = Array.from({ length: sectors }, (_, s) => R((s / sectors) * 2 * Math.PI));
  const top: number[][] = [];
  const centre = B.v(0, 0, Math.max(MIN_TOP, f(0, 0)));
  for (let k = 1; k <= rings; k++) {
    const rho = k / rings, row: number[] = [];
    for (let s = 0; s < sectors; s++) {
      const th = (s / sectors) * 2 * Math.PI, x = radius[s] * rho * Math.cos(th), y = radius[s] * rho * Math.sin(th);
      row.push(B.v(x, y, Math.max(MIN_TOP, f(x, y))));
    }
    top.push(row);
  }
  const rim = top[rings - 1];
  const bottom = rim.map((_, s) => { const th = (s / sectors) * 2 * Math.PI; return B.v(radius[s] * Math.cos(th), radius[s] * Math.sin(th), 0); });
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

/** A turned solid round Y: radius r(h) for h in [0, H], closed ends, centred on the origin. */
function lathe(r: (h: number) => number, H: number, rings = 120, seg = 96): MeshData {
  const B = new MeshBuilder();
  const rows: number[][] = [];
  for (let k = 0; k <= rings; k++) {
    const h = (H * k) / rings, rad = Math.max(1, r(h)), row: number[] = [];
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

/** Outline radius of a region round the origin along each direction: the outermost crossing, refined by bisection. */
function outlineRadius(inside: (x: number, y: number) => boolean, rMax: number, pad = 0) {
  return (th: number) => {
    const c = Math.cos(th), s = Math.sin(th);
    let last = 0;
    for (let r = 1; r <= rMax; r += 1) if (inside(r * c, r * s)) last = r;
    let lo = last, hi = last + 1;
    for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (inside(m * c, m * s)) lo = m; else hi = m; }
    return lo + pad;
  };
}

/* ---------- helpers ---------- */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** Smoothstep that also runs downhill when e0 > e1. */
const ss = (e0: number, e1: number, x: number) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const g = (x: number, y: number, cx: number, cy: number, sx: number, sy: number) => Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));
function hash2(i: number, j: number, seed: number) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(seed + 1, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
const GRAD = Array.from({ length: 16 }, (_, k) => [Math.cos((k * Math.PI) / 8), Math.sin((k * Math.PI) / 8)]);
/** Seeded 2D gradient noise, about −1..1. */
export function noise(x: number, y: number, seed = 0) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const dot = (a: number, b: number, dx: number, dy: number) => { const gr = GRAD[hash2(a, b, seed) & 15]; return gr[0] * dx + gr[1] * dy; };
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const n00 = dot(i, j, fx, fy), n10 = dot(i + 1, j, fx - 1, fy), n01 = dot(i, j + 1, fx, fy - 1), n11 = dot(i + 1, j + 1, fx - 1, fy - 1);
  return 1.4 * (n00 + (n10 - n00) * u + (n01 - n00) * v + (n00 - n10 - n01 + n11) * u * v);
}
const fbm = (x: number, y: number, oct: number, seed: number) => {
  let s = 0, a = 0.5, f = 1;
  for (let o = 0; o < oct; o++) { s += a * noise(x * f, y * f, seed + o * 17); a *= 0.5; f *= 2.03; }
  return s;
};

/** Catmull-Rom through (t, value) knots sorted by t (clamped at the ends). */
function spline(knots: [number, number][]) {
  return (t: number) => {
    if (t <= knots[0][0]) return knots[0][1];
    const n = knots.length;
    if (t >= knots[n - 1][0]) return knots[n - 1][1];
    let k = 0;
    while (knots[k + 1][0] < t) k++;
    const p0 = knots[Math.max(0, k - 1)], p1 = knots[k], p2 = knots[k + 1], p3 = knots[Math.min(n - 1, k + 2)];
    const s = (t - p1[0]) / (p2[0] - p1[0]);
    const m1 = ((p2[1] - p0[1]) / (p2[0] - p0[0] || 1)) * (p2[0] - p1[0]), m2 = ((p3[1] - p1[1]) / (p3[0] - p1[0] || 1)) * (p2[0] - p1[0]);
    const s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * p1[1] + (s3 - 2 * s2 + s) * m1 + (-2 * s3 + 3 * s2) * p2[1] + (s3 - s2) * m2;
  };
}

/**
 * Distance from the outline of a region, mm, on a grid over [-w/2, w/2] × [-h/2, h/2] (exact
 * Euclidean distance transform; 0 outside). `at` samples it bilinearly anywhere.
 */
function distanceField(w: number, h: number, cell: number, inside: (x: number, y: number) => boolean) {
  const nx = Math.min(360, Math.round(w / cell)), ny = Math.min(360, Math.round(h / cell));
  const W = nx + 1, H = ny + 1, dx = w / nx, dy = h / ny;
  const d = new Float32Array(W * H);
  // Exact Euclidean distance transform (Felzenszwalb and Huttenlocher) in cells, then mm.
  const INF = 1e12;
  const f = new Float64Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const edge = i === 0 || j === 0 || i === W - 1 || j === H - 1;
    f[j * W + i] = !edge && inside(-w / 2 + i * dx, -h / 2 + j * dy) ? INF : 0;
  }
  const line = (get: (q: number) => number, set: (q: number, v: number) => void, n: number) => {
    const v = new Int32Array(n), z = new Float64Array(n + 1), src = new Float64Array(n);
    for (let q = 0; q < n; q++) src[q] = get(q);
    const cross = (q: number, p: number) => (src[q] + q * q - (src[p] + p * p)) / (2 * q - 2 * p);
    let k = 0;
    z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = cross(q, v[k]);
      while (s <= z[k]) { k--; s = cross(q, v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; set(q, (q - v[k]) ** 2 + src[v[k]]); }
  };
  for (let i = 0; i < W; i++) line((q) => f[q * W + i], (q, val) => { f[q * W + i] = val; }, H);
  for (let j = 0; j < H; j++) line((q) => f[j * W + q], (q, val) => { f[j * W + q] = val; }, W);
  const cellMm = (dx + dy) / 2;
  for (let k = 0; k < W * H; k++) d[k] = Math.sqrt(f[k]) * cellMm;
  // One 3 × 3 blur softens the crease along the middle of each region.
  const src = d.slice();
  for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
    const k = j * W + i;
    if (src[k]) d[k] = (src[k - W - 1] + src[k - W] + src[k - W + 1] + src[k - 1] + src[k] + src[k + 1] + src[k + W - 1] + src[k + W] + src[k + W + 1]) / 9;
  }
  const at = (x: number, y: number) => {
    const fi = Math.min(nx - 1e-6, Math.max(0, (x + w / 2) / dx)), fj = Math.min(ny - 1e-6, Math.max(0, (y + h / 2) / dy));
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, k = j * W + i;
    return (d[k] * (1 - u) + d[k + 1] * u) * (1 - v) + (d[k + W] * (1 - u) + d[k + W + 1] * u) * v;
  };
  return { nx, ny, W, dx, dy, d, at };
}

/**
 * Pillow relief from a region on a grid: height rises with the distance from the outline, as
 * sqrt(d / radius) up to `depth`, plus `extra` inside.
 */
function pillowGrid(w: number, h: number, cell: number, inside: (x: number, y: number) => boolean, radius: number, depth: number, extra: (x: number, y: number, d: number) => number, base = 1.2): MeshData {
  const { nx, ny, W, dx, dy, d } = distanceField(w, h, cell, inside);
  return gridMesh(w, h, nx, ny, (i, j) => {
    const dd = d[j * W + i];
    if (!dd) return base;
    const x = -w / 2 + i * dx, y = -h / 2 + j * dy;
    return base + depth * Math.sqrt(Math.min(1, dd / radius)) + extra(x, y, dd);
  });
}

/* ---------- faces ---------- */

/**
 * A calm frontal face with closed eyes, in face units: u across (about ±0.7), v up (chin about
 * −1, crown +1.1). Returns the height in the same units (nose tip about 0.5); 0 off the head.
 */
export function faceUnits(u: number, v: number): number {
  const jaw = 1 - 0.3 * ss(0.15, -1.0, v);
  const uu = u / jaw;
  const d = 1 - (uu / 0.68) ** 2 - ((v - 0.06) / 1.06) ** 2;
  const neckW = 0.34 + 0.08 * ss(-1.0, -1.6, v);
  const nd = 1 - (u / neckW) ** 2;
  const neck = v < -0.55 && nd > 0 ? 0.17 * Math.sqrt(nd) * ss(-0.55, -0.85, v) : 0;
  if (d <= 0) return neck;
  const head = 0.26 * Math.sqrt(d);
  const m = ss(0, 0.3, d);
  const au = Math.abs(u);
  let f = 0;
  f += 0.035 * g(u, v, 0, 0.55, 0.45, 0.28);
  f += 0.04 * g(au, v, 0.26, 0.31, 0.2, 0.055);
  f -= 0.085 * g(au, v, 0.27, 0.17, 0.16, 0.085);
  f += 0.055 * g(au, v, 0.27, 0.16, 0.115, 0.05);
  const nt = ss(0.26, -0.24, v);
  const nw = 0.05 + 0.045 * nt;
  const win = ss(0.36, 0.22, v) * ss(-0.36, -0.28, v);
  f += (0.05 + 0.17 * nt * nt) * Math.exp(-((u / nw) ** 2)) * win;
  f += 0.05 * g(u, v, 0, -0.245, 0.075, 0.055);
  f += 0.05 * g(au, v, 0.095, -0.27, 0.055, 0.045);
  f += 0.07 * g(u, v, 0, -0.5, 0.27, 0.2);
  f += 0.032 * g(u, v, 0, -0.465, 0.16, 0.032);
  f += 0.042 * g(u, v, 0, -0.565, 0.14, 0.038);
  f -= 0.022 * g(u, v, 0, -0.513, 0.17, 0.012);
  f -= 0.018 * g(u, v, 0, -0.655, 0.11, 0.03);
  f += 0.06 * g(u, v, 0, -0.8, 0.16, 0.1);
  f += 0.05 * g(au, v, 0.42, -0.02, 0.16, 0.13);
  f += 0.025 * g(au, v, 0.32, -0.33, 0.17, 0.17);
  f -= 0.02 * g(au, v, 0.56, 0.26, 0.09, 0.14);
  return Math.max(neck, head + f * m);
}

const FACE_S = 125;
const faceInside = (x: number, y: number) => faceUnits(x / FACE_S, (y - 20) / FACE_S) > 0 || (Math.abs(x) < 0.34 * FACE_S && y < 20 - 0.6 * FACE_S);

function faceMesh(): MeshData {
  const R = outlineRadius(faceInside, 260, 4);
  // The outline runs down to the cut of the neck at y = −150.
  const cut = (th: number) => { const s = Math.sin(th); const r = R(th); return s < 0 ? Math.min(r, 150 / -s) : r; };
  return polarRelief(cut, (x, y) => 1.5 + FACE_S * faceUnits(x / FACE_S, (y - 20) / FACE_S), 110, 300);
}

/** The flagship: a face with a veil of strands sweeping across the brow and away to one side, on a 340 × 480 board. */
export function veiledFaceHeight(x: number, y: number): number {
  const S = 120, fx = -50, fy = 30, a = 0.12;
  const u0 = (x - fx) / S, v0 = (y - fy) / S;
  const u = u0 * Math.cos(a) + v0 * Math.sin(a), v = -u0 * Math.sin(a) + v0 * Math.cos(a);
  const head = S * faceUnits(u, v);
  const dx = x - fx;
  const yc = fy + 0.68 * S - 0.4 * dx - 0.0019 * Math.max(0, dx) ** 2 + 9 * Math.sin(dx / 52);
  const hw = 0.52 * S + 0.2 * Math.max(0, dx);
  const t = (y - yc) / hw;
  const e = ss(1, 0.5, Math.abs(t)) * ss(fx - 0.95 * S, fx - 0.5 * S, x) * ss(178, 120, x);
  let veil = 0;
  if (e > 0) {
    const psi = t * 4.5 + 0.22 * Math.sin(dx / 30 + t * 2.2);
    const r = Math.pow(0.5 + 0.5 * Math.cos(2 * Math.PI * psi), 1.3) * (0.8 + 0.2 * Math.sin(dx / 23 + psi * 1.3));
    const lift = 10 + 30 * ss(-20, 80, dx) * Math.exp(-Math.max(0, dx - 80) / 150);
    veil = e * (Math.max(head + 4, lift) + 3 + 10 * r);
  }
  // A few loose strands falling past the cheek and neck.
  const wy = y - (fy + 0.3 * S), wx = x - (fx + 0.7 * S - 0.18 * wy + 12 * Math.sin(wy / 45));
  const wisp = wy < 0 && wy > -1.9 * S ? ss(1, 0.2, Math.abs(wx) / 24) * ss(-1.9 * S, -1.1 * S, wy) * Math.pow(0.5 + 0.5 * Math.cos((2 * Math.PI * wx) / 16), 1.5) * 12 : 0;
  return 1.2 + Math.max(head, veil, wisp > 1 ? 7 + wisp : 0);
}

/** Side view facing left, in face units (v up, x across); the region and its features. */
const PROFILE_FRONT = spline([
  [-1.4, -0.16], [-0.84, -0.18], [-0.78, -0.3], [-0.72, -0.46], [-0.63, -0.5], [-0.52, -0.45], [-0.43, -0.51], [-0.37, -0.49],
  [-0.3, -0.52], [-0.22, -0.5], [-0.19, -0.6], [-0.13, -0.66], [-0.02, -0.56], [0.1, -0.46], [0.18, -0.5], [0.3, -0.49], [0.45, -0.44], [0.62, -0.3],
]);
const PROFILE_BACK = spline([[-1.4, 0.3], [-0.7, 0.22], [-0.45, 0.3], [-0.2, 0.42], [0.3, 0.6], [0.62, 0.6]]);
const profileInside = (x: number, v: number) => {
  if (((x - 0.12) / 0.6) ** 2 + ((v - 0.3) / 0.66) ** 2 < 1) return true;
  return v > -1.4 && v < 0.62 && x > PROFILE_FRONT(v) && x < PROFILE_BACK(v);
};

function profileMesh(): MeshData {
  const S = 150, cy = 15;
  const toU = (x: number, y: number) => [x / S + 0.05, (y - cy) / S] as const;
  return pillowGrid(260, 340, 1.6, (x, y) => { const [u, v] = toU(x, y); return profileInside(u, v); }, 0.24 * S, 0.24 * S, (x, y, d) => {
    const [u, v] = toU(x, y);
    const m = Math.min(1, d / 12);
    let f = 0;
    f -= 0.05 * g(u, v, -0.37, 0.13, 0.06, 0.035);
    f += 0.035 * g(u, v, -0.36, 0.125, 0.04, 0.02);
    f += 0.04 * g(u, v, -0.22, -0.04, 0.12, 0.1);
    const er = Math.hypot((u - 0.24) / 0.08, (v - 0.02) / 0.13);
    f += 0.05 * Math.exp(-(((er - 0.75) / 0.25) ** 2)) + 0.02 * g(u, v, 0.24, 0.02, 0.05, 0.08);
    // Hair: waves combed back over the crown.
    const hair = ss(-0.12, 0.05, u + 0.25 * (v - 0.4)) * ss(0.02, 0.18, v);
    const fan = Math.atan2(v + 0.3, u - 0.45), rr = Math.hypot(v + 0.3, u - 0.45);
    f += hair * 0.01 * Math.cos(fan * 26 + 0.6 * Math.sin(rr * 14));
    return S * f * m;
  });
}

/* ---------- nature and patterns ---------- */

function terrainHeight(x: number, y: number) {
  let s = 0, a = 1, f = 1 / 70, wgt = 1;
  for (let o = 0; o < 5; o++) {
    const n = 1 - Math.abs(noise(x * f + 3.1, y * f - 7.7, 11 + o));
    const r = n * n * wgt;
    wgt = clamp01(r * 1.6);
    s += r * a; a *= 0.5; f *= 2.05;
  }
  const valley = 0.55 + 0.45 * ss(0, 60, Math.abs(y + 18 * Math.sin(x / 45)));
  return 3 + 34 * s * valley;
}

function dunesHeight(x: number, y: number) {
  const w = x + 22 * Math.sin(y / 55) + 14 * fbm(x / 120, y / 120, 2, 5);
  const p = (((w / 52) % 1) + 1) % 1;
  const prof = p < 0.78 ? ss(0, 0.78, p) : ss(1, 0.78, p) ** 0.6;
  const swell = 0.7 + 0.3 * Math.sin(y / 40 + x / 90);
  return 4 + 15 * prof * swell + 2 * fbm(x / 40, y / 40, 2, 9);
}

function oceanHeight(x: number, y: number) {
  const crest = -10 + 30 * Math.sin((x + 40) / 70) - 0.0012 * x * x;
  const t = y - crest;
  const front = t > 0 ? Math.exp(-((t / 18) ** 2)) : Math.exp(-((t / 55) ** 2));
  const big = 34 * front * (0.65 + 0.35 * ss(-140, 60, x));
  const behind = 5 * Math.max(0, Math.sin((y + 0.25 * x) / 13)) * ss(crest - 10, crest - 90, y);
  const foam = 5 * ss(4, 0, Math.abs(t - 6)) * (0.5 + 0.5 * noise(x / 9, y / 9, 3)) * front;
  return 4 + big + behind + foam;
}

function soundHeight(x: number, y: number) {
  const env = 0.15 + 0.85 * Math.abs(Math.sin(x / 31) * Math.cos(x / 13 + 1) * 0.7 + 0.35 * Math.sin(x / 7.3)) * g(x, 0, 0, 0, 120, 1);
  const H = 58 * env;
  const d = 1 - (y / Math.max(4, H)) ** 2;
  return 2 + (d > 0 ? 26 * Math.sqrt(d) * (0.35 + 0.65 * env) : 0);
}

function flowHeight(x: number, y: number) {
  const warp = 2.4 * fbm(x / 90 + 1.3, y / 90 - 2.1, 3, 21);
  return 11 + 9 * Math.sin(x / 17 + y / 41 + warp * 3.2);
}

function hexHeight(x: number, y: number) {
  const r = 17, q = ((2 / 3) * x) / r, s = ((-1 / 3) * x + (Math.sqrt(3) / 3) * y) / r;
  // Round axial coordinates to the nearest hexagon centre.
  let rx = Math.round(q), rz = Math.round(s), ry = Math.round(-q - s);
  const dxq = Math.abs(rx - q), dzs = Math.abs(rz - s), dy = Math.abs(ry + q + s);
  if (dxq > dy && dxq > dzs) rx = -ry - rz; else if (dy <= dzs) rz = -rx - ry;
  const cx = r * 1.5 * rx, cy = r * Math.sqrt(3) * (rz + rx / 2);
  const d = Math.hypot(x - cx, y - cy) / (r * 0.86);
  const hgt = 9 + 7 * (0.5 + 0.5 * Math.sin(rx * 1.7 + rz * 2.3));
  return 2 + (d < 1 ? hgt * Math.pow(1 - d * d, 0.6) : 0);
}

const PEBBLES: [number, number, number, number, number, number][] = [
  // cx, cy, a, b, angle, height
  [-78, 32, 48, 34, 0.3, 30], [-10, 46, 36, 28, -0.4, 26], [58, 38, 44, 30, 0.2, 28], [-50, -30, 38, 30, -0.2, 27],
  [18, -18, 46, 34, 0.5, 33], [86, -36, 34, 26, -0.6, 22], [-104, -52, 22, 18, 0.1, 16], [-16, -66, 26, 20, 0.9, 18],
  [44, -70, 22, 16, -0.3, 14], [104, 56, 18, 14, 0.4, 12], [-118, 62, 16, 12, -0.5, 11], [8, 82, 18, 12, 0.2, 10],
];
function pebbleHeight(x: number, y: number) {
  let z = 1.5;
  for (const [cx, cy, a, b, ang, hgt] of PEBBLES) {
    const c = Math.cos(ang), s = Math.sin(ang), dx = x - cx, dy = y - cy;
    const u = (dx * c + dy * s) / a, v = (-dx * s + dy * c) / b;
    const d = 1 - Math.pow(Math.abs(u), 2.4) - Math.pow(Math.abs(v), 2.4);
    if (d > 0) z = Math.max(z, 1.5 + hgt * Math.pow(d, 0.45));
  }
  return z;
}

/** Petals: rings of n petals, each petal a rounded or pointed lobe of the ring's radius. */
function petalRing(rho: number, th: number, n: number, phase: number, r0: number, r1: number, sharp: number, height: number, cup: number, pointed = false) {
  const step = (2 * Math.PI) / n;
  const off = ((((th - phase) % step) + step * 1.5) % step) - step / 2;
  const a = pointed ? clamp01(1 - Math.abs(off) / (step / 2)) : Math.abs(Math.cos((n * (th - phase)) / 2));
  const R = r0 + (r1 - r0) * Math.pow(a, sharp);
  if (rho >= R) return 0;
  const k = rho / R;
  return height * (1 - Math.pow(k, 3)) ** 0.5 * (1 - cup + cup * k) * (0.82 + 0.18 * a);
}

function roseHeight(x: number, y: number) {
  const rho = Math.hypot(x, y), th = Math.atan2(y, x);
  let z = 2;
  for (let k = 0; k < 6; k++) {
    const r1 = 108 - k * 16, r0 = r1 * 0.55;
    z = Math.max(z, 2 + petalRing(rho, th, 5, k * 2.39996, r0, r1, 0.55, 14 + k * 6.5, 0.45));
  }
  return z + 8 * Math.exp(-((rho / 16) ** 2));
}

function lotusHeight(x: number, y: number) {
  const rho = Math.hypot(x, y), th = Math.atan2(y, x);
  let z = 2;
  z = Math.max(z, 2 + petalRing(rho, th, 9, 0, 30, 112, 0.55, 16, 0.6, true));
  z = Math.max(z, 2 + petalRing(rho, th, 9, Math.PI / 9, 24, 84, 0.55, 26, 0.55, true));
  z = Math.max(z, 2 + petalRing(rho, th, 7, Math.PI / 7, 18, 52, 0.6, 34, 0.4, true));
  const pod = 30 * Math.sqrt(Math.max(0, 1 - (rho / 22) ** 2));
  return Math.max(z, 6 + pod - 3 * (0.5 + 0.5 * Math.cos(rho / 3)) * ss(18, 8, rho));
}

function shellHeight(x: number, y: number) {
  const rho = Math.hypot(x, y) + 1e-6, th = Math.atan2(y, x);
  const b = 0.19;
  const turns = (Math.log(rho / 6) / b - th) / (2 * Math.PI);
  const p = ((turns % 1) + 1) % 1;
  const rib = Math.pow(Math.sin(Math.PI * p), 0.7);
  const fine = 0.5 + 0.5 * Math.cos(th * 34);
  return 3 + (8 + 22 * (1 - rho / 115)) * rib * (0.88 + 0.12 * fine);
}

function mandalaHeight(x: number, y: number) {
  const rho = Math.hypot(x, y), th = Math.atan2(y, x);
  let z = 2;
  z = Math.max(z, 2 + 24 * Math.sqrt(Math.max(0, 1 - (rho / 26) ** 2)));
  z = Math.max(z, 2 + petalRing(rho, th, 8, 0, 30, 58, 0.8, 18, 0.2));
  const band = (r0: number, r1: number, hgt: number) => (rho > r0 && rho < r1 ? hgt * Math.sin((Math.PI * (rho - r0)) / (r1 - r0)) ** 0.6 : 0);
  z = Math.max(z, 2 + band(58, 66, 10));
  z = Math.max(z, 2 + petalRing(rho, th, 16, Math.PI / 16, 66, 88, 1.6, 14, 0.3) * ss(64, 68, rho));
  z = Math.max(z, 2 + band(88, 94, 8));
  const bead = 9 * Math.max(0, 1 - Math.hypot(rho - 103, ((((th * 32) / (2 * Math.PI)) % 1 + 1) % 1 - 0.5) * (2 * Math.PI * 103) / 32) / 7) ** 0.5;
  return Math.max(z, 2 + bead);
}

const CRATERS: [number, number, number, number][] = [[-35, 30, 26, 7], [42, 48, 16, 5], [30, -40, 30, 8], [-60, -36, 14, 4], [70, -4, 12, 4], [-8, -78, 15, 4], [-80, 20, 11, 3], [8, 8, 9, 3], [-30, 76, 12, 3]];
function moonHeight(x: number, y: number) {
  const rho = Math.hypot(x, y);
  let z = 4 + 30 * Math.sqrt(Math.max(0, 1 - (rho / 112) ** 2));
  for (const [cx, cy, rc, dep] of CRATERS) {
    const r = Math.hypot(x - cx, y - cy);
    if (r < rc) z -= dep * (1 - (r / rc) ** 2);
    z += 0.45 * dep * Math.exp(-(((r - rc) / (0.22 * rc)) ** 2));
  }
  return z + 1.2 * fbm(x / 18, y / 18, 3, 4);
}

/** The heart curve, with the origin just below the notch so every rim point is in sight of it. */
const heartInside = (x: number, y: number) => {
  const X = x / 98, Y = y / 98 + 0.7;
  return (X * X + Y * Y - 1) ** 3 - X * X * Y * Y * Y < 0;
};

function heartMesh(): MeshData {
  const R = outlineRadius(heartInside, 240);
  const df = distanceField(240, 420, 1.5, heartInside);
  return polarRelief(R, (x, y) => { const t = 1 - Math.min(1, df.at(x, y) / 70); return 2 + 36 * Math.sqrt(1 - t * t); }, 90, 360);
}

function starRadius(th: number) {
  const n = 5, R = 115, r = 50;
  const a = ((th - Math.PI / 2) % ((2 * Math.PI) / n) + (2 * Math.PI) / n) % ((2 * Math.PI) / n);
  const half = Math.PI / n, t = Math.abs(a - half) / half;
  // Straight edges between tip (t = 1) and inner corner (t = 0).
  const ang = (1 - t) * half;
  const px = R, py = 0, qx = r * Math.cos(half), qy = r * Math.sin(half);
  const ex = qx - px, ey = qy - py;
  const c = Math.cos(ang), s = Math.sin(ang);
  const den = c * ey - s * ex;
  return Math.abs(den) < 1e-9 ? R : (px * ey - py * ex) / den;
}

/* ---------- lamps and vessels ---------- */

const globeR = (h: number) => { const t = h / 220; return t > 0.9 ? 26 : 26 + 82 * Math.sin(Math.PI * Math.min(1, t / 0.92)) ** 0.85; };
const teardropR = (h: number) => { const t = h / 260; return 16 + 92 * Math.sin(Math.PI * Math.pow(t, 0.62)) ** 1.25 * (t < 0.04 ? t / 0.04 : 1); };
const bellR = (h: number) => { const t = h / 200; return 22 + 88 * Math.pow(1 - t, 1.8) + 10 * Math.exp(-(((t - 0.06) / 0.06) ** 2)); };
const bulbVaseR = (h: number) => { const t = h / 240; return 18 + 62 * Math.exp(-(((t - 0.32) / 0.26) ** 2)) + 10 * ss(0.8, 1, t); };

export function reliefMesh(id: LibraryId): MeshData {
  switch (id) {
    case "face-cc0": return faceMesh();
    case "veiled-face-cc0": return heightfield(340, 460, veiledFaceHeight, 1.8);
    case "profile-face-cc0": return profileMesh();
    case "terrain": return heightfield(260, 170, terrainHeight, 1.6);
    case "sand-dunes": return heightfield(260, 180, dunesHeight, 1.6);
    case "ocean-wave": return heightfield(280, 180, oceanHeight, 1.6);
    case "diagonal-waves": return heightfield(240, 180, (x, y) => 13 + 9 * Math.sin((x + y) / 16) * (0.55 + 0.45 * Math.cos((x - y) / 70)), 1.6);
    case "sound-wave": return heightfield(300, 130, soundHeight, 1.4);
    case "flow-lines": return heightfield(240, 180, flowHeight, 1.6);
    case "hex-bumps": return heightfield(240, 180, hexHeight, 1.4);
    case "pebbles": return heightfield(260, 180, pebbleHeight, 1.6);
    case "rose": return polarRelief(() => 112, roseHeight, 110, 300);
    case "lotus": return polarRelief(() => 116, lotusHeight, 110, 320);
    case "shell-spiral": return polarRelief(() => 112, shellHeight, 110, 320);
    case "mandala": return polarRelief(() => 115, mandalaHeight, 120, 384);
    case "moon": return polarRelief(() => 112, moonHeight, 100, 300);
    case "heart": return heartMesh();
    case "star": return polarRelief(starRadius, (x, y) => {
      const rho = Math.hypot(x, y), r = starRadius(Math.atan2(y, x));
      return 2 + 30 * Math.pow(Math.max(0, 1 - rho / r), 0.75) + 6 * Math.exp(-((rho / 30) ** 2));
    }, 90, 400);
    case "globe-lamp": return lathe(globeR, 220);
    case "teardrop-lamp": return lathe(teardropR, 260);
    case "bell-lamp": return lathe(bellR, 200);
    case "bulb-vase": return lathe(bulbVaseR, 240);
    default: throw new Error(`Unknown library shape: ${id}`);
  }
}