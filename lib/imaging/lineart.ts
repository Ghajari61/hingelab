/**
 * Photo to line art, cartoon and portrait outline. Lines come from a difference of Gaussians (the dark
 * side of every edge at the chosen scale), cleaned of specks and grown to the chosen line width.
 */
import { removeSpeckles, quantize, type Bitmap } from "@/lib/studio/trace/raster";
import { gaussian, greyOf, makeImg, type Img } from "./image";
import { dilate } from "./morph";

export interface LineArtOptions {
  /** 0 (only strong outlines) to 1 (every small edge). */
  detail: number;
  /** Line width, pixels (1–6). */
  thickness: number;
  /** Scale of the features drawn, pixels (blur before the edges are found). */
  scale: number;
  /** Specks smaller than this many pixels are dropped. */
  clean: number;
}

export const LINE_ART_DEFAULTS: LineArtOptions = { detail: 0.5, thickness: 2, scale: 1.5, clean: 24 };
/** Portraits: larger features, fewer specks, so faces become a few clean outlines. */
export const PORTRAIT_DEFAULTS: LineArtOptions = { detail: 0.35, thickness: 2.5, scale: 2.6, clean: 60 };

export function lineArt(img: Img, raw: Partial<LineArtOptions> = {}): Bitmap {
  const o = { ...LINE_ART_DEFAULTS, ...raw };
  const { width: w, height: h } = img, g = greyOf(img);
  const s = Math.max(0.5, o.scale);
  const a = gaussian(g, w, h, s), b = gaussian(g, w, h, s * 1.6);
  // Edge strength scale: the DoG of a full black-to-white step is about 0.2 × 255 at these sigmas.
  const t = 2 + (1 - Math.min(1, Math.max(0, o.detail))) * 30;
  const bits = new Uint8Array(w * h);
  for (let i = 0; i < bits.length; i++) bits[i] = b[i] - a[i] > t ? 1 : 0;
  const clean = removeSpeckles({ width: w, height: h, bits }, Math.max(0, Math.round(o.clean)));
  return o.thickness > 1.2 ? dilate(clean, (o.thickness - 1) / 2) : clean;
}

export interface CartoonOptions extends LineArtOptions {
  /** Flat colour levels (2–8). */
  levels: number;
  /** Draw black outlines over the flat colours. */
  outlines: boolean;
}

export const CARTOON_DEFAULTS: CartoonOptions = { ...LINE_ART_DEFAULTS, detail: 0.4, scale: 2, levels: 5, outlines: true };

/** Flat colours (k-means on a smoothed copy) with black outlines on top. */
export function cartoon(img: Img, raw: Partial<CartoonOptions> = {}): Img {
  const o = { ...CARTOON_DEFAULTS, ...raw };
  const { width: w, height: h } = img;
  const smooth = makeImg(w, h);
  for (let c = 0; c < 4; c++) {
    const p = new Float32Array(w * h);
    for (let i = 0; i < p.length; i++) p[i] = img.data[i * 4 + c];
    const q = c === 3 ? p : gaussian(p, w, h, 1.2);
    for (let i = 0; i < p.length; i++) smooth.data[i * 4 + c] = q[i];
  }
  const { palette, labels } = quantize(smooth, Math.max(2, Math.min(8, Math.round(o.levels))));
  const out = makeImg(w, h, [255, 255, 255, 0]);
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] < 0) continue;
    const c = palette[labels[i]];
    out.data[i * 4] = c[0]; out.data[i * 4 + 1] = c[1]; out.data[i * 4 + 2] = c[2]; out.data[i * 4 + 3] = 255;
  }
  if (o.outlines) {
    const lines = lineArt(img, o);
    for (let i = 0; i < lines.bits.length; i++) if (lines.bits[i]) { out.data[i * 4] = 0; out.data[i * 4 + 1] = 0; out.data[i * 4 + 2] = 0; out.data[i * 4 + 3] = 255; }
  }
  return out;
}
