/**
 * How a photo is printed or engraved on a Shadow Box's back board: in colour, in grey, in a few flat
 * grey tones (posterised) or as engraving dots, after brightness and contrast and with the background
 * optionally removed (made white). Pure functions on RGBA images, run in the photo worker and in tests.
 */
import type { Bitmap } from "@/lib/studio/trace/raster";
import { backgroundMask } from "./cutout";
import { dither } from "./dither";
import type { Img } from "./image";
import type { PhotoSpec, Subject } from "./photoSpec";

export type LookResult =
  | { kind: "rgba"; img: Img }
  | { kind: "grey"; width: number; height: number; grey: Uint8Array }
  | { kind: "bits"; bitmap: Bitmap };

/** Brightness and contrast on 0–255: contrast pivots around mid-grey, brightness shifts by up to half the range. */
export function toneOf(bright: number, contrast: number): Uint8Array {
  const k = Math.max(0, (100 + contrast) / 100), b = (bright / 100) * 128, lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) lut[v] = Math.max(0, Math.min(255, Math.round((v - 128) * k + 128 + b)));
  return lut;
}

/** Pixels joined to the border and close to its colour turn white; returns the background mask. */
export function whiteBackground(img: Img, tol: number): Uint8Array {
  const mask = backgroundMask(img, tol), d = img.data;
  for (let i = 0; i < mask.length; i++) if (mask[i]) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = d[i * 4 + 3] = 255; }
  return mask;
}

/** The photo in the chosen look; `img` is changed in place (background and tone). */
export function applyLook(img: Img, s: PhotoSpec): LookResult {
  const { width: w, height: h, data: d } = img;
  if (s.bg) whiteBackground(img, s.tol);
  const lut = toneOf(s.bright, s.contrast);
  for (let i = 0; i < d.length; i += 4) {
    // Transparent parts print as white paper.
    const a = d[i + 3] / 255;
    for (let c = 0; c < 3; c++) d[i + c] = lut[Math.round(d[i + c] * a + 255 * (1 - a))];
    d[i + 3] = 255;
  }
  if (s.look === "colour") return { kind: "rgba", img };
  const grey = new Uint8Array(w * h);
  for (let i = 0; i < grey.length; i++) grey[i] = Math.round(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
  if (s.look === "grey") return { kind: "grey", width: w, height: h, grey };
  if (s.look === "poster") {
    const n = Math.max(2, Math.min(8, Math.round(s.tones)));
    for (let i = 0; i < grey.length; i++) grey[i] = Math.round((Math.min(n - 1, Math.floor((grey[i] / 256) * n)) * 255) / (n - 1));
    return { kind: "grey", width: w, height: h, grey };
  }
  return { kind: "bits", bitmap: dither(grey, w, h, { algo: s.dither }) };
}

/**
 * The main subject of a photo on a plain background: what is left after removing the background, as
 * its centre and height. Null when there is no clear subject (the background is busy, or nothing goes).
 */
export function subjectOf(img: Img, tol: number): Subject | null {
  const mask = backgroundMask(img, tol), { width: w, height: h } = img;
  let n = 0, sx = 0, sy = 0, y0 = h, y1 = -1, x0 = w, x1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (mask[y * w + x]) continue;
    n++; sx += x; sy += y;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
  }
  const share = n / (w * h);
  if (share < 0.03 || share > 0.92) return null;
  // What is left reaches every edge: the photo is busy, not a subject on a background.
  if (x1 - x0 + 1 >= 0.96 * w && y1 - y0 + 1 >= 0.96 * h) return null;
  return { u: (sx / n + 0.5) / w, v: (sy / n + 0.5) / h, h: (y1 - y0 + 1) / h, face: false };
}
