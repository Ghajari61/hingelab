import type { Point } from "./types";
import { r3 } from "./util";

/** Drop duplicates and collinear vertices. Same epsilon as the prototype. */
export function simplify(pts: Point[]) {
  const eq = (a: Point, b: Point) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
  const out: Point[] = [];
  for (const q of pts) if (!out.length || !eq(out[out.length - 1], q)) out.push(q);
  if (out.length > 1 && eq(out[0], out[out.length - 1])) out.pop();
  let changed = true;
  while (changed && out.length > 3) {
    changed = false; const res: Point[] = [];
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length], b = out[i], c = out[(i + 1) % out.length];
      const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(cr) < 1e-9) { changed = true; continue; }
      res.push(b);
    }
    out.length = 0;
    for (const p of res) out.push(p);
  }
  return out;
}

/**
 * Outward (or inward, if d < 0) miter offset of a simple polygon.
 * A zero distance returns the same point array.
 */
export function offsetRect(pts: Point[], d: number) {
  if (!d) return pts;
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const s = area > 0 ? 1 : -1;
  const nrm = (a: Point, b: Point) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); return [s * dy / l, -s * dx / l] as Point; };
  return pts.map((q, i) => { const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length], n1 = nrm(a, q), n2 = nrm(q, b); return [q[0] + d * (n1[0] + n2[0]), q[1] + d * (n1[1] + n2[1])] as Point; });
}

/**
 * Miter offset of a polygon whose edges are all horizontal or vertical: vertical edges move by `dx`,
 * horizontal ones by `dy` (kerf that differs by axis). Equal values give `offsetRect`.
 */
export function offsetRectXY(pts: Point[], dx: number, dy: number) {
  if (dx === dy) return offsetRect(pts, dx);
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const s = area > 0 ? 1 : -1;
  const nrm = (a: Point, b: Point) => { const ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey); return [s * ey / l, -s * ex / l] as Point; };
  return pts.map((q, i) => { const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length], n1 = nrm(a, q), n2 = nrm(q, b); return [q[0] + dx * (n1[0] + n2[0]), q[1] + dy * (n1[1] + n2[1])] as Point; });
}

/**
 * Exact miter offset of a simple polygon at any angles: each edge moves out by half the kerf across
 * it (kx across vertical edges, ky across horizontal ones, in between on a slant).
 */
export function offsetPolyXY(pts: Point[], kx: number, ky: number) {
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const s = area > 0 ? 1 : -1;
  const nrm = (a: Point, b: Point) => { const ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey); return [s * ey / l, -s * ex / l] as Point; };
  const dist = (n: Point) => Math.hypot(n[0] * kx, n[1] * ky) / 2;
  return pts.map((q, i) => {
    const n1 = nrm(pts[(i - 1 + pts.length) % pts.length], q), n2 = nrm(q, pts[(i + 1) % pts.length]);
    const d1 = dist(n1), d2 = dist(n2), det = n1[0] * n2[1] - n1[1] * n2[0];
    if (Math.abs(det) < 1e-9) return [q[0] + d1 * n1[0], q[1] + d1 * n1[1]] as Point;
    // The point v with v·n1 = d1 and v·n2 = d2.
    return [q[0] + (d1 * n2[1] - d2 * n1[1]) / det, q[1] + (n1[0] * d2 - n2[0] * d1) / det] as Point;
  });
}

export const polyD = (pts: Point[], ox: number, oy: number) => "M" + pts.map(q => `${r3(q[0] + ox)},${r3(q[1] + oy)}`).join(" L") + " Z";

export function bboxOf(pts: Point[]) {
  const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
