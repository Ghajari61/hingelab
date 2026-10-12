/**
 * Cheap pictures of a formula design for the generator: the formula sampled on a small grid plus
 * the lines where the fins, ribs or layers will fall. Nothing is sliced, so six variations draw in
 * a few milliseconds. Library, file, photo and text sources have no preview here (their gallery
 * thumbnails are used instead).
 */
import { finSpacingOf } from "./defaults";
import { compileFormula } from "./source/formula";
import type { ParametricParams } from "./types";

/** A segment in mm, y up. */
export type Seg = [number, number, number, number];

export type PreviewData =
  | { kind: "field"; x0: number; y0: number; w: number; h: number; nx: number; ny: number; z: Float32Array; lo: number; hi: number; segs: Seg[]; levels: number | null }
  | { kind: "lines"; extent: number; segs: Seg[]; outline: [number, number][] | null };

function grid(x0: number, y0: number, w: number, h: number, n: number, f: (x: number, y: number) => number) {
  const nx = Math.max(4, n), ny = Math.max(4, Math.round((n * h) / w));
  const z = new Float32Array((nx + 1) * (ny + 1));
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const v = f(x0 + (w * i) / nx, y0 + (h * j) / ny);
    z[j * (nx + 1) + i] = v;
    if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  }
  return { nx, ny, z, lo: Number.isFinite(lo) ? lo : 0, hi: Number.isFinite(hi) ? hi : 1 };
}

/** Lines `step` mm apart across a span, centred like the slicer's planes (phase 0.5). */
function stations(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  if (!(step > 0)) return out;
  const n = Math.floor((hi - lo) / step);
  const start = lo + (hi - lo - n * step) / 2;
  for (let k = 0; k <= n && out.length < 400; k++) out.push(start + k * step);
  return out;
}

export function previewData(p: ParametricParams, n = 64): PreviewData | null {
  const s = p.source;
  try {
    if (p.method === "curveNormal") return curvePreview(p);
    if (s.kind !== "formula") return null;
    const vars: Record<string, number> = Object.fromEntries(Object.entries(s.variables).map(([k, v]) => [k, v.value]));
    if (s.type === "heightfield") {
      const f = compileFormula(s.expression, ["x", "y"], Object.keys(s.variables));
      const [x0, x1] = s.domain.x, [y0, y1] = s.domain.y, w = x1 - x0, h = y1 - y0;
      const g = grid(x0, y0, w, h, n, (x, y) => { vars.x = x; vars.y = y; return f(vars); });
      const segs: Seg[] = [];
      if (p.method === "parallel") {
        const step = finSpacingOf(p);
        if (p.parallel.axis === "X") for (const x of stations(x0, x1, step)) segs.push([x, y0, x, y1]);
        else for (const y of stations(y0, y1, step)) segs.push([x0, y, x1, y]);
      } else if (p.method === "waffle") {
        for (const x of stations(x0, x1, p.waffle.spacingA)) segs.push([x, y0, x, y1]);
        for (const y of stations(y0, y1, p.waffle.spacingB)) segs.push([x0, y, x1, y]);
      }
      return { kind: "field", x0, y0, w, h, ...g, segs, levels: p.method === "stacked" ? p.material.T : null };
    }
    if (s.type === "radial-profile") {
      const f = compileFormula(s.expression, ["theta", "s"], Object.keys(s.variables));
      const r0 = Math.min(s.domain.x[0], s.domain.x[1]), r1 = Math.max(s.domain.x[0], s.domain.x[1]);
      const g = grid(-r1, -r1, 2 * r1, 2 * r1, n, (x, y) => {
        const r = Math.hypot(x, y);
        if (r < r0 || r > r1) return NaN;
        vars.theta = Math.atan2(y, x); vars.s = r - r0;
        return f(vars);
      });
      const segs: Seg[] = [];
      const [a0, a1] = p.radial.angleRange, full = Math.abs(a1 - a0) >= 360 - 1e-6;
      const count = Math.max(1, Math.round(p.radial.count));
      for (let i = 0; i < count; i++) {
        const a = ((a0 + ((a1 - a0) * i) / (full ? count : Math.max(1, count - 1))) * Math.PI) / 180;
        segs.push([r0 * Math.cos(a), r0 * Math.sin(a), r1 * Math.cos(a), r1 * Math.sin(a)]);
      }
      return { kind: "field", x0: -r1, y0: -r1, w: 2 * r1, h: 2 * r1, ...g, segs, levels: null };
    }
    return null;
  } catch {
    return null;
  }
}

function curvePreview(p: ParametricParams): PreviewData | null {
  const c = p.curveNormal;
  const len = compileFormula(c.finLength, ["t"]);
  const outline = c.outerBoundary.kind === "formula" ? compileFormula(c.outerBoundary.expression, ["phi"]) : null;
  const [a, b] = c.guide.kind === "circle" ? [c.guide.d / 2, c.guide.d / 2] : [c.guide.w / 2, c.guide.h / 2];
  const count = Math.max(3, Math.min(600, c.count ?? Math.round((Math.PI * (a + b)) / Math.max(1, c.spacingAtGuide))));
  const bound = (x: number, y: number) => {
    if (outline) return Math.hypot(x, y) <= outline({ phi: Math.atan2(y, x) });
    if (c.outerBoundary.kind === "ellipse") return (x / (c.outerBoundary.w / 2)) ** 2 + (y / (c.outerBoundary.h / 2)) ** 2 <= 1;
    return true;
  };
  const segs: Seg[] = [];
  let extent = Math.max(a, b);
  for (let i = 0; i < count; i++) {
    const t = i / count, th = 2 * Math.PI * t;
    const x = a * Math.cos(th), y = b * Math.sin(th);
    let nx = b * Math.cos(th), ny = a * Math.sin(th);
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl; ny /= nl;
    const L = Math.max(0, len({ t }));
    let d = 0;
    while (d < L && bound(x + nx * (d + 1), y + ny * (d + 1))) d += 1;
    segs.push([x, y, x + nx * d, y + ny * d]);
    extent = Math.max(extent, Math.hypot(x + nx * d, y + ny * d));
  }
  let ring: [number, number][] | null = null;
  if (outline) {
    ring = [];
    for (let k = 0; k < 120; k++) { const phi = (k / 120) * 2 * Math.PI, r = outline({ phi }); ring.push([r * Math.cos(phi), r * Math.sin(phi)]); }
  }
  return { kind: "lines", extent, segs, outline: ring };
}
