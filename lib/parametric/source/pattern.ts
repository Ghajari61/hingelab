/**
 * Wall-art patterns: a height field over the piece (sine waves, a ridge that follows your curve,
 * Perlin noise, a radial ripple, a mountain ridge, points that push and pull, or a picture's
 * brightness), in a style: a full rectangle (wave relief), a border that follows the wave (organic
 * edge), or flat level shelves set into it (wave shelf). It is meshed as a relief with a flat back
 * on the wall, so slicing, numbering, nesting and export work as for any model.
 *
 * Coordinates: u across the piece (0 at the left) and v down it (0 at the top), both 0..1.
 */
import type { MeshData } from "../types";
import { reliefMesh, removePinches, sampleDepth, unpackDepth, type DepthMap, type ReliefGrid } from "./relief";
import type { PatternSource } from "./patternSpec";
export * from "./patternSpec";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/* ---------- Noise ---------- */

function hash(i: number, j: number, seed: number): number {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(seed + 1, 2147483629);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
/** Gradient noise, about -1..1. */
function perlin(x: number, y: number, seed: number): number {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const g = (a: number, b: number, dx: number, dy: number) => { const t = hash(a, b, seed) * 2 * Math.PI; return Math.cos(t) * dx + Math.sin(t) * dy; };
  const u = fade(fx), v = fade(fy);
  const n00 = g(i, j, fx, fy), n10 = g(i + 1, j, fx - 1, fy), n01 = g(i, j + 1, fx, fy - 1), n11 = g(i + 1, j + 1, fx - 1, fy - 1);
  return 1.41 * ((n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v);
}
/** Octaves of noise, 0..1. */
function fbm(x: number, y: number, seed: number, octaves: number, ridged = false): number {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let k = 0; k < octaves; k++) {
    const n = perlin(x * f, y * f, seed + k * 101);
    sum += amp * (ridged ? 1 - Math.abs(n) : (n + 1) / 2);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return clamp(sum / norm, 0, 1);
}

/* ---------- The height field ---------- */

const segDist = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};

/** The pattern's height at (u, v), 0..1, before the style and the amplitude. `pic` is the brightness map for "image". */
export function patternValue(s: PatternSource, u: number, v: number, pic?: DepthMap): number {
  const W = s.width, H = s.height, x = u * W, y = v * H;
  switch (s.pattern) {
    case "sine": {
      const a = (s.angle * Math.PI) / 180, L = Math.abs(W * Math.cos(a)) + Math.abs(H * Math.sin(a)) || W;
      const along = (x * Math.cos(a) + y * Math.sin(a)) / L, across = (-x * Math.sin(a) + y * Math.cos(a)) / L;
      const c = s.cross / 100;
      return 0.5 + 0.5 * ((1 - c) * Math.sin(2 * Math.PI * s.waves * along) + c * Math.sin(2 * Math.PI * Math.max(1, s.waves / 2) * across + 1.3));
    }
    case "ridge": {
      let d = Infinity;
      for (let i = 1; i < s.curve.length; i++) d = Math.min(d, segDist(x, y, s.curve[i - 1][0] * W, s.curve[i - 1][1] * H, s.curve[i][0] * W, s.curve[i][1] * H));
      const r = (s.ridgeWidth / 100) * H;
      return Math.exp(-((d / r) ** 2));
    }
    case "perlin": return fbm(x / s.scale, y / s.scale, s.seed, s.octaves);
    case "ripple": {
      const r = Math.hypot(x - s.center[0] * W, y - s.center[1] * H), L = Math.max(W, H) / Math.max(0.5, s.waves * 2);
      return 0.5 + 0.5 * Math.cos((2 * Math.PI * r) / L) * Math.exp(-r / Math.max(W, H));
    }
    case "mountain": {
      // A ridge line wandering across the upper part; the land falls away below it, rugged.
      const ridge = 0.22 + 0.4 * fbm(x / s.scale, 0.37, s.seed, s.octaves);
      if (v < ridge) return 0.05 * fbm(x / s.scale, y / s.scale, s.seed + 9, 2);
      const fall = Math.exp(-((v - ridge) / 0.45));
      return clamp(fall * (0.55 + 0.45 * fbm(x / (s.scale * 0.5), y / (s.scale * 0.5), s.seed + 3, s.octaves, true)), 0, 1);
    }
    case "attractors": {
      let h = 0.5;
      const R = Math.max(10, s.scale);
      for (const p of s.points) h += 0.5 * p.s * Math.exp(-((Math.hypot(x - p.x * W, y - p.y * H) / R) ** 2));
      return clamp(h, 0, 1);
    }
    case "image": {
      if (!pic) return 0.5;
      const b = sampleDepth(pic, u * (pic.w - 1), v * (pic.h - 1));
      return s.invert ? b : 1 - b;
    }
  }
}

/** The relief grid: heights over the piece, and which cells it covers (the organic edge's border). */
export function patternGrid(s: PatternSource, file?: ArrayBuffer): ReliefGrid {
  if (s.pattern === "image" && !file) throw new Error("The picture's brightness map is missing. Load the picture again.");
  const pic = s.pattern === "image" ? unpackDepth(file!) : undefined;
  const res = Math.max(16, Math.min(256, Math.round(s.resolution)));
  const landscape = s.width >= s.height;
  const nx = landscape ? res : Math.max(4, Math.round((res * s.width) / s.height)), ny = landscape ? Math.max(4, Math.round((res * s.height) / s.width)) : res;
  const cell = s.width / nx, x0 = -s.width / 2, y0 = (ny * cell) / 2;
  const a = s.amplitude / 100;
  const heightOf = (h: number) => Math.max(0.5, s.base + s.depth * (1 - a + a * h));
  const heights = new Float32Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const u = i / nx, v = j / ny;
    let h = patternValue(s, u, v, pic);
    if (s.style === "shelf") for (const sh of s.shelves) if (u >= sh.x0 && u <= sh.x1 && Math.abs(v - sh.y) <= sh.h / 2) h = sh.level;
    heights[j * (nx + 1) + i] = heightOf(h);
  }
  const inside = new Uint8Array(nx * ny).fill(1);
  if (s.style === "organic" && s.edge > 0) {
    // Each column keeps the cells between a top and a bottom border that rise and fall with the wave.
    const e = s.edge / 100;
    for (let i = 0; i < nx; i++) {
      const u = (i + 0.5) / nx;
      const top = e * (1 - patternValue(s, u, 0.08, pic)), bottom = 1 - e * (1 - patternValue(s, u, 0.92, pic));
      for (let j = 0; j < ny; j++) { const v = (j + 0.5) / ny; if (v < top || v > bottom) inside[j * nx + i] = 0; }
    }
    removePinches(inside, nx, ny);
  }
  return { nx, ny, cell, heights, inside, x0, y0, heightOf, toImage: (x, y) => [(x - x0) / (nx * cell), (y0 - y) / (ny * cell)] };
}

export const patternMesh = (s: PatternSource, file?: ArrayBuffer): MeshData => reliefMesh(patternGrid(s, file));

/**
 * A picture's brightness as a map for the "image" pattern (0 black .. 1 white), from RGBA pixels,
 * shrunk so its long side is at most `long` px.
 */
export function brightnessMap(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, long = 256): DepthMap {
  const k = Math.min(1, long / Math.max(w, h)), W = Math.max(2, Math.round(w * k)), H = Math.max(2, Math.round(h * k));
  const data = new Float32Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const px = Math.min(w - 1, Math.floor((i + 0.5) / k)), py = Math.min(h - 1, Math.floor((j + 0.5) / k)), o = (py * w + px) * 4;
    data[j * W + i] = (0.2126 * rgba[o] + 0.7152 * rgba[o + 1] + 0.0722 * rgba[o + 2]) / 255;
  }
  return { w: W, h: H, data };
}
