/**
 * Taper Stroke and Power Stroke: the path becomes the filled outline of a stroke whose width varies
 * along it (open or closed paths), built with the brush outline of strokes.ts. Butt ends.
 */
import { brushOutline } from "../strokes";
import type { PowerStrokeParams, Subpath, TaperStrokeParams, Vec } from "../types";
import { track, trackAt, trackNearest } from "./warp";

const smoothstep = (r: number) => r * r * (3 - 2 * r);

/** Width at u (0–1 along the path): ramps over the first `start` % and the last `end` %, full width between. */
export function taperWidth(p: TaperStrokeParams): (u: number) => number {
  const s = Math.max(0, Math.min(100, p.start)) / 100, e = Math.max(0, Math.min(100, p.end)) / 100;
  const sm = Math.max(0, Math.min(1, p.smoothing));
  const shape = (r: number) => { const c = Math.max(0, Math.min(1, r)); return (1 - sm) * c + sm * smoothstep(c); };
  return (u) => {
    let r = 1;
    if (s > 0 && u < s) r = Math.min(r, u / s);
    if (e > 0 && u > 1 - e) r = Math.min(r, (1 - u) / e);
    return Math.max(0, p.width) * shape(r);
  };
}

export const applyTaperStroke = (subs: Subpath[], p: TaperStrokeParams): Subpath[] =>
  subs.filter((s) => s.nodes.length > 1).flatMap((s) => brushOutline(s, taperWidth(p)));

const sorted = (p: PowerStrokeParams) => p.points.filter((q) => Number.isFinite(q.t) && Number.isFinite(q.w)).slice().sort((a, b) => a.t - b.t);

/** Width at u from the control points; constant before the first and after the last. */
export function powerWidth(p: PowerStrokeParams): (u: number) => number {
  const pts = sorted(p);
  return (u) => {
    if (!pts.length) return 0;
    if (u <= pts[0].t) return Math.max(0, pts[0].w);
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k];
      if (u <= b.t) {
        const r = b.t - a.t > 1e-12 ? (u - a.t) / (b.t - a.t) : 1;
        return Math.max(0, a.w + (b.w - a.w) * (p.interpolation === "smooth" ? smoothstep(r) : r));
      }
    }
    return Math.max(0, pts[pts.length - 1].w);
  };
}

export const applyPowerStroke = (subs: Subpath[], p: PowerStrokeParams): Subpath[] =>
  subs.filter((s) => s.nodes.length > 1).flatMap((s) => brushOutline(s, powerWidth(p)));

const firstLine = (input: Subpath[]) => input.find((s) => s.nodes.length > 1);

/** One handle per control point, half its width to the right of the first subpath. */
export function powerHandles(p: PowerStrokeParams, input: Subpath[]): Vec[] {
  const s = firstLine(input);
  if (!s) return [];
  const t = track(s);
  return p.points.map((q) => {
    const { p: at, d } = trackAt(t, Math.max(0, Math.min(1, q.t)) * t.length);
    return { x: at.x - d.y * (q.w / 2), y: at.y + d.x * (q.w / 2) };
  });
}

/** A tick from the path to each handle. */
export function powerOutline(p: PowerStrokeParams, input: Subpath[]): Subpath[] {
  const s = firstLine(input);
  if (!s) return [];
  const t = track(s);
  return powerHandles(p, input).map((h, k) => ({ closed: false, nodes: [{ ...trackAt(t, Math.max(0, Math.min(1, p.points[k].t)) * t.length).p }, h] }));
}

/** Dragging a handle slides its control point along the path (between its neighbours) and sets its width. */
export function powerDrag(p: PowerStrokeParams, index: number, at: Vec, input: Subpath[]): Partial<PowerStrokeParams> {
  const s = firstLine(input);
  if (!s || !p.points[index]) return {};
  const t = track(s);
  if (t.length < 1e-9) return {};
  const near = trackNearest(t, at);
  const lo = index > 0 ? p.points[index - 1].t + 1e-3 : 0, hi = index < p.points.length - 1 ? p.points[index + 1].t - 1e-3 : 1;
  const points = p.points.map((q) => ({ ...q }));
  points[index] = { t: Math.max(lo, Math.min(hi, near.s / t.length)), w: Math.round(near.dist * 2 * 1000) / 1000 };
  return { points };
}
