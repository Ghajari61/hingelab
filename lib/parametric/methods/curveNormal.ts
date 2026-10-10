/**
 * Fins along a curve: fins stand on the wall square to a guide curve (the oval of a leaf clock),
 * each one's length, height and tilt given by formulas of the curve parameter t. An optional outer
 * boundary clips the fins; the back plate carries one rotated slot per tab and the centre feature.
 */
import { makeShape, offsetShapes, pointInContour, shapeContours, signedArea, unionShapes } from "@/lib/letters/polygon";
import { minFeatureOf, tabDepthOf } from "../defaults";
import { rect, tabCenters, tabRuleOf } from "../joints";
import { finLabel } from "../label";
import { cleanSection } from "../slice/clean";
import { placementOf } from "../slice/planes";
import { compileFormula } from "../source/formula";
import type { BoundaryCurve, Contour, CurveNormalParams, GuideCurve, ParametricParams, Part, Plane, Point, Vec3, Warning } from "../types";
import { cross, dot, finId, idRange, partsBounds, type MethodOut } from "./common";
import { arcTable, guideAt } from "./guide";
import { circle } from "./stacked";

export { arcTable, guideAt };

/** The outer boundary as a closed polygon (counter-clockwise), or null. */
export function boundaryPolygon(b: BoundaryCurve, n = 1440): Contour | null {
  if (b.kind === "none") return null;
  let r: (phi: number) => number;
  if (b.kind === "ellipse") r = phi => { const a = b.w / 2, c = b.h / 2; return (a * c) / Math.hypot(c * Math.cos(phi), a * Math.sin(phi)); };
  else {
    const f = compileFormula(b.expression, ["phi"]);
    r = phi => { const v = f({ phi }); if (!Number.isFinite(v) || v <= 0) throw new Error("The outline formula must give a positive radius for every angle phi."); return v; };
  }
  return Array.from({ length: n }, (_, i) => { const phi = (2 * Math.PI * i) / n, rr = r(phi); return [rr * Math.cos(phi), rr * Math.sin(phi)] as Point; });
}

/** Distance along the ray from p in direction d to the first crossing of the polygon (Infinity if none). */
export function rayHit(poly: Contour, p: Point, d: Point): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const den = d[0] * ey - d[1] * ex;
    if (Math.abs(den) < 1e-12) continue;
    const wx = a[0] - p[0], wy = a[1] - p[1];
    const lam = (wx * ey - wy * ex) / den, mu = (wx * d[1] - wy * d[0]) / den;
    if (lam > 1e-9 && mu >= 0 && mu <= 1 && lam < best) best = lam;
  }
  return best;
}

const segDist = (p: Point, a: Point, b: Point) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};

