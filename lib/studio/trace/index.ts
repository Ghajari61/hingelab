/**
 * Trace Bitmap: RGBA raster → vector layers in pixel coordinates. Every mode is our own code
 * (threshold / Sobel / k-means bitmaps, contour loops, Zhang–Suen skeletons); no DOM, so the same
 * function runs in the editor's trace worker and in tests.
 */
import type { Subpath, Vec } from "../types";
import { centerlines } from "./centerline";
import { fitCurve, simplifyOpen, traceOutlines } from "./contours";
import { bandBitmap, edgeBitmap, labelBitmap, luminance, quantize, removeSpeckles, rgbHex, thresholdBitmap, type Bitmap, type Raster } from "./raster";

export type TraceMode = "brightness" | "edges" | "colors" | "scans" | "centerline";

export interface TraceOptions {
  mode: TraceMode;
  /** Brightness cut-off 0–1: darker pixels are traced (brightness, centre-line). */
  threshold: number;
  /** Edge strength 0–1 that counts as an edge. */
  edgeThreshold: number;
  /** Colour quantisation: number of colours. */
  colors: number;
  /** Multiple scans: number of scans and what they step through. */
  scans: number;
  scanBy: "brightness" | "colors";
  /** Stacked: each scan holds everything darker too (overlapping); separate: bands that don't overlap. */
  stack: boolean;
  /** Leave out the lightest colour / scan (usually the background). */
  skipBackground: boolean;
  /** Trace the light parts instead of the dark ones (brightness, scans by brightness, centre-line). */
  invert: boolean;
  /** Speckle removal: blobs and holes smaller than this many pixels are dropped. 0 = off. */
  speckles: number;
  /** Corner smoothing 0–1.3: 0 keeps every corner (polygons), higher values round more corners. */
  smooth: number;
  /** Path optimisation: largest distance (pixels) the simplified outline may move from the pixel edge. */
  optimize: number;
}

export const TRACE_DEFAULTS: TraceOptions = {
  mode: "brightness", threshold: 0.45, edgeThreshold: 0.25, colors: 4, scans: 4, scanBy: "brightness", stack: false,
  skipBackground: true, invert: false, speckles: 4, smooth: 1, optimize: 0.5,
};

export interface TraceLayer { name: string; color: string; subpaths: Subpath[] }

export interface TraceResult {
  width: number;
  height: number;
  layers: TraceLayer[];
  /** Centre-line output: open lines to engrave, not areas. */
  lines: boolean;
}

const outlines = (b: Bitmap, o: TraceOptions) => traceOutlines(removeSpeckles(b, o.speckles), { smooth: o.smooth, optimize: o.optimize });

const grey = (v: number) => { const c = Math.round(Math.max(0, Math.min(255, v))); return rgbHex([c, c, c]); };

/** Centre-lines of a bitmap as open (or closed ring) subpaths. */
export function traceCenterlines(b: Bitmap, o: Pick<TraceOptions, "speckles" | "smooth" | "optimize">): Subpath[] {
  const out: Subpath[] = [];
  for (const line of centerlines(removeSpeckles(b, o.speckles))) {
    if (line.length < 2) continue;
    const closed = line.length > 3 && line[0].x === line[line.length - 1].x && line[0].y === line[line.length - 1].y;
    const pts: Vec[] = simplifyOpen(closed ? line.slice(0, -1) : line, Math.max(o.optimize, 0.01));
    if (pts.length < 2) continue;
    out.push(fitCurve(pts, closed && pts.length > 2, o.smooth));
  }
  return out;
}

export function traceRaster(r: Raster, opts: Partial<TraceOptions> = {}): TraceResult {
  const o = { ...TRACE_DEFAULTS, ...opts };
  const { width, height } = r;
  const res: TraceResult = { width, height, layers: [], lines: o.mode === "centerline" };
  const push = (name: string, color: string, subpaths: Subpath[]) => { if (subpaths.length) res.layers.push({ name, color, subpaths }); };
  switch (o.mode) {
    case "brightness": push("Trace", "#000000", outlines(thresholdBitmap(r, o.threshold, o.invert), o)); break;
    case "edges": push("Edges", "#000000", outlines(edgeBitmap(r, o.edgeThreshold), o)); break;
    case "centerline": push("Centre-line", "#000000", traceCenterlines(thresholdBitmap(r, o.threshold, o.invert), o)); break;
    case "colors": case "scans": {
      const n = Math.max(2, Math.min(16, Math.round(o.mode === "colors" ? o.colors : o.scans)));
      const stack = o.mode === "scans" && o.stack;
      if (o.mode === "scans" && o.scanBy === "brightness") {
        // n scans step the cut-off evenly through the brightness range; scan 1 is the darkest.
        const lum = luminance(r);
        if (o.invert) for (let i = 0; i < lum.length; i++) lum[i] = 255 - lum[i];
        const count = o.skipBackground ? n + 1 : n;
        for (let k = 0; k < n; k++) {
          const lo = stack ? -1 : (k * 255) / count, hi = ((k + 1) * 255) / count + (k === count - 1 ? 1 : 0);
          push(`Scan ${k + 1}`, grey(o.invert ? 255 - (lo + hi) / 2 : (Math.max(0, lo) + hi) / 2), outlines(bandBitmap(lum, width, height, lo, hi), o));
        }
        break;
      }
      const { palette, labels } = quantize(r, n);
      const used = o.skipBackground && palette.length > 1 ? palette.length - 1 : palette.length;
      for (let k = 0; k < used; k++) {
        const name = o.mode === "colors" ? `Colour ${k + 1} ${rgbHex(palette[k])}` : `Scan ${k + 1} ${rgbHex(palette[k])}`;
        push(name, rgbHex(palette[k]), outlines(labelBitmap(labels, width, height, stack ? (l) => l <= k : (l) => l === k), o));
      }
      break;
    }
  }
  return res;
}

export const traceNodeCount = (r: TraceResult) => r.layers.reduce((a, l) => a + l.subpaths.reduce((b, s) => b + s.nodes.length, 0), 0);

export type { Raster, Bitmap } from "./raster";
