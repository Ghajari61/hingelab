/**
 * Waffle (egg-crate): two families of ribs whose planes cross along a common axis. At every
 * crossing the overlap [t0, t1] along the common line is split at its midpoint: one rib is
 * slotted from its edge to the midpoint, the other from the midpoint to its other edge.
 */
import { differenceShapes, makeShape, pointInShape, shapeContours } from "@/lib/letters/polygon";
import { rect } from "../joints";
import { finLabel, rectInside, strokeText, textWidth } from "../label";
import { parallelOffsets, placementOf } from "../slice/planes";
import type { Contour, Crossing, ParametricParams, Part, Plane, Shape, Vec3, Warning } from "../types";
import { axisIndex, axisVec, finId, idRange, newTally, pieceIds, sliceFamily, tallyWarnings, type MethodContext, type MethodOut } from "./common";

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Frames of the two families: W runs along the common line (part-local y), U = W × N. */
export function waffleFrames(axes: ParametricParams["waffle"]["familyAxes"]) {
  const nA = axisVec(axes[0]), nB = axisVec(axes[1]);
  const w = cross(nA, nB).map(Math.abs) as Vec3;
  return { A: { n: nA, w, u: cross(w, nA) }, B: { n: nB, w, u: cross(w, nB) } };
}

/** Intervals of y where the vertical line x = const lies inside the shapes (even-odd over all contours). */
export function intervalsAlong(shapes: Shape[], x: number): [number, number][] {
  const ys: number[] = [];
  for (const c of shapeContours(shapes)) {
    for (let i = 0; i < c.length; i++) {
      const a = c[i], b = c[(i + 1) % c.length];
      if ((a[0] <= x && b[0] > x) || (b[0] <= x && a[0] > x)) ys.push(a[1] + ((x - a[0]) * (b[1] - a[1])) / (b[0] - a[0]));
    }
  }
  ys.sort((p, q) => p - q);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < ys.length; i += 2) if (ys[i + 1] > ys[i]) out.push([ys[i], ys[i + 1]]);
  return out;
}

const intersectIntervals = (a: [number, number][], b: [number, number][]) => {
  const out: [number, number][] = [];
  for (const [a0, a1] of a) for (const [b0, b1] of b) { const lo = Math.max(a0, b0), hi = Math.min(a1, b1); if (hi > lo) out.push([lo, hi]); }
  return out.sort((p, q) => p[0] - q[0]);
};

const containing = (ivs: [number, number][], t0: number, t1: number) => ivs.find(([a, b]) => a <= t0 + 1e-9 && t1 <= b + 1e-9)!;

