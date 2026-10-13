/**
 * Auto vectorize for cutting: image → clean bitmap → outlines in millimetres. On top of Trace Bitmap's
 * tracer it removes parts thinner than the smallest feature the laser can keep, can thicken the ink,
 * and bridges loose pieces or stencil pockets so nothing falls out.
 */
import type { Subpath } from "@/lib/studio/types";
import { edgeBitmap, removeSpeckles, thresholdBitmap, type Bitmap } from "@/lib/studio/trace/raster";
import { traceOutlines } from "@/lib/studio/trace/contours";
import { traceCenterlines } from "@/lib/studio/trace";
import { mapSubpaths } from "@/lib/studio/trace/place";
import type { Img } from "./image";
import { connectPieces, dilate, openBitmap } from "./morph";

export type VectorSource = "dark" | "light" | "edges";

export interface VectorizeOptions {
  /** What becomes ink: dark pixels, light pixels, or edges. */
  source: VectorSource;
  /** Brightness cut-off 0–1 (dark / light), edge strength (edges). */
  threshold: number;
  /** Outlines (areas to cut or fill) or centre-lines (single strokes to score). */
  lines: boolean;
  /** Width of the result on the material, mm. */
  widthMm: number;
  /** Parts thinner than this are removed, mm (0 = keep everything). */
  minFeatureMm: number;
  /** Grows the ink by this much before tracing, mm. */
  thickenMm: number;
  /** Pieces smaller than this area are dropped, mm². */
  minAreaMm2: number;
  /** Join loose pieces into one part ("islands") or keep stencil pockets attached ("holes"). */
  connect: "none" | "islands" | "holes";
  /** Bridge width, mm. */
  bridgeMm: number;
  /** Corner smoothing 0–1.3 and path optimisation (pixels), as in Trace Bitmap. */
  smooth: number;
  optimize: number;
}

export const VECTORIZE_DEFAULTS: VectorizeOptions = {
  source: "dark", threshold: 0.5, lines: false, widthMm: 100, minFeatureMm: 0, thickenMm: 0, minAreaMm2: 0.5,
  connect: "none", bridgeMm: 1.5, smooth: 1, optimize: 0.6,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function cleanVectorize(raw: Partial<VectorizeOptions>): VectorizeOptions {
  const d = VECTORIZE_DEFAULTS, n = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) ? v : def);
  return {
    source: raw.source === "light" || raw.source === "edges" ? raw.source : "dark",
    threshold: clamp(n(raw.threshold, d.threshold), 0.01, 0.99),
    lines: !!raw.lines,
    widthMm: clamp(n(raw.widthMm, d.widthMm), 5, 3000),
    minFeatureMm: clamp(n(raw.minFeatureMm, d.minFeatureMm), 0, 20),
    thickenMm: clamp(n(raw.thickenMm, d.thickenMm), 0, 10),
    minAreaMm2: clamp(n(raw.minAreaMm2, d.minAreaMm2), 0, 10_000),
    connect: raw.connect === "islands" || raw.connect === "holes" ? raw.connect : "none",
    bridgeMm: clamp(n(raw.bridgeMm, d.bridgeMm), 0.3, 20),
    smooth: clamp(n(raw.smooth, d.smooth), 0, 1.3),
    optimize: clamp(n(raw.optimize, d.optimize), 0, 5),
  };
}

export interface Vectorized {
  /** The cleaned bitmap that was traced (pixels). */
  bitmap: Bitmap;
  /** Pixels per mm on the material. */
  pxPerMm: number;
  widthMm: number;
  heightMm: number;
  /** Outlines (or centre-lines) in mm, origin at the top-left corner of the image. */
  subpaths: Subpath[];
  lines: boolean;
  bridges: number;
}

/** The ink bitmap of an image before cleanup. */
export function inkBitmap(img: Img, o: Pick<VectorizeOptions, "source" | "threshold">): Bitmap {
  return o.source === "edges" ? edgeBitmap(img, o.threshold) : thresholdBitmap(img, o.threshold, o.source === "light");
}

/** Speckles, thin parts, thickening and bridges on a bitmap whose pixels are 1 / pxPerMm wide. */
export function cleanBitmap(b: Bitmap, o: VectorizeOptions, pxPerMm: number): { bitmap: Bitmap; bridges: number } {
  let out = removeSpeckles(b, Math.round(o.minAreaMm2 * pxPerMm * pxPerMm));
  if (o.minFeatureMm > 0 && !o.lines) out = openBitmap(out, (o.minFeatureMm * pxPerMm) / 2);
  if (o.thickenMm > 0) out = dilate(out, o.thickenMm * pxPerMm);
  let bridges = 0;
  if (o.connect !== "none" && !o.lines) {
    const r = connectPieces(out, o.connect, Math.max(1, o.bridgeMm * pxPerMm));
    out = r.bitmap; bridges = r.bridges;
  }
  return { bitmap: out, bridges };
}

export function vectorizeBitmap(b: Bitmap, raw: Partial<VectorizeOptions>): Vectorized {
  const o = cleanVectorize(raw);
  const pxPerMm = b.width / o.widthMm;
  const { bitmap, bridges } = cleanBitmap(b, o, pxPerMm);
  const px = o.lines
    ? traceCenterlines(bitmap, { speckles: 0, smooth: o.smooth, optimize: Math.max(o.optimize, 0.01) })
    : traceOutlines(bitmap, { smooth: o.smooth, optimize: o.optimize });
  const k = 1 / pxPerMm;
  return {
    bitmap, pxPerMm, widthMm: o.widthMm, heightMm: b.height * k, lines: o.lines, bridges,
    subpaths: mapSubpaths(px, (p) => ({ x: p.x * k, y: p.y * k })),
  };
}

export const vectorize = (img: Img, raw: Partial<VectorizeOptions>): Vectorized => vectorizeBitmap(inkBitmap(img, cleanVectorize(raw)), raw);
