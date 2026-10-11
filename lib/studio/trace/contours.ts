/**
 * Outline tracing of a one-bit bitmap: contour loops along pixel edges (marching squares on the
 * pixel corners), outer/hole nesting, staircase smoothing, closed polygon simplification and
 * corner-aware Bézier fitting. Coordinates are pixels, y down; pixel (x, y) covers [x, x+1] × [y, y+1].
 */
import type { Anchor, Subpath, Vec } from "../types";
import type { Bitmap } from "./raster";

/** A maximal straight stretch of a contour: start corner, direction (0 E, 1 S, 2 W, 3 N) and length in pixels. */
export interface Run { x: number; y: number; dir: number; len: number }

/** One closed contour. Ink is on the right of the direction of travel, so outer loops have positive area (y down) and holes negative. */
export interface Loop { runs: Run[]; area: number }

const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];

/**
 * Every contour of the bitmap. Diagonal ink pixels are joined (8-connected ink): at a corner where
 * two ink pixels touch only diagonally the contour turns left, so it goes round both.
 */
export function traceLoops(b: Bitmap): Loop[] {
  const { width: w, height: h, bits } = b;
  const W = w + 1;
  const ink = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && bits[y * w + x] === 1;
  // Outgoing edge directions per corner, as a bit mask.
  const out = new Uint8Array(W * (h + 1));
  for (let y = 0; y <= h; y++) for (let x = 0; x <= w; x++) {
    const tl = ink(x - 1, y - 1), tr = ink(x, y - 1), bl = ink(x - 1, y), br = ink(x, y);
    out[y * W + x] = (br && !tr ? 1 : 0) | (bl && !br ? 2 : 0) | (tl && !bl ? 4 : 0) | (tr && !tl ? 8 : 0);
  }
  const all = out.slice();
  const loops: Loop[] = [];
  for (let v0 = 0; v0 < out.length; v0++) {
    while (out[v0]) {
      let d = Math.log2(out[v0] & -out[v0]);
      let x = v0 % W, y = (v0 - x) / W;
      const runs: Run[] = [];
      let area = 0;
      for (;;) {
        const v = y * W + x;
        if (runs.length) {
          // The next edge depends only on the bitmap (one way out, or turn left at a saddle), so every
          // loop closes on the edge it started with, wherever it started.
          const mask = all[v];
          d = mask & (mask - 1) ? (d + 3) & 3 : Math.log2(mask);
        }
        if (!(out[v] & (1 << d))) break;
        out[v] &= ~(1 << d);
        const nx = x + DX[d], ny = y + DY[d];
        area += x * ny - nx * y;
        const last = runs[runs.length - 1];
        if (last && last.dir === d) last.len++;
        else runs.push({ x, y, dir: d, len: 1 });
        x = nx; y = ny;
      }
      if (runs.length > 1 && runs[0].dir === runs[runs.length - 1].dir) {
        const last = runs.pop()!;
        runs[0] = { x: last.x, y: last.y, dir: last.dir, len: last.len + runs[0].len };
      }
      if (runs.length >= 4) loops.push({ runs, area: area / 2 });
    }
  }
  return loops;
}

/** The exact pixel-edge polygon of a loop (its corners). */
export const loopCorners = (l: Loop): Vec[] => l.runs.map((r) => ({ x: r.x, y: r.y }));

/**
 * The loop with its pixel staircase smoothed: one-pixel steps are replaced by their midpoints and the
 * ends of longer stretches next to a step are pulled in by half a pixel, while corners between two
 * longer stretches stay exact (a traced square keeps its corners and its area).
 */
export function smoothLoop(l: Loop): Vec[] {
  const rs = l.runs, n = rs.length, pts: Vec[] = [];
  for (let k = 0; k < n; k++) {
    const r = rs[k], prev = rs[(k + n - 1) % n], next = rs[(k + 1) % n];
    const ex = r.x + DX[r.dir] * r.len, ey = r.y + DY[r.dir] * r.len;
    if (r.len === 1) { pts.push({ x: r.x + DX[r.dir] / 2, y: r.y + DY[r.dir] / 2 }); continue; }
    pts.push(prev.len > 1 ? { x: r.x, y: r.y } : { x: r.x + DX[r.dir] / 2, y: r.y + DY[r.dir] / 2 });
    if (next.len === 1) pts.push({ x: ex - DX[r.dir] / 2, y: ey - DY[r.dir] / 2 });
  }
  return pts;
}

const segDist = (p: Vec, a: Vec, b: Vec) => {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};

/** Ramer–Douglas–Peucker on an open polyline (both ends kept). */
export function simplifyOpen(pts: Vec[], tol: number): Vec[] {
  if (pts.length < 3 || tol <= 0) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = -1, wd = tol;
    for (let k = a + 1; k < b; k++) { const d = segDist(pts[k], pts[a], pts[b]); if (d > wd) { wd = d; worst = k; } }
    if (worst >= 0) { keep[worst] = 1; stack.push([a, worst], [worst, b]); }
  }
  return pts.filter((_, k) => keep[k]);
}

