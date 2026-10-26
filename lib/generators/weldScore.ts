/**
 * Weld and score: overlapping letters (script names, a word on a motif) are cut as one piece, and
 * where a shape lies over the ones before it, its edge is scored instead of lost, so each letter
 * still reads on the welded piece.
 */
import { offsetShapes, shapeContours, unionShapes } from "@/lib/letters/polygon";
import type { Shape } from "@/lib/letters/types";
import { pointInContour } from "./geom";
import type { Contour, Pt } from "./types";

const inside = (q: Pt, ss: Shape[]) => ss.some((s) => pointInContour(q, s.outer) && !s.holes.some((h) => pointInContour(q, h)));

/** Resamples a closed contour so no step is longer than `step` mm. */
function dense(c: Contour, step: number): Contour {
  const out: Contour = [];
  for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

/**
 * Score lines that draw every letter on a welded piece: each glyph's own outline (closed), so the
 * letters read even where the weld fills the gaps between them. Overlaps come out as crossings.
 */
export function letterScores(shapes: Contour[][]): Contour[] {
  return shapes.flatMap((g) => shapeContours(unionShapes(g))).filter((c) => c.length > 2).map((c) => [...c, c[0]]);
}

/**
 * Score lines for shapes drawn in order (each a glyph's or motif's outlines): the parts of each
 * shape's edge that lie inside the shapes drawn before it (kept `inset` mm inside them, so no line
 * touches the cut edge). Runs shorter than `minRun` mm are dropped.
 */
export function overlapScores(shapes: Contour[][], o: { inset?: number; minRun?: number; step?: number } = {}): Contour[] {
  const inset = o.inset ?? 0.35, minRun = o.minRun ?? 1, step = o.step ?? 0.4;
  const groups = shapes.map((g) => unionShapes(g)).filter((g) => g.length);
  const out: Contour[] = [];
  for (let i = 1; i < groups.length; i++) {
    const below = offsetShapes(unionShapes(groups.slice(0, i).flatMap((g) => shapeContours(g))), -inset);
    if (!below.length) continue;
    for (const c of shapeContours(groups[i])) {
      const pts = dense(c, step), flags = pts.map((q) => inside(q, below));
      if (!flags.some(Boolean)) continue;
      // start the walk where the edge is outside, so a run is never split across the seam
      const start = flags.indexOf(false);
      if (start < 0) { out.push([...pts, pts[0]]); continue; }
      let run: Contour = [];
      const flush = () => {
        let len = 0;
        for (let k = 1; k < run.length; k++) len += Math.hypot(run[k][0] - run[k - 1][0], run[k][1] - run[k - 1][1]);
        if (run.length > 1 && len >= minRun) out.push(run);
        run = [];
      };
      for (let k = 0; k <= pts.length; k++) {
        const j = (start + k) % pts.length;
        if (flags[j] && k < pts.length) run.push(pts[j]);
        else flush();
      }
    }
  }
  return out;
}
