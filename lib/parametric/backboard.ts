/**
 * Backboard plate behind the fins (z from -T to 0). Board-local coordinates are (X, -Y) of model
 * space, so the drawing reads like the front view in SVG orientation; part-local z points to -Z.
 */
import { bboxOfContours, differenceShapes, makeShape, offsetShapes, pointInShape, shapeContours, unionShapes } from "@/lib/letters/polygon";
import { FRET_KINDS, fretHoles } from "@/lib/generators/fretwork";
import { rect } from "./joints";
import { finLabel, strokeText, textWidth } from "./label";
import { simplifyClosed } from "./slice/clean";
import type { BoardPattern, Contour, Lumber, Part, Plane, Point, RailMount, Shape, Vec3 } from "./types";

export const BOARD_ID = "B1";

export const boardPlacement = (T: number): number[] => [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, -T / 2, 1];
export const toBoard = ([x, y]: Point): Point => [x, -y];

/** A point in a fin's plane (u along the wall, w = 0) in model XY. */
const onWall = (pl: Plane, u: number, t = 0): Point => [pl.normal[0] * (pl.offset + t) + pl.u[0] * u, pl.normal[1] * (pl.offset + t) + pl.u[1] * u];

/** A rectangle in model XY centred on the plane: `along` mm along U around u, `across` mm along N. */
export function planeRect(pl: Plane, u0: number, u1: number, across: number): Contour {
  const h = across / 2;
  return [onWall(pl, u0, -h), onWall(pl, u1, -h), onWall(pl, u1, h), onWall(pl, u0, h)];
}

/**
 * The slot for a tab (part-local x range [x0, x1] of a fin on plane `pl`) in board-local mm,
 * at nominal size (T + clearance) × (tab width + clearance).
 */
export function slotFor(pl: Plane, x0: number, x1: number, T: number, clearance: number): Contour {
  const c = clearance / 2;
  return planeRect(pl, x0 - c, x1 + c, T + clearance).map(toBoard);
}

/** Model-XY outline of the slices: one band per section piece, spacing wide (fallback projection). */
export function staircaseProjection(planes: Plane[], sections: Shape[][], spacing: number): Contour[] {
  const out: Contour[] = [];
  sections.forEach((shapes, i) => {
    for (const s of shapes) out.push(planeRect(planes[i], s.bbox.x0, s.bbox.x1, spacing));
  });
  return out;
}

const orient = (c: Contour): Contour => {
  let a = 0;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) a += c[j][0] * c[i][1] - c[i][0] * c[j][1];
  return a >= 0 ? c : [...c].reverse();
};

function hull(pts: Point[]): Contour {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point[] = [], upper: Point[] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
export { hull as convexHull };

/**
 * Board outline in board-local mm. Plate: the model's projection grown by the margin (round),
 * merged with a 4 mm border around every slot. Slats: the bounding rectangle of the same.
 * Several separate pieces are joined by their convex hull so the board stays one part.
 */
export function boardOutline(projectionModel: Contour[], slots: Contour[], margin: number, mode: "plate" | "slats"): Shape | null {
  const proj = unionShapes(projectionModel.map(c => orient(c.map(toBoard))));
  const grown = offsetShapes(proj, Math.max(0, margin));
  const around = offsetShapes(unionShapes(slots.map(orient)), 4, "miter");
  let all = unionShapes([...shapeContours(grown), ...shapeContours(around)]);
  if (!all.length) return null;
  if (mode === "slats") {
    const b = bboxOfContours(all.map(s => s.outer));
    return makeShape(rect(b.x0, b.y0, b.x1, b.y1), []);
  }
  if (all.length > 1) all = unionShapes([orient(hull(all.flatMap(s => s.outer)))]);
  const s = all.sort((a, b) => b.area - a.area)[0];
  return makeShape(simplifyClosed(s.outer, 0.05), s.holes.map(h => simplifyClosed(h, 0.05)));
}

/** Backboard pattern kinds (a motif needs a tile, which this panel does not pick). */
export const BOARD_PATTERN_KINDS = FRET_KINDS.filter((k): k is BoardPattern["kind"] => k !== "none" && k !== "motif" && k !== "tile");

/** A saved or sent board pattern, or none for anything that is not one. */
export function cleanBoardPattern(raw: unknown): BoardPattern | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Partial<BoardPattern>;
  if (!BOARD_PATTERN_KINDS.includes(r.kind as BoardPattern["kind"])) return undefined;
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return { kind: r.kind!, cell: num(r.cell, 6, 80, 16), bar: num(r.bar, 1, 15, 3) };
}

/**
 * The pattern's holes in a board's margin: a bar clear of the board's edge, its holes, the
 * model's footprint and every slot and label, oriented as the board's holes.
 */
