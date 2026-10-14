/**
 * Pictures for the Shadow Box picture pattern: a photo or drawing is traced into outlines at every
 * brightness cut-off of LEVEL_CUTS (darker parts are inside), an SVG into its filled shapes, both in
 * the picPath box and format. Pure functions (no DOM), run in the editor's worker and in tests; the
 * picture never leaves the device, only these outlines are kept in the design.
 */
import { makeShape, shapeContours, unionShapes } from "@/lib/letters/polygon";
import type { Contour } from "@/lib/letters/types";
import { LEVEL_CUTS, MAX_PIC_TEXT, PIC_BOX, encodeContours, encodeLevels } from "@/lib/generators/shadowbox/picPath";
import { flatten } from "@/lib/studio/geom";
import { importSvg } from "@/lib/studio/svgImport";
import { traceOutlines } from "@/lib/studio/trace/contours";
import { luminance, removeSpeckles, emptyBitmap, type Raster } from "@/lib/studio/trace/raster";
import type { GroupNode, PathNode } from "@/lib/studio/types";

/** A problem with the picture itself; its message is written for the user. */
export class PictureError extends Error {}

/** Longest side a picture is traced at, px. */
export const TRACE_SIDE = 600;

export interface Levels {
  /** Outlines per level, `|` between them (picPath format). */
  levels: string;
  /** Width / height of the picture (or of the SVG's art). */
  aspect: number;
}

/** Outlines of a raster at every cut-off; coarser outlines when the detail would not fit the stored size. */
export function traceLevels(r: Raster): Levels {
  const lum = luminance(r);
  const k = PIC_BOX / Math.max(r.width, r.height);
  const speck = Math.max(6, Math.round(r.width * r.height * 0.00005));
  const bitmaps = LEVEL_CUTS.map((cut) => {
    const b = emptyBitmap(r.width, r.height), t = (cut / 100) * 255;
    for (let i = 0; i < lum.length; i++) b.bits[i] = lum[i] < t ? 1 : 0;
    return removeSpeckles(b, speck);
  });
  let levels = "";
  for (const optimize of [0.6, 1.2, 2.4, 4.8]) {
    levels = bitmaps.map((b) => encodeContours(
      traceOutlines(b, { smooth: 0, optimize }).map((s) => s.nodes.map((n) => [n.x * k, n.y * k] as [number, number])),
    )).join("|");
    if (levels.length <= MAX_PIC_TEXT) break;
  }
  if (levels.length > MAX_PIC_TEXT) throw new PictureError("This picture has too much fine detail to trace. Try a simpler picture or one with more contrast.");
  return { levels, aspect: r.width / r.height };
}

function pathsOf(n: GroupNode | PathNode, out: PathNode[]) {
  if (n.type === "path") out.push(n);
  else for (const c of n.children) pathsOf(c as GroupNode | PathNode, out);
}

/** The filled shapes of an SVG as one level; open lines are left out. */
export function svgLevels(src: string): Levels {
  const imp = importSvg(src, { maxObjects: 5000, maxAnchors: 200_000 });
  const paths: PathNode[] = [];
  if (imp.group) pathsOf(imp.group, paths);
  const contours: Contour[] = [];
  for (const p of paths) {
    const rings = p.subpaths.filter((s) => s.closed && s.nodes.length >= 2).map((s) => flatten(s, 0.05).map((q) => [q.x, q.y] as [number, number]));
    if (rings.length) contours.push(...shapeContours(unionShapes(rings, [], true)));
  }
  const shapes = unionShapes(contours);
  if (!shapes.length) throw new PictureError("This SVG has no filled shapes to cut. Use a file with closed, filled paths (convert text and strokes to paths first).");
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of shapes) for (const [x, y] of s.outer) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const w = x1 - x0, h = y1 - y0, k = PIC_BOX / Math.max(w, h, 1e-6);
  const fit = shapes.map((s) => makeShape(s.outer.map(([x, y]) => [(x - x0) * k, (y - y0) * k]), s.holes.map((c) => c.map(([x, y]) => [(x - x0) * k, (y - y0) * k]))));
  const levels = encodeLevels([shapeContours(fit)]);
  if (levels.length > MAX_PIC_TEXT) throw new PictureError("This SVG is too detailed to use. Simplify it, or export it with fewer points.");
  return { levels, aspect: w / Math.max(h, 1e-6) };
}
