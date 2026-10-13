/**
 * Smart Adjust, Auto Enhance and Upscale: levels, gamma, saturation, noise and sharpness on RGBA
 * images, computed here (no model), so they are free and instant.
 */
import { gaussian, greyOf, planes, fromPlanes, resample, type Img } from "./image";

export interface AdjustOptions {
  /** Input levels: this brightness becomes black / white (0–255). */
  black: number;
  white: number;
  /** Mid-tone gamma: above 1 lightens, below 1 darkens. */
  gamma: number;
  /** −100 (grey) to 100 (double). */
  saturation: number;
  /** Unsharp mask amount 0–2. */
  sharpen: number;
  /** Smoothing radius before sharpening, pixels 0–3. */
  denoise: number;
}

export const ADJUST_NEUTRAL: AdjustOptions = { black: 0, white: 255, gamma: 1, saturation: 0, sharpen: 0, denoise: 0 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function cleanAdjust(o: Partial<AdjustOptions>): AdjustOptions {
  const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const black = clamp(n(o.black, 0), 0, 254), white = clamp(n(o.white, 255), black + 1, 255);
  return {
    black, white, gamma: clamp(n(o.gamma, 1), 0.2, 4), saturation: clamp(n(o.saturation, 0), -100, 100),
    sharpen: clamp(n(o.sharpen, 0), 0, 2), denoise: clamp(n(o.denoise, 0), 0, 3),
  };
}

/** Brightness at the given fraction (0–1) of the opaque pixels. */
function percentile(img: Img, q: number[]): number[] {
  const hist = new Uint32Array(256), g = greyOf(img);
  let n = 0;
  for (let i = 0; i < g.length; i++) if (img.data[i * 4 + 3] > 127) { hist[Math.round(g[i])]++; n++; }
  if (!n) return q.map((x) => x * 255);
  return q.map((x) => {
    const target = x * n;
    let acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= target) return v; }
    return 255;
  });
}

/**
 * Smart Adjust: stretches the darkest and lightest 0.5 % to black and white, then picks the gamma
 * that puts the median at mid-grey (limited, so a dark night photo stays dark-ish).
 */
export function autoAdjust(img: Img): AdjustOptions {
  const [lo, mid, hi] = percentile(img, [0.005, 0.5, 0.995]);
  const black = clamp(lo, 0, 200), white = clamp(Math.max(hi, black + 16), black + 1, 255);
  const m = clamp((mid - black) / (white - black), 0.02, 0.98);
  const gamma = clamp(Math.log(0.5) / Math.log(m), 0.6, 1.8);
  return cleanAdjust({ black, white, gamma: Math.round(gamma * 100) / 100, saturation: 8, sharpen: 0.35, denoise: 0 });
}

export function adjust(img: Img, raw: Partial<AdjustOptions>): Img {
  const o = cleanAdjust(raw);
  const { width: w, height: h } = img;
  const lut = new Float32Array(256);
  for (let v = 0; v < 256; v++) lut[v] = 255 * Math.pow(clamp((v - o.black) / (o.white - o.black), 0, 1), 1 / o.gamma);
  let [r, g, b] = planes(img);
  const a = planes(img)[3];
  if (o.denoise > 0) { r = gaussian(r, w, h, o.denoise); g = gaussian(g, w, h, o.denoise); b = gaussian(b, w, h, o.denoise); }
  const sat = 1 + o.saturation / 100;
  for (let i = 0; i < w * h; i++) {
    let R = lut[clamp(Math.round(r[i]), 0, 255)], G = lut[clamp(Math.round(g[i]), 0, 255)], B = lut[clamp(Math.round(b[i]), 0, 255)];
    if (sat !== 1) { const y = 0.299 * R + 0.587 * G + 0.114 * B; R = y + (R - y) * sat; G = y + (G - y) * sat; B = y + (B - y) * sat; }
    r[i] = R; g[i] = G; b[i] = B;
  }
  if (o.sharpen > 0) [r, g, b] = [r, g, b].map((p) => unsharp(p, w, h, 1.2, o.sharpen)) as [Float32Array, Float32Array, Float32Array];
  return fromPlanes([r, g, b, a], w, h);
}

/** Unsharp mask on one plane: adds `amount` × (plane − blurred plane). */
export function unsharp(p: Float32Array, w: number, h: number, sigma: number, amount: number): Float32Array {
  const blur = gaussian(p, w, h, sigma), out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i++) out[i] = p[i] + amount * (p[i] - blur[i]);
  return out;
}

/** Auto Enhance: Smart Adjust's levels plus light noise removal and sharpening. */
export const enhance = (img: Img): Img => adjust(img, { ...autoAdjust(img), denoise: 0.6, sharpen: 0.6 });

/** Largest side an upscale may produce. */
export const MAX_UPSCALE_SIDE = 4096;

/** Upscale 2× or 4×: bicubic in 2× steps with a light sharpen after each, capped at MAX_UPSCALE_SIDE. */
export function upscale(img: Img, factor: 2 | 4): Img {
  let out = img;
  for (let k = factor; k > 1; k /= 2) {
    const s = Math.min(2, MAX_UPSCALE_SIDE / Math.max(out.width, out.height));
    if (s <= 1) break;
    out = resample(out, out.width * s, out.height * s);
    const [r, g, b, a] = planes(out);
    out = fromPlanes([unsharp(r, out.width, out.height, 1, 0.45), unsharp(g, out.width, out.height, 1, 0.45), unsharp(b, out.width, out.height, 1, 0.45), a], out.width, out.height);
  }
  return out;
}
