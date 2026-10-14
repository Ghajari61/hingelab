/**
 * Distort: Push & Pull, Zipper and Twister.
 * Push & Pull moves every node away from the centre and each segment's handles towards it (or the
 * other way round), so sides bow in between pointed corners (push) or swell into petals (pull).
 * Zipper splits each segment evenly and moves alternate points out and in along the outline's normal.
 * Twister turns the outline round the centre, more the farther a point is from it.
 */
import { catmullRom, cubicAt, flatten, segments, splitCubic, type Segment } from "../geom";
import type { Anchor, DistortParams, Subpath, Vec } from "../types";
import { seededRandom } from "./roughen";

const RAD = Math.PI / 180;

/** A straight segment as an equivalent cubic (handles at the thirds), so it can bow. */
const asCubic = (g: Segment): Segment => g.line
  ? { ...g, c1: { x: g.p0.x + (g.p3.x - g.p0.x) / 3, y: g.p0.y + (g.p3.y - g.p0.y) / 3 }, c2: { x: g.p0.x + ((g.p3.x - g.p0.x) * 2) / 3, y: g.p0.y + ((g.p3.y - g.p0.y) * 2) / 3 } }
  : g;

function pushPull(s: Subpath, p: DistortParams): Subpath {
  const segs = segments(s);
  if (!segs.length) return s;
  const k = Math.max(-100, Math.min(100, p.amount)) / 100;
  const at = (q: Vec, f: number): Vec => ({ x: p.cx + (q.x - p.cx) * f, y: p.cy + (q.y - p.cy) * f });
  const fNode = 1 + 0.5 * k, fHandle = 1 - 0.5 * k;
  const nodes: Anchor[] = s.nodes.map((a) => ({ ...at(a, fNode), ...(a.k ? { k: a.k } : {}) }));
  const n = nodes.length;
  segs.forEach((g0, i) => {
    const g = asCubic(g0);
    nodes[i].o = at(g.c1, fHandle);
    nodes[(i + 1) % n].i = at(g.c2, fHandle);
  });
  return { closed: s.closed, nodes };
}

/** The subpath split into `pieces` equal-parameter pieces per segment: points (closed: no repeat) and unit normals. */
function splitEven(s: Subpath, pieces: number): { pts: Vec[]; normals: Vec[] } {
  const pts: Vec[] = [], normals: Vec[] = [];
  const segs = segments(s).map(asCubic);
  const normal = (g: Segment, t: number): Vec => {
    const a = cubicAt(g, Math.max(0, t - 1e-4)), b = cubicAt(g, Math.min(1, t + 1e-4));
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    return l > 1e-12 ? { x: -(b.y - a.y) / l, y: (b.x - a.x) / l } : { x: 0, y: 1 };
  };
  segs.forEach((g, si) => {
    if (si === 0) { pts.push({ x: g.p0.x, y: g.p0.y }); normals.push(normal(g, 0)); }
    let rest = g;
    for (let j = 0; j < pieces; j++) {
      const [head, tail] = j < pieces - 1 ? splitCubic(rest, 1 / (pieces - j)) : [rest, rest];
      if (!(s.closed && si === segs.length - 1 && j === pieces - 1)) { pts.push({ x: head.p3.x, y: head.p3.y }); normals.push(normal(g, (j + 1) / pieces)); }
      rest = tail;
    }
  });
  return { pts, normals };
}

function zipper(s: Subpath, p: DistortParams, rnd: () => number): Subpath {
  if (s.nodes.length < 2) return s;
  const teeth = Math.max(1, Math.min(200, Math.round(p.frequency)));
  const { pts, normals } = splitEven(s, 2 * teeth);
  const moved = pts.map((q, k) => {
    // Every second point is a tooth tip, alternately out and in; the rest stay on the outline.
    const j = k % (2 * teeth);
    if (j % 2 === 0) return q;
    const h = p.amplitude * (p.random ? 0.3 + 0.7 * rnd() : 1) * (j % 4 === 1 ? 1 : -1);
    return { x: q.x + normals[k].x * h, y: q.y + normals[k].y * h };
  });
  const closed = s.closed && moved.length > 2;
  if (p.smooth && moved.length > 2) return catmullRom(moved, closed);
  return { closed, nodes: moved.map((q) => ({ x: q.x, y: q.y })) };
}

function twister(subs: Subpath[], p: DistortParams): Subpath[] {
  if (Math.abs(p.angle) < 1e-9) return subs;
  let reach = 0;
  for (const s of subs) for (const a of s.nodes) reach = Math.max(reach, Math.hypot(a.x - p.cx, a.y - p.cy));
  if (reach < 1e-9) return subs;
  const step = reach / 40;
  return subs.map((s) => {
    if (s.nodes.length < 2) return s;
    const flat = flatten(s, reach / 500);
    const ring = s.closed ? [...flat, flat[0]] : flat;
    const dense: Vec[] = [];
    for (let k = 0; k < ring.length - 1 && dense.length < 4000; k++) {
      const a = ring[k], b = ring[k + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
      for (let j = 0; j < n; j++) dense.push({ x: a.x + ((b.x - a.x) * j) / n, y: a.y + ((b.y - a.y) * j) / n });
    }
    if (!s.closed) dense.push(ring[ring.length - 1]);
    const turned = dense.map((q) => {
      const dx = q.x - p.cx, dy = q.y - p.cy;
      const t = p.angle * RAD * Math.min(1, Math.hypot(dx, dy) / reach);
      const c = Math.cos(t), sn = Math.sin(t);
      return { x: p.cx + dx * c - dy * sn, y: p.cy + dx * sn + dy * c };
    });
    return turned.length > 2 ? catmullRom(turned, s.closed) : { closed: false, nodes: turned.map((q) => ({ x: q.x, y: q.y })) };
  });
}

export function applyDistort(subs: Subpath[], p: DistortParams): Subpath[] {
  switch (p.mode) {
    case "pushPull": return Math.abs(p.amount) < 1e-9 ? subs : subs.map((s) => pushPull(s, p));
    case "zipper": {
      if (Math.abs(p.amplitude) < 1e-9) return subs;
      const rnd = seededRandom(p.seed);
      return subs.map((s) => zipper(s, p, rnd));
    }
    case "twister": return twister(subs, p);
  }
}
