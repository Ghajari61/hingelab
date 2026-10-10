/**
 * Text to solid. The browser shapes the text (HarfBuzz, Letters fonts) and sends the glyph contours
 * (mm, y down) as a small binary file; here they are united into regions and stood on the wall:
 * flat letters are an exact extrusion `depth` deep; rounded letters are a pillow on a grid whose
 * height rises from the edge to `depth` over `round` mm (a quarter circle).
 */
import { ShapeUtils, Vector2 } from "three";
import { dropSpecks, MIN_PIECE_AREA, pointInShape, shapeContours, signedArea, unionShapes } from "@/lib/letters/polygon";
import type { Contour, MeshData, Shape, TextSource } from "../types";
import { orientOutward } from "./library";
import { MIN_RELIEF, reliefMesh, removePinches } from "./relief";

export { packOutline, unpackOutline } from "./outlineBytes";

/** Regions of the text in model coordinates (y up): outers counter-clockwise, holes clockwise. */
export function textRegions(contours: Contour[]): Shape[] {
  const flipped = contours.filter((c) => c.length >= 3).map((c) => c.map(([x, y]) => [x, -y] as [number, number]));
  const shapes = dropSpecks(unionShapes(flipped), MIN_PIECE_AREA);
  const ccw = (c: Contour, want: boolean) => ((signedArea(c) > 0) === want ? c : [...c].reverse());
  return shapes.map((s) => ({ ...s, outer: ccw(s.outer, true), holes: s.holes.map((h) => ccw(h, false)) }));
}

function flatMesh(shapes: Shape[], depth: number): MeshData {
  const pos: number[] = [], idx: number[] = [];
  for (const s of shapes) {
    const loops = [s.outer, ...s.holes];
    const base = pos.length / 3;
    const offsets: number[] = [];
    let count = 0;
    for (const l of loops) {
      offsets.push(count);
      for (const [x, y] of l) pos.push(x, y, 0, x, y, depth);
      count += l.length;
    }
    const bot = (i: number) => base + 2 * i, top = (i: number) => base + 2 * i + 1;
    const flat = loops.flat();
    for (const [a, b, c] of ShapeUtils.triangulateShape(s.outer.map(([x, y]) => new Vector2(x, y)), s.holes.map((h) => h.map(([x, y]) => new Vector2(x, y))))) {
      const [p, q, r] = [flat[a], flat[b], flat[c]];
      const up = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]) > 0;
      const [u, v] = up ? [b, c] : [c, b];
      idx.push(top(a), top(u), top(v), bot(a), bot(v), bot(u));
    }
    loops.forEach((l, li) => {
      for (let i = 0; i < l.length; i++) {
        const a = offsets[li] + i, b = offsets[li] + ((i + 1) % l.length);
        idx.push(bot(a), bot(b), top(b), bot(a), top(b), top(a));
      }
    });
  }
  return orientOutward({ positions: new Float32Array(pos), indices: new Uint32Array(idx) });
}

/** Distance from (x, y) to the nearest contour segment. */
function edgeDistance(segs: Float64Array, x: number, y: number): number {
  let best = Infinity;
  for (let k = 0; k < segs.length; k += 4) {
    const ax = segs[k], ay = segs[k + 1], dx = segs[k + 2] - ax, dy = segs[k + 3] - ay;
    const L = dx * dx + dy * dy;
    const t = L > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
    const ex = ax + t * dx - x, ey = ay + t * dy - y;
    const d = ex * ex + ey * ey;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/** Grid cells along the long side of the rounded text. */
const ROUNDED_CELLS = 220;

function roundedMesh(shapes: Shape[], depth: number, round: number): MeshData {
  let x0 = Infinity, y0 = -Infinity, x1 = -Infinity, y1 = Infinity;
  for (const s of shapes) for (const [x, y] of s.outer) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.max(y0, y); y1 = Math.min(y1, y); }
  const cell = Math.max(0.25, Math.max(x1 - x0, y0 - y1) / ROUNDED_CELLS);
  x0 -= cell; y0 += cell;
  const nx = Math.ceil((x1 - x0) / cell) + 1, ny = Math.ceil((y0 - y1) / cell) + 1;
  const inside = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const pt: [number, number] = [x0 + (i + 0.5) * cell, y0 - (j + 0.5) * cell];
    if (shapes.some((s) => pointInShape(pt, s))) inside[j * nx + i] = 1;
  }
  removePinches(inside, nx, ny);
  const loops = shapeContours(shapes);
  const segs = new Float64Array(loops.reduce((a, l) => a + 4 * l.length, 0));
  let k = 0;
  for (const l of loops) for (let i = 0; i < l.length; i++) {
    const q = l[(i + 1) % l.length];
    segs[k++] = l[i][0]; segs[k++] = l[i][1]; segs[k++] = q[0]; segs[k++] = q[1];
  }
  const r = Math.max(0.1, round);
  const W = nx + 1;
  const heights = new Float32Array(W * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const touches = [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]].some(([a, b]) => a >= 0 && b >= 0 && a < nx && b < ny && inside[b * nx + a]);
    if (!touches) continue;
    const x = x0 + i * cell, y = y0 - j * cell;
    const inShape = shapes.some((s) => pointInShape([x, y], s));
    const t = inShape ? Math.min(1, edgeDistance(segs, x, y) / r) : 0;
    heights[j * W + i] = Math.max(MIN_RELIEF, depth * Math.sqrt(1 - (1 - t) ** 2));
  }
  return reliefMesh({ nx, ny, cell, heights, inside, x0, y0, heightOf: (v) => v, toImage: (x, y) => [x, y] });
}

/** The solid for a Text source from its shaped glyph contours. */
export function textMesh(contours: Contour[], s: Pick<TextSource, "depth" | "profile" | "round">): MeshData {
  const shapes = textRegions(contours);
  if (!shapes.length) throw new Error("Type some text to slice (letters the font has).");
  if (!(s.depth > 0)) throw new Error("The text needs a positive depth.");
  return s.profile === "rounded" ? roundedMesh(shapes, s.depth, s.round) : flatMesh(shapes, s.depth);
}
