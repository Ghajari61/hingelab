/**
 * The sheet's outline, centred on (0, 0), and its radius in every direction. Rings and the spiral are
 * built in polar form round the centre: a ring that follows the outline is the outline scaled down
 * (so a star stays a star in every ring and no ring ever collapses), and a round ring is a circle.
 */
import { customOutline, distToContour, ellipse, pointInContour, regularPolygon, roundCorners, roundedRect, signedArea, TAU } from "../geom";
import { unionShapes } from "@/lib/letters/polygon";
import { heartCurve, orient, starPolygon } from "../shapes";
import type { Contour, Pt } from "../types";
import type { PopShape, PopupParams } from "./params";

/** Directions the outline is sampled in (a quarter degree: 0.01 mm off a 300 mm circle). */
export const N_DIR = 1440;

export interface Polar {
  /** Radius of the outline at direction i (angle TAU * i / N_DIR, y down so it turns clockwise). */
  r: Float64Array;
  /** Smallest and largest radius. */
  min: number;
  max: number;
  /** Some direction leaves the outline more than once: the outline is not star-shaped round its centre. */
  folded: boolean;
}

const clampPct = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v)) / 100;

/** A shape given by its radius at each angle (flowers, pumpkins, snowflakes), R the largest radius. */
function polarShape(R: number, f: (a: number) => number, sy = 1): Contour {
  const out: Contour = [];
  const n = 720;
  for (let i = 0; i < n; i++) {
    const a = (TAU * i) / n, r = R * f(a);
    out.push([r * Math.cos(a), r * Math.sin(a) * sy]);
  }
  return out;
}

/** Centred on (0, 0): the bounding box's middle, then moved to the area centroid for lopsided shapes. */
function centred(c: Contour): Contour {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of c) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  return c.map(([x, y]) => [x - mx, y - my] as Pt);
}

/**
 * The point inside farthest from every edge (the pole of inaccessibility), by a grid search refined
 * round the best point: the centre that gives the narrowest part of the outline the widest rings.
 */
function pole(c: Contour): Pt {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of c) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const score = (q: Pt) => (pointInContour(q, c) ? distToContour(q, c) : -1);
  let best: Pt = [(x0 + x1) / 2, (y0 + y1) / 2], bs = score(best);
  let w = x1 - x0, h = y1 - y0, cx = best[0], cy = best[1];
  for (let level = 0; level < 4; level++) {
    const n = level ? 10 : 24;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const q: Pt = [cx - w / 2 + (w * i) / n, cy - h / 2 + (h * j) / n], s = score(q);
      if (s > bs) { bs = s; best = q; }
    }
    [cx, cy] = best; w /= 6; h /= 6;
  }
  return best;
}

/** Width and height the outline fills (some shapes are as tall as they are wide). */
export function outlineBox(p: PopupParams): { w: number; h: number } {
  const W = Math.max(20, p.shape.size), H = Math.max(20, p.shape.height);
  switch (p.shape.kind) {
    case "ellipse": case "rounded": case "heart": case "leaf": case "custom": return { w: W, h: H };
    case "pumpkin": return { w: W, h: W * 0.86 };
    default: return { w: W, h: W };
  }
}

