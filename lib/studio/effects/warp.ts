/**
 * Warps: Pattern Along Path (copies of another object laid along this path), Bend (the artwork follows
 * a guide path) and Envelope (bilinear or perspective map of the artwork's box onto four corners).
 * Curves are flattened and split into short pieces before mapping, so the output is polylines.
 */
import { EPS, flatten, rotateAt, subpathsBox, transformSubpaths } from "../geom";
import { FLAT_TOL } from "../pathfinder";
import type { BendParams, EnvelopeParams, PatternAlongPathParams, Subpath, Vec } from "../types";
import { boxOf } from "./copies";

// ---------- arc-length tracks ----------

/** A polyline with running length; closed tracks repeat their first point at the end. */
export interface Track { pts: Vec[]; cum: number[]; length: number; closed: boolean }

export function track(s: Subpath, tol = FLAT_TOL): Track {
  const pts = flatten(s, tol);
  const closed = s.closed && pts.length > 2;
  if (closed) pts.push({ ...pts[0] });
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
  return { pts, cum, length: cum[cum.length - 1] ?? 0, closed };
}

/** Point and unit tangent at length `s`; open tracks continue straight past their ends, closed ones wrap. */
export function trackAt(t: Track, s: number): { p: Vec; d: Vec } {
  const n = t.pts.length;
  if (n < 2 || t.length < EPS) return { p: t.pts[0] ?? { x: 0, y: 0 }, d: { x: 1, y: 0 } };
  const at = t.closed ? ((s % t.length) + t.length) % t.length : s;
  let lo = 1, hi = n - 1;
  if (at <= 0) hi = 1;
  else if (at >= t.length) lo = n - 1;
  else while (lo < hi) { const m = (lo + hi) >> 1; if (t.cum[m] < at) lo = m + 1; else hi = m; }
  let k = Math.min(lo, hi);
  while (k > 1 && t.cum[k] - t.cum[k - 1] < 1e-12) k--;
  while (k < n - 1 && t.cum[k] - t.cum[k - 1] < 1e-12) k++;
  const a = t.pts[k - 1], b = t.pts[k], span = t.cum[k] - t.cum[k - 1];
  const d = span > 1e-12 ? { x: (b.x - a.x) / span, y: (b.y - a.y) / span } : { x: 1, y: 0 };
  const u = at - t.cum[k - 1];
  return { p: { x: a.x + d.x * u, y: a.y + d.y * u }, d };
}

/** Nearest point of a track to `q`: its length along the track and distance. */
export function trackNearest(t: Track, q: Vec): { s: number; dist: number } {
  let best = { s: 0, dist: Infinity };
  for (let k = 1; k < t.pts.length; k++) {
    const a = t.pts[k - 1], b = t.pts[k], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const u = l2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2));
    const dist = Math.hypot(a.x + dx * u - q.x, a.y + dy * u - q.y);
    if (dist < best.dist) best = { s: t.cum[k - 1] + u * Math.sqrt(l2), dist };
  }
  return best;
}

/** Each subpath as a polyline (curves flattened) with no piece longer than `step`. */
export function densify(subs: Subpath[], step: number, tol = FLAT_TOL): { closed: boolean; pts: Vec[] }[] {
  const out: { closed: boolean; pts: Vec[] }[] = [];
  for (const s of subs) {
    const flat = flatten(s, tol);
    if (!flat.length) continue;
    const closed = s.closed && flat.length > 2;
    const ring = closed ? [...flat, flat[0]] : flat;
    const pts: Vec[] = [{ ...ring[0] }];
    for (let k = 1; k < ring.length; k++) {
      const a = ring[k - 1], b = ring[k], parts = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
      for (let j = 1; j <= parts; j++) pts.push({ x: a.x + ((b.x - a.x) * j) / parts, y: a.y + ((b.y - a.y) * j) / parts });
    }
    if (closed) pts.pop();
    out.push({ closed, pts });
  }
  return out;
}

export const polySub = (pts: Vec[], closed: boolean): Subpath => ({ closed, nodes: pts.map((p) => ({ x: p.x, y: p.y })) });

/** A point placed `v` across the track at length `s` (positive v: to the right of the direction of travel on screen). */
function across(t: Track, s: number, v: number): Vec {
  const { p, d } = trackAt(t, s);
  return { x: p.x - d.y * v, y: p.y + d.x * v };
}

// ---------- Pattern Along Path ----------

