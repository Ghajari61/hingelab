/**
 * Hatches: parallel straight lines across the filled area (even-odd, as drawn), optionally a second
 * set at 90° (crosshatch). Lines run along `angle`; they sit at spacing/2 + phase from the edge of the
 * area's extent and every `spacing` after that, and alternate direction for a short laser path.
 */
import type { Paths } from "clipper-lib";
import { regionOf, fromPath } from "../pathfinder";
import type { HatchParams, Subpath, Vec } from "../types";
import { clipLines, offsetArea, openSubpath } from "./clip";

/** Most lines one set may hold; finer spacings are widened to stay under it. */
const MAX_LINES = 4000;

export function hatchLines(area: Paths, angleDeg: number, spacing: number, phase: number): Vec[][] {
  if (!area.length || !(spacing > 0)) return [];
  const a = (angleDeg * Math.PI) / 180;
  const u = { x: Math.cos(a), y: Math.sin(a) }, nrm = { x: -u.y, y: u.x };
  let lo = Infinity, hi = -Infinity, ulo = Infinity, uhi = -Infinity;
  for (const p of area.flatMap(fromPath)) {
    const t = p.x * nrm.x + p.y * nrm.y, s = p.x * u.x + p.y * u.y;
    lo = Math.min(lo, t); hi = Math.max(hi, t); ulo = Math.min(ulo, s); uhi = Math.max(uhi, s);
  }
  const step = Math.max(spacing, (hi - lo) / MAX_LINES);
  const shift = ((phase % step) + step) % step;
  const first = lo + step / 2 + shift - (shift > step / 2 ? step : 0);
  const pad = 1;
  const lines: Vec[][] = [];
  for (let t = first, k = 0; t <= hi + 1e-9; t = first + ++k * step) {
    const s0 = ulo - pad, s1 = uhi + pad;
    lines.push([
      { x: u.x * s0 + nrm.x * t, y: u.y * s0 + nrm.y * t },
      { x: u.x * s1 + nrm.x * t, y: u.y * s1 + nrm.y * t },
    ]);
  }
  const pieces = clipLines(lines, area);
  // Clipper returns pieces in no particular order: sort along the hatch, then snake.
  const key = (p: Vec[]) => {
    const m = { x: (p[0].x + p[p.length - 1].x) / 2, y: (p[0].y + p[p.length - 1].y) / 2 };
    return { t: m.x * nrm.x + m.y * nrm.y, s: m.x * u.x + m.y * u.y };
  };
  const keyed = pieces.map((p) => ({ p, ...key(p) })).sort((A, B) => (Math.abs(A.t - B.t) > step / 4 ? A.t - B.t : A.s - B.s));
  return keyed.map(({ p, t }) => {
    const forward = (p[p.length - 1].x - p[0].x) * u.x + (p[p.length - 1].y - p[0].y) * u.y >= 0;
    const odd = Math.round((t - first) / step) % 2 !== 0;
    return forward === odd ? [...p].reverse() : p;
  });
}

export function applyHatches(subs: Subpath[], p: HatchParams): Subpath[] {
  const region = regionOf(subs);
  if (!region.length) return subs;
  const area = p.inset > 0 ? offsetArea(region, -p.inset) : region;
  const lines = [
    ...hatchLines(area, p.angle, p.spacing, p.phase),
    ...(p.cross ? hatchLines(area, p.angle + 90, p.spacing, p.phase) : []),
  ];
  return [...(p.keepOutline ? subs : []), ...lines.map(openSubpath)];
}
