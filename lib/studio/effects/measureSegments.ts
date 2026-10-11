/**
 * Measure Segments: a dimension line, end marks and a length label beside every segment of the path.
 * The effect leaves the geometry as it is; the labels are guides that only the canvas draws (computed on
 * page coordinates so lengths include the object's scale), so they never reach the laser or an export.
 */
import { flatten, segments } from "../geom";
import { FLAT_TOL } from "../pathfinder";
import { fromMM } from "../units";
import type { MeasureSegmentsParams, Subpath, Units, Vec } from "../types";

export interface GuideLabel { x: number; y: number; /** Degrees, kept upright. */ angle: number; size: number; text: string; length: number }
export interface EffectGuides { lines: Subpath[]; labels: GuideLabel[] }

export function measureLabel(length: number, p: MeasureSegmentsParams, units: Units): string {
  const d = Math.max(0, Math.min(6, Math.round(p.decimals)));
  return `${p.prefix}${fromMM(length, units).toFixed(d)}${p.showUnit ? ` ${units}` : ""}${p.suffix}`;
}

const open = (pts: Vec[]): Subpath => ({ closed: false, nodes: pts.map((q) => ({ x: q.x, y: q.y })) });

/** Dimension lines and labels for every segment of `subs` (page coordinates). */
export function measureGuides(subs: Subpath[], p: MeasureSegmentsParams, units: Units): EffectGuides {
  const lines: Subpath[] = [], labels: GuideLabel[] = [];
  const size = Math.max(0.2, p.fontSize), off = p.offset, side = off < 0 ? -1 : 1, mark = size * 0.45;
  for (const s of subs) {
    for (const g of segments(s)) {
      const pts = flatten({ closed: false, nodes: [{ x: g.p0.x, y: g.p0.y, ...(g.line ? {} : { o: g.c1 }) }, { x: g.p3.x, y: g.p3.y, ...(g.line ? {} : { i: g.c2 }) }] }, FLAT_TOL);
      let len = 0;
      const cum = [0];
      for (let k = 1; k < pts.length; k++) cum.push(len += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
      if (len < 1e-6) continue;
      // Normal on the outer side of a clockwise (on screen) outline for positive offsets.
      const normals = pts.map((_, k) => {
        const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)], l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        return { x: (b.y - a.y) / l, y: -(b.x - a.x) / l };
      });
      const dim = pts.map((q, k) => ({ x: q.x + normals[k].x * off, y: q.y + normals[k].y * off }));
      lines.push(open(dim));
      const ends: [number, number][] = [[0, 1], [pts.length - 1, pts.length - 2]];
      for (const [k, j] of ends) {
        const n = normals[k], q = pts[k], e = dim[k];
        if (Math.abs(off) > 1e-9) lines.push(open([{ x: q.x + n.x * side * size * 0.25, y: q.y + n.y * side * size * 0.25 }, { x: e.x + n.x * side * mark, y: e.y + n.y * side * mark }]));
        if (p.ends === "ticks") lines.push(open([{ x: e.x - n.x * mark - (n.y) * mark * 0.6, y: e.y - n.y * mark + n.x * mark * 0.6 }, { x: e.x + n.x * mark + n.y * mark * 0.6, y: e.y + n.y * mark - n.x * mark * 0.6 }]));
        else if (p.ends === "arrows") {
          const t = { x: dim[j].x - e.x, y: dim[j].y - e.y }, tl = Math.hypot(t.x, t.y) || 1, u = { x: t.x / tl, y: t.y / tl };
          const a = Math.min(mark * 1.4, len / 3);
          lines.push(open([{ x: e.x + u.x * a + n.x * a * 0.4, y: e.y + u.y * a + n.y * a * 0.4 }, e, { x: e.x + u.x * a - n.x * a * 0.4, y: e.y + u.y * a - n.y * a * 0.4 }]));
        }
      }
      let k = 1;
      while (k < cum.length - 1 && cum[k] < len / 2) k++;
      const span = cum[k] - cum[k - 1] || 1, f = (len / 2 - cum[k - 1]) / span;
      const mid = { x: dim[k - 1].x + (dim[k].x - dim[k - 1].x) * f, y: dim[k - 1].y + (dim[k].y - dim[k - 1].y) * f };
      const dir = { x: pts[k].x - pts[k - 1].x, y: pts[k].y - pts[k - 1].y }, dl = Math.hypot(dir.x, dir.y) || 1;
      const n = { x: dir.y / dl, y: -dir.x / dl };
      let angle = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
      if (angle > 90) angle -= 180;
      else if (angle <= -90) angle += 180;
      const gap = size * 0.8;
      labels.push({ x: mid.x + n.x * side * gap, y: mid.y + n.y * side * gap, angle, size, text: measureLabel(len, p, units), length: len });
    }
  }
  return { lines, labels };
}
