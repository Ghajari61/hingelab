/**
 * Bitmaps for tracing: RGBA rasters in, one-bit masks out. Pure functions on ImageData-like
 * objects (no DOM), so they run in tests and in the trace worker. Transparent pixels count as white.
 */

/** RGBA pixels, 4 bytes per pixel, row by row (ImageData-like). */
export interface Raster { width: number; height: number; data: ArrayLike<number> }

/** 1 = ink (traced), 0 = background. */
export interface Bitmap { width: number; height: number; bits: Uint8Array }

export const emptyBitmap = (width: number, height: number): Bitmap => ({ width, height, bits: new Uint8Array(width * height) });

/** Perceived brightness 0–255 per pixel (Rec. 601 weights), composited over white. */
export function luminance(r: Raster): Float32Array {
  const n = r.width * r.height, out = new Float32Array(n), d = r.data;
  for (let i = 0; i < n; i++) {
    const a = d[i * 4 + 3] / 255;
    const l = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    out[i] = a * l + (1 - a) * 255;
  }
  return out;
}

/** Ink where brightness is below `cut` (0–1); `invert` traces the light parts instead. */
export function thresholdBitmap(r: Raster, cut: number, invert = false): Bitmap {
  const lum = luminance(r), b = emptyBitmap(r.width, r.height), t = cut * 255;
  for (let i = 0; i < lum.length; i++) b.bits[i] = (lum[i] < t) !== invert ? 1 : 0;
  return b;
}

/** Ink where brightness is in [lo, hi) (0–255). */
export function bandBitmap(lum: Float32Array, width: number, height: number, lo: number, hi: number): Bitmap {
  const b = emptyBitmap(width, height);
  for (let i = 0; i < lum.length; i++) b.bits[i] = lum[i] >= lo && lum[i] < hi ? 1 : 0;
  return b;
}

/**
 * Edge detection: Sobel gradient magnitude of the brightness, normalised so a full black-to-white
 * step reads 1, with ink where it reaches `cut` (0–1). Border pixels repeat the edge row.
 */
export function edgeBitmap(r: Raster, cut: number): Bitmap {
  const { width: w, height: h } = r, lum = luminance(r), b = emptyBitmap(w, h);
  const at = (x: number, y: number) => lum[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  const t = cut * 4 * 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
    const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
    b.bits[y * w + x] = Math.hypot(gx, gy) >= t && t > 0 ? 1 : 0;
  }
  return b;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rgb = [number, number, number];
export const rgbHex = (c: Rgb) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const lumOf = (c: Rgb) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

/**
 * Colour quantisation: k-means on RGB (k-means++ start, seeded, run on at most ~20 000 sampled
 * pixels) to `n` colours. Images with `n` colours or fewer keep their exact colours. The palette is
 * sorted dark to light; `labels` gives each pixel's palette index, −1 for transparent pixels.
 */
export function quantize(r: Raster, n: number, seed = 1): { palette: Rgb[]; labels: Int16Array } {
  const count = r.width * r.height, d = r.data;
  const k = Math.max(1, Math.min(64, Math.round(n)));
  const step = Math.max(1, Math.floor(count / 20000));
  const samples: Rgb[] = [];
  const exact = new Map<number, Rgb>();
  for (let i = 0; i < count; i += step) {
    if (d[i * 4 + 3] < 128) continue;
    const c: Rgb = [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]];
    samples.push(c);
    if (exact.size <= k) exact.set((c[0] << 16) | (c[1] << 8) | c[2], c);
  }
  let palette: Rgb[];
  if (exact.size <= k) palette = [...exact.values()];
  else {
    const rnd = mulberry32(seed);
    const d2 = (a: Rgb, b: Rgb) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    palette = [samples[Math.floor(rnd() * samples.length)].slice() as Rgb];
    const best = samples.map((s) => d2(s, palette[0]));
    while (palette.length < k) {
      const total = best.reduce((a, v) => a + v, 0);
      let pick = rnd() * total, idx = 0;
      for (; idx < best.length - 1 && pick > best[idx]; idx++) pick -= best[idx];
      const c = samples[idx].slice() as Rgb;
      palette.push(c);
      for (let i = 0; i < samples.length; i++) best[i] = Math.min(best[i], d2(samples[i], c));
    }
    for (let it = 0; it < 12; it++) {
      const sum = palette.map(() => [0, 0, 0, 0]);
      for (const s of samples) {
        let bi = 0, bd = Infinity;
        for (let j = 0; j < palette.length; j++) { const v = d2(s, palette[j]); if (v < bd) { bd = v; bi = j; } }
        const a = sum[bi]; a[0] += s[0]; a[1] += s[1]; a[2] += s[2]; a[3]++;
      }
      let moved = false;
      palette = palette.map((p, j) => {
        const a = sum[j];
        if (!a[3]) return p;
        const q: Rgb = [a[0] / a[3], a[1] / a[3], a[2] / a[3]];
        if (d2(p, q) > 0.25) moved = true;
        return q;
      });
      if (!moved) break;
    }
  }
  palette.sort((a, b) => lumOf(a) - lumOf(b));
  const labels = new Int16Array(count);
  for (let i = 0; i < count; i++) {
    if (d[i * 4 + 3] < 128) { labels[i] = -1; continue; }
    let bi = 0, bd = Infinity;
    for (let j = 0; j < palette.length; j++) {
      const v = (d[i * 4] - palette[j][0]) ** 2 + (d[i * 4 + 1] - palette[j][1]) ** 2 + (d[i * 4 + 2] - palette[j][2]) ** 2;
      if (v < bd) { bd = v; bi = j; }
    }
    labels[i] = bi;
  }
  return { palette, labels };
}

/** Ink where the label is in `which`. */
export function labelBitmap(labels: Int16Array, width: number, height: number, which: (label: number) => boolean): Bitmap {
  const b = emptyBitmap(width, height);
  for (let i = 0; i < labels.length; i++) b.bits[i] = labels[i] >= 0 && which(labels[i]) ? 1 : 0;
  return b;
}

/**
 * Speckle removal: ink blobs (8-connected, matching how contours join diagonal pixels) smaller than
 * `minArea` pixels are cleared, and enclosed background holes (4-connected) smaller than it are filled.
 */
export function removeSpeckles(src: Bitmap, minArea: number): Bitmap {
  if (minArea <= 1) return src;
  const { width: w, height: h } = src, bits = src.bits.slice();
  const seen = new Uint8Array(w * h), stack: number[] = [], blob: number[] = [];
  for (const ink of [1, 0]) {
    seen.fill(0);
    for (let start = 0; start < w * h; start++) {
      if (seen[start] || bits[start] !== ink) continue;
      blob.length = 0; stack.push(start); seen[start] = 1;
      let border = false;
      while (stack.length) {
        const i = stack.pop()!, x = i % w, y = (i - x) / w;
        blob.push(i);
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dy) || (!ink && dx && dy)) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (!seen[j] && bits[j] === ink) { seen[j] = 1; stack.push(j); }
        }
      }
      if (blob.length < minArea && (ink || !border)) for (const i of blob) bits[i] = ink ? 0 : 1;
    }
  }
  return { width: w, height: h, bits };
}

export const inkCount = (b: Bitmap) => b.bits.reduce((a, v) => a + v, 0);
