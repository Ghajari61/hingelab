/**
 * Offset: the filled area grown (positive distance) or shrunk (negative), with round, mitred or
 * bevelled joins; open paths become a closed outline `|distance|` either side. Same engine as the
 * Offset Path command, kept live.
 */
import * as ClipperLib from "clipper-lib";
import type { Paths } from "clipper-lib";
import { flatten } from "../geom";
import { FLAT_TOL, regionOf, toPath, toSubpaths, UNIT } from "../pathfinder";
import type { OffsetParams, Subpath } from "../types";

export function applyOffset(subs: Subpath[], p: OffsetParams): Subpath[] {
  if (Math.abs(p.distance) < 1e-9) return subs;
  const jt = p.join === "round" ? ClipperLib.JoinType.jtRound : p.join === "miter" ? ClipperLib.JoinType.jtMiter : ClipperLib.JoinType.jtSquare;
  const co = new ClipperLib.ClipperOffset(Math.max(1, p.miterLimit), FLAT_TOL * UNIT * 0.5);
  const region = regionOf(subs);
  if (region.length) co.AddPaths(region, jt, ClipperLib.EndType.etClosedPolygon);
  const open = subs.filter((s) => !s.closed && s.nodes.length > 1).map((s) => toPath(flatten(s, FLAT_TOL)));
  if (open.length) co.AddPaths(open, jt, p.join === "round" ? ClipperLib.EndType.etOpenRound : ClipperLib.EndType.etOpenButt);
  if (!region.length && !open.length) return subs;
  const res: Paths = [];
  co.Execute(res, (open.length && !region.length ? Math.abs(p.distance) : p.distance) * UNIT);
  return toSubpaths(res);
}