export function sliceWaffle(p: ParametricParams, ctx: MethodContext): MethodOut {
  const o = p.waffle;
  const T = p.material.T;
  const F = waffleFrames(o.familyAxes);
  const fam = (key: "A" | "B", axis: "X" | "Y" | "Z", spacing: number): Plane[] => {
    const k = axisIndex(axis);
    return parallelOffsets(ctx.bounds.min[k], ctx.bounds.max[k], Math.max(T + 1, spacing), 0.5).map(offset => ({ normal: F[key].n, offset, u: F[key].u, w: F[key].w }));
  };
  const planesA = fam("A", o.familyAxes[0], o.spacingA), planesB = fam("B", o.familyAxes[1], o.spacingB);
  const idA = (i: number) => finId(i, planesA.length, "A"), idB = (j: number) => finId(j, planesB.length, "B");
  const tally = newTally();
  const secA = sliceFamily(p, ctx, planesA, planesA.map((_, i) => idA(i)), false, tally);
  const secB = sliceFamily(p, ctx, planesB, planesB.map((_, j) => idB(j)), false, tally);
  const warnings: Warning[] = [];

  // Where a crossing line sits in each rib: rib A's x is U_A · (point on B's plane), and vice versa.
  const sAB = dot(F.A.u, F.B.n), sBA = dot(F.B.u, F.A.n);
  const sw = T + p.joints.halfLapClearance;
  const slotsA: Contour[][] = planesA.map(() => []), slotsB: Contour[][] = planesB.map(() => []);
  const crossings: Crossing[] = [];
  let tooShort = 0;
  const aBottom = o.lapDirection === "A-from-bottom";
  planesA.forEach((pa, i) => planesB.forEach((pb, j) => {
    if (!secA[i].length || !secB[j].length) return;
    const xa = sAB * pb.offset, xb = sBA * pa.offset;
    const ia = intervalsAlong(secA[i], xa), ib = intervalsAlong(secB[j], xb);
    for (const [t0, t1] of intersectIntervals(ia, ib)) {
      if (t1 - t0 < 2 * T) { tooShort++; continue; }
      const m = (t0 + t1) / 2;
      const [a0, a1] = containing(ia, t0, t1), [b0, b1] = containing(ib, t0, t1);
      // Slots run past the rib's edge by 1 mm so they open cleanly.
      const ya: [number, number] = aBottom ? [a0 - 1, m] : [m, a1 + 1];
      const yb: [number, number] = aBottom ? [m, b1 + 1] : [b0 - 1, m];
      slotsA[i].push(rect(xa - sw / 2, ya[0], xa + sw / 2, ya[1]));
      slotsB[j].push(rect(xb - sw / 2, yb[0], xb + sw / 2, yb[1]));
      crossings.push({ a: idA(i), b: idB(j), xa, xb, t0, t1, m });
    }
  }));
  if (tooShort) warnings.push({ code: "CROSSING_TOO_SHORT", message: `${tooShort} rib crossings are too short for a joint (under ${2 * T} mm) and were left unjoined.` });

  const parts: Part[] = [];
  const build = (planes: Plane[], secs: Shape[][], slots: Contour[][], id: (i: number) => string, kind: Part["kind"]) => planes.forEach((pl, i) => {
    const cut = slots[i].length ? differenceShapes(shapeContours(secs[i]), slots[i]) : secs[i];
    const pieces = [...cut].sort((a, b) => b.area - a.area);
    const ids = pieceIds(id(i), pieces.length);
    pieces.forEach((s, k) => parts.push({ id: ids[k], kind, shape: s, innerCuts: [], engrave: [], placement: placementOf(pl), plane: i, neighbors: [] }));
  });
  build(planesA, secA, slotsA, idA, "rib-x");
  const nA = parts.length;
  build(planesB, secB, slotsB, idB, "rib-y");
  for (let k = nA; k < parts.length; k++) parts[k].plane += planesA.length;

  // The piece of a rib plane that holds the material at (x, t).
  const pieceAt = (prefix: string, x: number, t: number) => parts.find(q => (q.id === prefix || q.id.startsWith(prefix + "-")) && pointInShape([x, t], q.shape));

  // Partner ids beside each slot, then the rib's own id where it fits.
  const marks = new Map<Part, Contour[]>();
  let labelSkipped = 0;
  const besideSlot = (part: Part, text: string, x: number, y0: number, y1: number) => {
    for (const h of [2.5, 2]) {
      const tw = textWidth(text, h);
      const ys: number[] = [];
      for (let y = Math.min(y0, y1) + tw / 2 + 1; y <= Math.max(y0, y1) - tw / 2 - 1; y += 1) ys.push(y);
      for (const side of [1, -1]) for (const y of ys) {
        const cx = x + side * (sw / 2 + 1 + h / 2);
        if (!rectInside(part.shape, cx - h / 2 - 0.3, y - tw / 2, cx + h / 2 + 0.3, y + tw / 2)) continue;
        marks.set(part, [...(marks.get(part) ?? []), rect(cx - h / 2 - 0.3, y - tw / 2, cx + h / 2 + 0.3, y + tw / 2)]);
        return strokeText(text, h, cx, y, 90);
      }
    }
    return null;
  };
  for (const c of crossings) {
    const below = (c.t0 + c.m) / 2, above = (c.m + c.t1) / 2;
    const pa = pieceAt(c.a, c.xa, aBottom ? above : below), pb = pieceAt(c.b, c.xb, aBottom ? below : above);
    if (!pa || !pb) continue;
    pa.neighbors.push(pb.id);
    pb.neighbors.push(pa.id);
    if (!p.labels.enabled) continue;
    for (const [part, partner, x] of [[pa, pb, c.xa], [pb, pa, c.xb]] as const) {
      const lab = besideSlot(part, p.labels.prefix + partner.id, x, c.t0, c.t1);
      if (lab) part.engrave.push(...lab); else labelSkipped++;
    }
  }
  const noJoint: string[] = [];
  for (const part of parts) {
    part.neighbors = [...new Set(part.neighbors)];
    if (!part.neighbors.length) noJoint.push(part.id);
    if (!p.labels.enabled) continue;
    const free = makeShape(part.shape.outer, [...part.shape.holes, ...(marks.get(part) ?? []).map(r => [...r].reverse())]);
    const lab = finLabel(free, p.labels.prefix + part.id, { arrow: false, nearWall: false });
    if (lab) part.engrave.push(...lab); else labelSkipped++;
  }

  warnings.push(...tallyWarnings(p, tally));
  if (noJoint.length) warnings.push({ code: "NO_JOINT", message: `${noJoint.length} rib pieces cross no other rib; glue them in place or change the spacing.`, partIds: noJoint });
  if (labelSkipped) warnings.push({ code: "LABEL_SKIPPED", message: `${labelSkipped} labels did not fit on their parts; the assembly guide still lists every part.` });

  const ribsA = parts.filter(q => q.kind === "rib-x").map(q => q.id), ribsB = parts.filter(q => q.kind === "rib-y").map(q => q.id);
  const guide = [
    `Stand the ${aBottom ? "B" : "A"} ribs ${idRange(aBottom ? ribsB : ribsA)} upright with their slots facing ${aBottom ? "up" : "down"}, in order.`,
    `Slide the ${aBottom ? "A" : "B"} ribs ${idRange(aBottom ? ribsA : ribsB)} onto them, slot into slot. The id engraved beside every slot names the rib that goes into it.`,
    ...(noJoint.length ? [`Glue ${noJoint.join(", ")} in place: ${noJoint.length === 1 ? "it crosses" : "they cross"} no other rib.`] : []),
    "Press each crossing fully home; a drop of glue in the slots makes the structure rigid.",
  ];
  return { planes: [...planesA, ...planesB], sections: [...secA, ...secB], parts, warnings, guide, crossings };
}
