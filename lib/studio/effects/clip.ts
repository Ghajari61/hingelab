/**
 * Clipper helpers shared by the Live Effects: grow or shrink an area, clip open lines and closed
 * polylines to an area, and unite areas. Built on the Pathfinder's helpers (1 unit = 0.001 mm).
 */
import * as ClipperLib from "clipper-lib";
import type { Path, Paths } from "clipper-lib";
import { flatten } from "../geom";
import { FLAT_TOL, fromPath, regionOf, run, toPath, toSubpaths, UNIT } from "../pathfinder";
import type { Subpath, Vec } from "../types";

const NZ = ClipperLib.PolyFillType.pftNonZero;

/** An area grown (positive) or shrunk (negative) by `d` mm with round joins. */
export function offsetArea(area: Paths, d: number): Paths {
  if (!area.length || Math.abs(d) < 1e-9) return area;
  const co = new ClipperLib.ClipperOffset(2, FLAT_TOL * UNIT * 0.5);
  co.AddPaths(area, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const out: Paths = [];
  co.Execute(out, d * UNIT);
  return out;
}

/** The parts of open polylines (mm) inside `area`. */
export function clipLines(lines: Vec[][], area: Paths): Vec[][] {
  const subj = lines.filter((l) => l.length > 1).map(toPath);
  if (!subj.length || !area.length) return [];
  const c = new ClipperLib.Clipper();
  c.AddPaths(subj, ClipperLib.PolyType.ptSubject, false);
  c.AddPaths(area, ClipperLib.PolyType.ptClip, true);
  const tree = new ClipperLib.PolyTree();
  c.Execute(ClipperLib.ClipType.ctIntersection, tree, NZ, NZ);
  return (ClipperLib.Clipper.OpenPathsFromPolyTree(tree) as Path[]).filter((p) => p.length > 1).map(fromPath);
}

/** Closed polylines (mm) cut to `area`, as closed subpaths. */
export function clipRings(rings: Vec[][], area: Paths): Subpath[] {
  const subj = rings.filter((r) => r.length > 2).map(toPath);
  if (!subj.length || !area.length) return [];
  return toSubpaths(run(ClipperLib.ClipType.ctIntersection, subj, area));
}

/** One area from the closed parts of several path sets (each read even-odd, as the canvas draws it). */
export function uniteClosed(sets: Subpath[][]): Subpath[] {
  const regions = sets.map(regionOf).filter((r) => r.length);
  if (!regions.length) return [];
  return toSubpaths(run(ClipperLib.ClipType.ctUnion, regions.flat(), []));
}

export const openParts = (subs: Subpath[]) => subs.filter((s) => !s.closed);

export const openSubpath = (pts: Vec[]): Subpath => ({ closed: false, nodes: pts.map((p) => ({ x: p.x, y: p.y })) });

export const flatRing = (s: Subpath) => flatten(s, FLAT_TOL);