/** Ramer–Douglas–Peucker on a closed polygon: split at the first point and the point farthest from it. */
export function simplifyClosed(pts: Vec[], tol: number): Vec[] {
  if (pts.length < 4 || tol <= 0) return pts.slice();
  let far = 0, fd = -1;
  for (let k = 1; k < pts.length; k++) { const d = Math.hypot(pts[k].x - pts[0].x, pts[k].y - pts[0].y); if (d > fd) { fd = d; far = k; } }
  const a = simplifyOpen(pts.slice(0, far + 1), tol), b = simplifyOpen([...pts.slice(far), pts[0]], tol);
  const out = [...a.slice(0, -1), ...b.slice(0, -1)];
  return out.length >= 3 ? out : pts.slice();
}

/** Turn angle at a corner below which a node is smooth, for a corner smoothing value 0–1.3 (0: polygon). */
export const smoothLimit = (smooth: number) => (smooth <= 0 ? 0 : (20 + 55 * Math.min(1.3, smooth)) * (Math.PI / 180));

/**
 * Corner-aware Bézier fit through polygon points: a node whose direction changes less than
 * `smoothLimit` gets tangent handles along the bisector of its edges; sharper nodes stay corners.
 * Handles are a third of the shorter neighbouring edge, so long straight edges stay straight.
 */
export function fitCurve(pts: Vec[], closed: boolean, smooth: number): Subpath {
  const n = pts.length, lim = smoothLimit(smooth);
  if (lim <= 0 || n < 3) return { closed, nodes: pts.map((p) => ({ x: p.x, y: p.y })) };
  const nodes: Anchor[] = pts.map((p, k) => {
    const node: Anchor = { x: p.x, y: p.y };
    if (!closed && (k === 0 || k === n - 1)) return node;
    const a = pts[(k + n - 1) % n], b = pts[(k + 1) % n];
    const ux = p.x - a.x, uy = p.y - a.y, vx = b.x - p.x, vy = b.y - p.y;
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    if (lu < 1e-9 || lv < 1e-9) return node;
    const turn = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv))));
    if (turn >= lim) return node;
    let tx = ux / lu + vx / lv, ty = uy / lu + vy / lv;
    const tl = Math.hypot(tx, ty);
    tx /= tl; ty /= tl;
    const hl = Math.min(lu, lv) / 3;
    node.i = { x: p.x - tx * hl, y: p.y - ty * hl };
    node.o = { x: p.x + tx * hl, y: p.y + ty * hl };
    node.k = "smooth";
    return node;
  });
  return { closed, nodes };
}

const ringArea = (pts: Vec[]) => { let a = 0; for (let k = 0, j = pts.length - 1; k < pts.length; j = k++) a += pts[j].x * pts[k].y - pts[k].x * pts[j].y; return a / 2; };

function inside(p: Vec, ring: Vec[]): boolean {
  let c = false;
  for (let k = 0, j = ring.length - 1; k < ring.length; j = k++) {
    const a = ring[j], b = ring[k];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y)) c = !c;
  }
  return c;
}

/** An outer contour with the holes directly inside it. */
export interface Shape { outer: Loop; holes: Loop[] }

/** Puts every hole with the smallest outer contour around it. */
export function nestLoops(loops: Loop[]): Shape[] {
  const outers = loops.filter((l) => l.area > 0).map((l) => {
    const ring = loopCorners(l);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of ring) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
    return { shape: { outer: l, holes: [] as Loop[] }, ring, minX, minY, maxX, maxY };
  }).sort((a, b) => a.shape.outer.area - b.shape.outer.area);
  for (const h of loops.filter((l) => l.area < 0)) {
    // A point a quarter pixel inside the hole, next to its first edge: never on any contour.
    const r = h.runs[0], lx = DY[r.dir], ly = -DX[r.dir];
    const p = { x: r.x + DX[r.dir] * 0.5 + lx * 0.25, y: r.y + DY[r.dir] * 0.5 + ly * 0.25 };
    const o = outers.find((q) => p.x > q.minX && p.x < q.maxX && p.y > q.minY && p.y < q.maxY && inside(p, q.ring));
    if (o) o.shape.holes.push(h);
  }
  return outers.map((o) => o.shape);
}

export interface OutlineOptions { smooth: number; optimize: number }

/** Bitmap → closed subpaths in pixel coordinates, each outer followed by its holes. */
export function traceOutlines(b: Bitmap, o: OutlineOptions): Subpath[] {
  const out: Subpath[] = [];
  const fit = (l: Loop) => {
    const pts = simplifyClosed(smoothLoop(l), o.optimize);
    if (pts.length >= 3 && Math.abs(ringArea(pts)) > 1e-6) out.push(fitCurve(pts, true, o.smooth));
  };
  for (const s of nestLoops(traceLoops(b))) { fit(s.outer); s.holes.forEach(fit); }
  return out;
}
