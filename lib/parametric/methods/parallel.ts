/**
 * Parallel fins: planes stacked along X or Y, each section standing out of the wall (w ≥ 0), with
 * tabs into a backboard (plate or slat board). Part-local coordinates are (u, w) of the plane
 * frame: the wall edge lies on y = 0 and tabs reach below it.
 */
import { differenceShapes, intersectShapes, makeShape, shapeContours, unionShapes } from "@/lib/letters/polygon";
import { backboardPart, boardOutline, boardPatternHoles, boardRangeAlong, cleanBoardPattern, cleanRails, convexHull, LUMBER, railSpans, slotFor, type BoardSlot } from "../backboard";
import { bridgeWidthOf, finSpacingOf, tabDepthOf } from "../defaults";
import { finTabs, rect, tabRuleOf, withTabs } from "../joints";
import { finLabel } from "../label";
import { parallelPlanes, placementOf } from "../slice/planes";
import type { Contour, ParametricParams, Part, Plane, Point, Shape, Warning } from "../types";
import { finId, idRange, newTally, pieceSuffix, sliceFamily, tallyWarnings, type MethodContext, type MethodOut } from "./common";

export { finId, pieceSuffix };

export interface ParallelContext extends MethodContext {
  /** The model's footprint on the wall (z ≥ 0 part projected onto XY), model mm. */
  projection: (planes: Plane[], sections: Shape[][]) => Contour[];
}

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

