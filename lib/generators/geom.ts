/** 2D helpers shared by the generators: mm, y down, contours as point lists. */
import { r3 } from "@/lib/hinge/util";
import type { Contour, Pt } from "./types";

/** Chord tolerance for arcs, mm. */
export const ARC_TOL = 0.03;

export const TAU = Math.PI * 2;
export const deg = (d: number) => (d * Math.PI) / 180;

/** Segments for an arc of radius r spanning `sweep` radians within the chord tolerance. */
export function arcSegments(r: number, sweep: number, tol = ARC_TOL): number {
  if (!(r > tol)) return 1;
  const step = 2 * Math.acos(1 - tol / r);
  return Math.max(2, Math.ceil(Math.abs(sweep) / step));
}

/** Points on an arc from angle a0 to a1 (radians; positive turns clockwise on screen, as y is down). */
export function arc(cx: number, cy: number, r: number, a0: number, a1: number, tol = ARC_TOL, includeEnd = true): Contour {
  const n = arcSegments(r, a1 - a0, tol);
  const out: Contour = [];
  for (let i = 0; i <= n; i++) {
    if (i === n && !includeEnd) break;
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

export function circle(cx: number, cy: number, r: number, tol = ARC_TOL): Contour {
  return arc(cx, cy, r, 0, TAU, tol, false);
}

export function ellipse(cx: number, cy: number, rx: number, ry: number, n = 0): Contour {
  const m = n || Math.max(24, arcSegments(Math.max(rx, ry), TAU));
  const out: Contour = [];
  for (let i = 0; i < m; i++) { const a = (TAU * i) / m; out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return out;
}

export function rect(x0: number, y0: number, w: number, h: number): Contour {
  return [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]];
}

/** Regular polygon with `n` corners on radius R (corner radius), first corner at angle `rot` (deg, 0 = up). */
export function regularPolygon(n: number, R: number, rot = 0, cx = 0, cy = 0): Contour {
  const out: Contour = [];
  for (let i = 0; i < n; i++) {
    const a = deg(rot) - Math.PI / 2 + (TAU * i) / n;
    out.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
  }
  return out;
}

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const len = (a: Pt) => Math.hypot(a[0], a[1]);
const norm = (a: Pt): Pt => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };

/** Fillet every corner of a closed polygon with radius r (shrunk where an edge is too short). */
export function roundCorners(poly: Contour, r: number, tol = ARC_TOL): Contour {
  if (!(r > 0) || poly.length < 3) return poly.slice();
  const n = poly.length;
  const out: Contour = [];
  for (let i = 0; i < n; i++) {
    const A = poly[(i + n - 1) % n], B = poly[i], C = poly[(i + 1) % n];
    const u = norm(sub(A, B)), v = norm(sub(C, B));
    const cos = Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]));
    const half = Math.acos(cos) / 2;
    if (half < 1e-6 || Math.PI / 2 - half < 1e-6) { out.push(B); continue; }
    let d = r / Math.tan(half);
    const dMax = Math.min(len(sub(A, B)), len(sub(C, B))) / 2;
    d = Math.min(d, dMax);
    const rr = d * Math.tan(half);
    const bis = norm([u[0] + v[0], u[1] + v[1]]);
    const c: Pt = [B[0] + (bis[0] * rr) / Math.sin(half), B[1] + (bis[1] * rr) / Math.sin(half)];
    const p0: Pt = [B[0] + u[0] * d, B[1] + u[1] * d], p1: Pt = [B[0] + v[0] * d, B[1] + v[1] * d];
    let a0 = Math.atan2(p0[1] - c[1], p0[0] - c[0]), a1 = Math.atan2(p1[1] - c[1], p1[0] - c[0]);
    let sweep = a1 - a0;
    while (sweep > Math.PI) sweep -= TAU;
    while (sweep < -Math.PI) sweep += TAU;
    a1 = a0 + sweep;
    out.push(...arc(c[0], c[1], rr, a0, a1, tol));
  }
  return out;
}

export function roundedRect(x0: number, y0: number, w: number, h: number, r: number): Contour {
  return roundCorners(rect(x0, y0, w, h), Math.min(r, w / 2, h / 2));
}

