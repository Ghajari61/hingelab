/**
 * Living Hinge: fills a closed shape with the hinge cut pattern of the Hinge Box designer (same
 * column placement, slit intervals and cut shapes from lib/hinge), sized to the shape's extent less a
 * margin and cut to that area. The cuts run along y (angle 0) or along x (angle 90). Cuts that reach
 * the zone edge stop there; in slot style they are cut flat at the edge.
 */
import type { Paths } from "clipper-lib";
import { DEFAULTS } from "@/lib/hinge/defaults";
import { bendAnalysis } from "@/lib/hinge/analysis";
import { colSegments, hingeCutPaths, hingeSegments, makeCols, mergesEdgeCuts, stadiumD } from "@/lib/hinge/hinge";
import type { BendResult, Params } from "@/lib/hinge/types";
import { parsePathData } from "@/lib/generators/geom";
import { rotateAt, transformSubpaths } from "../geom";
import { fromPath, regionOf } from "../pathfinder";
import type { LivingHingeParams, Subpath, Vec } from "../types";
import { clipLines, clipRings, offsetArea, openSubpath } from "./clip";

/** The Hinge Box parameters these effect settings stand for. */
export function hingeParams(p: LivingHingeParams): Params {
  return { ...DEFAULTS, pattern: p.pattern, cutStyle: p.cutStyle, slit: p.slit, bridge: p.bridge, pitch: p.pitch, slotW: p.slotW, K: p.kerf, material: p.material, T: p.thickness };
}

interface Zone { area: Paths; x0: number; x1: number; y0: number; h: number }

/** The area the cuts fill (in the hinge frame, where cuts run along y). */
function zoneOf(subs: Subpath[], p: LivingHingeParams): Zone | null {
  const region = regionOf(subs);
  if (!region.length) return null;
  const area = p.margin > 0 ? offsetArea(region, -p.margin) : region;
  if (!area.length) return null;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const v of area.flatMap(fromPath)) { x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
  return { area, x0, x1, y0, h: y1 - y0 };
}

const toFrame = (p: LivingHingeParams) => (p.angle === 90 ? rotateAt(-90) : null);

export function applyLivingHinge(subs: Subpath[], p: LivingHingeParams): Subpath[] {
  const into = toFrame(p);
  const zone = zoneOf(into ? transformSubpaths(subs, into) : subs, p);
  if (!zone || zone.h <= 0 || !(p.pitch > 0) || !(p.slit > 0) || !(p.bridge > 0)) return subs;
  const q = hingeParams(p);
  const hs = hingeSegments(zone.h, q.slit, q.bridge);
  const rr = (q.slotW - q.K) / 2, k2 = q.K / 2;
  const lines: Vec[][] = [], rings: Vec[][] = [];
  for (const col of makeCols(zone.x0, zone.x1, q)) {
    const segs = colSegments(col.kind, hs, zone.h, q.bridge);
    const ds = hingeCutPaths(col.x, segs, zone.h, q, 0, zone.y0);
    // Slot cuts that reach the edge are outline notches in the Hinge Box; here they are slots cut flat at the zone edge.
    if (q.cutStyle === "slot" && mergesEdgeCuts(q)) {
      for (const [y1, y2] of segs) if (y1 < 0 || y2 > zone.h) ds.push(stadiumD(col.x, y1 + k2, y2 - k2, rr, 0, zone.y0));
    }
    for (const d of ds) {
      const { contours, closed } = parsePathData(d, 0.02);
      contours.forEach((c, i) => (closed[i] ? rings : lines).push(c.map(([x, y]) => ({ x, y }))));
    }
  }
  let cuts: Subpath[] = [...clipLines(lines, zone.area).map(openSubpath), ...clipRings(rings, zone.area)];
  if (into) cuts = transformSubpaths(cuts, rotateAt(90));
  return [...(p.keepOutline ? subs : []), ...cuts];
}

/** Bend estimate for the zone (read-only display), or null when the shape has no area. */
export function livingHingeAnalysis(subs: Subpath[], p: LivingHingeParams): (BendResult & { columns: number; height: number }) | null {
  const into = toFrame(p);
  const zone = zoneOf(into ? transformSubpaths(subs, into) : subs, p);
  if (!zone || zone.h <= 0 || !(p.pitch > 0)) return null;
  const q = hingeParams(p);
  return { ...bendAnalysis(q, zone.h, 1), columns: makeCols(zone.x0, zone.x1, q).length, height: zone.h };
}
