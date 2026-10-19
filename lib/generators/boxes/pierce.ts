/**
 * The decorative pattern cut through a box's walls and lid. Holes stay a finger's depth plus a bar
 * clear of every edge (so joints keep their strength), clear of the part's own holes, and round the
 * lid's label: when the lid carries text, a framed label is left solid in the middle of the pattern.
 */
import { differenceShapes, makeShape, offsetShapes, shapeContours } from "@/lib/letters/polygon";
import { distToContour, pointInContour, roundedRect } from "../geom";
import { fretHoles, type FretSpec, type KeepOut } from "../fretwork";
import type { Contour, GenPart } from "../types";
import type { BoxesParams } from "./params";

export const pierced = (p: BoxesParams) => p.pierce.pattern !== "none";
export const pierceWalls = (p: BoxesParams) => pierced(p) && p.pierce.on !== "lid";
export const pierceLid = (p: BoxesParams) => pierced(p) && p.pierce.on !== "walls";
const spec = (p: BoxesParams): FretSpec => ({ kind: p.pierce.pattern, cell: Math.max(6, p.pierce.cell), bar: Math.max(1, p.pierce.bar) });

const boxOf = (c: Contour): KeepOut => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of c) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
};

/** Cuts the pattern into a part, `edge` mm clear of its outline, keeping `keep` areas solid. */
export function pierce(p: BoxesParams, part: GenPart, edge: number, keep: KeepOut[] = []): number {
  const b = boxOf(part.outer);
  const inside = (q: [number, number]) => pointInContour(q, part.outer) && distToContour(q, part.outer) >= edge;
  const holes = fretHoles(spec(p), b.x0, b.y0, b.x1, b.y1, [...keep, ...part.holes.map(boxOf)], inside);
  part.holes.push(...holes);
  return holes.length;
}

/** An engraved double frame round a label area (x0..x1 × y0..y1). */
export function labelFrame(k: KeepOut): Contour[] {
  const ring = (inset: number, w: number) => {
    const o = roundedRect(k.x0 + inset, k.y0 + inset, k.x1 - k.x0 - 2 * inset, k.y1 - k.y0 - 2 * inset, 2);
    const inner = offsetShapes([makeShape(o, [])], -w);
    return shapeContours(differenceShapes([o], shapeContours(inner)));
  };
  return [...ring(0, 1.4), ...ring(2.6, 0.7)];
}

/** The label area for art w × h centred on (cx, cy), with room round it. */
export const labelBox = (cx: number, cy: number, w: number, h: number, pad = 6): KeepOut =>
  ({ x0: cx - w / 2 - pad, y0: cy - h / 2 - pad, x1: cx + w / 2 + pad, y1: cy + h / 2 + pad });
