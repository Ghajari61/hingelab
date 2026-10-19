/**
 * The decorative pattern on a box's walls and lid: cut through, engraved or scored. Holes stay a
 * finger's depth plus a bar clear of every edge (so joints keep their strength), clear of the part's
 * own holes, and round the lid's label: when the lid carries text, a framed label is left solid in
 * the middle of the pattern. The pattern can fill the face or a shape (heart, star...) in its middle.
 */
import { differenceShapes, makeShape, offsetShapes, shapeContours } from "@/lib/letters/polygon";
import { circle, distToContour, pointInContour, regularPolygon, roundedRect } from "../geom";
import { fretHoles, type FretSpec, type KeepOut } from "../fretwork";
import type { Contour, GenPart, Pt } from "../types";
import type { BoxesParams, PierceShape } from "./params";

export const pierced = (p: BoxesParams) => p.pierce.pattern !== "none";
export const pierceWalls = (p: BoxesParams) => pierced(p) && p.pierce.on !== "lid";
export const pierceLid = (p: BoxesParams) => pierced(p) && (p.pierce.on === "both" || p.pierce.on === "lid" || p.pierce.on === "front-lid");
/** The walls that carry the pattern (by part id); every wall unless only the front does. */
export const pierceWallIds = (p: BoxesParams, all: string[]) => (p.pierce.on === "front" || p.pierce.on === "front-lid" ? all.filter((id) => id === "front") : all);
/** True when the pattern opens holes through the part (not engraved or scored). */
export const pierceCuts = (p: BoxesParams) => p.pierce.mark !== "engrave" && p.pierce.mark !== "score";
const spec = (p: BoxesParams): FretSpec => ({ kind: p.pierce.pattern, cell: Math.max(6, p.pierce.cell), bar: Math.max(1, p.pierce.bar) });

const boxOf = (c: Contour): KeepOut => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of c) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
};

/** A shape of the given size (its width and height at most `s`) centred on (cx, cy), y down. */
export function windowShape(shape: PierceShape, cx: number, cy: number, s: number): Contour | null {
  const r = s / 2;
  switch (shape) {
    case "circle": return circle(cx, cy, r);
    case "hexagon": return regularPolygon(6, r, 30, cx, cy);
    case "diamond": return [[cx, cy - r], [cx + r * 0.75, cy], [cx, cy + r], [cx - r * 0.75, cy]];
    case "star": {
      const pts: Contour = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (Math.PI * i) / 5, R = i % 2 ? r * 0.45 : r;
        pts.push([cx + R * Math.cos(a), cy + 0.06 * r + R * Math.sin(a)]);
      }
      return pts;
    }
    case "heart": {
      // The classic heart curve (17 × 15.5 units across), its point down.
      const k = s / 34, pts: Contour = [];
      for (let i = 0; i < 96; i++) {
        const t = (2 * Math.PI * i) / 96;
        const x = 16 * Math.sin(t) ** 3, y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        pts.push([cx + x * k, cy - (y + 2.5) * k]);
      }
      return pts;
    }
    default: return null;
  }
}

/** The pattern's holes for the rectangle x0..x1 × y0..y1, in the chosen window (whole face, heart...). */
export function patternHoles(p: BoxesParams, x0: number, y0: number, x1: number, y1: number, keep: KeepOut[] = [], inside?: (q: Pt) => boolean): Contour[] {
  const win = windowShape(p.pierce.shape, (x0 + x1) / 2, (y0 + y1) / 2, Math.min(x1 - x0, y1 - y0) * Math.min(100, Math.max(20, p.pierce.size)) / 100);
  const ok = win ? (q: Pt) => pointInContour(q, win) && (!inside || inside(q)) : inside;
  return fretHoles(spec(p), x0, y0, x1, y1, keep, ok);
}

/** Puts pattern shapes on a part: cut through, engraved, or scored as outlines. */
export function markPattern(p: BoxesParams, part: GenPart, holes: Contour[]) {
  if (!holes.length) return;
  if (p.pierce.mark === "engrave") part.engrave = [...(part.engrave ?? []), ...holes];
  else if (p.pierce.mark === "score") part.score = [...(part.score ?? []), ...holes.map((c) => [...c, c[0]])];
  else part.holes.push(...holes);
}

/** Puts the pattern on a part, `edge` mm clear of its outline, keeping `keep` areas solid. */
export function pierce(p: BoxesParams, part: GenPart, edge: number, keep: KeepOut[] = []): number {
  const b = boxOf(part.outer);
  // The window sits in the middle of the face inside the joints, not of the fingers' outline.
  const inner = { x0: b.x0 + edge, y0: b.y0 + edge, x1: b.x1 - edge, y1: b.y1 - edge };
  const inside = (q: [number, number]) => pointInContour(q, part.outer) && distToContour(q, part.outer) >= edge;
  const holes = p.pierce.shape === "full"
    ? fretHoles(spec(p), b.x0, b.y0, b.x1, b.y1, [...keep, ...part.holes.map(boxOf)], inside)
    : patternHoles(p, inner.x0, inner.y0, inner.x1, inner.y1, [...keep, ...part.holes.map(boxOf)], inside);
  markPattern(p, part, holes);
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
