/**
 * RGBA images for the AI Studio's local tools. Pure functions on plain arrays (no DOM), so the same
 * code runs in the imaging worker and in tests. Transparent pixels count as white wherever brightness
 * is read, like the trace bitmaps.
 */
import type { Bitmap } from "@/lib/studio/trace/raster";

export interface Img { width: number; height: number; data: Uint8ClampedArray }

export const makeImg = (width: number, height: number, rgba: [number, number, number, number] = [255, 255, 255, 255]): Img => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = rgba[0]; data[i + 1] = rgba[1]; data[i + 2] = rgba[2]; data[i + 3] = rgba[3]; }
  return { width, height, data };
};

export const cloneImg = (img: Img): Img => ({ width: img.width, height: img.height, data: img.data.slice() });

/** Brightness 0–255 per pixel (Rec. 601), composited over white. */
export function greyOf(img: Img): Float32Array {
  const n = img.width * img.height, out = new Float32Array(n), d = img.data;
  for (let i = 0; i < n; i++) {
    const a = d[i * 4 + 3] / 255;
    out[i] = a * (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) + (1 - a) * 255;
  }
  return out;
}

/** A grey image (0–255) as an opaque RGBA image. */
export function imgFromGrey(g: ArrayLike<number>, width: number, height: number): Img {
  const img = makeImg(width, height);
  for (let i = 0; i < width * height; i++) { const v = g[i]; img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; }
  return img;
}

/** A bitmap as black ink on white (or on transparent when `clear`). */
export function imgFromBits(b: Bitmap, clear = false): Img {
  const img = makeImg(b.width, b.height, clear ? [0, 0, 0, 0] : [255, 255, 255, 255]);
  for (let i = 0; i < b.bits.length; i++) if (b.bits[i]) { img.data[i * 4] = 0; img.data[i * 4 + 1] = 0; img.data[i * 4 + 2] = 0; img.data[i * 4 + 3] = 255; }
  return img;
}

/** Keys cubic (a = −0.5, Catmull-Rom) weights. */
function cubic(t: number): number {
  const x = Math.abs(t);
  if (x <= 1) return 1.5 * x ** 3 - 2.5 * x ** 2 + 1;
  if (x < 2) return -0.5 * x ** 3 + 2.5 * x ** 2 - 4 * x + 2;
  return 0;
}

/**
 * Resamples one axis. Shrinking widens the kernel by the scale (so it averages like a box filter);
 * enlarging uses the plain bicubic kernel. Colour is premultiplied by alpha while filtering.
 */
function resampleAxis(src: Float32Array, sw: number, sh: number, dw: number, horizontal: boolean): Float32Array {
  const len = horizontal ? sw : sh, out = horizontal ? new Float32Array(dw * sh * 4) : new Float32Array(sw * dw * 4);
  const scale = dw / len, support = scale < 1 ? 2 / scale : 2, k = scale < 1 ? scale : 1;
  const lines = horizontal ? sh : sw;
  for (let o = 0; o < dw; o++) {
    const centre = (o + 0.5) / scale - 0.5;
    const lo = Math.max(0, Math.floor(centre - support + 1)), hi = Math.min(len - 1, Math.ceil(centre + support - 1));
    const ws: number[] = [];
    let sum = 0;
    for (let j = lo; j <= hi; j++) { const w = cubic((j - centre) * k); ws.push(w); sum += w; }
    for (let line = 0; line < lines; line++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = lo; j <= hi; j++) {
        const w = ws[j - lo] / (sum || 1);
        const si = (horizontal ? line * sw + j : j * sw + line) * 4;
        r += src[si] * w; g += src[si + 1] * w; b += src[si + 2] * w; a += src[si + 3] * w;
      }
      const di = (horizontal ? line * dw + o : o * sw + line) * 4;
      out[di] = r; out[di + 1] = g; out[di + 2] = b; out[di + 3] = a;
    }
  }
  return out;
}

/** Bicubic resize to width × height. */
export function resample(img: Img, width: number, height: number): Img {
  width = Math.max(1, Math.round(width)); height = Math.max(1, Math.round(height));
  if (width === img.width && height === img.height) return cloneImg(img);
  const pre = new Float32Array(img.data.length);
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3] / 255;
    pre[i] = img.data[i] * a; pre[i + 1] = img.data[i + 1] * a; pre[i + 2] = img.data[i + 2] * a; pre[i + 3] = img.data[i + 3];
  }
  const h = resampleAxis(pre, img.width, img.height, width, true);
  const v = resampleAxis(h, width, img.height, height, false);
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < out.length; i += 4) {
    const a = Math.max(0, Math.min(255, v[i + 3])), k = a > 0.5 ? 255 / a : 0;
    out[i] = v[i] * k; out[i + 1] = v[i + 1] * k; out[i + 2] = v[i + 2] * k; out[i + 3] = a;
  }
  return { width, height, data: out };
}

/** Scales so the longer side is at most `max` pixels (never enlarges). */
export const fitWithin = (img: Img, max: number): Img => {
  const k = Math.min(1, max / Math.max(img.width, img.height));
  return k >= 1 ? img : resample(img, img.width * k, img.height * k);
};

/** Box blur of one channel plane, radius r (separable, edge pixels repeat). */
export function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return src.slice();
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / n;
      acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / n;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/** Approximate Gaussian blur (three box passes). */
export function gaussian(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma < 0.3) return src.slice();
  const r = Math.max(1, Math.round((Math.sqrt((12 * sigma * sigma) / 3 + 1) - 1) / 2));
  return boxBlur(boxBlur(boxBlur(src, w, h, r), w, h, r), w, h, r);
}

/** Splits an image into R, G, B and A planes. */
export function planes(img: Img): [Float32Array, Float32Array, Float32Array, Float32Array] {
  const n = img.width * img.height;
  const p: [Float32Array, Float32Array, Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) for (let c = 0; c < 4; c++) p[c][i] = img.data[i * 4 + c];
  return p;
}

export function fromPlanes(p: Float32Array[], width: number, height: number): Img {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) for (let c = 0; c < 4; c++) data[i * 4 + c] = p[c][i];
  return { width, height, data };
}

/** Adds a border of transparent pixels (Creative Expand: the model fills it). */
export function pad(img: Img, m: { left: number; top: number; right: number; bottom: number }): Img {
  const l = Math.max(0, Math.round(m.left)), t = Math.max(0, Math.round(m.top));
  const width = img.width + l + Math.max(0, Math.round(m.right)), height = img.height + t + Math.max(0, Math.round(m.bottom));
  const out = makeImg(width, height, [0, 0, 0, 0]);
  for (let y = 0; y < img.height; y++) out.data.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), ((y + t) * width + l) * 4);
  return out;
}
