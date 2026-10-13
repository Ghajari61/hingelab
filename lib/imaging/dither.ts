/**
 * Photo to engraving: grey levels to burn / no-burn dots. Error diffusion (Floyd–Steinberg, Jarvis–
 * Judice–Ninke, Stucki, Atkinson), ordered (8 × 8 Bayer), rotated halftone dots and a plain threshold,
 * written from the published kernels. Material presets set the resolution and tone curve.
 */
import type { Bitmap } from "@/lib/studio/trace/raster";
import { greyOf, resample, type Img } from "./image";

export type DitherAlgo = "threshold" | "floyd" | "jarvis" | "stucki" | "atkinson" | "ordered" | "halftone";

export const DITHER_ALGOS: { id: DitherAlgo; name: string; note: string }[] = [
  { id: "floyd", name: "Floyd–Steinberg", note: "Fine, even grain; a good default." },
  { id: "jarvis", name: "Jarvis", note: "Spreads error wider: smoother tones, softer detail." },
  { id: "stucki", name: "Stucki", note: "Like Jarvis with crisper edges." },
  { id: "atkinson", name: "Atkinson", note: "High contrast; light and dark areas go clean." },
  { id: "ordered", name: "Ordered", note: "Regular cross-hatch pattern; engraves fast and evenly." },
  { id: "halftone", name: "Halftone", note: "Round dots on a slanted grid, like print." },
  { id: "threshold", name: "Threshold", note: "Only black and white: logos and line art." },
];

export interface DitherOptions {
  algo: DitherAlgo;
  /** Cut-off for threshold, and the mid-point for the others (0–1). */
  threshold: number;
  /** Burn the light parts instead of the dark ones. */
  invert: boolean;
  /** Error diffusion runs alternate rows right to left (fewer worm patterns). */
  serpentine: boolean;
  /** Halftone cell size, pixels. */
  cell: number;
  /** Halftone screen angle, degrees. */
  angle: number;
}

export const DITHER_DEFAULTS: DitherOptions = { algo: "floyd", threshold: 0.5, invert: false, serpentine: true, cell: 6, angle: 45 };

type Kernel = { div: number; taps: [number, number, number][] };
/** Error kernels: [dx, dy, weight], weights over `div` (Atkinson passes on only 6/8 of the error). */
const KERNELS: Record<"floyd" | "jarvis" | "stucki" | "atkinson", Kernel> = {
  floyd: { div: 16, taps: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]] },
  jarvis: { div: 48, taps: [[1, 0, 7], [2, 0, 5], [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3], [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1]] },
  stucki: { div: 42, taps: [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2], [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1]] },
  atkinson: { div: 8, taps: [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]] },
};

/** 8 × 8 Bayer matrix, values 0–63. */
const BAYER8 = (() => {
  const m = [[0]];
  let size = 1;
  while (size < 8) {
    const n: number[][] = Array.from({ length: size * 2 }, () => new Array(size * 2).fill(0));
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const v = m[y][x] * 4;
      n[y][x] = v; n[y][x + size] = v + 2; n[y + size][x] = v + 3; n[y + size][x + size] = v + 1;
    }
    m.splice(0, m.length, ...n);
    size *= 2;
  }
  return m;
})();

/**
 * Grey (0–255, 255 = white) to a bitmap where 1 = burn. Darkness drives the dot density, so a 25 %
 * grey burns about a quarter of its pixels.
 */
export function dither(grey: ArrayLike<number>, width: number, height: number, raw: Partial<DitherOptions> = {}): Bitmap {
  const o = { ...DITHER_DEFAULTS, ...raw };
  const n = width * height, bits = new Uint8Array(n);
  // Work in "ink" 0–1: 1 = fully dark (burn). Invert swaps which tones burn.
  const ink = new Float32Array(n);
  for (let i = 0; i < n; i++) { const v = 1 - grey[i] / 255; ink[i] = o.invert ? 1 - v : v; }
  const t = 1 - Math.min(0.99, Math.max(0.01, o.threshold));
  if (o.algo === "threshold") {
    for (let i = 0; i < n; i++) bits[i] = ink[i] >= t ? 1 : 0;
  } else if (o.algo === "ordered") {
    const bias = t - 0.5;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      bits[i] = ink[i] - bias > (BAYER8[y & 7][x & 7] + 0.5) / 64 ? 1 : 0;
    }
  } else if (o.algo === "halftone") {
    halftone(ink, width, height, o, bits, t - 0.5);
  } else {
    const k = KERNELS[o.algo];
    const buf = ink;
    for (let y = 0; y < height; y++) {
      const rtl = o.serpentine && y % 2 === 1;
      for (let s = 0; s < width; s++) {
        const x = rtl ? width - 1 - s : s, i = y * width + x;
        const old = buf[i], on = old >= t ? 1 : 0;
        bits[i] = on;
        const err = old - on;
        if (!err) continue;
        for (const [dx, dy, w] of k.taps) {
          const nx = x + (rtl ? -dx : dx), ny = y + dy;
          if (nx < 0 || nx >= width || ny >= height) continue;
          buf[ny * width + nx] += (err * w) / k.div;
        }
      }
    }
  }
  return { width, height, bits };
}

