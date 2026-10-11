/**
 * Live Boolean: the object's area combined with a linked object's area (in this object's coordinates),
 * recomputed whenever either changes. Areas use the even-odd rule, as the canvas draws them; open parts of
 * this object pass through unchanged except in "cut", which cuts every outline.
 */
import * as ClipperLib from "clipper-lib";
import { flatten, subpathsBox, unionBox, isEmptyBox } from "../geom";
import { FLAT_TOL, inter, minus, pieces, regionOf, run, toPath, toSubpaths, union } from "../pathfinder";
import type { LiveBooleanOp, LiveBooleanParams, Subpath, Vec } from "../types";
import { clipLines, openSubpath } from "./clip";

export const LIVE_BOOLEAN_LABELS: Record<LiveBooleanOp, string> = {
  union: "Union", difference: "Difference", intersection: "Intersection", exclusion: "Exclusion", division: "Division", cut: "Cut outline",
};

export function applyLiveBoolean(subs: Subpath[], p: LiveBooleanParams): Subpath[] {
  const other = p.linkCache;
  if (!other?.length) return subs;
  const A = regionOf(subs), B = regionOf(other);
  const open = subs.filter((s) => !s.closed);
  switch (p.op) {
    case "union": return [...toSubpaths(union([A, B])), ...open];
    case "difference": return [...toSubpaths(minus(A, B)), ...open];
    case "intersection": return [...toSubpaths(inter(A, B)), ...open];
    case "exclusion": return [...toSubpaths(run(ClipperLib.ClipType.ctUnion, [...A, ...B], [], ClipperLib.PolyFillType.pftEvenOdd)), ...open];
    case "division": return [...pieces(inter(A, B)), ...pieces(minus(A, B))].flatMap(toSubpaths).concat(open);
    case "cut": {
      const b = unionBox(subpathsBox(subs), subpathsBox(other));
      if (isEmptyBox(b)) return subs;
      const m = 10;
      const frame = toPath([{ x: b.minX - m, y: b.minY - m }, { x: b.maxX + m, y: b.minY - m }, { x: b.maxX + m, y: b.maxY + m }, { x: b.minX - m, y: b.maxY + m }]);
      const outside = minus([frame], B);
      const lines: Vec[][] = subs.map((s) => { const pts = flatten(s, FLAT_TOL); return s.closed && pts.length > 2 ? [...pts, pts[0]] : pts; });
      return clipLines(lines, outside).map(openSubpath);
    }
  }
}
