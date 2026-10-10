/**
 * How closely the assembled parts follow the model: distances from random points on the model's
 * surface to the nearest part (each part a prism of thickness T at its placement), the mean and
 * max, and a fidelity score = clamp(1 − mean / (2 · spacing), 0, 1).
 */
import { pointInContour } from "@/lib/letters/polygon";
import { finSpacingOf } from "./defaults";
import { bounds } from "./source/mesh";
import type { Contour, Deviation, MeshData, ParametricParams, Part, SliceResult, Vec3 } from "./types";

export const DEVIATION_SAMPLES = 2000;

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Area-weighted random points on the mesh surface. Triangles lying flat on the wall (z = 0, facing
 * the wall) are skipped: that face is hidden against the backboard. `frontOnly` keeps z ≥ 0 only
 * (methods that build out of the wall leave whatever is behind it out).
 */
export function sampleSurface(m: MeshData, n: number, seed = 1, frontOnly = false): Float32Array {
  const p = m.positions, ix = m.indices, tris = ix.length / 3;
  const cum = new Float64Array(tris);
  let total = 0;
  for (let t = 0; t < tris; t++) {
    const a = ix[t * 3] * 3, b = ix[t * 3 + 1] * 3, c = ix[t * 3 + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const area = Math.hypot(nx, ny, nz) / 2;
    const onWall = Math.abs(p[a + 2]) < 1e-6 && Math.abs(p[b + 2]) < 1e-6 && Math.abs(p[c + 2]) < 1e-6 && nz < 0;
    const behind = frontOnly && Math.max(p[a + 2], p[b + 2], p[c + 2]) <= 0;
    total += onWall || behind ? 0 : area;
    cum[t] = total;
  }
  const out = new Float32Array(n * 3);
  if (!(total > 0)) return out.subarray(0, 0);
  const rnd = mulberry32(seed);
  let k = 0;
  // Triangles crossing the wall: points behind it are drawn again.
  for (let tries = 0; k < n && tries < n * 20; tries++) {
    const r = rnd() * total;
    let lo = 0, hi = tris - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; }
    let s = rnd(), q = rnd();
    if (s + q > 1) { s = 1 - s; q = 1 - q; }
    const a = ix[lo * 3] * 3, b = ix[lo * 3 + 1] * 3, c = ix[lo * 3 + 2] * 3;
    const z = p[a + 2] + s * (p[b + 2] - p[a + 2]) + q * (p[c + 2] - p[a + 2]);
    if (frontOnly && z < 0) continue;
    for (let d = 0; d < 3; d++) out[k * 3 + d] = p[a + d] + s * (p[b + d] - p[a + d]) + q * (p[c + d] - p[a + d]);
    k++;
  }
  return out.subarray(0, k * 3);
}

interface PartGeom {
  o: Vec3; u: Vec3; w: Vec3; n: Vec3;
  contours: Contour[];
  x0: number; y0: number; x1: number; y1: number;
}

export function partGeom(part: Part): PartGeom {
  const m = part.placement;
  const { x0, y0, x1, y1 } = part.shape.bbox;
  return { u: [m[0], m[1], m[2]], w: [m[4], m[5], m[6]], n: [m[8], m[9], m[10]], o: [m[12], m[13], m[14]], contours: [part.shape.outer, ...part.shape.holes], x0, y0, x1, y1 };
}

function segDist(x: number, y: number, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)) : 0;
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}

/** Distance from a part-local 2D point to the part's filled region (0 inside). */
function regionDist(g: PartGeom, x: number, y: number): number {
  const [outer, ...holes] = g.contours;
  if (pointInContour([x, y], outer) && !holes.some(h => pointInContour([x, y], h))) return 0;
  let d = Infinity;
  for (const c of g.contours) for (let i = 0; i < c.length; i++) d = Math.min(d, segDist(x, y, c[i], c[(i + 1) % c.length]));
  return d;
}

/** Distance from a model point to the nearest part prism (thickness T, centred on its plane). */
export function distanceToParts(q: Vec3, geoms: PartGeom[], T: number): number {
  const lbs = geoms.map((g, k) => {
    const rx = q[0] - g.o[0], ry = q[1] - g.o[1], rz = q[2] - g.o[2];
    const x = rx * g.u[0] + ry * g.u[1] + rz * g.u[2], y = rx * g.w[0] + ry * g.w[1] + rz * g.w[2], z = rx * g.n[0] + ry * g.n[1] + rz * g.n[2];
    const dz = Math.max(0, Math.abs(z) - T / 2);
    const bx = Math.max(0, g.x0 - x, x - g.x1), by = Math.max(0, g.y0 - y, y - g.y1);
    return { k, x, y, dz, lb: Math.hypot(dz, bx, by) };
  }).sort((a, b) => a.lb - b.lb);
  let best = Infinity;
  for (const c of lbs) {
    if (c.lb >= best) break;
    best = Math.min(best, Math.hypot(c.dz, regionDist(geoms[c.k], c.x, c.y)));
  }
  return best;
}

/** The method's typical gap between neighbouring parts, mm (the scale of the fidelity score). */
export function spacingOf(p: ParametricParams, mesh: MeshData, pts: Float32Array): number {
  if (p.method === "stacked") return p.material.T;
  if (p.method === "waffle") return (p.waffle.spacingA + p.waffle.spacingB) / 2;
  if (p.method === "curveNormal") return p.curveNormal.spacingAtGuide;
  if (p.method === "radial") {
    const o = p.radial, k = o.axis === "X" ? 0 : o.axis === "Y" ? 1 : 2;
    const b = bounds(mesh);
    const c = o.axisPoint ?? ([0, 1, 2].map(i => (b.min[i] + b.max[i]) / 2) as Vec3);
    const span = Math.min(360, Math.abs(o.angleRange[1] - o.angleRange[0]));
    const step = ((span >= 360 ? span / o.count : span / Math.max(1, o.count - 1)) * Math.PI) / 180;
    let s = 0;
    const n = pts.length / 3;
    for (let i = 0; i < n; i++) {
      let r2 = 0;
      for (let d = 0; d < 3; d++) if (d !== k) r2 += (pts[i * 3 + d] - c[d]) ** 2;
      s += Math.sqrt(r2);
    }
    return Math.max(p.material.T, (n ? s / n : 0) * step);
  }
  return finSpacingOf(p);
}

export function measureDeviation(r: SliceResult, mesh: MeshData, p: ParametricParams, n = DEVIATION_SAMPLES): { deviation: Deviation; max: number; mean: number; fidelity: number } | null {
  if (!r.parts.length) return null;
  const points = sampleSurface(mesh, n, 1, p.method === "parallel");
  const count = points.length / 3;
  if (!count) return null;
  const geoms = r.parts.map(partGeom);
  const values = new Float32Array(count);
  let max = 0, sum = 0;
  for (let i = 0; i < count; i++) {
    const d = distanceToParts([points[i * 3], points[i * 3 + 1], points[i * 3 + 2]], geoms, p.material.T);
    values[i] = d; max = Math.max(max, d); sum += d;
  }
  const mean = sum / count;
  const spacing = spacingOf(p, mesh, points);
  const fidelity = Math.min(1, Math.max(0, 1 - mean / (2 * spacing)));
  return { deviation: { points, values, spacing }, max, mean, fidelity };
}
