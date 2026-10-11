/**
 * Connectors: lines that stay attached to two objects. The route runs between the centres of the
 * objects' boxes and is cut where it leaves the first object's outline and enters the second's
 * (falling back to the box edge when the line never crosses the outline, e.g. an open path).
 */
import { flatten, I, subpathsBox, type Box } from "./geom";
import { addNode, findNode } from "./scene";
import type { ConnectorMode, Document, PathNode, Subpath, Vec } from "./types";

/** Adds a connector from one object to another (its route is filled in by the link sync). False when either is missing or the same. */
export function connectObjects(d: Document, from: string, to: string, mode: ConnectorMode, layer: number, id: string): boolean {
  if (from === to || !findNode(d.root, from) || !findNode(d.root, to)) return false;
  const node: PathNode = { id, type: "path", transform: [...I], layer, subpaths: [], connector: { from, to, mode } };
  addNode(d, node);
  return true;
}

/** Sets the routing of the given connectors. Returns the ids changed. */
export function setConnectorMode(d: Document, ids: string[], mode: ConnectorMode): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const n = findNode(d.root, id);
    if (n?.type !== "path" || !n.connector || n.connector.mode === mode) continue;
    n.connector.mode = mode;
    out.push(id);
  }
  return out;
}

interface End { box: Box; polys: { pts: Vec[]; closed: boolean }[] }

const endOf = (world: Subpath[]): End | null => {
  const box = subpathsBox(world);
  if (!(box.maxX >= box.minX && box.maxY >= box.minY)) return null;
  return { box, polys: world.map((s) => ({ pts: flatten(s, 0.01), closed: s.closed })) };
};

/** Parameters u ∈ [0, 1] along a→b where it crosses the polyline p→q pieces. */
function crossings(a: Vec, b: Vec, polys: End["polys"]): number[] {
  const out: number[] = [];
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const { pts, closed } of polys) {
    const n = pts.length, count = closed ? n : n - 1;
    for (let k = 0; k < count; k++) {
      const p = pts[k], q = pts[(k + 1) % n];
      const ex = q.x - p.x, ey = q.y - p.y;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-15) continue;
      const u = ((p.x - a.x) * ey - (p.y - a.y) * ex) / den;
      const v = ((p.x - a.x) * dy - (p.y - a.y) * dx) / den;
      if (u >= -1e-12 && u <= 1 + 1e-12 && v >= -1e-12 && v <= 1 + 1e-12) out.push(Math.max(0, Math.min(1, u)));
    }
  }
  return out;
}

const boxPolys = (b: Box): End["polys"] => [{ closed: true, pts: [{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY }] }];

/** Where a→b leaves (`last`) or first meets (`!last`) the object's outline, else its box; null when it does neither. */
function clip(a: Vec, b: Vec, e: End, last: boolean): Vec | null {
  let us = crossings(a, b, e.polys);
  if (!us.length) us = crossings(a, b, boxPolys(e.box));
  if (!us.length) return null;
  const u = last ? Math.max(...us) : Math.min(...us);
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

const centre = (b: Box): Vec => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });
/** Centres closer than this (mm) across a right-angled route count as lined up: one straight run instead of a tiny jog. */
const ALIGNED = 1e-3;

/**
 * The connector between two objects' world outlines as a polyline (world space). Orthogonal routes
 * use horizontal and vertical runs only: a Z through the middle of the gap when the boxes overlap
 * along one axis, an L (out sideways, in from above or below) when they overlap along neither, and a
 * straight line when the boxes overlap.
 */
export function connectorRoute(from: Subpath[], to: Subpath[], mode: ConnectorMode): Vec[] | null {
  const A = endOf(from), B = endOf(to);
  if (!A || !B) return null;
  const a = centre(A.box), b = centre(B.box);
  let pts: Vec[] = [a, b];
  if (mode === "orthogonal") {
    const xo = A.box.minX < B.box.maxX && B.box.minX < A.box.maxX, yo = A.box.minY < B.box.maxY && B.box.minY < A.box.maxY;
    if (xo && !yo) {
      const my = A.box.maxY <= B.box.minY ? (A.box.maxY + B.box.minY) / 2 : (B.box.maxY + A.box.minY) / 2;
      pts = Math.abs(a.x - b.x) < ALIGNED ? [a, { x: a.x, y: b.y }] : [a, { x: a.x, y: my }, { x: b.x, y: my }, b];
    } else if (yo && !xo) {
      const mx = A.box.maxX <= B.box.minX ? (A.box.maxX + B.box.minX) / 2 : (B.box.maxX + A.box.minX) / 2;
      pts = Math.abs(a.y - b.y) < ALIGNED ? [a, { x: b.x, y: a.y }] : [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b];
    } else if (!xo && !yo) pts = [a, { x: b.x, y: a.y }, b];
  }
  pts = pts.filter((p, k) => k === 0 || Math.hypot(p.x - pts[k - 1].x, p.y - pts[k - 1].y) > 1e-6);
  pts = pts.filter((p, k) => {
    if (k === 0 || k === pts.length - 1) return true;
    const ux = p.x - pts[k - 1].x, uy = p.y - pts[k - 1].y, vx = pts[k + 1].x - p.x, vy = pts[k + 1].y - p.y;
    return Math.abs(ux * vy - uy * vx) > 1e-6 * Math.hypot(ux, uy) * Math.hypot(vx, vy);
  });
  if (pts.length < 2) return null;
  const n = pts.length;
  const start = clip(pts[0], pts[1], A, true), end = clip(pts[n - 2], pts[n - 1], B, false);
  if (start) pts[0] = start;
  if (end) pts[n - 1] = end;
  return pts;
}
