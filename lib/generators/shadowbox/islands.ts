/**
 * Loose pieces inside a layer's cut-outs (the middle of an "O", a light spot in a traced picture):
 * each is tied to the nearest paper with a straight bridge, biggest first, so later pieces can hang
 * on earlier ones and the bridges stay short.
 */
import { makeShape, shapeContours, unionShapes } from "@/lib/letters/polygon";
import type { Shape } from "@/lib/letters/types";
import { orient } from "../shapes";
import type { Contour, Pt } from "../types";

/** Most pieces bridged on one layer; smaller ones beyond this are left out. */
export const MAX_BRIDGED = 150;
/** Spacing of the points the nearest paper is searched along, mm. */
const STEP = 1;
const CELL = 5;

/** Points along a closed contour no more than `step` apart. */
function along(c: Contour, step: number): Pt[] {
  const out: Pt[] = [];
  for (let k = 0; k < c.length; k++) {
    const a = c[k], b = c[(k + 1) % c.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let j = 0; j < n; j++) out.push([a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n]);
  }
  return out;
}

class Grid {
  private cells = new Map<number, Pt[]>();
  private key = (gx: number, gy: number) => gx * 1_000_003 + gy;
  add(pts: Pt[]) {
    for (const p of pts) {
      const k = this.key(Math.floor(p[0] / CELL), Math.floor(p[1] / CELL));
      const c = this.cells.get(k);
      if (c) c.push(p); else this.cells.set(k, [p]);
    }
  }
  /** The nearest stored point within `reach` mm, or null. */
  nearest(p: Pt, reach: number): { q: Pt; d: number } | null {
    const gx = Math.floor(p[0] / CELL), gy = Math.floor(p[1] / CELL);
    let best: Pt | null = null, bd = Infinity;
    const rings = Math.ceil(reach / CELL);
    for (let r = 0; r <= rings; r++) {
      if (best && (r - 1) * CELL > bd) break;
      for (let x = gx - r; x <= gx + r; x++) for (let y = gy - r; y <= gy + r; y++) {
        if (Math.max(Math.abs(x - gx), Math.abs(y - gy)) !== r) continue;
        for (const q of this.cells.get(this.key(x, y)) ?? []) {
          const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
          if (d < bd) { bd = d; best = q; }
        }
      }
    }
    return best ? { q: best, d: bd } : null;
  }
}

/** A bar `width` wide from p to q, running `over` mm past both ends. */
function bar(p: Pt, q: Pt, width: number, over: number): Contour {
  const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
  const ux = dx / l, uy = dy / l, nx = (-uy * width) / 2, ny = (ux * width) / 2;
  const a: Pt = [p[0] - ux * over, p[1] - uy * over], b: Pt = [q[0] + ux * over, q[1] + uy * over];
  return orient([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]);
}

export interface Bridged {
  shape: Shape;
  /** Bridges added. */
  bridges: number;
  /** Pieces still loose (too many, or too far). */
  left: number;
}

/** `main` with every piece of `loose` bridged to it (or to a piece bridged before it). */
export function bridgeIslands(main: Shape, loose: Shape[], width: number, reach = 400): Bridged {
  const pieces = loose.slice().sort((a, b) => b.area - a.area);
  const take = pieces.slice(0, MAX_BRIDGED);
  const grid = new Grid();
  for (const c of [main.outer, ...main.holes]) grid.add(along(c, STEP));
  const bars: Contour[] = [];
  const joined: Shape[] = [];
  for (const s of take) {
    const pts = along(s.outer, STEP);
    const stride = Math.max(1, Math.floor(pts.length / 600));
    let best: { p: Pt; q: Pt; d: number } | null = null;
    for (let k = 0; k < pts.length; k += stride) {
      const hit = grid.nearest(pts[k], best ? Math.min(reach, best.d) : reach);
      if (hit && (!best || hit.d < best.d)) best = { p: pts[k], q: hit.q, d: hit.d };
    }
    if (!best) continue;
    bars.push(bar(best.p, best.q, width, width * 0.75));
    joined.push(s);
    grid.add(pts);
    for (const h of s.holes) grid.add(along(h, STEP));
  }
  if (!bars.length) return { shape: main, bridges: 0, left: loose.length };
  const all = unionShapes([...shapeContours([main]), ...shapeContours(joined), ...bars]);
  const top = all.reduce((a, b) => (b.area > a.area ? b : a));
  const stray = all.filter((s) => s !== top && s.area > 1).length;
  return { shape: makeShape(top.outer, top.holes), bridges: bars.length, left: loose.length - joined.length + stray };
}
