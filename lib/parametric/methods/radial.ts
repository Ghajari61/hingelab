/**
 * Radial fins: half-sections in planes that all contain one axis (a lamp shade, a sunburst
 * clock). Fins start at the hub opening; hub rings at one or both ends of the axis carry radial
 * slots for every fin, and every fin has tabs into each hub on a strip along its inner edge.
 */
import { intersectShapes, makeShape, shapeContours, unionShapes } from "@/lib/letters/polygon";
import { minFeatureOf } from "../defaults";
import { TAB_OVERLAP, rect, tabCenters, tabRuleOf } from "../joints";
import { finLabel } from "../label";
import { cleanSection } from "../slice/clean";
import { placementOf } from "../slice/planes";
import type { Contour, ParametricParams, Part, Plane, Point, RadialParams, Shape, Vec3, Warning } from "../types";
import { axisIndex, cross, dot, finId, idRange, newTally, partsBounds, pieceIds, sliceFamily, tallyWarnings, type MethodContext, type MethodOut } from "./common";
import { circle } from "./stacked";

const BIG = 1e5;

/** The axis `a` and an in-plane basis with e1 × e2 = a; angles run from e1 towards e2. */
export function radialBasis(axis: RadialParams["axis"]): { a: Vec3; e1: Vec3; e2: Vec3 } {
  if (axis === "X") return { a: [1, 0, 0], e1: [0, 1, 0], e2: [0, 0, 1] };
  if (axis === "Y") return { a: [0, 1, 0], e1: [1, 0, 0], e2: [0, 0, -1] };
  return { a: [0, 0, 1], e1: [1, 0, 0], e2: [0, 1, 0] };
}

const isFullTurn = (o: RadialParams) => Math.abs(o.angleRange[1] - o.angleRange[0]) >= 360 - 1e-9;

/** Fin angles in degrees: evenly round a full turn, or from start to end inclusive. */
export function finAngles(o: RadialParams): number[] {
  const n = Math.max(1, Math.round(o.count));
  const [a0, a1] = o.angleRange;
  if (isFullTurn(o)) return Array.from({ length: n }, (_, i) => a0 + (360 * i) / n);
  if (n === 1) return [a0];
  return Array.from({ length: n }, (_, i) => a0 + ((a1 - a0) * i) / (n - 1));
}

/** Fins need T + 1 mm of arc between them at the hub radius. */
export function hubLimits(o: RadialParams, T: number) {
  const n = Math.max(1, Math.round(o.count));
  const span = isFullTurn(o) ? 2 * Math.PI : (Math.abs(o.angleRange[1] - o.angleRange[0]) * Math.PI) / 180;
  const step = isFullTurn(o) ? span / n : n > 1 ? span / (n - 1) : Infinity;
  const need = T + 1;
  const maxCount = Math.floor((span * o.innerRadius) / need + 1e-9) + (isFullTurn(o) ? 0 : 1);
  const minRadius = Number.isFinite(step) ? need / step : 0;
  return { collide: n > 1 && o.innerRadius * step < need - 1e-9, maxCount, minRadius };
}

/** Fin outline straight from a radial-profile formula: s runs from the hub radius to r1. */
export type ProfileFn = { height: (theta: number, s: number) => number; r0: number; r1: number };