/** Start and stretch factor of every copy of a pattern `pw` long on a spine `L` long. */
export function patternPlacements(L: number, pw: number, mode: PatternAlongPathParams["mode"], spacing: number): { start: number; scale: number }[] {
  if (L < EPS || pw < EPS) return [];
  const pitch = pw + spacing;
  switch (mode) {
    case "single": return [{ start: 0, scale: 1 }];
    case "singleStretched": return [{ start: 0, scale: L / pw }];
    case "repeated": {
      if (pitch < EPS) return [];
      const n = Math.min(10000, Math.floor(L / pitch + 1e-9));
      return Array.from({ length: n }, (_, k) => ({ start: k * pitch, scale: 1 }));
    }
    case "repeatedStretched": {
      let n = pitch < EPS ? 1 : Math.max(1, Math.min(10000, Math.round((L + spacing) / pitch)));
      let len = (L - (n - 1) * spacing) / n;
      if (len < EPS) { n = 1; len = L; }
      return Array.from({ length: n }, (_, k) => ({ start: k * (len + spacing), scale: len / pw }));
    }
  }
}

/** The linked pattern (page space) laid along every subpath of `subs`; without a pattern the input passes. */
export function applyPatternAlongPath(subs: Subpath[], p: PatternAlongPathParams): Subpath[] {
  let pattern = p.linkCache;
  if (!pattern?.length) return subs;
  if (p.rotate90) pattern = transformSubpaths(pattern, rotateAt(90));
  const b = subpathsBox(pattern);
  const pw = b.maxX - b.minX, ph = b.maxY - b.minY;
  if (!(pw > EPS)) return subs;
  const cy = (b.minY + b.maxY) / 2, ws = p.widthScale;
  const norm = transformSubpaths(pattern, [1, 0, 0, ws, -b.minX, -cy * ws]);
  const out: Subpath[] = [];
  for (const s of subs) {
    if (s.nodes.length < 2) continue;
    const t = track(s);
    for (const pl of patternPlacements(t.length, pw, p.mode, p.spacing)) {
      const step = Math.max(0.02, Math.max(pw, ph * Math.abs(ws)) / 100) / Math.max(1, pl.scale);
      for (const poly of densify(norm, step)) {
        out.push(polySub(poly.pts.map((q) => across(t, pl.start + q.x * pl.scale, q.y + p.normalOffset)), poly.closed));
      }
    }
  }
  return out;
}

// ---------- Bend ----------

/** A straight guide through the middle of the artwork's box (with ⅓ handles, so dragging them bends it). */
export function bendGuide(input: Subpath[], vertical: boolean): Subpath {
  const b = boxOf(input);
  if (vertical) {
    const x = (b.minX + b.maxX) / 2, h = b.maxY - b.minY;
    return { closed: false, nodes: [{ x, y: b.minY, o: { x, y: b.minY + h / 3 } }, { x, y: b.maxY, i: { x, y: b.maxY - h / 3 } }] };
  }
  const y = (b.minY + b.maxY) / 2, w = b.maxX - b.minX;
  return { closed: false, nodes: [{ x: b.minX, y, o: { x: b.minX + w / 3, y } }, { x: b.maxX, y, i: { x: b.maxX - w / 3, y } }] };
}

/** The artwork's length (x, or y when vertical) runs along the guide; its offset from the box's centre line runs across it. */
export function applyBend(subs: Subpath[], p: BendParams): Subpath[] {
  const b = boxOf(subs);
  const along = p.vertical ? b.maxY - b.minY : b.maxX - b.minX;
  const t = track(p.guide);
  if (along < EPS || t.length < EPS) return subs;
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  const k = p.widthScale * (p.widthInLength ? t.length / along : 1), f = t.length / along;
  const step = Math.max(0.02, along / 400);
  return densify(subs, step).map((poly) => polySub(poly.pts.map((q) => {
    const u = p.vertical ? q.y - b.minY : q.x - b.minX, v = p.vertical ? cx - q.x : q.y - cy;
    return across(t, u * f, v * k);
  }), poly.closed));
}

/** Guide handles in path order: each anchor's in handle, the anchor, its out handle. */
export function bendHandleRefs(guide: Subpath): { node: number; part: "a" | "i" | "o" }[] {
  const out: { node: number; part: "a" | "i" | "o" }[] = [];
  guide.nodes.forEach((a, k) => { if (a.i) out.push({ node: k, part: "i" }); out.push({ node: k, part: "a" }); if (a.o) out.push({ node: k, part: "o" }); });
  return out;
}

export function bendHandles(p: BendParams): Vec[] {
  return bendHandleRefs(p.guide).map((r) => { const a = p.guide.nodes[r.node]; const q = r.part === "a" ? a : a[r.part]!; return { x: q.x, y: q.y }; });
}

