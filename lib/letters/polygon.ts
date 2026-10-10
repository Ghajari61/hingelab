/**
 * Polygon helpers: curve flattening, cleanup, and Clipper wrappers.
 *
 * Clipper works in integers; 1 unit = 0.001 mm. Clipper's positive orientation is clockwise
 * on screen (y down), which is our outer-contour convention; holes come back negative.
 * (clipper-lib, the JS port of Clipper 1. clipper2-js 1.2.4 was tried first: its offsets return
 * wrong vertices even for a square, and its poly trees come back empty.)
 */
import * as ClipperLib from "clipper-lib";
import type { Path, Paths, PolyNode } from "clipper-lib";
import type { PathCommand } from "opentype.js";
import type { BBox } from "@/lib/hinge";
import type { Contour, Point, Shape } from "./types";

/** Clipper units per millimeter. */
export const UNIT = 1000;
/** Chordal tolerance for curve flattening and round offsets, mm. */
export const FLATTEN_TOL = 0.02;
/** Points closer than this are merged, mm. */
export const MIN_POINT_DIST = 0.01;
/**
 * Pieces and holes below this area (mm²) are dropped: they are too small to cut, and
 * self-overlapping glyph contours leave such slivers after the union.
 */
export const MIN_PIECE_AREA = 0.5;

/**
 * Flatten path commands into closed contours. `tf` maps command coordinates to mm;
 * it must be affine (Bezier control points are transformed, then the curve is subdivided).
 * Subdivision is uniform per segment with a step count that bounds the chord error by `tol`.
 */
export function flatten(cmds: PathCommand[], tf: (x: number, y: number) => Point, tol = FLATTEN_TOL): Contour[] {
  const out: Contour[] = [];
  let cur: Contour = [];
  let p: Point = [0, 0];
  const close = () => {
    const c = cleanContour(cur);
    if (c.length >= 3) out.push(c);
    cur = [];
  };
  for (const c of cmds) {
    if (c.type === "M") {
      if (cur.length) close();
      p = tf(c.x, c.y);
      cur.push(p);
    } else if (c.type === "L") {
      p = tf(c.x, c.y);
      cur.push(p);
    } else if (c.type === "Q") {
      const p1 = tf(c.x1, c.y1), p2 = tf(c.x, c.y);
      const d = Math.hypot(p[0] - 2 * p1[0] + p2[0], p[1] - 2 * p1[1] + p2[1]);
      const n = Math.max(1, Math.ceil(Math.sqrt(d / (4 * tol))));
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        cur.push([u * u * p[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
      }
      p = p2;
    } else if (c.type === "C") {
      const p1 = tf(c.x1, c.y1), p2 = tf(c.x2, c.y2), p3 = tf(c.x, c.y);
      const d1 = Math.hypot(p[0] - 2 * p1[0] + p2[0], p[1] - 2 * p1[1] + p2[1]);
      const d2 = Math.hypot(p1[0] - 2 * p2[0] + p3[0], p1[1] - 2 * p2[1] + p3[1]);
      const n = Math.max(1, Math.ceil(Math.sqrt((0.75 * Math.max(d1, d2)) / tol)));
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        const a = u * u * u, b = 3 * u * u * t, e = 3 * u * t * t, f = t * t * t;
        cur.push([a * p[0] + b * p1[0] + e * p2[0] + f * p3[0], a * p[1] + b * p1[1] + e * p2[1] + f * p3[1]]);
      }
      p = p3;
    } else if (c.type === "Z") {
      close();
    }
  }
  if (cur.length) close();
  return out;
}

/** Drop repeated points and points closer than `minDist` to the previous kept point (closing pair included). */
export function cleanContour(c: Contour, minDist = MIN_POINT_DIST): Contour {
  const out: Contour = [];
  for (const q of c) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) >= minDist) out.push(q);
  }
  while (out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) >= minDist) break;
    out.pop();
  }
  return out;
}

/** Signed area in mm². Positive = clockwise on screen (outer), negative = hole. */
export function signedArea(c: Contour) {
  let s = 0;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) s += c[j][0] * c[i][1] - c[i][0] * c[j][1];
  return s / 2;
}

export function bboxOfContours(cs: Contour[]): BBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cs) for (const [x, y] of c) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

