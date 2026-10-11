/**
 * Calligraphy tool: a flat nib dragged along the pointer. Each sample gives the nib's two end points;
 * the quads between successive nib positions (plus optional rounded caps) are unioned with Clipper
 * into a filled outline for engraving, and the outline is tidied into a path with smooth curves where
 * it bends gently and corners where the nib turns sharply.
 */
import * as ClipperLib from "clipper-lib";
import type { Paths } from "clipper-lib";
import { seeded } from "./arrays";
import { simplifyPolyline } from "./geom";
import { run, toPath, toSubpaths } from "./pathfinder";
import type { Anchor, Subpath, Vec } from "./types";

export interface CalligraphyParams {
  /** Nib width: mm, or percent of the visible canvas width when `relative`. */
  width: number;
  relative: boolean;
  /** −100…100: positive makes fast strokes thinner, negative makes them wider. */
  thinning: number;
  /** Nib angle, degrees counter-clockwise from horizontal. */
  angle: number;
  /** 0: the nib turns to stay across the stroke (even width); 100: the nib keeps `angle`. */
  fixation: number;
  /** 0: flat ends; up to 5: ends bulge out by caps × ¼ of the nib width. */
  caps: number;
  /** 0…100: random wobble of the width (seeded). */
  tremor: number;
  /** 0…100: the nib lags behind the pointer like a heavy pen, smoothing jitter. */
  mass: number;
  /** Pen pressure scales the width (half pressure = set width). */
  pressure: boolean;
}

export const CALLIGRAPHY_DEFAULTS: CalligraphyParams = { width: 2, relative: false, thinning: 10, angle: 30, fixation: 90, caps: 0, tremor: 0, mass: 2, pressure: false };

export const CALLIGRAPHY_PRESETS: { id: string; label: string; params: Partial<CalligraphyParams> }[] = [
  { id: "dip", label: "Dip pen", params: { width: 1.6, thinning: 10, angle: 30, fixation: 90, caps: 0, tremor: 0, mass: 2, pressure: true } },
  { id: "marker", label: "Marker", params: { width: 3, thinning: 0, angle: 0, fixation: 0, caps: 2, tremor: 0, mass: 0, pressure: false } },
  { id: "brush", label: "Brush", params: { width: 4, thinning: 40, angle: 45, fixation: 25, caps: 2.5, tremor: 0, mass: 6, pressure: true } },
  { id: "wiggly", label: "Wiggly", params: { width: 2.5, thinning: 20, angle: 30, fixation: 40, caps: 0.5, tremor: 55, mass: 0, pressure: false } },
  { id: "splotchy", label: "Splotchy", params: { width: 5, thinning: -60, angle: 30, fixation: 0, caps: 3, tremor: 25, mass: 35, pressure: false } },
  { id: "tracing", label: "Tracing", params: { width: 1, thinning: 0, angle: 45, fixation: 50, caps: 1, tremor: 0, mass: 0, pressure: true } },
];

export interface InkSample { x: number; y: number; /** ms */ t: number; /** 0–1; a mouse reports 0.5 */ pressure: number }

export interface RibbonOptions { /** Nib width in mm (already resolved from `relative`). */ widthMm: number; /** Screen pixels per mm, for speed. */ pxPerMm: number; seed: number }

/** Nib width in mm for a canvas `viewWidthMm` wide. */
export const nibWidthMm = (p: CalligraphyParams, viewWidthMm: number) => (p.relative ? (p.width / 100) * viewWidthMm : p.width);

/** Speed (screen px/ms) at which thinning has its full effect. */
const FULL_SPEED = 1.5;

/** The nib's end points at each kept sample (left and right of the stroke), and the stroke direction there. */
export function nibRibbon(samples: InkSample[], p: CalligraphyParams, o: RibbonOptions): { left: Vec[]; right: Vec[]; dirs: Vec[]; centre: Vec[] } {
  const rnd = seeded(o.seed);
  const k = 1 - (Math.max(0, Math.min(100, p.mass)) / 100) * 0.92;
  const pts: (Vec & { t: number; pr: number })[] = [];
  let f: Vec | null = null;
  for (const s of samples) {
    f = f ? { x: f.x + (s.x - f.x) * k, y: f.y + (s.y - f.y) * k } : { x: s.x, y: s.y };
    const last = pts[pts.length - 1];
    if (last && Math.hypot(f.x - last.x, f.y - last.y) < 1e-4) continue;
    pts.push({ x: f.x, y: f.y, t: s.t, pr: s.pressure });
  }
  const n = pts.length;
  const left: Vec[] = [], right: Vec[] = [], dirs: Vec[] = [];
  if (!n) return { left, right, dirs, centre: [] };
  const fixed = (-p.angle * Math.PI) / 180;
  const fix = Math.max(0, Math.min(100, p.fixation)) / 100;
  const thin = Math.max(-100, Math.min(100, p.thinning)) / 100;
  let speed = 0, wobble = 0, dir: Vec = { x: 1, y: 0 };
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l > 1e-9) dir = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
    dirs.push(dir);
    if (i > 0) {
      const v = (Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) * o.pxPerMm) / Math.max(1, pts[i].t - pts[i - 1].t);
      speed += (v - speed) * 0.4;
    }
    const sf = Math.min(1, speed / FULL_SPEED);
    let factor = thin >= 0 ? 1 - thin * sf * 0.9 : 1 - thin * sf;
    if (p.pressure) factor *= Math.max(0.05, Math.min(2, pts[i].pr / 0.5));
    if (p.tremor > 0) { wobble += ((rnd() * 2 - 1) - wobble) * 0.6; factor *= Math.max(0.02, 1 + wobble * (Math.min(100, p.tremor) / 100) * 0.8); }
    const hw = (o.widthMm / 2) * Math.max(0, factor);
    const across = Math.atan2(dir.x, -dir.y);
    const diff = ((((fixed - across + Math.PI / 2) % Math.PI) + Math.PI) % Math.PI) - Math.PI / 2;
    const th = across + fix * diff;
    const nx = Math.cos(th) * hw, ny = Math.sin(th) * hw;
    left.push({ x: pts[i].x + nx, y: pts[i].y + ny });
    right.push({ x: pts[i].x - nx, y: pts[i].y - ny });
  }
  return { left, right, dirs, centre: pts.map((q) => ({ x: q.x, y: q.y })) };
}

