/**
 * Corners: replaces sharp corners between two straight segments by a fillet (circular arc tangent to
 * both segments), an inverse fillet (the arc mirrored across its chord, centred near the corner), a
 * chamfer (the chord) or an inverse chamfer (a notch: the corner point mirrored across the chord).
 * Each corner's cut-back is limited to half of both neighbouring segments. Corners touching a curve,
 * open ends and straight-through points are left as they are.
 */
import { EPS } from "../geom";
import type { Anchor, CornersParams, Subpath, Vec } from "../types";

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const mulv = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
const rot = (v: Vec, a: number): Vec => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });

/** `p` mirrored across the line through `a` and `b`. */
function reflect(p: Vec, a: Vec, b: Vec): Vec {
  const d = sub(b, a), l2 = d.x * d.x + d.y * d.y;
  if (l2 < EPS * EPS) return p;
  const t = ((p.x - a.x) * d.x + (p.y - a.y) * d.y) / l2;
  const f = add(a, mulv(d, t));
  return { x: 2 * f.x - p.x, y: 2 * f.y - p.y };
}

/**
 * A circular arc from `p0` around `c` by `sweep` radians (positive = from +x towards +y), as anchors:
 * the first carries the outgoing handle, the last the incoming one. Pieces of at most 45°.
 */
export function arcAnchors(c: Vec, p0: Vec, sweep: number): Anchor[] {
  const m = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 4) - 1e-9));
  const step = sweep / m;
  const r = Math.hypot(p0.x - c.x, p0.y - c.y);
  const h = (4 / 3) * Math.tan(Math.abs(step) / 4) * r;
  const s = Math.sign(sweep);
  const tangent = (w: Vec): Vec => ({ x: (-w.y * s) / r, y: (w.x * s) / r });
  const out: Anchor[] = [];
  let w = sub(p0, c);
  for (let k = 0; k <= m; k++) {
    const p = add(c, w), t = tangent(w);
    const a: Anchor = { x: p.x, y: p.y };
    if (k > 0) a.i = sub(p, mulv(t, h));
    if (k < m) a.o = add(p, mulv(t, h));
    out.push(a);
    if (k < m) w = rot(sub(p0, c), step * (k + 1));
  }
  return out;
}

function cornerSubpath(s: Subpath, p: CornersParams, picked: Set<number> | null): Subpath {
  const n = s.nodes.length;
  if (n < 3 || p.radius <= EPS) return s;
  const out: Anchor[] = [];
  for (let k = 0; k < n; k++) {
    const v = s.nodes[k];
    const hasPrev = s.closed || k > 0, hasNext = s.closed || k < n - 1;
    const prev = s.nodes[(k - 1 + n) % n], next = s.nodes[(k + 1) % n];
    const straight = hasPrev && hasNext && !prev.o && !v.i && !v.o && !next.i;
    if (!straight || (picked && !picked.has(k))) { out.push({ ...v }); continue; }
    const l1 = Math.hypot(v.x - prev.x, v.y - prev.y), l2 = Math.hypot(next.x - v.x, next.y - v.y);
    if (l1 < EPS || l2 < EPS) { out.push({ ...v }); continue; }
    const u1 = { x: (v.x - prev.x) / l1, y: (v.y - prev.y) / l1 }, u2 = { x: (next.x - v.x) / l2, y: (next.y - v.y) / l2 };
    const theta = Math.acos(Math.max(-1, Math.min(1, -(u1.x * u2.x + u1.y * u2.y))));
    if (theta < 1e-4 || Math.PI - theta < 1e-4) { out.push({ ...v }); continue; }
    const t = Math.min(p.radius / Math.tan(theta / 2), l1 / 2, l2 / 2);
    const a = sub(v, mulv(u1, t)), b = add(v, mulv(u2, t));
    if (p.mode === "chamfer") { out.push(a, b); continue; }
    if (p.mode === "inverseChamfer") { out.push(a, reflect(v, a, b), b); continue; }
    // Turn direction: positive cross product = the path turns towards +y at this corner.
    const turn = Math.sign(u1.x * u2.y - u1.y * u2.x);
    const r = t * Math.tan(theta / 2);
    const normal = { x: -u1.y * turn, y: u1.x * turn };
    const centre = add(a, mulv(normal, r));
    const sweep = turn * (Math.PI - theta);
    if (p.mode === "fillet") { out.push(...arcAnchors(centre, a, sweep)); continue; }
    out.push(...arcAnchors(reflect(centre, a, b), a, -sweep));
  }
  return { closed: s.closed, nodes: mergeCoincident(out, s.closed) };
}

/** Joins neighbouring anchors at the same spot (two corners cut back to the same middle point). */
function mergeCoincident(nodes: Anchor[], closed: boolean): Anchor[] {
  const same = (a: Anchor, b: Anchor) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9 && !a.o && !b.i;
  const out: Anchor[] = [];
  for (const q of nodes) {
    const last = out[out.length - 1];
    if (last && same(last, q)) {
      out[out.length - 1] = { ...last, ...(q.o ? { o: q.o } : {}), ...(q.k ? { k: q.k } : {}) };
      continue;
    }
    out.push(q);
  }
  if (closed && out.length > 2 && same(out[out.length - 1], out[0])) {
    const last = out.pop()!;
    out[0] = { ...out[0], ...(last.i ? { i: last.i } : {}) };
  }
  return out;
}

export function applyCorners(subs: Subpath[], p: CornersParams): Subpath[] {
  return subs.map((s, si) => {
    const picked = p.nodes ? new Set(p.nodes[si] ?? []) : null;
    if (picked && !picked.size) return s;
    return cornerSubpath(s, p, picked);
  });
}
