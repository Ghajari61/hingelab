/**
 * Background removal without a model: the background is the colour around the image's border, and
 * every pixel connected to the border within `tolerance` of it becomes transparent. Works for product
 * shots and drawings on plain backgrounds; busy photos go through the AI cutout instead, whose result
 * (the subject on pure white) is keyed out here too.
 */
import { boxBlur, cloneImg, type Img } from "./image";

export interface CutoutOptions {
  /** 0–1: how far a colour may be from the background colour and still be removed. */
  tolerance: number;
  /** Soft edge width, pixels (0–4). */
  feather: number;
}

export const CUTOUT_DEFAULTS: CutoutOptions = { tolerance: 0.18, feather: 1 };

const MAX_DIST = Math.sqrt(3 * 255 * 255);

/** Median colour of the border pixels. */
export function borderColour(img: Img): [number, number, number] {
  const { width: w, height: h, data: d } = img, ch: number[][] = [[], [], []];
  const add = (x: number, y: number) => { const i = (y * w + x) * 4; if (d[i + 3] > 127) for (let c = 0; c < 3; c++) ch[c].push(d[i + c]); };
  for (let x = 0; x < w; x++) { add(x, 0); add(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { add(0, y); add(w - 1, y); }
  return ch.map((v) => { if (!v.length) return 255; v.sort((a, b) => a - b); return v[v.length >> 1]; }) as [number, number, number];
}

/** Flood fill from the border through pixels close to the background colour; returns 1 = background. */
export function backgroundMask(img: Img, tolerance: number, bg = borderColour(img)): Uint8Array {
  const { width: w, height: h, data: d } = img, mask = new Uint8Array(w * h), t = Math.max(0, Math.min(1, tolerance)) * MAX_DIST;
  const near = (i: number) => d[i * 4 + 3] < 16 || Math.hypot(d[i * 4] - bg[0], d[i * 4 + 1] - bg[1], d[i * 4 + 2] - bg[2]) <= t;
  const stack: number[] = [];
  const seed = (x: number, y: number) => { const i = y * w + x; if (!mask[i] && near(i)) { mask[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
  for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }
  while (stack.length) {
    const i = stack.pop()!, x = i % w, y = (i - x) / w;
    if (x > 0) seed(x - 1, y);
    if (x < w - 1) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y < h - 1) seed(x, y + 1);
  }
  return mask;
}

export function applyMask(img: Img, background: Uint8Array, feather: number): Img {
  const out = cloneImg(img), { width: w, height: h } = img;
  let keep: Float32Array = new Float32Array(w * h);
  for (let i = 0; i < keep.length; i++) keep[i] = background[i] ? 0 : 1;
  if (feather >= 1) keep = boxBlur(keep, w, h, Math.round(feather));
  for (let i = 0; i < keep.length; i++) out.data[i * 4 + 3] = Math.round(out.data[i * 4 + 3] * keep[i]);
  return out;
}

export function cutout(img: Img, raw: Partial<CutoutOptions> = {}): Img {
  const o = { ...CUTOUT_DEFAULTS, ...raw };
  return applyMask(img, backgroundMask(img, o.tolerance), o.feather);
}

/** Keys out a pure white background around the subject (the AI cutout's output). */
export const whiteToAlpha = (img: Img, tolerance = 0.1): Img => applyMask(img, backgroundMask(img, tolerance, [255, 255, 255]), 1);
