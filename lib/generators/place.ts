/**
 * Where a point of a part ends up in the assembly, matching the 3D view (scene3d): local (u, v) in the
 * part's y-down outline and h up through its thickness, to the plan (x, y down the sheet, z up).
 * Larger y is nearer the viewer.
 */
import type { GenPart } from "./types";

export type Place = NonNullable<GenPart["place"]>;
export type V3 = [number, number, number];
const D2R = Math.PI / 180;

export function placePoint(pl: Place, u: number, v: number, h: number): V3 {
  let x = u, y = -v, z = h;
  if (pl.rot) {
    const r = -pl.rot * D2R;
    [x, y] = [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
  }
  if (pl.upright) {
    const a = (pl.tilt ?? 90) * D2R;
    [y, z] = [y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
  }
  if (pl.yaw) {
    const b = -pl.yaw * D2R;
    [x, y] = [x * Math.cos(b) - y * Math.sin(b), x * Math.sin(b) + y * Math.cos(b)];
  }
  return pl.upright ? [x + pl.x, -(y - pl.z), z - pl.y] : [x + pl.x, -(y - pl.y), z + pl.z];
}

/** The inverse of placePoint. */
export function unplacePoint(pl: Place, P: V3): V3 {
  let x: number, y: number, z: number;
  if (pl.upright) [x, y, z] = [P[0] - pl.x, -P[1] + pl.z, P[2] + pl.y];
  else [x, y, z] = [P[0] - pl.x, -P[1] + pl.y, P[2] - pl.z];
  if (pl.yaw) {
    const b = pl.yaw * D2R;
    [x, y] = [x * Math.cos(b) - y * Math.sin(b), x * Math.sin(b) + y * Math.cos(b)];
  }
  if (pl.upright) {
    const a = -(pl.tilt ?? 90) * D2R;
    [y, z] = [y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
  }
  if (pl.rot) {
    const r = pl.rot * D2R;
    [x, y] = [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
  }
  return [x, -y, z];
}
