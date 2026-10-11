/**
 * Fill Bounded Area (paint bucket / live paint): the region around a click that the outlines of other
 * objects close off becomes a new closed path. Every outline (open or closed, any mix) is thickened by
 * half the gap tolerance, so gaps up to the tolerance still close; the free space inside a frame round
 * the walls splits into faces, the face under the click is taken and grown back by the same amount,
 * so its edges run along the line centres.
 */
import * as ClipperLib from "clipper-lib";
import type { Paths } from "clipper-lib";
import { newId } from "./doc";
import { flatten, invert, nodePaths, transformSubpaths } from "./geom";
import { areaOfPaths, FLAT_TOL, MIN_AREA, minus, pieces, regionOf, toPath, toSubpaths, union, UNIT } from "./pathfinder";
import { locate, removeNodes, walk, type IdFactory } from "./scene";
import type { Document, PathNode, Vec } from "./types";

export interface FillOptions {
  /** Gaps in the outlines up to this size (mm) still close a region. */
  gap: number;
  /** Grows (positive) or shrinks (negative) the result, mm. */
  grow: number;
}

export const FILL_DEFAULTS: FillOptions = { gap: 0.1, grow: 0 };

/** Half-width of the walls when the gap tolerance is zero, mm. */
const MIN_WALL = 0.005;
/** Free space kept round the walls, mm; the face touching the frame is "outside". */
const MARGIN = 10;

export interface Outline { pts: Vec[]; closed: boolean }

/** World polylines of every visible, unlocked path, shape, text and clone (or only those under `ids`), except `exclude`. */
export function boundaryOutlines(d: Document, ids: string[] | null, exclude: string[] = []): Outline[] {
  const scope = ids && ids.length ? new Set(ids) : null, skip = new Set(exclude);
  const inScope = new Set<string>();
  const out: Outline[] = [];
  walk(d.root, (l) => {
    if (l.node.hidden || l.node.locked || skip.has(l.node.id)) return "skip";
    const mine = !scope || scope.has(l.node.id) || inScope.has(l.parent.id);
    if (l.node.type === "group") { if (mine) inScope.add(l.node.id); return; }
    if (!mine || !(l.node.type === "path" || l.node.type === "shape" || l.node.type === "text" || l.node.type === "clone")) return;
    for (const s of transformSubpaths(nodePaths(l.node), l.world)) {
      const pts = flatten(s, FLAT_TOL);
      if (pts.length > 1) out.push({ pts, closed: s.closed && pts.length > 2 });
    }
  });
  return out;
}

const inside = (q: ClipperLib.IntPoint, piece: Paths) =>
  ClipperLib.Clipper.PointInPolygon(q, piece[0]) === 1 && piece.slice(1).every((h) => ClipperLib.Clipper.PointInPolygon(q, h) === 0);

/** The closed region around `p` (world mm) bounded by `outlines`, as Clipper paths, or null when `p` is outside every region or on a line. */
export function boundedRegion(outlines: Outline[], p: Vec, o: FillOptions = FILL_DEFAULTS): Paths | null {
  if (!outlines.length) return null;
  const r = Math.max(o.gap / 2, MIN_WALL);
  const co = new ClipperLib.ClipperOffset(2, FLAT_TOL * UNIT * 0.25);
  for (const l of outlines) co.AddPath(toPath(l.pts), ClipperLib.JoinType.jtRound, l.closed ? ClipperLib.EndType.etClosedLine : ClipperLib.EndType.etOpenRound);
  const walls: Paths = [];
  co.Execute(walls, r * UNIT);
  if (!walls.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const w of walls) for (const v of w) { minX = Math.min(minX, v.X); minY = Math.min(minY, v.Y); maxX = Math.max(maxX, v.X); maxY = Math.max(maxY, v.Y); }
  const m = MARGIN * UNIT;
  const frame = [{ X: minX - m, Y: minY - m }, { X: maxX + m, Y: minY - m }, { X: maxX + m, Y: maxY + m }, { X: minX - m, Y: maxY + m }];
  const q = { X: Math.round(p.x * UNIT), Y: Math.round(p.y * UNIT) };
  if (q.X <= minX || q.X >= maxX || q.Y <= minY || q.Y >= maxY) return null;
  const corner = { X: minX - m + 1, Y: minY - m + 1 };
  const face = pieces(minus([frame], walls)).find((pc) => inside(q, pc));
  if (!face || inside(corner, face)) return null;
  const grow = new ClipperLib.ClipperOffset(4, FLAT_TOL * UNIT * 0.25);
  grow.AddPaths(face, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
  const res: Paths = [];
  grow.Execute(res, (r + o.grow) * UNIT);
  return Math.abs(areaOfPaths(res)) > MIN_AREA ? res : null;
}

export interface FillResult { id: string | null; area: number }

/**
 * Fills the region under `p`: a new closed path on `layer` at the top of the document, or — with
 * `addTo` — the region is added to (or, with `subtract`, cut out of) that existing path, whose own
 * outline then does not count as a wall. Works on the outlines of `ids`, or of everything.
 */
export function fillBoundedArea(d: Document, p: Vec, o: FillOptions, at: { ids?: string[] | null; layer: number; addTo?: string | null; subtract?: boolean }, id: IdFactory = newId): FillResult {
  const target = at.addTo ? locate(d.root, at.addTo) : null;
  const into = target && target.node.type === "path" ? target : null;
  const face = boundedRegion(boundaryOutlines(d, at.ids ?? null, into ? [into.node.id] : []), p, o);
  if (!face || (at.subtract && !into)) return { id: null, area: 0 };
  if (into) {
    const node = into.node as PathNode;
    const own = regionOf(transformSubpaths(node.subpaths, into.world));
    const next = at.subtract ? minus(own, face) : union([own, face]);
    const subs = toSubpaths(next);
    if (!subs.length) { removeNodes(d, [node.id]); return { id: null, area: 0 }; }
    node.subpaths = transformSubpaths(subs, invert(into.world));
    return { id: node.id, area: Math.abs(areaOfPaths(next)) / (UNIT * UNIT) };
  }
  const node: PathNode = { id: id(), type: "path", name: "Filled area", transform: [1, 0, 0, 1, 0, 0], layer: at.layer, subpaths: transformSubpaths(toSubpaths(face), invert(d.root.transform)) };
  d.root.children.push(node);
  return { id: node.id, area: Math.abs(areaOfPaths(face)) / (UNIT * UNIT) };
}