export function sliceParallel(p: ParametricParams, ctx: ParallelContext): MethodOut {
  const axis = p.parallel.axis;
  const k = axis === "X" ? 0 : 1;
  const spacing = finSpacingOf(p);
  const T = p.material.T;
  const modelPlanes = parallelPlanes(axis, ctx.bounds.min[k], ctx.bounds.max[k], spacing, Math.min(1, Math.max(0, p.parallel.phase)));
  const warnings: Warning[] = [];
  if (!modelPlanes.length) return { planes: [], sections: [], parts: [], warnings, guide: [] };

  const tally = newTally();
  const modelSections = sliceFamily(p, ctx, modelPlanes, modelPlanes.map((_, i) => finId(i, modelPlanes.length)), true, tally);

  const mode = p.parallel.backboard;
  // Rails: the slat wall's slats, notched where lumber rails on the wall cross them (no board, no tabs).
  const railed = mode === "rails", rails = railed ? cleanRails(p.parallel.rails) : null, lumber = rails ? LUMBER[rails.lumber] : null;
  const projection = mode === "none" ? [] : ctx.projection(modelPlanes, modelSections);
  const slatBoard = (mode === "slats" || railed) && projection.length ? boardOutline(projection, [], p.parallel.backboardMargin, "slats") : null;
  // A slat must stand deeper than the rail it sits on, or its notch would cut it in two.
  const stripDepth = lumber ? Math.max(p.parallel.slatDepth, lumber.t + 6) : p.parallel.slatDepth;

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
    if (slatRange) shapes = unionShapes([...shapeContours(shapes), rect(slatRange[0], 0, slatRange[1], stripDepth)]);
    if (rails && lumber && slatRange) {
      const notches = railSpans(slatRange[0], slatRange[1], rails).map(([a, b]) => rect(a, -1, b, lumber.t + rails.clearance));
      shapes = differenceShapes(shapeContours(shapes), notches);
    }
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
      if (mode !== "none" && !railed && projection.length) {
        tabs = finTabs(s, p.joints.tabWidth, tabRuleOf(p.joints));
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

  if (rails && lumber && slatRange) {
    if (p.parallel.slatDepth < lumber.t + 6) warnings.push({ code: "NOTCH_DEEP", message: `The rails' notches are ${lumber.t} mm deep, so the slats were deepened to ${lumber.t + 6} mm to stay whole.` });
    const [a] = railSpans(slatRange[0], slatRange[1], rails)[0], L = slatRange[1] - slatRange[0];
    if (a - slatRange[0] < Math.max(20, L * 0.08)) warnings.push({ code: "RAIL_NEAR_END", message: "A rail sits close to the slats' ends, where the notch leaves little wood. Use one rail, narrower lumber or a taller piece." });
  }
  if (mode !== "none" && !railed && projection.length) {
    const outline = slatBoard ?? boardOutline(projection, slots.map(s => s.contour), p.parallel.backboardMargin, "plate");
    if (outline) {
      const board = backboardPart(outline, slots, T, p.labels.enabled);
      const pattern = cleanBoardPattern(p.parallel.boardPattern);
      if (pattern) {
        const holes = boardPatternHoles(board.part, projection, pattern);
        if (holes.length) board.part.shape = makeShape(board.part.shape.outer, [...board.part.shape.holes, ...holes]);
        else warnings.push({ code: "BOARD_PATTERN_EMPTY", message: "The board pattern does not fit in the margin round the model. Widen the board margin or make the pattern smaller." });
      }
      labelSkipped += board.skipped;
      parts.push(board.part);
      for (const part of parts) if (part.kind !== "backboard" && part.tabs?.length) part.neighbors.push(board.part.id);
    }
  }

  warnings.push(...tallyWarnings(p, tally));
  if (shortIds.length) warnings.push({ code: "SHORT_FIN_DROPPED", message: `${shortIds.length} fin pieces lower than ${p.parallel.minFinHeight} mm were left out.`, partIds: [...new Set(shortIds)] });
  if (bridges) warnings.push({ code: "BRIDGE_ADDED", message: `${bridges} floating pieces were connected to the wall with support bridges.` });
  if (floatingIds.length) warnings.push({ code: "FLOATING_PIECE", message: `${floatingIds.length} pieces could not be bridged to the wall; glue them in place.`, partIds: floatingIds });
  if (noTabIds.length) warnings.push({ code: "NO_TAB", message: `${noTabIds.length} pieces touch the wall over too short a length for a tab; glue them to the backboard.`, partIds: noTabIds });
  if (labelSkipped) warnings.push({ code: "LABEL_SKIPPED", message: `${labelSkipped} labels did not fit on their parts; the assembly guide still lists every part.` });

  const board = parts.find(q => q.kind === "backboard");
  const fins = parts.filter(q => q.kind === "fin");
  const slats = parts.filter(q => q.kind === "slat");
  const along = axis === "X" ? "from left to right" : "from bottom to top";
  const guide: string[] = [];
  if (board) guide.push(`Lay the backboard ${board.id} face up with the engraved TOP arrow pointing up.`);
  if (fins.length) guide.push(`Insert ${idRange(fins.map(f => f.id).filter(id => !id.includes("-")))} into the backboard ${along}${board ? ", tabs into the slots" : ""}; the engraved arrow on each fin points to the wall.`);
  const split = fins.filter(f => f.id.includes("-"));
  if (split.length) guide.push(`Fins cut in several pieces (${split.map(f => f.id).join(", ")}) go into the same row as their number.`);
  if (slats.length) guide.push(`Fill the remaining slots with the plain slats ${idRange(slats.map(s => s.id))} ${along}.`);
  const glue = [...new Set([...noTabIds, ...floatingIds])];
  if (glue.length) guide.push(`Glue ${glue.join(", ")} in place: ${glue.length === 1 ? "it has" : "they have"} no tab.`);
  if (rails && lumber && slatRange) {
    const run = slatBoard ? boardRangeAlong(slatBoard, modelPlanes[0].normal) : [0, 0];
    const len = Math.round(run[1] - run[0] + 40);
    guide.push(`Cut ${rails.count} ${rails.count === 1 ? "rail" : "rails"} of ${lumber.name} lumber, ${len} mm long, and screw ${rails.count === 1 ? "it" : "them"} level to the wall${rails.count > 1 ? `, ${Math.round(railSpans(slatRange[0], slatRange[1], rails)[1][0] - railSpans(slatRange[0], slatRange[1], rails)[0][0])} mm apart` : ""}.`);
    guide.push(`Push every slat's notches over the rails ${along} and glue or pin each one.`);
  } else guide.push(board ? "Fix the backboard to the wall (screws or a French cleat behind it)." : "Glue the fins to the wall or a board you supply, spaced by the plane positions.");

  const planes = entries.map(e => e.plane);
  const sections = entries.map(e => e.shapes);
  return { planes, sections, parts, warnings, guide };
}
