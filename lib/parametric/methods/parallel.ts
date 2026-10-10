/**
 * Parallel fins: planes stacked along X or Y, each section standing out of the wall (w ≥ 0), with
 * tabs into a backboard (plate or slat board). Part-local coordinates are (u, w) of the plane
 * frame: the wall edge lies on y = 0 and tabs reach below it.
 */
import { intersectShapes, shapeContours, unionShapes } from "@/lib/letters/polygon";
import { backboardPart, boardOutline, boardRangeAlong, convexHull, slotFor, type BoardSlot } from "../backboard";
import { bridgeWidthOf, finSpacingOf, minFeatureOf, tabDepthOf } from "../defaults";
import { finTabs, rect, withTabs } from "../joints";
import { finLabel } from "../label";
import { cleanSection } from "../slice/clean";
import { parallelPlanes, placementOf } from "../slice/planes";
import type { SectionSource } from "../slice/section";
import type { Contour, ParametricParams, Part, Plane, Point, Shape, Vec3, Warning } from "../types";

export interface ParallelOut {
  planes: Plane[];
  sections: Shape[][];
  parts: Part[];
  warnings: Warning[];
}

export interface ParallelContext {
  bounds: { min: Vec3; max: Vec3 };
  sections: (frame: Plane) => SectionSource;
  /** The model's footprint on the wall (z ≥ 0 part projected onto XY), model mm. */
  projection: (planes: Plane[], sections: Shape[][]) => Contour[];
}

export const finId = (i: number, n: number, prefix = "F") => `${prefix}${String(i + 1).padStart(Math.max(2, String(n).length), "0")}`;
/** Suffixes for extra pieces of one fin: a, b, …, z, aa, ab, … */
export const pieceSuffix = (k: number): string => (k < 26 ? String.fromCharCode(97 + k) : pieceSuffix(Math.floor(k / 26) - 1) + pieceSuffix(k % 26));

const grounded = (s: Shape) => s.bbox.y0 <= 1e-3;

/**
 * Island rule: every piece must touch the wall. A floating piece gets a vertical strip of width
 * `bw` from its lowest point down to the wall, kept inside the convex hull of the section (and
 * of the island's shadow on the wall, so a section that floats entirely can still reach it).
 */
export function bridgeIslands(shapes: Shape[], bw: number): { shapes: Shape[]; added: number; floating: number } {
  const islands = shapes.filter(s => !grounded(s));
  if (!islands.length) return { shapes, added: 0, floating: 0 };
  const pts: Point[] = shapes.flatMap(s => s.outer);
  for (const isl of islands) pts.push([isl.bbox.x0, 0], [isl.bbox.x1, 0]);
  const hull = convexHull(pts);
  const strips: Contour[] = [];
  for (const isl of islands) {
    let low = isl.outer[0];
    for (const q of isl.outer) if (q[1] < low[1]) low = q;
    const { x0, x1 } = isl.bbox;
    const u = x1 - x0 <= bw ? (x0 + x1) / 2 : Math.min(x1 - bw / 2, Math.max(x0 + bw / 2, low[0]));
    const band = intersectShapes(shapeContours([isl]), [rect(u - bw / 2, -1e5, u + bw / 2, 1e5)]).sort((a, b) => a.bbox.y0 - b.bbox.y0);
    if (!band.length) continue;
    const top = (band[0].bbox.y0 + band[0].bbox.y1) / 2;
    strips.push(...shapeContours(intersectShapes([rect(u - bw / 2, 0, u + bw / 2, top)], [hull])));
  }
  const out = unionShapes([...shapeContours(shapes), ...strips]);
  const floating = out.filter(s => !grounded(s)).length;
  return { shapes: out, added: Math.max(0, islands.length - floating), floating };
}