/**
 * Round dots on a grid turned by `angle`. Each cell burns as many of its pixels as its average
 * darkness asks for, nearest the cell's centre first: a round dot that grows until neighbouring dots
 * merge, with exactly the right amount of ink.
 */
function halftone(ink: Float32Array, w: number, h: number, o: DitherOptions, bits: Uint8Array, bias: number) {
  const cell = Math.max(2, o.cell), a = (o.angle * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const cells = new Map<string, { sum: number; px: { i: number; d: number }[] }>();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = ((x + 0.5) * c + (y + 0.5) * s) / cell, v = (-(x + 0.5) * s + (y + 0.5) * c) / cell;
    const cu = Math.floor(u), cv = Math.floor(v), k = `${cu},${cv}`, i = y * w + x;
    const d = Math.hypot(u - cu - 0.5, v - cv - 0.5);
    const e = cells.get(k);
    if (e) { e.sum += ink[i]; e.px.push({ i, d }); } else cells.set(k, { sum: ink[i], px: [{ i, d }] });
  }
  for (const e of cells.values()) {
    const dark = Math.min(1, Math.max(0, e.sum / e.px.length - bias));
    const n = Math.round(dark * e.px.length);
    if (!n) continue;
    e.px.sort((p, q) => p.d - q.d);
    for (let k = 0; k < n; k++) bits[e.px[k].i] = 1;
  }
}

export type EngraveMaterialId = "wood" | "acrylic" | "leather" | "slate" | "anodized";

export interface EngraveMaterial {
  id: EngraveMaterialId;
  name: string;
  algo: DitherAlgo;
  /** Dots per inch on the material (the line interval is 25.4 / dpi mm). */
  dpi: number;
  /** Tone curve before dithering: gamma above 1 lightens mid-tones (for materials that burn dark fast). */
  gamma: number;
  /** −50 to 50. */
  contrast: number;
  /** The mark is lighter than the material (acrylic, slate, anodised metal): burn the light parts. */
  invert: boolean;
  /** Matching entry of the Studio material library, for power and speed. */
  library?: string;
  note: string;
}

export const ENGRAVE_MATERIALS: EngraveMaterial[] = [
  { id: "wood", name: "Wood / plywood", algo: "jarvis", dpi: 254, gamma: 1.35, contrast: 10, invert: false, library: "birch3", note: "Wood darkens quickly, so mid-tones are lightened. Mask the surface to avoid smoke stains." },
  { id: "acrylic", name: "Cast acrylic", algo: "floyd", dpi: 300, gamma: 1, contrast: 15, invert: true, library: "acr3", note: "Engraved acrylic turns frosted white, so the image is inverted. Mirror it to engrave the back." },
  { id: "leather", name: "Leather", algo: "stucki", dpi: 254, gamma: 1.25, contrast: 5, invert: false, library: "leather2", note: "Veg-tan only. Low power: leather scorches fast." },
  { id: "slate", name: "Slate / stone", algo: "atkinson", dpi: 254, gamma: 1, contrast: 20, invert: true, note: "Slate marks light grey, so the image is inverted. Wipe the dust off after engraving." },
  { id: "anodized", name: "Anodised aluminium", algo: "floyd", dpi: 318, gamma: 1, contrast: 10, invert: true, library: "anod-al", note: "The laser removes the colour and leaves bright metal, so the image is inverted." },
];

export const engraveMaterial = (id: string) => ENGRAVE_MATERIALS.find((m) => m.id === id) ?? ENGRAVE_MATERIALS[0];

/** Largest engraving raster, pixels on the long side. */
export const MAX_ENGRAVE_SIDE = 3000;

export interface EngraveOptions {
  material: EngraveMaterialId;
  /** Width of the engraving on the material, mm. */
  widthMm: number;
  algo?: DitherAlgo;
  dpi?: number;
  gamma?: number;
  contrast?: number;
  invert?: boolean;
  threshold?: number;
}

/** Tone curve: contrast around mid-grey, then gamma (works on 0–255 grey). */
export function toneCurve(g: Float32Array, gamma: number, contrast: number): Float32Array {
  const k = (100 + contrast) / 100, out = new Float32Array(g.length);
  for (let i = 0; i < g.length; i++) {
    const v = Math.min(1, Math.max(0, ((g[i] / 255 - 0.5) * k) + 0.5));
    out[i] = 255 * Math.pow(v, 1 / gamma);
  }
  return out;
}

/** The photo at the material's resolution, toned and dithered: 1 = burn. Also returns the resolution used. */
export function engrave(img: Img, o: EngraveOptions): { bitmap: Bitmap; dpi: number; material: EngraveMaterial } {
  const m = engraveMaterial(o.material);
  const dpi = o.dpi ?? m.dpi;
  let w = Math.max(8, Math.round((o.widthMm / 25.4) * dpi));
  let h = Math.max(8, Math.round((w * img.height) / img.width));
  const k = Math.min(1, MAX_ENGRAVE_SIDE / Math.max(w, h));
  w = Math.round(w * k); h = Math.round(h * k);
  const g = toneCurve(greyOf(resample(img, w, h)), o.gamma ?? m.gamma, o.contrast ?? m.contrast);
  const bitmap = dither(g, w, h, { algo: o.algo ?? m.algo, invert: o.invert ?? m.invert, threshold: o.threshold ?? 0.5 });
  return { bitmap, dpi: dpi * k, material: m };
}
