/**
 * A names batch builds one complete assembly per name. In 3D they stand in a row along x, each
 * with its own fittings (cords, sockets, bulbs), far enough apart that neither the assembled nor the
 * exploded views overlap. Only the 3D placements move; the cut parts and their layout do not.
 */
import { bboxOf } from "./geom";
import { placePoint, type Place } from "./place";
import type { GenOutput, GenPart, Hardware3D } from "./types";

/** Space between neighbouring assemblies, mm. */
export const BATCH_GAP = 40;

type Placed = { outer: GenPart["outer"]; place?: Place; apart?: [number, number, number]; frames?: number[][] };

/** The x range an assembly takes up, assembled and fully exploded, with its fittings. */
export function assemblyExtentX(out: GenOutput): [number, number] {
  let lo = Infinity, hi = -Infinity;
  const take = (x: number) => { if (Number.isFinite(x)) { lo = Math.min(lo, x); hi = Math.max(hi, x); } };
  const shown: Placed[] = out.parts.flatMap((p): Placed[] => (p.views3d?.length ? p.views3d.map((v) => ({ outer: v.outer, place: v.place, apart: v.apart, frames: v.frames })) : [{ outer: p.outer, place: p.place, apart: p.apart }]));
  for (const s of shown) {
    const b = bboxOf([s.outer]);
    if (!Number.isFinite(b.x0)) continue;
    const corners: [number, number][] = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];
    const places: Place[] = s.frames?.length ? s.frames.map((m) => ({ x: 0, y: 0, z: 0, m })) : [s.place ?? { x: 0, y: 0, z: 0 }];
    for (const pl of places) for (const [u, v] of corners) {
      const x = placePoint(pl, u, v, 0)[0];
      take(x);
      take(x + (s.apart?.[0] ?? 0));
    }
  }
  for (const h of out.hardware ?? []) {
    if (h.kind === "cord") for (const q of h.pts) take(q[0]);
    else { const r = h.kind === "knot" ? h.d / 2 : h.r; take(h.at[0] - r); take(h.at[0] + r); }
  }
  return Number.isFinite(lo) ? [lo, hi] : [0, 0];
}

function shiftPlace(pl: Place | undefined, dx: number): Place | undefined {
  if (!pl) return { x: dx, y: 0, z: 0 };
  return pl.m ? { ...pl, m: pl.m.map((v, i) => (i === 3 ? v + dx : v)) } : { ...pl, x: pl.x + dx };
}
const shiftFrames = (f: number[][] | undefined, dx: number) => f?.map((m) => m.map((v, i) => (i === 3 ? v + dx : v)));

/** A part moved `dx` along x in 3D (its views, folding frames and placement), as a copy. */
export function shiftPart(p: GenPart, dx: number): GenPart {
  if (!dx) return p;
  return {
    ...p,
    place: shiftPlace(p.place, dx),
    ...(p.views3d ? { views3d: p.views3d.map((v) => ({ ...v, place: shiftPlace(v.place, dx)!, ...(v.frames ? { frames: shiftFrames(v.frames, dx) } : {}) })) } : {}),
  };
}

/** Fittings moved `dx` along x, as copies. */
export function shiftHardware(hw: Hardware3D[], dx: number): Hardware3D[] {
  if (!dx) return hw;
  return hw.map((h) => (h.kind === "cord" ? { ...h, pts: h.pts.map(([x, y, z]) => [x + dx, y, z] as [number, number, number]) } : { ...h, at: [h.at[0] + dx, h.at[1], h.at[2]] as [number, number, number] }));
}

/** Where each build of a batch goes along x: in a row, `BATCH_GAP` apart, in order. */
export function batchOffsets(outs: GenOutput[]): number[] {
  const ext = outs.map(assemblyExtentX);
  const dx: number[] = [0];
  for (let k = 1; k < outs.length; k++) dx.push(dx[k - 1] + ext[k - 1][1] - ext[k][0] + BATCH_GAP);
  return dx;
}
