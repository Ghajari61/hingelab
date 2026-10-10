/**
 * Stacked layers: sections at the centre of every T-thick layer, glued on top of each other
 * (a topographic model). Dowel holes run through every layer of a chain, the outline of the layer
 * above is engraved on each layer, and layers can be hollowed to save material.
 */
import { differenceShapes, intersectShapes, makeShape, offsetShapes, pointInShape, shapeContours, unionShapes } from "@/lib/letters/polygon";
import { finLabel } from "../label";
import { placementOf } from "../slice/planes";
import type { Contour, ParametricParams, Part, Plane, Point, Shape, Vec3, Warning } from "../types";
import { axisIndex, finId, idRange, newTally, pieceIds, sliceFamily, tallyWarnings, type MethodContext, type MethodOut } from "./common";

/** Frame for layers: N is the stacking axis; U × W = N. */
export function stackFrame(axis: "Y" | "Z"): { n: Vec3; u: Vec3; w: Vec3 } {
  return axis === "Y" ? { n: [0, 1, 0], u: [1, 0, 0], w: [0, 0, -1] } : { n: [0, 0, 1], u: [1, 0, 0], w: [0, 1, 0] };
}

/** Layer centres h_min + (i + ½)·T inside the model. */
export function layerOffsets(min: number, max: number, T: number): number[] {
  const out: number[] = [];
  for (let i = 0; min + (i + 0.5) * T < max - 1e-9; i++) out.push(min + (i + 0.5) * T);
  return out;
}

export const circle = (cx: number, cy: number, r: number, n = 48): Contour =>
  Array.from({ length: n }, (_, i) => { const a = (2 * Math.PI * i) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Point; });

const areaOf = (shapes: Shape[]) => shapes.reduce((a, s) => a + s.area, 0);

/**
 * Up to `count` points of the region, as far from each other as possible (farthest-point
 * selection over the region's vertices and an interior grid), at least `minGap` apart.
 */
export function spreadPoints(region: Shape[], count: number, minGap: number): Point[] {
  const cand: Point[] = region.flatMap(s => s.outer);
  const xs = cand.map(q => q[0]), ys = cand.map(q => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const step = Math.max(0.5, Math.max(x1 - x0, y1 - y0) / 24);
  for (let x = x0; x <= x1; x += step) for (let y = y0; y <= y1; y += step) if (region.some(s => pointInShape([x, y], s))) cand.push([x, y]);
  if (!cand.length) return [];
  // One dowel: the candidate nearest the centre of area of the largest piece.
  const big = [...region].sort((a, b) => b.area - a.area)[0];
  const c = centroid(big.outer);
  const first = cand.reduce((best, q) => (Math.hypot(q[0] - c[0], q[1] - c[1]) < Math.hypot(best[0] - c[0], best[1] - c[1]) ? q : best));
  if (count === 1) return [first];
  let a = cand[0], b = cand[0], d = -1;
  for (let i = 0; i < cand.length; i++) for (let j = i + 1; j < cand.length; j++) {
    const e = Math.hypot(cand[i][0] - cand[j][0], cand[i][1] - cand[j][1]);
    if (e > d) { d = e; a = cand[i]; b = cand[j]; }
  }
  if (d < minGap) return [first];
  const out: Point[] = [a, b];
  while (out.length < count) {
    let best: Point | null = null, bd = -1;
    for (const q of cand) {
      const m = Math.min(...out.map(o => Math.hypot(q[0] - o[0], q[1] - o[1])));
      if (m > bd) { bd = m; best = q; }
    }
    if (!best || bd < minGap) break;
    out.push(best);
  }
  return out;
}

function centroid(c: Contour): Point {
  let a = 0, x = 0, y = 0;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const f = c[j][0] * c[i][1] - c[i][0] * c[j][1];
    a += f; x += (c[j][0] + c[i][0]) * f; y += (c[j][1] + c[i][1]) * f;
  }
  return Math.abs(a) < 1e-12 ? c[0] : [x / (3 * a), y / (3 * a)];
}