const convexHull = (pts: Point[]): Contour => {
  const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const crossZ = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point[] = [], upper: Point[] = [];
  for (const p of s) { while (lower.length >= 2 && crossZ(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (const p of [...s].reverse()) { while (upper.length >= 2 && crossZ(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
};

export interface FinFoot {
  t: number;
  g: Point;
  n: Point;
  /** Fin length after the boundary and the collision trim. */
  L: number;
  /** Tilt round the fin's own length, degrees. */
  twist: number;
}

/** Fin footprints on the wall: positions, normals, lengths (clipped and trimmed), and the collision report. */
export function curveFootprints(o: CurveNormalParams, T: number) {
  const { perimeter, phiAt } = arcTable(o.guide);
  const count = Math.max(1, Math.round(o.count ?? Math.floor(perimeter / Math.max(o.spacingAtGuide, T + 1))));
  const lenF = compileFormula(o.finLength, ["t"]), twistF = compileFormula(o.twist, ["t"]);
  const boundary = boundaryPolygon(o.outerBoundary);
  const feet: FinFoot[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const { p: g, n } = guideAt(o.guide, phiAt(t));
    let L = lenF({ t });
    if (!Number.isFinite(L)) throw new Error("The fin length formula gives no number for some t.");
    if (boundary) L = Math.min(L, pointInContour(g, boundary) ? rayHit(boundary, g, n) : 0);
    const tw = twistF({ t });
    if (!Number.isFinite(tw)) throw new Error("The twist formula gives no number for some t.");
    feet.push({ t, g, n, L: Math.max(0, L), twist: Math.max(-45, Math.min(45, tw)) });
  }
  // Neighbouring footprints must stay T + 0.5 mm apart; where they converge the fins are shortened.
  const clear = T + 0.5;
  const collided: number[] = [];
  const end = (f: FinFoot): Point => [f.g[0] + f.n[0] * f.L, f.g[1] + f.n[1] * f.L];
  const limits = feet.map(f => f.L);
  feet.forEach((f, i) => {
    for (const j of [i - 1, i + 1]) {
      if (count < 2) break;
      const h = feet[(j + count) % count];
      if (h === f) continue;
      if (segDist(f.g, h.g, end(h)) < clear) { collided.push(i); continue; }
      for (let s = 0.5; s <= f.L; s += 0.5) {
        const q: Point = [f.g[0] + f.n[0] * s, f.g[1] + f.n[1] * s];
        if (segDist(q, h.g, end(h)) < clear) { limits[i] = Math.min(limits[i], s - 0.5); collided.push(i); break; }
      }
    }
  });
  feet.forEach((f, i) => { f.L = Math.max(0, limits[i]); });
  return { feet, perimeter, boundary, collided: [...new Set(collided)].sort((a, b) => a - b) };
}

export function sliceCurveNormal(p: ParametricParams): MethodOut {
  const o = p.curveNormal;
  const T = p.material.T;
  const depth = tabDepthOf(p);
  const warnings: Warning[] = [];
  const { feet, boundary, collided } = curveFootprints(o, T);
  const heightF = compileFormula(o.finHeight, ["t", "s", "L"]);
  const minLen = Math.max(minFeatureOf(p), p.joints.tabWidth + 2);
  const live = feet.map((f, i) => ({ f, i })).filter(({ f }) => f.L >= minLen);
  const n = live.length;
  const W: Vec3 = [0, 0, 1];

  const planes: Plane[] = [];
  const parts: Part[] = [];
  const slots: Contour[] = [];
  let labelSkipped = 0;
  const noTab: string[] = [];
  live.forEach(({ f }, k) => {
    const id = finId(k, n, "F");
    const U: Vec3 = [f.n[0], f.n[1], 0];
    const N0 = cross(U, W);
    const tau = (f.twist * Math.PI) / 180;
    const Wt: Vec3 = [0, 1, 2].map(i => W[i] * Math.cos(tau) + N0[i] * Math.sin(tau)) as Vec3;
    const Nt: Vec3 = [0, 1, 2].map(i => N0[i] * Math.cos(tau) - W[i] * Math.sin(tau)) as Vec3;
    const g3: Vec3 = [f.g[0], f.g[1], 0];
    const plane: Plane = { normal: Nt, offset: dot(Nt, g3), u: U, w: Wt };
    // Local coordinates of the wall point g: the fin's bottom edge runs from (x0, y0) along +x.
    const x0 = dot(U, g3), y0 = dot(Wt, g3);
    const steps = Math.max(8, Math.ceil(f.L / 1));
    const top: Point[] = [];
    for (let j = steps; j >= 0; j--) {
      const s = (f.L * j) / steps;
      const h = heightF({ t: f.t, s, L: f.L });
      if (!Number.isFinite(h)) throw new Error("The fin height formula gives no number for some t and s.");
      top.push([x0 + s, y0 + Math.max(0.5, h)]);
    }
    const body = cleanSection([[[x0, y0], [x0 + f.L, y0], ...top]], { evenOdd: false, clipToWall: false, chordTolerance: p.quality.chordTolerance, smoothing: 0, minFeature: minFeatureOf(p), minIslandArea: p.quality.minIslandArea }).shapes;
    if (!body.length) return;
    const main = [...body].sort((a, b) => b.area - a.area)[0];
    const tabs: [number, number][] = o.backPlate ? tabCenters(f.L - 2, p.joints.tabWidth, tabRuleOf(p.joints)).map(c => [x0 + 1 + c - p.joints.tabWidth / 2, x0 + 1 + c + p.joints.tabWidth / 2]) : [];
    const outline = tabs.length ? unionShapes([...shapeContours([main]), ...tabs.map(([a, b]) => rect(a, y0 - depth, b, y0 + 0.01))])[0] : main;
    if (o.backPlate && !tabs.length) noTab.push(id);
    // Slots: rotated rectangles on the plate under each tab, wider by 1/cos(tilt).
    const hw = (T + p.joints.slotClearance) / 2 / Math.cos(tau);
    const q: Point = [-f.n[1], f.n[0]];
    for (const [a, b] of tabs) {
      const sa = a - x0, sb = b - x0;
      const at = (s: number, h: number): Point => [f.g[0] + f.n[0] * s + q[0] * h, f.g[1] + f.n[1] * s + q[1] * h];
      slots.push([at(sa, -hw), at(sb, -hw), at(sb, hw), at(sa, hw)]);
    }
    const lab = p.labels.enabled ? finLabel(outline, p.labels.prefix + id, { arrow: false, nearWall: false }) : null;
    if (p.labels.enabled && !lab) labelSkipped++;
    planes.push(plane);
    parts.push({ id, kind: "fin", shape: outline, innerCuts: [], engrave: lab ?? [], placement: placementOf(plane), plane: planes.length - 1, neighbors: [], tabs: tabs.length ? tabs : undefined, tabDepth: tabs.length ? depth : undefined });
  });
  parts.forEach((q, k) => { if (n > 1) q.neighbors.push(parts[(k + n - 1) % n].id, parts[(k + 1) % n].id); q.neighbors = [...new Set(q.neighbors)].filter(x => x !== q.id); });

  if (o.backPlate && parts.length) {
    let outer: Contour;
    if (boundary) outer = boundary;
    else {
      const pts: Point[] = [];
      for (const { f } of live) pts.push(f.g, [f.g[0] + f.n[0] * f.L, f.g[1] + f.n[1] * f.L]);
      const hull = offsetShapes([makeShape(convexHull(pts), [])], o.backMargin);
      outer = hull.length ? hull[0].outer : convexHull(pts);
    }
    if (signedArea(outer) < 0) outer = [...outer].reverse();
    const centre: Contour[] = [];
    if (o.centerFeature === "clock-insert") centre.push(circle(0, 0, (o.clockInsertDia + 0.2) / 2, 144));
    else if (o.centerFeature === "opening" || o.centerFeature === "mirror") {
      const { phiAt } = arcTable(o.guide);
      const ring = Array.from({ length: 360 }, (_, i) => guideAt(o.guide, phiAt(i / 360)).p);
      const shrunk = o.centerFeature === "mirror" ? offsetShapes([makeShape(ring, [])], -3) : [makeShape(ring, [])];
      if (shrunk.length) centre.push(shrunk[0].outer);
    }
    const plane: Plane = { normal: [0, 0, 1], offset: -depth / 2, u: [1, 0, 0], w: [0, 1, 0] };
    planes.push(plane);
    const engrave: Contour[] = [];
    // A tick at the first fin's outer slot end orients the plate.
    const f0 = live[0]?.f;
    if (f0) engrave.push([[f0.g[0] - f0.n[0] * 2, f0.g[1] - f0.n[1] * 2], [f0.g[0] - f0.n[0] * 5, f0.g[1] - f0.n[1] * 5]]);
    parts.push({ id: "BP", kind: "backboard", shape: makeShape(outer, []), innerCuts: [...slots, ...centre], engrave, placement: placementOf(plane), plane: planes.length - 1, neighbors: parts.filter(q => q.tabs).map(q => q.id) });
    for (const q of parts) if (q.tabs) q.neighbors.push("BP");
  }

  if (collided.length) {
    const ts = collided.map(i => feet[i].t);
    warnings.push({ code: "FINS_COLLIDE", message: `Fins touch between t = ${Math.min(...ts).toFixed(3)} and ${Math.max(...ts).toFixed(3)}. They were trimmed there.`, data: { t0: Math.min(...ts), t1: Math.max(...ts), count: collided.length } });
  }
  const dropped = feet.length - n;
  if (dropped) warnings.push({ code: "SHORT_FIN_DROPPED", message: `${dropped} fins were shorter than ${minLen.toFixed(1)} mm (outside the outline or trimmed) and were left out.` });
  if (noTab.length) warnings.push({ code: "NO_TAB", message: `${noTab.length} fins are too short for a tab; glue them to the back plate.`, partIds: noTab });
  if (labelSkipped) warnings.push({ code: "LABEL_SKIPPED", message: `${labelSkipped} labels did not fit on their parts; the assembly guide still lists every part.` });

  const fins = parts.filter(q => q.kind === "fin").map(q => q.id);
  const guide: string[] = [];
  if (o.backPlate) {
    guide.push(`Lay the back plate BP flat, engraved side up. ${fins[0]} goes in the slots next to the engraved tick; continue counter-clockwise round the opening with ${idRange(fins)} (the guide drawing names every slot).`);
    if (feet.some(f => Math.abs(f.twist) > 0.5)) guide.push("The fins lean: push each one in at the angle its slot allows, wider side of the slot first.");
    if (o.centerFeature === "clock-insert") guide.push(`Press the ${o.clockInsertDia} mm clock insert into the centre hole from the front.`);
    if (o.centerFeature === "mirror") guide.push("Glue the mirror behind the opening before fixing the plate to the wall.");
  } else if (fins.length) guide.push(`Glue the fins ${idRange(fins)} square to the guide curve, in order.`);
  guide.push("A drop of glue in each slot makes the assembly rigid.");

  return { planes, sections: parts.map(q => [q.shape]), parts, warnings, guide, bounds: partsBounds(parts, planes, T) };
}