/** Stadium (slot) between two centres, width w. */
export function stadium(x0: number, y0: number, x1: number, y1: number, w: number): Contour {
  const a = Math.atan2(y1 - y0, x1 - x0), r = w / 2;
  return [...arc(x1, y1, r, a - Math.PI / 2, a + Math.PI / 2), ...arc(x0, y0, r, a + Math.PI / 2, a + (3 * Math.PI) / 2)];
}

export interface Place { x?: number; y?: number; rot?: number; sx?: number; sy?: number }

/** Scale, then rotate (deg, clockwise on screen), then move. */
export function transform(c: Contour, t: Place): Contour {
  const a = deg(t.rot ?? 0), cs = Math.cos(a), sn = Math.sin(a), sx = t.sx ?? 1, sy = t.sy ?? sx, x = t.x ?? 0, y = t.y ?? 0;
  return c.map(([px, py]) => { const qx = px * sx, qy = py * sy; return [x + qx * cs - qy * sn, y + qx * sn + qy * cs] as Pt; });
}

export const reverse = (c: Contour): Contour => c.slice().reverse();

export function bboxOf(cs: Contour[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cs) for (const [x, y] of c) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

export function signedArea(c: Contour) {
  let s = 0;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) s += c[j][0] * c[i][1] - c[i][0] * c[j][1];
  return s / 2;
}