/** Even-odd point-in-polygon test. */
export function pointInContour(pt: Point, c: Contour) {
  let inside = false;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const [xi, yi] = c[i], [xj, yj] = c[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** True if `pt` lies in the filled part of the shape (inside the outer, outside every hole). */
export const pointInShape = (pt: Point, s: Shape) => pointInContour(pt, s.outer) && !s.holes.some(h => pointInContour(pt, h));

export const toPath = (c: Contour): Path => c.map(([x, y]) => ({ X: Math.round(x * UNIT), Y: Math.round(y * UNIT) }));
export const toPaths = (cs: Contour[]): Paths => cs.map(toPath);
export const fromPath = (p: Path): Contour => p.map(q => [q.X / UNIT, q.Y / UNIT] as Point);

/** Every contour of the shapes, with their orientation (outers positive, holes negative). */
export const shapeContours = (shapes: Shape[]): Contour[] => shapes.flatMap(s => [s.outer, ...s.holes]);

export function makeShape(outer: Contour, holes: Contour[], group = 0): Shape {
  const area = Math.abs(signedArea(outer)) - holes.reduce((a, h) => a + Math.abs(signedArea(h)), 0);
  return { outer, holes, area, bbox: bboxOfContours([outer]), group };
}

/**
 * Walk a Clipper poly tree into shapes: every outer node with its direct hole children.
 * Islands inside holes are outers again and become shapes of their own.
 */
function treeToShapes(tree: ClipperLib.PolyTree): Shape[] {
  const out: Shape[] = [];
  const visit = (outers: PolyNode[]) => {
    for (const o of outers) {
      const outer = fromPath(o.Contour());
      if (outer.length < 3) continue;
      const holes = o.Childs().map(h => fromPath(h.Contour())).filter(h => h.length >= 3);
      out.push(makeShape(outer, holes));
      for (const h of o.Childs()) visit(h.Childs());
    }
  };
  visit(tree.Childs());
  return out;
}

function clip(type: ClipperLib.ClipType, subject: Contour[], clipPaths: Contour[], evenOdd = false, strict = false): Shape[] {
  const c = new ClipperLib.Clipper();
  c.StrictlySimple = strict;
  c.AddPaths(toPaths(subject), ClipperLib.PolyType.ptSubject, true);
  if (clipPaths.length) c.AddPaths(toPaths(clipPaths), ClipperLib.PolyType.ptClip, true);
  const tree = new ClipperLib.PolyTree();
  const fill = evenOdd ? ClipperLib.PolyFillType.pftEvenOdd : ClipperLib.PolyFillType.pftNonZero;
  c.Execute(type, tree, fill, fill);
  return treeToShapes(tree);
}

/**
 * Union with the nonzero fill rule (overlapping contours must share an orientation to merge),
 * or even-odd for loops of unknown orientation. `strict` splits loops that touch at a point, so a hole
 * that touches its outer (blocks of squares) comes back as a hole rather than a slit in the outer.
 */
export function unionShapes(contours: Contour[], clips: Contour[] = [], evenOdd = false, strict = false): Shape[] {
  return clip(ClipperLib.ClipType.ctUnion, contours, clips, evenOdd, strict);
}

/** Subject minus clip, both filled with the nonzero rule. */
export function differenceShapes(subject: Contour[], clipPaths: Contour[]): Shape[] {
  return clip(ClipperLib.ClipType.ctDifference, subject, clipPaths);
}

/** Subject and clip overlap, both filled with the nonzero rule. */
export function intersectShapes(subject: Contour[], clipPaths: Contour[]): Shape[] {
  return clip(ClipperLib.ClipType.ctIntersection, subject, clipPaths);
}

/**
 * Offset of filled shapes by `delta` mm: outers grow and holes shrink for a positive delta.
 * Round joins by default; miter joins keep sharp corners (limit 4 × delta, then squared off).
 * Shapes must use our orientation convention (as produced by the functions above).
 */
export function offsetShapes(shapes: Shape[], delta: number, join: "round" | "miter" = "round"): Shape[] {
  if (Math.abs(delta) < 1 / UNIT) return shapes.map(s => makeShape(s.outer, s.holes, s.group));
  const co = new ClipperLib.ClipperOffset(4, FLATTEN_TOL * UNIT);
  const jt = join === "round" ? ClipperLib.JoinType.jtRound : ClipperLib.JoinType.jtMiter;
  co.AddPaths(toPaths(shapeContours(shapes)), jt, ClipperLib.EndType.etClosedPolygon);
  const tree = new ClipperLib.PolyTree();
  co.Execute(tree, delta * UNIT);
  return treeToShapes(tree);
}

/** Remove pieces and holes smaller than `minArea` mm² (too small to cut). */
export function dropSpecks(shapes: Shape[], minArea: number): Shape[] {
  return shapes
    .filter(s => s.area >= minArea)
    .map(s => {
      const holes = s.holes.filter(h => -signedArea(h) >= minArea);
      return holes.length === s.holes.length ? s : makeShape(s.outer, holes, s.group);
    });
}

export const totalArea = (shapes: Shape[]) => shapes.reduce((a, s) => a + s.area, 0);
