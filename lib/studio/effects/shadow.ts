/**
 * Solid Shadow and Depth: a solid shadow swept out behind a shape (one piece you can cut from a
 * second colour and glue behind), and a 3D-looking extrusion drawn as lines (the side edges and
 * the back face), for engraving or scoring. Both read the closed parts; open parts pass through.
 */
import * as ClipperLib from "clipper-lib";
import type { Paths } from "clipper-lib";
import { subpathsBox } from "../geom";
import { FLAT_TOL, fromPath, minus, regionOf, run, toPath, toSubpaths, union } from "../pathfinder";
import type { BlockShadowParams, DepthParams, Subpath, Vec } from "../types";
import { flatRing, openParts, openSubpath } from "./clip";

const dirOf = (angle: number, d: number): Vec => ({ x: Math.cos((angle * Math.PI) / 180) * d, y: Math.sin((angle * Math.PI) / 180) * d });

/** The area swept by the shape moving along `v`: the shape, the moved shape and every edge's band between them. */
function sweep(closed: Subpath[], rings: Vec[][], v: Vec): Paths {
  const own = regionOf(closed);
  const moved = regionOf(closed.map((q) => ({ ...q, nodes: q.nodes.map((n) => ({ x: n.x + v.x, y: n.y + v.y, ...(n.i ? { i: { x: n.i.x + v.x, y: n.i.y + v.y } } : {}), ...(n.o ? { o: { x: n.o.x + v.x, y: n.o.y + v.y } } : {}) })) })));
  // the bands all wound the same way, so overlapping ones add up instead of cancelling
  const bands: Paths = [];
  for (const r of rings) for (let k = 0; k < r.length; k++) {
    const a = r[k], b = r[(k + 1) % r.length];
    const q = toPath([a, b, { x: b.x + v.x, y: b.y + v.y }, { x: a.x + v.x, y: a.y + v.y }]);
    bands.push(ClipperLib.Clipper.Orientation(q) ? q : q.slice().reverse());
  }
  // each set resolved on its own (subject and clip are filled separately), then united
  const both = run(ClipperLib.ClipType.ctUnion, own, moved);
  return run(ClipperLib.ClipType.ctUnion, both, union([bands]));
}

export function applyBlockShadow(subs: Subpath[], p: BlockShadowParams): Subpath[] {
  const closed = subs.filter((s) => s.closed && s.nodes.length > 2);
  if (!closed.length || p.depth <= 0) return subs;
  const rings = closed.map((s) => flatRing(s)).filter((r) => r.length > 2);
  const shadow = sweep(closed, rings, dirOf(p.angle, p.depth));
  const own = regionOf(closed);
  switch (p.output) {
    case "fused": return [...toSubpaths(shadow), ...openParts(subs)];
    case "shadow": return [...toSubpaths(minus(shadow, own)), ...openParts(subs)];
    default: return [...subs, ...toSubpaths(minus(shadow, own))];
  }
}

/** Lines of `lines` outside `area` (hidden edges behind the front face are dropped). */
function outside(lines: Vec[][], area: Paths): Vec[][] {
  const subj = lines.filter((l) => l.length > 1).map(toPath);
  if (!subj.length) return [];
  if (!area.length) return lines;
  const c = new ClipperLib.Clipper();
  c.AddPaths(subj, ClipperLib.PolyType.ptSubject, false);
  c.AddPaths(area, ClipperLib.PolyType.ptClip, true);
  const tree = new ClipperLib.PolyTree();
  c.Execute(ClipperLib.ClipType.ctDifference, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return (ClipperLib.Clipper.OpenPathsFromPolyTree(tree) as ClipperLib.Path[]).filter((q) => q.length > 1).map(fromPath);
}

/** A corner: where the outline turns by more than `deg` degrees (curves are not given side edges). */
function corners(r: Vec[], deg = 25): Vec[] {
  const out: Vec[] = [];
  const n = r.length;
  for (let k = 0; k < n; k++) {
    const a = r[(k - 1 + n) % n], b = r[k], c = r[(k + 1) % n];
    const t = Math.abs(Math.atan2((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x), (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)));
    if ((t * 180) / Math.PI > deg) out.push(b);
  }
  return out;
}

export function applyDepth(subs: Subpath[], p: DepthParams): Subpath[] {
  const closed = subs.filter((s) => s.closed && s.nodes.length > 2);
  if (!closed.length || p.depth <= 0) return subs;
  const b = subpathsBox(closed), c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  const v = dirOf(p.angle, p.depth), k = Math.max(0.05, Math.min(1, p.scale));
  // the back face: moved back and, for perspective, shrunk towards its middle
  const back = (q: Vec): Vec => ({ x: c.x + (q.x - c.x) * k + v.x, y: c.y + (q.y - c.y) * k + v.y });
  const rings = closed.map((s) => flatRing(s)).filter((r) => r.length > 2);
  const lines: Vec[][] = [];
  for (const r of rings) {
    lines.push([...r.map(back), back(r[0])]);
    for (const q of corners(r)) lines.push([q, back(q)]);
    // the silhouette's side edges on curves: the points furthest out across the direction
    const nrm = { x: -v.y, y: v.x }, dots = r.map((q) => q.x * nrm.x + q.y * nrm.y);
    for (const i of [dots.indexOf(Math.max(...dots)), dots.indexOf(Math.min(...dots))]) lines.push([r[i], back(r[i])]);
  }
  const shown = p.hidden ? outside(lines, regionOf(closed)) : lines;
  return [...subs, ...shown.filter((l) => Math.hypot(l[l.length - 1].x - l[0].x, l[l.length - 1].y - l[0].y) > FLAT_TOL || l.length > 2).map(openSubpath)];
}
