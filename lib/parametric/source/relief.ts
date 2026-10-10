/**
 * Photo to relief: a depth map (from Depth-Anything-V2-Small in the browser, or any heightfield)
 * → blur, gamma, subject mask → a watertight relief mesh with a flat back on the wall (z = 0).
 * Depth maps are row-major with row 0 at the top of the image and values 0..1, 1 = nearest.
 */
import type { MeshData } from "../types";
import { orientOutward } from "./library";

export interface DepthMap {
  w: number;
  h: number;
  data: Float32Array;
}

export interface ReliefOptions {
  invert: boolean;
  /** Height of depth 1 above the base, mm. */
  maxReliefDepth: number;
  /** Gaussian sigma in depth-map pixels (0 = none). */
  blur: number;
  /** depth^gamma: below 1 lifts the low parts, above 1 sharpens the peaks (nose, lips). */
  gamma: number;
  subjectMask: "auto" | "none";
  /** Added under the whole relief, mm. */
  baseThickness: number;
  /** Grid cells along the long side of the image. */
  resolution: number;
  /** Width of the relief, mm (the height follows the image's aspect ratio). */
  width: number;
}

/** Lowest top surface, mm: a zero-height wall would not be a solid. */
export const MIN_RELIEF = 0.5;

/* ---------- Depth-map file (what the editor stores and sends to the worker) ---------- */

const MAGIC = 0x4d44_4c48; // "HLDM"

export function packDepth(d: DepthMap): ArrayBuffer {
  const buf = new ArrayBuffer(12 + d.data.length * 4);
  const head = new Uint32Array(buf, 0, 3);
  head[0] = MAGIC; head[1] = d.w; head[2] = d.h;
  new Float32Array(buf, 12).set(d.data);
  return buf;
}

export function unpackDepth(buf: ArrayBuffer): DepthMap {
  if (buf.byteLength < 12) throw new Error("The depth map is damaged. Load the photo again.");
  const [magic, w, h] = new Uint32Array(buf, 0, 3);
  if (magic !== MAGIC || !(w > 1 && h > 1) || buf.byteLength !== 12 + w * h * 4) throw new Error("The depth map is damaged. Load the photo again.");
  return { w, h, data: new Float32Array(buf.slice(12)) };
}

/* ---------- Depth-Anything input and output ---------- */

/** Model input size: the long side 518 px, both sides multiples of 14 (the ViT patch size). */
export function depthInputSize(w: number, h: number, long = 518): { w: number; h: number } {
  const k = long / Math.max(w, h);
  const r = (v: number) => Math.max(14, Math.round((v * k) / 14) * 14);
  return { w: r(w), h: r(h) };
}

const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

/** RGBA pixels (already resized to the model size) → normalised float32 NCHW tensor data. */
export function depthInput(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Float32Array {
  const n = w * h, out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) out[c * n + i] = (rgba[i * 4 + c] / 255 - MEAN[c]) / STD[c];
  return out;
}

/** Relative depth (any range, larger = nearer) → 0..1, clipped at the 1st and 99th percentile. */
export function normaliseDepth(raw: ArrayLike<number>, w: number, h: number): DepthMap {
  const n = w * h;
  const sorted = Float32Array.from({ length: n }, (_, i) => raw[i]).sort();
  const lo = sorted[Math.floor(0.01 * (n - 1))], hi = sorted[Math.ceil(0.99 * (n - 1))];
  const span = hi - lo > 1e-12 ? hi - lo : 1;
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) data[i] = Math.min(1, Math.max(0, (raw[i] - lo) / span));
  return { w, h, data };
}

/* ---------- Processing ---------- */

export function gaussianBlur(d: DepthMap, sigma: number): DepthMap {
  if (!(sigma > 0.05)) return d;
  const r = Math.ceil(3 * sigma);
  const k = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)));
  const ks = k.reduce((a, b) => a + b, 0);
  const pass = (src: Float32Array, horiz: boolean) => {
    const out = new Float32Array(src.length);
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) {
        const xx = horiz ? Math.min(d.w - 1, Math.max(0, x + i)) : x, yy = horiz ? y : Math.min(d.h - 1, Math.max(0, y + i));
        s += src[yy * d.w + xx] * k[i + r];
      }
      out[y * d.w + x] = s / ks;
    }
    return out;
  };
  return { w: d.w, h: d.h, data: pass(pass(d.data, true), false) };
}

/** Invert, blur and gamma: the depth the relief is built from. */
export function processDepth(d: DepthMap, o: Pick<ReliefOptions, "invert" | "blur" | "gamma">): DepthMap {
  const src = o.invert ? { ...d, data: d.data.map(v => 1 - v) } : d;
  const b = gaussianBlur(src, o.blur);
  const g = Math.min(3, Math.max(0.2, o.gamma || 1));
  return { w: b.w, h: b.h, data: b.data.map(v => Math.max(0, Math.min(1, v)) ** g) };
}

/**
 * Subject mask: pixels above the 35th depth percentile, the largest 4-connected region of them,
 * with enclosed background filled (eyes, open mouths stay part of the subject).
 */
