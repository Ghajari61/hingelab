/**
 * Marquee light holes: round bulb holes along each letter's strokes, clear of the walls.
 * Centres lie on the region where a hole of `holeDia` keeps `margin` from the inner wall face;
 * in a thin stroke that region is a sliver, so the holes follow the stroke's middle.
 */
import { halfKerf } from "./kerf";
import { dropSpecks, offsetShapes, shapeContours, signedArea } from "./polygon";
import type { Contour, LetterParams, Point, Shape } from "./types";

/** Walk step along the centre region, mm. */
const STEP = 0.5;
/** Material left between two neighbouring holes, at least, mm. */
const MIN_WEB = 2;

/** Centre-to-centre spacing actually used. */
export const marqueeSpacingOf = (p: LetterParams) => Math.max(p.marquee.spacing, p.marquee.holeDia + MIN_WEB);

/** A round hole contour, oriented as a hole. */
export function circleHole(c: Point, r: number, n = 48): Contour {
  const pts: Contour = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  return signedArea(pts) > 0 ? pts.reverse() : pts;
}

/** Hole centres for one letter. `shapes` is the letter's outer wall face (no kerf). */
export function marqueeCenters(shapes: Shape[], p: LetterParams): Point[] {
  const r = p.marquee.holeDia / 2;
  const region = dropSpecks(offsetShapes(shapes, -(p.T + p.marquee.margin + r)), 0);
  const gap = marqueeSpacingOf(p) - 1e-6;
  const out: Point[] = [];
  const free = (q: Point) => out.every(o => Math.hypot(o[0] - q[0], o[1] - q[1]) >= gap);
  for (const c of shapeContours(region)) {
    const n = c.length;
    for (let i = 0; i < n; i++) {
      const a = c[i], b = c[(i + 1) % n];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const k = Math.max(1, Math.ceil(len / STEP));
      for (let j = 0; j < k; j++) {
        const q: Point = [a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k];
        if (free(q)) out.push(q);
      }
    }
  }
  return out;
}

/** Cut paths for the holes: the beam removes K/2 outside the path, so the path runs K/2 inside. */
export const marqueeHoles = (centers: Point[], p: LetterParams): Contour[] =>
  centers.map(c => circleHole(c, Math.max(0.1, p.marquee.holeDia / 2 - halfKerf(p))));
