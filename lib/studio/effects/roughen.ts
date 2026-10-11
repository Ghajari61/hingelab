/**
 * Roughen: every segment is split into equal pieces (curves by de Casteljau, so the shape is kept), then
 * every node is moved by a seeded random amount along x and y or along the path's normal. Jagged output
 * joins the moved nodes with straight lines; smooth output runs a smooth curve through them.
 */
import { catmullRom, cubicAt, segments, splitCubic, type Segment } from "../geom";
import type { RoughenParams, Subpath, Vec } from "../types";

/** mulberry32: small, fast, seeded; numbers in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = (Math.floor(seed) >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const segLength = (g: Segment) => {
  if (g.line) return Math.hypot(g.p3.x - g.p0.x, g.p3.y - g.p0.y);
  let l = 0, prev = g.p0;
  for (let k = 1; k <= 16; k++) { const q = cubicAt(g, k / 16); l += Math.hypot(q.x - prev.x, q.y - prev.y); prev = q; }
  return l;
};

/** How many pieces segment `g` is split into. */
export function roughenPieces(g: Segment, p: RoughenParams): number {
  if (p.subdivide === "count") return Math.max(1, Math.min(1000, Math.round(p.segments)));
  return Math.max(1, Math.min(1000, Math.ceil(segLength(g) / Math.max(0.05, p.maxSegment) - 1e-9)));
}

/** Points of the subpath after splitting (closed: no repeat of the first) with the unit normal at each. */
function splitPoints(s: Subpath, p: RoughenParams): { pts: Vec[]; normals: Vec[] } {
  const pts: Vec[] = [], tangents: Vec[] = [];
  const segs = segments(s);
  const tangent = (g: Segment, t: number): Vec => {
    const a = cubicAt(g, Math.max(0, t - 1e-4)), b = cubicAt(g, Math.min(1, t + 1e-4));
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    return l > 1e-12 ? { x: (b.x - a.x) / l, y: (b.y - a.y) / l } : { x: 1, y: 0 };
  };
  segs.forEach((seg, si) => {
    const n = roughenPieces(seg, p);
    const third = (f: number): Vec => ({ x: seg.p0.x + (seg.p3.x - seg.p0.x) * f, y: seg.p0.y + (seg.p3.y - seg.p0.y) * f });
    const g: Segment = seg.line ? { ...seg, c1: third(1 / 3), c2: third(2 / 3) } : seg;
    if (si === 0) { pts.push({ x: g.p0.x, y: g.p0.y }); tangents.push(tangent(g, 0)); }
    let rest = g;
    for (let j = 0; j < n; j++) {
      const [head, tail] = j < n - 1 ? splitCubic(rest, 1 / (n - j)) : [rest, rest];
      if (!(s.closed && si === segs.length - 1 && j === n - 1)) { pts.push({ x: head.p3.x, y: head.p3.y }); tangents.push(tangent(g, (j + 1) / n)); }
      rest = tail;
    }
  });
  const normals = tangents.map((t) => ({ x: -t.y, y: t.x }));
  return { pts, normals };
}

export function applyRoughen(subs: Subpath[], p: RoughenParams): Subpath[] {
  const rnd = seededRandom(p.seed);
  const r = () => 2 * rnd() - 1;
  return subs.map((s) => {
    if (s.nodes.length < 2) return s;
    const { pts, normals } = splitPoints(s, p);
    const moved = pts.map((q, k) => {
      if (p.direction === "normal") { const d = r() * p.maxNormal; return { x: q.x + normals[k].x * d, y: q.y + normals[k].y * d }; }
      return { x: q.x + r() * p.maxX, y: q.y + r() * p.maxY };
    });
    const closed = s.closed && moved.length > 2;
    if (p.smooth && moved.length > 2) return catmullRom(moved, closed);
    return { closed, nodes: moved.map((q) => ({ x: q.x, y: q.y })) };
  });
}