/** Half-ellipse on the nib at one end, bulging away from the stroke (`back` = −direction at the start). */
function cap(c: Vec, l: Vec, back: Vec, bulge: number): Vec[] {
  const ax = { x: l.x - c.x, y: l.y - c.y };
  const out: Vec[] = [];
  for (let k = 0; k <= 16; k++) {
    const a = (Math.PI * k) / 16;
    out.push({ x: c.x + ax.x * Math.cos(a) + back.x * bulge * Math.sin(a), y: c.y + ax.y * Math.cos(a) + back.y * bulge * Math.sin(a) });
  }
  return out;
}

/** The stroke's filled outline as Clipper paths (nonzero union of the nib quads and caps). */
export function calligraphyArea(samples: InkSample[], p: CalligraphyParams, o: RibbonOptions): Paths {
  const { left, right, dirs, centre } = nibRibbon(samples, p, o);
  const polys: Paths = [];
  // Each piece is made simple and positively wound first: a reversing stroke or a turning nib gives
  // quads of either winding (or bow-ties), which would cancel each other in a nonzero union.
  const add = (pts: Vec[]) => { for (const q of ClipperLib.Clipper.SimplifyPolygon(toPath(pts), ClipperLib.PolyFillType.pftNonZero) as Paths) polys.push(ClipperLib.Clipper.Orientation(q) ? q : q.reverse()); };
  for (let i = 1; i < left.length; i++) add([left[i - 1], left[i], right[i], right[i - 1]]);
  const n = left.length;
  if (p.caps > 0 && n) {
    const hw0 = Math.hypot(left[0].x - centre[0].x, left[0].y - centre[0].y), hw1 = Math.hypot(left[n - 1].x - centre[n - 1].x, left[n - 1].y - centre[n - 1].y);
    const caps = Math.min(5, p.caps) / 2;
    if (hw0 > 1e-6) add(cap(centre[0], left[0], { x: -dirs[0].x, y: -dirs[0].y }, caps * hw0));
    if (hw1 > 1e-6) add(cap(centre[n - 1], left[n - 1], dirs[n - 1], caps * hw1));
  }
  return polys.length ? run(ClipperLib.ClipType.ctUnion, polys, [], ClipperLib.PolyFillType.pftNonZero) : [];
}

/**
 * A closed polyline as a path: near-collinear points dropped (`tol` mm), gentle bends (under 35°)
 * become smooth curve points and sharper ones stay corners.
 */
export function smoothOutline(s: Subpath, tol: number): Subpath {
  const ring = s.nodes.map((a) => ({ x: a.x, y: a.y }));
  if (ring.length < 4) return s;
  const pts = simplifyPolyline([...ring, ring[0]], tol);
  pts.pop();
  const n = pts.length;
  if (n < 3) return { closed: true, nodes: pts };
  const nodes: Anchor[] = pts.map((q, k) => {
    const a = pts[(k - 1 + n) % n], b = pts[(k + 1) % n];
    const u = { x: q.x - a.x, y: q.y - a.y }, v = { x: b.x - q.x, y: b.y - q.y };
    const lu = Math.hypot(u.x, u.y), lv = Math.hypot(v.x, v.y);
    const turn = lu > 1e-9 && lv > 1e-9 ? Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / (lu * lv)))) : Math.PI;
    if (turn >= (35 * Math.PI) / 180) return { x: q.x, y: q.y };
    const tx = (b.x - a.x) / 6, ty = (b.y - a.y) / 6, tl = Math.hypot(tx, ty) || 1;
    const hi = Math.min(tl, lu / 3) / tl, ho = Math.min(tl, lv / 3) / tl;
    return { x: q.x, y: q.y, i: { x: q.x - tx * hi, y: q.y - ty * hi }, o: { x: q.x + tx * ho, y: q.y + ty * ho }, k: "smooth" };
  });
  return { closed: true, nodes };
}

/** The finished stroke as subpaths (world mm), or [] when nothing has area. */
export function calligraphyStroke(samples: InkSample[], p: CalligraphyParams, o: RibbonOptions): Subpath[] {
  const tol = Math.max(0.005, Math.min(0.03, o.widthMm / 60));
  return toSubpaths(calligraphyArea(samples, p, o)).map((s) => smoothOutline(s, tol));
}