export function pointInContour(p: Pt, c: Contour) {
  let inside = false;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const [xi, yi] = c[i], [xj, yj] = c[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Path data for a contour, moved by (ox, oy). */
export function pathD(c: Contour, closed: boolean, ox = 0, oy = 0): string {
  if (!c.length) return "";
  const s = "M" + c.map(([x, y]) => `${r3(x + ox)},${r3(y + oy)}`).join(" L");
  return closed ? s + " Z" : s;
}

/** Shortest distance from p to segment ab. */
export function segDist(p: Pt, a: Pt, b: Pt) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Smallest distance from a point to a closed contour's edges. */
export function distToContour(p: Pt, c: Contour) {
  let d = Infinity;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) d = Math.min(d, segDist(p, c[j], c[i]));
  return d;
}

/** Smallest distance between the edges of two closed contours (vertex to edge both ways). */
export function contourGap(a: Contour, b: Contour) {
  let d = Infinity;
  for (const p of a) d = Math.min(d, distToContour(p, b));
  for (const p of b) d = Math.min(d, distToContour(p, a));
  return d;
}

/* ---------- SVG path data → closed contours (for custom outlines) ---------- */

const TOKEN = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;

/** Every subpath of SVG path data, flattened. Curves within `tol` mm. Throws on bad data. */
export function parsePathData(d: string, tol = 0.05): { contours: Contour[]; closed: boolean[] } {
  const toks: (string | number)[] = [];
  for (const m of d.matchAll(TOKEN)) toks.push(m[1] ?? Number(m[2]));
  const contours: Contour[] = [], closed: boolean[] = [];
  let cur: Contour = [], x = 0, y = 0, sx = 0, sy = 0, cmd = "", lcx = 0, lcy = 0, lqx = 0, lqy = 0, prev = "";
  let i = 0;
  const num = () => { const v = toks[i++]; if (typeof v !== "number") throw new Error("The path data is not valid."); return v; };
  const flush = (isClosed: boolean) => { if (cur.length > 1) { contours.push(cur); closed.push(isClosed); } cur = []; };
  const cubic = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
    const l = Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
    const n = Math.max(2, Math.min(200, Math.ceil(Math.sqrt(l / tol) * 0.6)));
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t;
      cur.push([u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3]);
    }
    lcx = x2; lcy = y2; x = x3; y = y3;
  };
  const quad = (x1: number, y1: number, x2: number, y2: number) => {
    const l = Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(2, Math.min(200, Math.ceil(Math.sqrt(l / tol) * 0.6)));
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t;
      cur.push([u * u * x + 2 * u * t * x1 + t * t * x2, u * u * y + 2 * u * t * y1 + t * t * y2]);
    }
    lqx = x1; lqy = y1; x = x2; y = y2;
  };
  const arcTo = (rx: number, ry: number, rotDeg: number, large: number, sweep: number, x2: number, y2: number) => {
    if (!rx || !ry) { cur.push([x2, y2]); x = x2; y = y2; return; }
    const phi = deg(rotDeg), cp = Math.cos(phi), sp = Math.sin(phi);
    const dx = (x - x2) / 2, dy = (y - y2) / 2;
    const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
    rx = Math.abs(rx); ry = Math.abs(ry);
    const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    const num2 = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    let co = Math.sqrt(Math.max(0, num2 / den));
    if (large === sweep) co = -co;
    const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
    const cx = cp * cxp - sp * cyp + (x + x2) / 2, cy = sp * cxp + cp * cyp + (y + y2) / 2;
    const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!sweep && dt > 0) dt -= TAU; else if (sweep && dt < 0) dt += TAU;
    const n = arcSegments(Math.max(rx, ry), dt, tol);
    for (let k = 1; k <= n; k++) {
      const t = t1 + (dt * k) / n;
      cur.push([cx + rx * Math.cos(t) * cp - ry * Math.sin(t) * sp, cy + rx * Math.cos(t) * sp + ry * Math.sin(t) * cp]);
    }
    x = x2; y = y2;
  };
  while (i < toks.length) {
    const t = toks[i];
    if (typeof t === "string") { cmd = t; i++; } else if (!cmd) throw new Error("The path data must start with M.");
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    switch (C) {
      case "M": {
        flush(false);
        x = ox + num(); y = oy + num(); sx = x; sy = y; cur.push([x, y]);
        cmd = rel ? "l" : "L";
        break;
      }
      case "L": x = ox + num(); y = oy + num(); cur.push([x, y]); break;
      case "H": x = (rel ? x : 0) + num(); cur.push([x, y]); break;
      case "V": y = (rel ? y : 0) + num(); cur.push([x, y]); break;
      case "C": { const a = ox + num(), b = oy + num(), c = ox + num(), e = oy + num(), f = ox + num(), g = oy + num(); cubic(a, b, c, e, f, g); break; }
      case "S": {
        const rx1 = /[CcSs]/.test(prev) ? 2 * x - lcx : x, ry1 = /[CcSs]/.test(prev) ? 2 * y - lcy : y;
        const c = ox + num(), e = oy + num(), f = ox + num(), g = oy + num(); cubic(rx1, ry1, c, e, f, g); break;
      }
      case "Q": { const a = ox + num(), b = oy + num(), c = ox + num(), e = oy + num(); quad(a, b, c, e); break; }
      case "T": {
        const qx = /[QqTt]/.test(prev) ? 2 * x - lqx : x, qy = /[QqTt]/.test(prev) ? 2 * y - lqy : y;
        const c = ox + num(), e = oy + num(); quad(qx, qy, c, e); break;
      }
      case "A": { const rx = num(), ry = num(), rot = num(), la = num(), sw = num(), ex = ox + num(), ey = oy + num(); arcTo(rx, ry, rot, la ? 1 : 0, sw ? 1 : 0, ex, ey); break; }
      case "Z": {
        x = sx; y = sy;
        const first = cur[0], last = cur[cur.length - 1];
        if (first && last && Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-9) cur.pop();
        flush(true);
        cur = [[x, y]];
        break;
      }
      default: throw new Error("The path data is not valid.");
    }
    prev = cmd;
  }
  flush(false);
  return { contours, closed };
}

/** The largest closed outline in path data, scaled to fit a w × h box and centred on (0, 0). */
export function customOutline(d: string, w: number, h: number): Contour | null {
  let parsed;
  try { parsed = parsePathData(d); } catch { return null; }
  const loops = parsed.contours.filter((c) => c.length >= 3);
  if (!loops.length) return null;
  const big = loops.reduce((a, b) => (Math.abs(signedArea(b)) > Math.abs(signedArea(a)) ? b : a));
  const bb = bboxOf([big]);
  const bw = bb.x1 - bb.x0, bh = bb.y1 - bb.y0;
  if (!(bw > 0 && bh > 0)) return null;
  const s = Math.min(w / bw, h / bh);
  return big.map(([x, y]) => [(x - (bb.x0 + bb.x1) / 2) * s, (y - (bb.y0 + bb.y1) / 2) * s] as Pt);
}