/** The guide itself and a line from each anchor to its handles. */
export function bendOutline(p: BendParams): Subpath[] {
  const sticks = p.guide.nodes.flatMap((a) => [a.i, a.o].filter((h) => !!h).map((h): Subpath => ({ closed: false, nodes: [{ x: a.x, y: a.y }, { x: h!.x, y: h!.y }] })));
  return [p.guide, ...sticks];
}

/** The guide with handle `index` moved to `at`; moving an anchor carries its handles along. */
export function bendDrag(p: BendParams, index: number, at: Vec): Partial<BendParams> {
  const r = bendHandleRefs(p.guide)[index];
  if (!r) return {};
  const guide: Subpath = JSON.parse(JSON.stringify(p.guide));
  const a = guide.nodes[r.node];
  if (r.part !== "a") { a[r.part] = { x: at.x, y: at.y }; return { guide }; }
  const dx = at.x - a.x, dy = at.y - a.y;
  a.x = at.x; a.y = at.y;
  if (a.i) a.i = { x: a.i.x + dx, y: a.i.y + dy };
  if (a.o) a.o = { x: a.o.x + dx, y: a.o.y + dy };
  return { guide };
}

// ---------- Envelope ----------

/** 3 × 3 projective map (row major, last entry 1) taking the unit square's (0,0), (1,0), (1,1), (0,1) to q0…q3. */
export function squareToQuad(q: [Vec, Vec, Vec, Vec]): number[] {
  const [p0, p1, p2, p3] = q;
  const sx = p0.x - p1.x + p2.x - p3.x, sy = p0.y - p1.y + p2.y - p3.y;
  let g = 0, h = 0;
  if (Math.abs(sx) > 1e-12 || Math.abs(sy) > 1e-12) {
    const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dy1 = p1.y - p2.y, dy2 = p3.y - p2.y;
    const det = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(det) > 1e-15) { g = (sx * dy2 - dx2 * sy) / det; h = (dx1 * sy - sx * dy1) / det; }
  }
  return [p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x, p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y, g, h, 1];
}

export function projectPoint(m: number[], u: number, v: number): Vec {
  const w = m[6] * u + m[7] * v + m[8];
  const k = Math.abs(w) < 1e-12 ? 1e12 : 1 / w;
  return { x: (m[0] * u + m[1] * v + m[2]) * k, y: (m[3] * u + m[4] * v + m[5]) * k };
}

export function bilinearPoint(p: EnvelopeParams, u: number, v: number): Vec {
  const a = (1 - u) * (1 - v), b = u * (1 - v), c = u * v, d = (1 - u) * v;
  return { x: a * p.tl.x + b * p.tr.x + c * p.br.x + d * p.bl.x, y: a * p.tl.y + b * p.tr.y + c * p.br.y + d * p.bl.y };
}

export function envelopeCorners(input: Subpath[]): Pick<EnvelopeParams, "tl" | "tr" | "br" | "bl"> {
  const b = boxOf(input);
  return { tl: { x: b.minX, y: b.minY }, tr: { x: b.maxX, y: b.minY }, br: { x: b.maxX, y: b.maxY }, bl: { x: b.minX, y: b.maxY } };
}

/** Maps the artwork's box onto the quad tl–tr–br–bl. Perspective keeps straight lines straight; bilinear curves them. */
export function applyEnvelope(subs: Subpath[], p: EnvelopeParams): Subpath[] {
  const b = boxOf(subs);
  const w = b.maxX - b.minX, h = b.maxY - b.minY;
  const uv = (q: Vec) => ({ u: w > EPS ? (q.x - b.minX) / w : 0.5, v: h > EPS ? (q.y - b.minY) / h : 0.5 });
  if (p.mode === "perspective") {
    const m = squareToQuad([p.tl, p.tr, p.br, p.bl]);
    return subs.map((s) => polySub(flatten(s, FLAT_TOL).map((q) => { const c = uv(q); return projectPoint(m, c.u, c.v); }), s.closed));
  }
  const step = Math.max(0.02, Math.max(w, h) / 200);
  return densify(subs, step).map((poly) => polySub(poly.pts.map((q) => { const c = uv(q); return bilinearPoint(p, c.u, c.v); }), poly.closed));
}

const CORNER_KEYS = ["tl", "tr", "br", "bl"] as const;
export const envelopeHandles = (p: EnvelopeParams): Vec[] => CORNER_KEYS.map((k) => ({ x: p[k].x, y: p[k].y }));
export const envelopeOutline = (p: EnvelopeParams): Subpath[] => [{ closed: true, nodes: envelopeHandles(p) }];
export const envelopeDrag = (index: number, at: Vec): Partial<EnvelopeParams> => (CORNER_KEYS[index] ? { [CORNER_KEYS[index]]: { x: at.x, y: at.y } } : {});
