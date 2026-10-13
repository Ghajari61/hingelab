/**
 * Depth map → stacked relief: the depth is cut into levels and every level becomes one sheet to cut,
 * so stacking the sheets builds the relief (nearest parts on top). Also the perforation tiling the
 * Lamp target uses.
 */
import type { DepthMap } from "@/lib/parametric/source/relief";
import { flatten } from "@/lib/studio/geom";
import type { Anchor, Subpath } from "@/lib/studio/types";
import { emptyBitmap, removeSpeckles, type Bitmap } from "@/lib/studio/trace/raster";
import { imgFromGrey, type Img } from "./image";

export interface LayerOptions {
  /** Number of sheets (2–12). */
  levels: number;
  /** Depth below this (0–1) is background and is left out. */
  floor: number;
  /** Pieces smaller than this many pixels are dropped. */
  speckles: number;
}

export const LAYER_DEFAULTS: LayerOptions = { levels: 5, floor: 0.15, speckles: 30 };

/**
 * Sheet k (0 = bottom) holds every pixel at least as near as its level, so each sheet sits inside the
 * one below it. The bottom sheet is the whole subject above the floor.
 */
export function depthLayers(d: DepthMap, raw: Partial<LayerOptions> = {}): Bitmap[] {
  const o = { ...LAYER_DEFAULTS, ...raw };
  const n = Math.max(2, Math.min(12, Math.round(o.levels))), floor = Math.max(0, Math.min(0.9, o.floor));
  const out: Bitmap[] = [];
  for (let k = 0; k < n; k++) {
    const level = floor + ((1 - floor) * k) / n, b = emptyBitmap(d.w, d.h);
    for (let i = 0; i < d.data.length; i++) b.bits[i] = d.data[i] >= level ? 1 : 0;
    const clean = removeSpeckles(b, o.speckles);
    if (clean.bits.some((v) => v)) out.push(clean);
  }
  return out;
}

/** The depth map as a grey image (white = near). */
export const depthImage = (d: DepthMap): Img => imgFromGrey(Array.from(d.data, (v) => Math.round(v * 255)), d.w, d.h);

export interface PerforationOptions {
  /** Panel size, mm. */
  width: number;
  height: number;
  /** Grid spacing, mm. */
  cell: number;
  /** Space between neighbouring holes, mm. */
  gap: number;
  /** Plain border around the pattern, mm. */
  margin: number;
  /** Every other row shifts by half a cell. */
  stagger: boolean;
}

export const PERFORATION_DEFAULTS: PerforationOptions = { width: 300, height: 200, cell: 24, gap: 4, margin: 15, stagger: true };

function bounds(subs: Subpath[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of subs) for (const p of flatten(s, 0.1)) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  return { minX, minY, maxX, maxY };
}

const mapAnchor = (n: Anchor, f: (x: number, y: number) => { x: number; y: number }): Anchor => {
  const p = f(n.x, n.y);
  return { ...p, ...(n.i ? { i: f(n.i.x, n.i.y) } : {}), ...(n.o ? { o: f(n.o.x, n.o.y) } : {}), ...(n.k ? { k: n.k } : {}) };
};

/**
 * A lamp panel: the outline plus the motif repeated on a grid inside the margin, each copy scaled to
 * fit its cell less the gap. Panel coordinates start at its top-left corner.
 */
export function perforation(motif: Subpath[], raw: Partial<PerforationOptions> = {}): { panel: Subpath; holes: Subpath[]; count: number } {
  const o = { ...PERFORATION_DEFAULTS, ...raw };
  const panel: Subpath = { closed: true, nodes: [{ x: 0, y: 0 }, { x: o.width, y: 0 }, { x: o.width, y: o.height }, { x: 0, y: o.height }] };
  const shapes = motif.filter((s) => s.closed && s.nodes.length > 2);
  if (!shapes.length || o.cell <= o.gap) return { panel, holes: [], count: 0 };
  const b = bounds(shapes), mw = b.maxX - b.minX, mh = b.maxY - b.minY;
  if (!(mw > 0 && mh > 0)) return { panel, holes: [], count: 0 };
  const k = (o.cell - o.gap) / Math.max(mw, mh), cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  const holes: Subpath[] = [];
  let count = 0;
  const half = (Math.max(mw, mh) * k) / 2;
  for (let row = 0, y = o.margin + o.cell / 2; y + half <= o.height - o.margin + 1e-6; row++, y += o.cell) {
    const shift = o.stagger && row % 2 ? o.cell / 2 : 0;
    for (let x = o.margin + o.cell / 2 + shift; x + half <= o.width - o.margin + 1e-6; x += o.cell) {
      const f = (px: number, py: number) => ({ x: x + (px - cx) * k, y: y + (py - cy) * k });
      for (const s of shapes) holes.push({ closed: true, nodes: s.nodes.map((n) => mapAnchor(n, f)) });
      count++;
    }
  }
  return { panel, holes, count };
}