/** The parts of closed contours that lie inside `inside`, as open polylines (sampled every `step` mm). */
export function clipInside(contours: Contour[], inside: Shape[], step = 1): Contour[] {
  const out: Contour[] = [];
  for (const c of contours) {
    const pts: Point[] = [];
    for (let i = 0; i < c.length; i++) {
      const a = c[i], b = c[(i + 1) % c.length];
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
      for (let k = 0; k < n; k++) pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
    const ok = pts.map(q => inside.some(s => pointInShape(q, s)));
    if (ok.every(Boolean)) { out.push([...pts, pts[0]]); continue; }
    const start = ok.indexOf(false);
    let run: Point[] = [];
    for (let k = 1; k <= pts.length; k++) {
      const i = (start + k) % pts.length;
      if (ok[i]) run.push(pts[i]);
      else { if (run.length >= 3) out.push(run); run = []; }
    }
    if (run.length >= 3) out.push(run);
  }
  return out;
}

export function sliceStacked(p: ParametricParams, ctx: MethodContext): MethodOut {
  const o = p.stacked;
  const T = p.material.T;
  const f = stackFrame(o.axis);
  const k = axisIndex(o.axis);
  const offsets = layerOffsets(ctx.bounds.min[k], ctx.bounds.max[k], T);
  const planes: Plane[] = offsets.map(offset => ({ normal: f.n, offset, u: f.u, w: f.w }));
  const warnings: Warning[] = [];
  if (!planes.length) return { planes, sections: [], parts: [], warnings, guide: [] };
  const n = planes.length;
  const layerId = (i: number) => finId(i, n, "L");
  const tally = newTally();
  const layers = sliceFamily(p, ctx, planes, planes.map((_, i) => layerId(i)), false, tally);

  // Dowel chains: grow a chain upward while the layers still share room for a dowel.
  const r = p.joints.dowelDia / 2;
  const dowelsOf: Point[][] = layers.map(() => []);
  const chains: { from: number; to: number; count: number }[] = [];
  const bare: number[] = [];
  if (o.dowels) {
    const eroded = layers.map(s => (s.length ? offsetShapes(s, -(r + 2)) : []));
    const close = (from: number, to: number, region: Shape[]) => {
      const pts = areaOf(region) > 1e-3 ? spreadPoints(region, Math.min(12, Math.max(1, Math.round(o.dowelCount))), 2 * r + 4) : [];
      if (!pts.length) { for (let i = from; i <= to; i++) if (layers[i].length) bare.push(i); return; }
      chains.push({ from, to, count: pts.length });
      for (let i = from; i <= to; i++) dowelsOf[i] = pts;
    };
    let from = 0, region = eroded[0];
    for (let i = 1; i < n; i++) {
      const next = areaOf(region) > 1e-3 && eroded[i].length ? intersectShapes(shapeContours(region), shapeContours(eroded[i])) : [];
      if (areaOf(next) > 1e-3) { region = next; continue; }
      close(from, i - 1, region);
      from = i;
      region = eroded[i];
    }
    close(from, n - 1, region);
    if (chains.length > 1) warnings.push({ code: "DOWEL_CHAIN_SPLIT", message: `No dowel position runs through all layers, so the stack is split into ${chains.length} dowel groups (${chains.map(c => idRange([layerId(c.from), layerId(c.to)])).join(", ")}).` });
    if (bare.length) warnings.push({ code: "NO_DOWEL", message: `${bare.length} layers are too small for a ${p.joints.dowelDia} mm dowel; glue them in place using the engraved outlines.`, partIds: bare.map(layerId) });
  }

  // Hollow: remove the inside that the layers above and below both cover, leaving `shell` mm of wall,
  // a ring round every dowel and a spoke from each ring to the wall so nothing comes loose.
  let shaped = layers;
  if (o.hollow) {
    shaped = layers.map((s, i) => {
      if (i === 0 || i === n - 1 || !s.length || !layers[i - 1].length || !layers[i + 1].length) return s;
      const cover = intersectShapes(shapeContours(intersectShapes(shapeContours(s), shapeContours(layers[i - 1]))), shapeContours(layers[i + 1]));
      const cavity = offsetShapes(cover, -o.shell);
      if (!cavity.length) return s;
      const keep: Contour[] = [];
      for (const [x, y] of dowelsOf[i]) {
        keep.push(circle(x, y, r + 3, 32));
        let near: Point = s[0].outer[0], nd = Infinity;
        for (const piece of s) for (const q of piece.outer) { const d = Math.hypot(q[0] - x, q[1] - y); if (d < nd) { nd = d; near = q; } }
        const len = Math.hypot(near[0] - x, near[1] - y) || 1, ux = (near[0] - x) / len, uy = (near[1] - y) / len, hw = r + 3;
        keep.push([[x - uy * hw, y + ux * hw], [x + uy * hw, y - ux * hw], [near[0] + uy * hw, near[1] - ux * hw], [near[0] - uy * hw, near[1] + ux * hw]].map(q => q as Point));
      }
      const hole = keep.length ? differenceShapes(shapeContours(cavity), shapeContours(unionShapes(keep))) : cavity;
      return hole.length ? differenceShapes(shapeContours(s), shapeContours(hole)) : s;
    });
  }

  const parts: Part[] = [];
  let labelSkipped = 0;
  const pieceIdx: number[][] = [];
  shaped.forEach((s, i) => {
    const pieces = [...s].sort((a, b) => b.area - a.area);
    const ids = pieceIds(layerId(i), pieces.length);
    pieceIdx[i] = [];
    pieces.forEach((piece, j) => {
      const holes = dowelsOf[i].filter(q => pointInShape(q, piece)).map(([x, y]) => circle(x, y, (p.joints.dowelDia + p.joints.slotClearance) / 2));
      let engrave: Contour[] = [];
      const above = i + 1 < n ? shaped[i + 1] : [];
      if (o.registrationMarks && above.length) engrave = clipInside(shapeContours(above), offsetShapes([piece], -0.5));
      if (p.labels.enabled) {
        const free = (sh: Shape) => makeShape(sh.outer, [...sh.holes, ...holes.map(h => [...h].reverse())]);
        // On the hidden face first: where the layer above covers this one.
        const covered = above.length ? intersectShapes(shapeContours([piece]), shapeContours(offsetShapes(above, -1))).sort((a, b) => b.area - a.area)[0] : undefined;
        const lab = (p.labels.position === "auto-hidden-face" && covered ? finLabel(free(covered), p.labels.prefix + ids[j], { arrow: false, nearWall: false }) : null)
          ?? finLabel(free(piece), p.labels.prefix + ids[j], { arrow: false, nearWall: false });
        if (lab) engrave.push(...lab); else labelSkipped++;
      }
      pieceIdx[i].push(parts.length);
      parts.push({ id: ids[j], kind: "layer", shape: piece, innerCuts: holes, engrave, placement: placementOf(planes[i]), plane: i, neighbors: [] });
    });
  });

  const overlaps = (a: Shape, b: Shape) => a.bbox.x0 < b.bbox.x1 && b.bbox.x0 < a.bbox.x1 && a.bbox.y0 < b.bbox.y1 && b.bbox.y0 < a.bbox.y1;
  for (let i = 0; i < n; i++) for (const a of pieceIdx[i]) {
    parts[a].neighbors = [i - 1, i + 1].filter(j => j >= 0 && j < n).flatMap(j => pieceIdx[j]).filter(b => overlaps(parts[a].shape, parts[b].shape)).map(b => parts[b].id);
  }

  warnings.push(...tallyWarnings(p, tally));
  if (labelSkipped) warnings.push({ code: "LABEL_SKIPPED", message: `${labelSkipped} labels did not fit on their parts; the assembly guide still lists every part.` });

  const first = parts[0]?.id, last = parts[parts.length - 1]?.id;
  const guide: string[] = [];
  const bottom = o.axis === "Y" ? "the bottom" : "the back (wall side)";
  if (first) guide.push(`Stack the layers from ${bottom} up: ${idRange([first, last!])}. Pieces with the same number (L07-a, L07-b) sit side by side in the same layer.`);
  if (o.registrationMarks) guide.push("Each layer is engraved with the outline of the layer that goes on top of it: line them up before gluing.");
  for (const c of chains) {
    const len = (c.to - c.from + 1) * T;
    guide.push(`Push ${c.count} dowel${c.count === 1 ? "" : "s"} of ${p.joints.dowelDia} mm, ${Math.round(len)} mm long, through ${idRange([layerId(c.from), layerId(c.to)])}.`);
  }
  if (bare.length) guide.push(`Glue ${bare.map(layerId).join(", ")} on without dowels.`);
  guide.push("Glue each layer to the one below; clamp lightly while the glue sets.");
  return { planes, sections: layers, parts, warnings, guide };
}