export function sliceParallel(p: ParametricParams, ctx: ParallelContext): ParallelOut {
  const axis = p.parallel.axis;
  const k = axis === "X" ? 0 : 1;
  const spacing = finSpacingOf(p);
  const T = p.material.T;
  const modelPlanes = parallelPlanes(axis, ctx.bounds.min[k], ctx.bounds.max[k], spacing, Math.min(1, Math.max(0, p.parallel.phase)));
  const warnings: Warning[] = [];
  if (!modelPlanes.length) return { planes: [], sections: [], parts: [], warnings };

  const src = ctx.sections(modelPlanes[0]);
  const raw = src.slice(modelPlanes.map(pl => pl.offset));
  src.dispose();

  const minFeature = minFeatureOf(p);
  let removed = 0, dropped = 0, openChains = 0;
  const removedIds: string[] = [];
  const modelSections = raw.map((r, i) => {
    openChains += r.openChains;
    const c = cleanSection(r.loops, {
      evenOdd: src.engine === "fallback",
      clipToWall: true,
      chordTolerance: p.quality.chordTolerance,
      smoothing: p.quality.smoothing,
      minFeature,
      minIslandArea: p.quality.minIslandArea,
    });
    if (c.featuresRemoved) removedIds.push(finId(i, modelPlanes.length));
    removed += c.featuresRemoved;
    dropped += c.islandsDropped;
    return c.shapes;
  });

  const mode = p.parallel.backboard;
  const projection = mode === "none" ? [] : ctx.projection(modelPlanes, modelSections);
  const slatBoard = mode === "slats" && projection.length ? boardOutline(projection, [], p.parallel.backboardMargin, "slats") : null;

  // Plane list in position order: model planes, plus slat-only planes across the board.
  type Entry = { plane: Plane; shapes: Shape[]; model: number };
  let entries: Entry[] = modelPlanes.map((plane, i) => ({ plane, shapes: modelSections[i], model: i }));
  let slatRange: [number, number] | null = null;
  if (slatBoard) {
    const f = modelPlanes[0];
    slatRange = boardRangeAlong(slatBoard, f.u);
    if (p.parallel.fillEmptySlots) {
      const [n0, n1] = boardRangeAlong(slatBoard, f.normal);
      const first = modelPlanes[0].offset, last = modelPlanes[modelPlanes.length - 1].offset;
      const extra: Entry[] = [];
      for (let o = first - spacing; o - T / 2 >= n0 - 1e-9; o -= spacing) extra.push({ plane: { ...f, offset: o }, shapes: [], model: -1 });
      for (let o = last + spacing; o + T / 2 <= n1 + 1e-9; o += spacing) extra.push({ plane: { ...f, offset: o }, shapes: [], model: -1 });
      entries = [...entries, ...extra].sort((a, b) => a.plane.offset - b.plane.offset);
    }
  }
  const slatCount = entries.filter(e => e.model < 0).length;

  const bw = bridgeWidthOf(p);
  const depth = tabDepthOf(p);
  const parts: Part[] = [];
  const slots: BoardSlot[] = [];
  let bridges = 0, labelSkipped = 0;
  const shortIds: string[] = [], floatingIds: string[] = [], noTabIds: string[] = [];
  let slatNo = 0;

  entries.forEach((e, pi) => {
    const isSlat = e.model < 0;
    const id = isSlat ? finId(slatNo++, slatCount, "S") : finId(e.model, modelPlanes.length);
    let shapes = e.shapes;
    if (slatRange) shapes = unionShapes([...shapeContours(shapes), rect(slatRange[0], 0, slatRange[1], p.parallel.slatDepth)]);
    const b = bridgeIslands(shapes, bw);
    bridges += b.added;
    const pieces = b.shapes
      .filter(s => {
        if (isSlat || s.bbox.y1 >= p.parallel.minFinHeight) return true;
        shortIds.push(id);
        return false;
      })
      .sort((a, c) => c.area - a.area);
    pieces.forEach((s, j) => {
      const pid = pieces.length > 1 ? `${id}-${pieceSuffix(j)}` : id;
      if (!grounded(s)) floatingIds.push(pid);
      let engrave: Contour[] = [];
      if (p.labels.enabled) {
        const lab = finLabel(s, p.labels.prefix + pid, { arrow: true, nearWall: p.labels.position === "auto-hidden-face" });
        if (lab) engrave = lab; else labelSkipped++;
      }
      let shape = s, tabs: [number, number][] | undefined;
      if (mode !== "none" && projection.length) {
        tabs = finTabs(s, p.joints.tabWidth);
        if (!tabs.length) noTabIds.push(pid);
        shape = withTabs(s, tabs, depth);
        for (const [x0, x1] of tabs) slots.push({ finId: pid, contour: slotFor(e.plane, x0, x1, T, p.joints.slotClearance) });
      }
      parts.push({
        id: pid,
        kind: isSlat ? "slat" : "fin",
        shape,
        innerCuts: [],
        engrave,
        placement: placementOf(e.plane),
        plane: pi,
        neighbors: [],
        ...(tabs ? { tabs, tabDepth: depth } : {}),
      });
    });
  });

  for (const part of parts) {
    part.neighbors = parts.filter(q => q !== part && Math.abs(q.plane - part.plane) === 1).map(q => q.id);
  }

  if (mode !== "none" && projection.length) {
    const outline = slatBoard ?? boardOutline(projection, slots.map(s => s.contour), p.parallel.backboardMargin, "plate");
    if (outline) {
      const board = backboardPart(outline, slots, T, p.labels.enabled);
      labelSkipped += board.skipped;
      parts.push(board.part);
      for (const part of parts) if (part.kind !== "backboard" && part.tabs?.length) part.neighbors.push(board.part.id);
    }
  }

  if (openChains) warnings.push({ code: "NON_MANIFOLD_SECTION", message: `${openChains} open section outlines were closed with a straight edge; check those fins.` });
  if (removed) warnings.push({ code: "MIN_FEATURE_REMOVED", message: `${removed} details thinner than ${minFeature.toFixed(1)} mm were removed.`, partIds: [...new Set(removedIds)] });
  if (dropped) warnings.push({ code: "ISLAND_DROPPED", message: `${dropped} tiny pieces under ${p.quality.minIslandArea} mm² were left out.` });
  if (shortIds.length) warnings.push({ code: "SHORT_FIN_DROPPED", message: `${shortIds.length} fin pieces lower than ${p.parallel.minFinHeight} mm were left out.`, partIds: [...new Set(shortIds)] });
  if (bridges) warnings.push({ code: "BRIDGE_ADDED", message: `${bridges} floating pieces were connected to the wall with support bridges.` });
  if (floatingIds.length) warnings.push({ code: "FLOATING_PIECE", message: `${floatingIds.length} pieces could not be bridged to the wall; glue them in place.`, partIds: floatingIds });
  if (noTabIds.length) warnings.push({ code: "NO_TAB", message: `${noTabIds.length} pieces touch the wall over too short a length for a tab; glue them to the backboard.`, partIds: noTabIds });
  if (labelSkipped) warnings.push({ code: "LABEL_SKIPPED", message: `${labelSkipped} labels did not fit on their parts; the assembly guide still lists every part.` });

  const planes = entries.map(e => e.plane);
  const sections = entries.map(e => e.shapes);
  return { planes, sections, parts, warnings };
}