export function autoMask(d: DepthMap): Uint8Array {
  const n = d.w * d.h;
  const sorted = Float32Array.from(d.data).sort();
  const t = sorted[Math.floor(0.35 * (n - 1))];
  const fg = new Uint8Array(n);
  for (let i = 0; i < n; i++) fg[i] = d.data[i] > t ? 1 : 0;
  const label = new Int32Array(n).fill(-1);
  let best = -1, bestSize = 0;
  const stack: number[] = [];
  for (let s = 0, id = 0; s < n; s++) {
    if (!fg[s] || label[s] >= 0) continue;
    let size = 0;
    label[s] = id; stack.push(s);
    while (stack.length) {
      const i = stack.pop()!; size++;
      const x = i % d.w, y = (i - x) / d.w;
      for (const j of [x > 0 ? i - 1 : -1, x < d.w - 1 ? i + 1 : -1, y > 0 ? i - d.w : -1, y < d.h - 1 ? i + d.w : -1]) {
        if (j >= 0 && fg[j] && label[j] < 0) { label[j] = id; stack.push(j); }
      }
    }
    if (size > bestSize) { bestSize = size; best = id; }
    id++;
  }
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = label[i] === best ? 1 : 0;
  // Fill holes: background not reachable from the border becomes subject.
  const outside = new Uint8Array(n);
  for (let x = 0; x < d.w; x++) for (const y of [0, d.h - 1]) { const i = y * d.w + x; if (!mask[i] && !outside[i]) { outside[i] = 1; stack.push(i); } }
  for (let y = 0; y < d.h; y++) for (const x of [0, d.w - 1]) { const i = y * d.w + x; if (!mask[i] && !outside[i]) { outside[i] = 1; stack.push(i); } }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % d.w, y = (i - x) / d.w;
    for (const j of [x > 0 ? i - 1 : -1, x < d.w - 1 ? i + 1 : -1, y > 0 ? i - d.w : -1, y < d.h - 1 ? i + d.w : -1]) {
      if (j >= 0 && !mask[j] && !outside[j]) { outside[j] = 1; stack.push(j); }
    }
  }
  for (let i = 0; i < n; i++) if (!outside[i]) mask[i] = 1;
  return mask;
}

/** Bilinear sample at image coordinates (pixel centres at integers). */
export function sampleDepth(d: DepthMap, x: number, y: number): number {
  const cx = Math.min(d.w - 1, Math.max(0, x)), cy = Math.min(d.h - 1, Math.max(0, y));
  const x0 = Math.min(d.w - 2, Math.floor(cx)), y0 = Math.min(d.h - 2, Math.floor(cy));
  const fx = cx - x0, fy = cy - y0, i = y0 * d.w + x0;
  return (d.data[i] * (1 - fx) + d.data[i + 1] * fx) * (1 - fy) + (d.data[i + d.w] * (1 - fx) + d.data[i + d.w + 1] * fx) * fy;
}

/* ---------- Grid and mesh ---------- */

export interface ReliefGrid {
  nx: number;
  ny: number;
  /** Cell size, mm. */
  cell: number;
  /** Node heights (nx + 1) × (ny + 1), row 0 at the top, mm. */
  heights: Float32Array;
  /** Cells that are part of the relief, nx × ny. */
  inside: Uint8Array;
  /** Node (i, j) → model x, y. */
  x0: number;
  y0: number;
  /** Height of the processed depth v at a model point, mm (for tests). */
  heightOf: (v: number) => number;
  /** Image coordinates of a model point. */
  toImage: (x: number, y: number) => [number, number];
}

export function reliefGrid(depth: DepthMap, o: ReliefOptions): ReliefGrid {
  if (!(o.width > 0)) throw new Error("The relief needs a positive width.");
  const d = processDepth(depth, o);
  const res = Math.max(8, Math.min(256, Math.round(o.resolution)));
  const landscape = d.w >= d.h;
  const nx = landscape ? res : Math.max(2, Math.round((res * d.w) / d.h));
  const ny = landscape ? Math.max(2, Math.round((res * d.h) / d.w)) : res;
  const cell = o.width / nx;
  const x0 = -o.width / 2, y0 = (ny * cell) / 2;
  // Node (i, j) sits at image coordinates (i / nx, j / ny) of the full image.
  const toImage = (x: number, y: number): [number, number] => [((x - x0) / (nx * cell)) * (d.w - 1), ((y0 - y) / (ny * cell)) * (d.h - 1)];
  const heightOf = (v: number) => Math.max(MIN_RELIEF, o.baseThickness + v * o.maxReliefDepth);
  const heights = new Float32Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    heights[j * (nx + 1) + i] = heightOf(sampleDepth(d, (i / nx) * (d.w - 1), (j / ny) * (d.h - 1)));
  }
  const inside = new Uint8Array(nx * ny).fill(1);
  if (o.subjectMask === "auto") {
    const m = autoMask(d);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const px = Math.min(d.w - 1, Math.round(((i + 0.5) / nx) * (d.w - 1))), py = Math.min(d.h - 1, Math.round(((j + 0.5) / ny) * (d.h - 1)));
      inside[j * nx + i] = m[py * d.w + px];
    }
    keepLargest(inside, nx, ny);
    for (let pass = 0; pass < 10; pass++) {
      const before = inside.reduce((a, v) => a + v, 0);
      fillHoles(inside, nx, ny);
      removePinches(inside, nx, ny);
      if (inside.reduce((a, v) => a + v, 0) === before) break;
    }
    if (!inside.some(v => v)) throw new Error("No subject was found in the photo. Turn the subject mask off.");
  }
  return { nx, ny, cell, heights, inside, x0, y0, heightOf, toImage };
}