export function sliceRadial(p: ParametricParams, ctx: MethodContext, profile?: ProfileFn): MethodOut {
  const o = p.radial;
  const T = p.material.T;
  const { a, e1, e2 } = radialBasis(o.axis);
  const k = axisIndex(o.axis);
  const b = ctx.bounds;
  const centre: Vec3 = o.axisPoint ?? (profile ? [0, 0, 0] : [0, 1, 2].map(i => (b.min[i] + b.max[i]) / 2) as Vec3);
  const rIn = Math.max(0, o.innerRadius);
  const angles = finAngles(o);
  const n = angles.length;
  const finIdOf = (i: number) => finId(i, n, "R");
  const warnings: Warning[] = [];
  const tally = newTally();

  const finPlanes: Plane[] = angles.map(deg => {
    const th = (deg * Math.PI) / 180;
    const u: Vec3 = [0, 1, 2].map(i => Math.cos(th) * e1[i] + Math.sin(th) * e2[i]) as Vec3;
    const normal = cross(u, a);
    return { normal, offset: dot(normal, centre), u, w: a };
  });

  // Fin sections in each plane's own frame: x along the radius (absolute), y along the axis.
  let sections: Shape[][];
  if (profile) {
    const rs = Math.max(rIn, profile.r0), steps = Math.max(8, Math.ceil((profile.r1 - rs) / 1));
    sections = finPlanes.map((pl, i) => {
      if (profile.r1 - rs < 2) return [];
      const xa = dot(pl.u, centre), y0 = dot(a, centre);
      const th = (angles[i] * Math.PI) / 180;
      const top: Point[] = [];
      for (let j = steps; j >= 0; j--) { const r = rs + ((profile.r1 - rs) * j) / steps; top.push([xa + r, y0 + profile.height(th, r - profile.r0)]); }
      const loop: Contour = [[xa + rs, y0], [xa + profile.r1, y0], ...top];
      return cleanSection([loop], { evenOdd: false, clipToWall: false, chordTolerance: p.quality.chordTolerance, smoothing: 0, minFeature: minFeatureOf(p), minIslandArea: p.quality.minIslandArea }).shapes;
    });
  } else {
    sections = finPlanes.map((pl, i) => {
      const s = sliceFamily(p, ctx, [pl], [finIdOf(i)], false, tally)[0];
      const xa = dot(pl.u, centre);
      return s.length ? intersectShapes(shapeContours(s), [rect(xa + rIn, -BIG, BIG, BIG)]) : [];
    });
  }

  const low = profile ? dot(a, centre) : b.min[k], high = profile ? Math.max(low + 1, ...sections.flat().map(s => s.bbox.y1)) : b.max[k];
  const hubs = o.hubPlates;
  const hubW = Math.max(2 * T + 4, o.hubWidth);
  const m0 = Math.max(T, 3);
  const tabLen = Math.max(3, Math.min(p.joints.tabWidth, hubW - 2 * m0));
  // Tab starts along the radius, spread across the hub ring with the shared tab rule (one centred tab when only one fits).
  const centres = tabCenters(hubW - 2 * m0, tabLen, tabRuleOf(p.joints));
  const tabFroms = centres.length ? centres.map(c => rIn + m0 + c - tabLen / 2) : [rIn + (hubW - tabLen) / 2];

  const parts: Part[] = [];
  const finParts: number[][] = [];
  const floating: string[] = [];
  let labelSkipped = 0;
  sections.forEach((sec, i) => {
    finParts[i] = [];
    if (!sec.length) return;
    const pl = finPlanes[i];
    const xa = dot(pl.u, centre);
    let shapes = sec;
    const tabs: [number, number][] = [];
    if (hubs > 0) {
      const zone = intersectShapes(shapeContours(shapes), [rect(xa + rIn, -BIG, xa + rIn + hubW, BIG)]);
      const top = hubs === 2 ? high : Math.max(low + hubW, ...zone.map(z => z.bbox.y1));
      // Extra tabs reach TAB_OVERLAP into the hub strip so Clipper always merges them; the first keeps its exact outline.
      const tabRects = (tabFrom: number, e: number) => {
        const r = [rect(xa + tabFrom, low - T, xa + tabFrom + tabLen, low + e)];
        if (hubs === 2) r.push(rect(xa + tabFrom, high - e, xa + tabFrom + tabLen, high + T));
        return r;
      };
      shapes = unionShapes([...shapeContours(shapes), rect(xa + rIn, low, xa + rIn + hubW, top), ...tabRects(tabFroms[0], 0)]);
      if (tabFroms.length > 1) shapes = unionShapes([...shapeContours(shapes), ...tabFroms.slice(1).flatMap(f => tabRects(f, TAB_OVERLAP))]);
      for (const tabFrom of tabFroms) tabs.push([xa + tabFrom, xa + tabFrom + tabLen]);
    }
    const pieces = [...shapes].sort((p1, p2) => p2.area - p1.area);
    const ids = pieceIds(finIdOf(i), pieces.length);
    pieces.forEach((s, j) => {
      const hasTab = hubs > 0 && s.bbox.y0 < low - T / 2;
      if (hubs > 0 && !hasTab) floating.push(ids[j]);
      const lab = p.labels.enabled ? finLabel(s, p.labels.prefix + ids[j], { arrow: false, nearWall: false }) : null;
      if (p.labels.enabled && !lab) labelSkipped++;
      finParts[i].push(parts.length);
      parts.push({ id: ids[j], kind: "radial-fin", shape: s, innerCuts: [], engrave: lab ?? [], placement: placementOf(pl), plane: i, neighbors: [], tabs: hasTab ? tabs : undefined, tabDepth: hasTab ? T : undefined });
    });
  });

  // Hub rings: one radial slot per fin, an engraved tick beside the first fin's slot.
  const hubPlanes: Plane[] = [];
  if (hubs > 0 && parts.length) {
    const cx = dot(e1, centre), cy = dot(e2, centre);
    const sw = (T + p.joints.slotClearance) / 2;
    const slotsOf = (deg: number): Contour[] => {
      const th = (deg * Math.PI) / 180, d: Point = [Math.cos(th), Math.sin(th)], q: Point = [-d[1], d[0]];
      const at = (r: number, h: number): Point => [cx + d[0] * r + q[0] * h, cy + d[1] * r + q[1] * h];
      return tabFroms.map(tabFrom => [at(tabFrom, -sw), at(tabFrom + tabLen, -sw), at(tabFrom + tabLen, sw), at(tabFrom, sw)]);
    };
    const tabbed = angles.map((_, i) => finParts[i].some(j => parts[j].tabs));
    const ring = makeShape(circle(cx, cy, rIn + hubW, 144), rIn >= 1 ? [circle(cx, cy, rIn, 144).reverse()] : []);
    const offsets = hubs === 2 ? [low - T / 2, high + T / 2] : [low - T / 2];
    offsets.forEach((offset, h) => {
      const id = finId(h, offsets.length, "H");
      const plane: Plane = { normal: a, offset, u: e1, w: e2 };
      hubPlanes.push(plane);
      const slots = angles.flatMap((deg, i) => (tabbed[i] ? slotsOf(deg) : []));
      const engrave: Contour[] = [];
      const first = angles.findIndex((_, i) => tabbed[i]);
      const lastEnd = tabFroms[tabFroms.length - 1] + tabLen;
      if (first >= 0 && rIn + hubW - lastEnd > 2) {
        const th = (angles[first] * Math.PI) / 180;
        const r0 = lastEnd + 1, r1 = rIn + hubW - 1;
        if (r1 - r0 >= 1.5) engrave.push([[cx + Math.cos(th) * r0, cy + Math.sin(th) * r0], [cx + Math.cos(th) * r1, cy + Math.sin(th) * r1]]);
      }
      const neighbors = parts.filter(q => q.tabs).map(q => q.id);
      parts.push({ id, kind: "hub", shape: ring, innerCuts: slots, engrave, placement: placementOf(plane), plane: finPlanes.length + h, neighbors });
    });
    const hubIds = parts.filter(q => q.kind === "hub").map(q => q.id);
    for (const q of parts) if (q.tabs) q.neighbors.push(...hubIds);
  }
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    if (!isFullTurn(o) && next === 0) continue;
    for (const x of finParts[i]) for (const y of finParts[next]) { if (x !== y) { parts[x].neighbors.push(parts[y].id); parts[y].neighbors.push(parts[x].id); } }
  }

  const lim = hubLimits(o, T);
  if (lim.collide) {
    warnings.push({
      code: "FINS_COLLIDE_AT_HUB",
      message: `Fins overlap at the hub. Use at most ${lim.maxCount} fins or a hub radius of at least ${Math.ceil(lim.minRadius * 10) / 10} mm.`,
      data: { maxCount: lim.maxCount, minRadius: lim.minRadius },
    });
  }
  if (floating.length) warnings.push({ code: "FLOATING_PIECE", message: `${floating.length} fin pieces do not reach the hub strip; glue them in place.`, partIds: floating });
  warnings.push(...tallyWarnings(p, tally));
  if (labelSkipped) warnings.push({ code: "LABEL_SKIPPED", message: `${labelSkipped} labels did not fit on their parts; the assembly guide still lists every part.` });

  const fins = parts.filter(q => q.kind === "radial-fin").map(q => q.id);
  const step = angles.length > 1 ? Math.abs(angles[1] - angles[0]) : 0;
  const guide: string[] = [];
  if (hubs > 0) {
    guide.push(`Lay hub H01 flat${o.axis === "Z" ? " on the wall side" : ""}. Push the fins ${idRange(fins)} into its slots, tab first: ${fins[0]} goes in the slot next to the engraved tick, then go round counter-clockwise (${Math.round(step * 100) / 100}° apart).`);
    if (hubs === 2) guide.push("Fit hub H02 on the other end, every top tab into its slot.");
  } else if (fins.length) {
    guide.push(`Glue the fins ${idRange(fins)} round the axis, ${Math.round(step * 100) / 100}° apart, inner edges ${rIn} mm from the centre.`);
  }
  guide.push("A drop of glue in each slot makes the assembly rigid.");

  const planes = [...finPlanes, ...hubPlanes];
  return { planes, sections, parts, warnings, guide, bounds: profile ? partsBounds(parts, planes, T) : undefined };
}