/** The outline before centring: mm, y down. Null when a custom outline cannot be read. */
function rawOutline(kind: PopShape, p: PopupParams): Contour | null {
  const s = p.shape, { w: W, h: H } = outlineBox(p), R = W / 2;
  const depth = clampPct(s.depth, 2, 60);
  switch (kind) {
    case "circle": return ellipse(0, 0, R, R, 720);
    case "ellipse": return ellipse(0, 0, W / 2, H / 2, 720);
    case "rounded": return roundedRect(-W / 2, -H / 2, W, H, Math.min(Math.max(1, s.corner), Math.min(W, H) / 2 - 0.5));
    case "polygon": return roundCorners(regularPolygon(s.sides, R), Math.max(0, s.corner));
    case "star": return roundCorners(starPolygon(s.points, R, clampPct(s.inner, 25, 85)), Math.min(Math.max(0, s.corner), R * 0.08));
    case "heart": {
      const c = heartCurve(360);
      const b = c.reduce((m, [x, y]) => ({ x0: Math.min(m.x0, x), x1: Math.max(m.x1, x), y0: Math.min(m.y0, y), y1: Math.max(m.y1, y) }), { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });
      return c.map(([x, y]) => [((x - b.x0) / (b.x1 - b.x0) - 0.5) * W, ((y - b.y0) / (b.y1 - b.y0) - 0.5) * H] as Pt);
    }
    case "flower": {
      const k = s.petals;
      return polarShape(R, (a) => 1 - depth + depth * Math.pow(Math.abs(Math.cos((k * a) / 2)), 0.7));
    }
    case "pumpkin": {
      const k = s.petals;
      const body = polarShape(R, (a) => 1 - depth * 0.5 * (1 - Math.cos(k * a)) * (0.6 + 0.4 * Math.abs(Math.cos(a))), 0.8);
      // A short stem on top, welded on.
      const sw = R * 0.16, top = Math.min(...body.map(([, y]) => y));
      const stem: Contour = [[-sw / 2, top + R * 0.12], [sw / 2, top + R * 0.12], [sw / 2, top - R * 0.15], [sw * 0.1, top - R * 0.22], [-sw / 2, top - R * 0.17]];
      const u = unionShapes([orient(body), orient(stem)]);
      return u.length ? u.reduce((a, b) => (b.area > a.area ? b : a)).outer : body;
    }
    case "leaf": {
      const out: Contour = [];
      const n = 360;
      for (let i = 0; i < n; i++) {
        const t = (TAU * i) / n, y = -Math.cos(t) * H / 2, x = Math.sin(t) * (W / 2) * Math.pow(Math.max(0, 1 - Math.cos(t) ** 2), 0.35);
        out.push([x, y]);
      }
      return out;
    }
    case "snowflake": {
      const arms = 6;
      return polarShape(R, (a) => {
        const u = Math.abs(Math.cos((arms * a) / 2));
        return 1 - depth * 1.2 + depth * 1.2 * (Math.pow(u, 6) * 0.75 + Math.pow(Math.abs(Math.cos((3 * arms * a) / 2)), 4) * 0.25 * u);
      });
    }
    case "custom": return customOutline(s.path, W, H);
  }
}

/** The outline, centred on (0, 0), running the same way as a circle from `ellipse`. */
export function outlineOf(p: PopupParams): Contour | null {
  const raw = rawOutline(p.shape.kind, p);
  if (!raw || raw.length < 3) return null;
  let c = centred(raw);
  // Lopsided outlines (a heart, a pumpkin, a leaf) turn round the point farthest from their edges.
  if (p.shape.kind === "heart" || p.shape.kind === "pumpkin" || p.shape.kind === "leaf" || p.shape.kind === "custom") {
    const [gx, gy] = pole(c);
    c = c.map(([x, y]) => [x - gx, y - gy] as Pt);
  }
  const ref = signedArea(ellipse(0, 0, 10, 10, 16));
  return Math.sign(signedArea(c)) === Math.sign(ref) ? c : c.slice().reverse();
}

/** Ray from the centre at angle a against every edge: the farthest crossing, and how many there are. */
function cast(c: Contour, a: number): { r: number; hits: number } {
  const dx = Math.cos(a), dy = Math.sin(a);
  let best = 0;
  const ts: number[] = [];
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const [x1, y1] = c[j], [x2, y2] = c[i];
    const ex = x2 - x1, ey = y2 - y1;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = (x1 * ey - y1 * ex) / den, u = (x1 * dy - y1 * dx) / den;
    // A ray through a corner meets both edges there: a little slack, and crossings at one place count once.
    if (t > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) {
      if (!ts.some((q) => Math.abs(q - t) < 1e-6)) ts.push(t);
      if (t > best) best = t;
    }
  }
  return { r: best, hits: ts.length };
}

export function polarOf(c: Contour): Polar {
  const r = new Float64Array(N_DIR);
  let min = Infinity, max = 0, folded = false;
  for (let i = 0; i < N_DIR; i++) {
    const h = cast(c, (TAU * i) / N_DIR);
    r[i] = h.r;
    if (h.hits > 1) folded = true;
    if (h.r < min) min = h.r;
    if (h.r > max) max = h.r;
  }
  return { r, min, max, folded };
}

/** The outline's radius at angle a (radians), interpolated between sampled directions. */
export function rho(P: Polar, a: number): number {
  const x = ((((a / TAU) % 1) + 1) % 1) * N_DIR, i = Math.floor(x) % N_DIR, f = x - Math.floor(x);
  return P.r[i] + (P.r[(i + 1) % N_DIR] - P.r[i]) * f;
}