export function boardPatternHoles(board: Part, projectionModel: Contour[], pattern: BoardPattern): Contour[] {
  const { bar } = pattern, edge = bar + 2;
  const inner = offsetShapes([makeShape(board.shape.outer, board.shape.holes)], -edge);
  const block = [
    ...shapeContours(offsetShapes(unionShapes(projectionModel.map(c => orient(c.map(toBoard)))), bar + 1)),
    ...shapeContours(offsetShapes(unionShapes([...board.innerCuts, ...board.engrave].filter(c => c.length > 2).map(orient)), bar + 1, "miter")),
  ];
  const area = block.length ? differenceShapes(shapeContours(inner), block) : inner;
  if (!area.length) return [];
  const b = bboxOfContours(area.map(s => s.outer));
  const holes = fretHoles({ kind: pattern.kind, cell: pattern.cell, bar }, b.x0, b.y0, b.x1, b.y1, [], (q) => area.some(s => pointInShape(q, s)));
  return holes.map(h => orient(h).slice().reverse());
}

/** Lumber sizes, mm: thickness off the wall and width along the slats. */
export const LUMBER: Record<Lumber, { t: number; w: number; name: string }> = {
  "1x2": { t: 19, w: 38, name: "1x2 (19 × 38 mm)" }, "1x3": { t: 19, w: 64, name: "1x3 (19 × 64 mm)" }, "1x4": { t: 19, w: 89, name: "1x4 (19 × 89 mm)" },
};
export const RAIL_DEFAULTS: RailMount = { lumber: "1x2", count: 2, clearance: 0.5 };
export function cleanRails(raw: unknown): RailMount {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<RailMount>;
  return {
    lumber: typeof r.lumber === "string" && r.lumber in LUMBER ? r.lumber : RAIL_DEFAULTS.lumber,
    count: r.count === 1 ? 1 : 2,
    clearance: typeof r.clearance === "number" && Number.isFinite(r.clearance) ? Math.min(3, Math.max(0, r.clearance)) : RAIL_DEFAULTS.clearance,
  };
}

/** Where the rails cross the slats, along u: one across the middle, or two at a fifth from each end. */
export function railSpans(u0: number, u1: number, m: RailMount): [number, number][] {
  const w = LUMBER[m.lumber].w + 2 * m.clearance, L = u1 - u0;
  const mids = m.count === 1 ? [u0 + L / 2] : [u0 + L * 0.22, u0 + L * 0.78];
  return mids.map((c) => [c - w / 2, c + w / 2] as [number, number]);
}

/** Board extent along the plane axis U, for slats: [u0, u1] of the board rectangle. */
export function boardRangeAlong(board: Shape, u: Vec3): [number, number] {
  const vals = board.outer.map(([x, y]) => u[0] * x + u[1] * -y);
  return [Math.min(...vals), Math.max(...vals)];
}

export interface BoardSlot {
  finId: string;
  contour: Contour;
}

/**
 * The backboard part: outline, one slot per tab, and engraved fin ids beside the first slot of
 * every fin (when there is room between the slots), plus the board id with a "top" arrow.
 */
export function backboardPart(outline: Shape, slots: BoardSlot[], T: number, labels: boolean): { part: Part; skipped: number } {
  const engrave: Contour[] = [];
  let skipped = 0;
  if (labels) {
    const firsts = new Map<string, Contour>();
    for (const s of slots) if (!firsts.has(s.finId)) firsts.set(s.finId, s.contour);
    for (const [id, c] of firsts) {
      const b = bboxOfContours([c]);
      const vertical = b.y1 - b.y0 >= b.x1 - b.x0;
      const room = vertical ? b.x1 - b.x0 : b.y1 - b.y0;
      const h = Math.min(3, Math.max(room * 1.6, 0));
      const w = textWidth(id, h);
      const cx = vertical ? (b.x0 + b.x1) / 2 : b.x0 - 2 - w / 2;
      const cy = vertical ? b.y0 - 2 - w / 2 : (b.y0 + b.y1) / 2;
      const ok = h >= 1.5 && [[cx, cy], [cx + (vertical ? 0 : w / 2), cy + (vertical ? w / 2 : 0)], [cx - (vertical ? 0 : w / 2), cy - (vertical ? w / 2 : 0)]].every(q => pointInShape(q as Point, outline));
      if (ok) engrave.push(...strokeText(id, h, cx, cy, vertical ? 90 : 0));
      else skipped++;
    }
    const free = makeShape(outline.outer, [...outline.holes, ...slots.map(s => orient(s.contour).slice().reverse())]);
    const top = finLabel(free, `${BOARD_ID} TOP`, { arrow: true, nearWall: true });
    if (top) engrave.push(...top); else skipped++;
  }
  return {
    part: {
      id: BOARD_ID,
      kind: "backboard",
      shape: outline,
      innerCuts: slots.map(s => s.contour),
      engrave,
      placement: boardPlacement(T),
      plane: -1,
      neighbors: [...new Set(slots.map(s => s.finId))],
    },
    skipped,
  };
}