/** Two cells touching only at a corner would share a vertex but no edge: fill one of the gaps. */
export function removePinches(inside: Uint8Array, nx: number, ny: number) {
  for (let pass = 0, changed = true; changed && pass < 50; pass++) {
    changed = false;
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, e = c + 1;
      if (inside[a] && inside[e] && !inside[b] && !inside[c]) { inside[b] = 1; changed = true; }
      else if (inside[b] && inside[c] && !inside[a] && !inside[e]) { inside[a] = 1; changed = true; }
    }
  }
}

/** Outside cells not reachable from the border (sampling can close off a channel) become inside. */
function fillHoles(inside: Uint8Array, nx: number, ny: number) {
  const outside = new Uint8Array(nx * ny);
  const stack: number[] = [];
  const seed = (k: number) => { if (!inside[k] && !outside[k]) { outside[k] = 1; stack.push(k); } };
  for (let i = 0; i < nx; i++) { seed(i); seed((ny - 1) * nx + i); }
  for (let j = 0; j < ny; j++) { seed(j * nx); seed(j * nx + nx - 1); }
  while (stack.length) {
    const k = stack.pop()!;
    const i = k % nx, j = (k - i) / nx;
    if (i > 0) seed(k - 1);
    if (i < nx - 1) seed(k + 1);
    if (j > 0) seed(k - nx);
    if (j < ny - 1) seed(k + nx);
  }
  for (let k = 0; k < inside.length; k++) if (!outside[k]) inside[k] = 1;
}

function keepLargest(inside: Uint8Array, nx: number, ny: number) {
  const label = new Int32Array(nx * ny).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let s = 0; s < inside.length; s++) {
    if (!inside[s] || label[s] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    label[s] = id; stack.push(s);
    while (stack.length) {
      const k = stack.pop()!; size++;
      const i = k % nx, j = (k - i) / nx;
      for (const m of [i > 0 ? k - 1 : -1, i < nx - 1 ? k + 1 : -1, j > 0 ? k - nx : -1, j < ny - 1 ? k + nx : -1]) {
        if (m >= 0 && inside[m] && label[m] < 0) { label[m] = id; stack.push(m); }
      }
    }
    sizes.push(size);
  }
  const best = sizes.indexOf(Math.max(...sizes));
  for (let k = 0; k < inside.length; k++) if (label[k] !== best) inside[k] = 0;
}

/** Top surface over the inside cells, flat back at z = 0, side walls along the mask boundary. */
export function reliefMesh(g: ReliefGrid): MeshData {
  const { nx, ny, cell, heights, inside, x0, y0 } = g;
  const W = nx + 1;
  const top = new Int32Array(W * (ny + 1)).fill(-1), bot = new Int32Array(W * (ny + 1)).fill(-1);
  const pos: number[] = [], idx: number[] = [];
  const used = new Uint8Array(W * (ny + 1));
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (inside[j * nx + i]) {
    used[j * W + i] = used[j * W + i + 1] = used[(j + 1) * W + i] = used[(j + 1) * W + i + 1] = 1;
  }
  for (let k = 0; k < used.length; k++) if (used[k]) {
    const i = k % W, j = (k - i) / W, x = x0 + i * cell, y = y0 - j * cell;
    top[k] = pos.length / 3; pos.push(x, y, heights[k]);
    bot[k] = pos.length / 3; pos.push(x, y, 0);
  }
  const isIn = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && inside[j * nx + i] === 1;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!isIn(i, j)) continue;
    // Corners counter-clockwise seen from the front (+z): bottom-left, bottom-right, top-right, top-left.
    const bl = (j + 1) * W + i, br = (j + 1) * W + i + 1, tr = j * W + i + 1, tl = j * W + i;
    idx.push(top[bl], top[br], top[tr], top[bl], top[tr], top[tl]);
    idx.push(bot[bl], bot[tr], bot[br], bot[bl], bot[tl], bot[tr]);
    // Walls where the neighbour is outside, wound to face away from this cell.
    const wall = (a: number, b: number) => idx.push(top[a], bot[b], bot[a], top[a], top[b], bot[b]);
    if (!isIn(i, j + 1)) wall(br, bl);
    if (!isIn(i + 1, j)) wall(tr, br);
    if (!isIn(i, j - 1)) wall(tl, tr);
    if (!isIn(i - 1, j)) wall(bl, tl);
  }
  return orientOutward({ positions: new Float32Array(pos), indices: new Uint32Array(idx) });
}

export const reliefFromDepth = (depth: DepthMap, o: ReliefOptions) => reliefMesh(reliefGrid(depth, o));
