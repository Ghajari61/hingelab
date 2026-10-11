/**
 * Centre-line tracing for single-line engraving: the ink is thinned to a one-pixel skeleton
 * (Zhang–Suen parallel thinning, Comm. ACM 27(3), 1984), redundant corner pixels are dropped, and
 * the skeleton is followed into polylines between end points and junctions. Free ends are extended
 * to the edge of the stroke so lines keep the stroke's length. Coordinates are pixels (centres at +0.5).
 */
import type { Vec } from "../types";
import type { Bitmap } from "./raster";

// Neighbours P2…P9: N, NE, E, SE, S, SW, W, NW.
const NX = [0, 1, 1, 1, 0, -1, -1, -1], NY = [-1, -1, 0, 1, 1, 1, 0, -1];

/** Zhang–Suen thinning; returns a new bitmap. */
export function thin(src: Bitmap): Bitmap {
  const { width: w, height: h } = src, bits = src.bits.slice();
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? bits[y * w + x] : 0);
  let live: number[] = [];
  for (let i = 0; i < bits.length; i++) if (bits[i]) live.push(i);
  const p = new Uint8Array(8);
  for (let changed = true; changed;) {
    changed = false;
    for (const step of [0, 1]) {
      const del: number[] = [];
      for (const i of live) {
        const x = i % w, y = (i - x) / w;
        let b = 0;
        for (let k = 0; k < 8; k++) { p[k] = at(x + NX[k], y + NY[k]); b += p[k]; }
        if (b < 2 || b > 6) continue;
        let a = 0;
        for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) & 7]) a++;
        if (a !== 1) continue;
        // p[0] N, p[2] E, p[4] S, p[6] W
        if (step === 0 ? p[0] * p[2] * p[4] || p[2] * p[4] * p[6] : p[0] * p[2] * p[6] || p[0] * p[4] * p[6]) continue;
        del.push(i);
      }
      if (del.length) { changed = true; for (const i of del) bits[i] = 0; live = live.filter((i) => bits[i]); }
    }
  }
  // Drop corner pixels whose removal keeps the skeleton 8-connected (staircase "elbows").
  for (const i of live) {
    const x = i % w, y = (i - x) / w;
    for (let k = 0; k < 8; k++) p[k] = at(x + NX[k], y + NY[k]);
    const elbow = (p[0] && p[2] && !p[5]) || (p[2] && p[4] && !p[7]) || (p[4] && p[6] && !p[1]) || (p[6] && p[0] && !p[3]);
    if (!elbow) continue;
    // Count 8-connected groups among the ink neighbours: ring neighbours touch, and so do two
    // edge neighbours with one corner between them.
    const seen = new Uint8Array(8);
    let groups = 0;
    for (let k = 0; k < 8; k++) {
      if (!p[k] || seen[k]) continue;
      groups++;
      const st = [k]; seen[k] = 1;
      while (st.length) {
        const j = st.pop()!;
        const near = [(j + 1) & 7, (j + 7) & 7, ...(j % 2 === 0 ? [(j + 2) & 7, (j + 6) & 7] : [])];
        for (const q of near) if (p[q] && !seen[q]) { seen[q] = 1; st.push(q); }
      }
    }
    if (groups === 1) bits[i] = 0;
  }
  return { width: w, height: h, bits };
}

/**
 * Skeleton → polylines (pixel centres). Branches from a junction to a free end shorter than
 * `spur` pixels are dropped; closed rings come out as closed polylines (first point repeated).
 */
export function skeletonPolylines(sk: Bitmap, spur = 3): Vec[][] {
  const { width: w, height: h, bits } = sk;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && bits[y * w + x] === 1;
  const nbrs = (i: number) => {
    const x = i % w, y = (i - x) / w, out: number[] = [];
    for (let k = 0; k < 8; k++) if (on(x + NX[k], y + NY[k])) out.push((y + NY[k]) * w + x + NX[k]);
    return out;
  };
  const deg = new Uint8Array(w * h);
  for (let i = 0; i < bits.length; i++) if (bits[i]) deg[i] = nbrs(i).length;
  const used = new Set<number>();
  const key = (a: number, b: number) => (a < b ? a * w * h + b : b * w * h + a);
  const lines: { px: number[]; ends: [number, number] }[] = [];
  const walk = (start: number, first: number) => {
    const px = [start, first];
    used.add(key(start, first));
    let prev = start, cur = first;
    while (deg[cur] === 2 && cur !== start) {
      const next = nbrs(cur).find((q) => q !== prev && !used.has(key(cur, q)));
      if (next === undefined) break;
      used.add(key(cur, next));
      px.push(next);
      prev = cur; cur = next;
    }
    lines.push({ px, ends: [deg[start], deg[cur]] });
  };
  for (let i = 0; i < bits.length; i++) {
    if (!bits[i] || deg[i] === 2) continue;
    if (deg[i] === 0) { lines.push({ px: [i], ends: [0, 0] }); continue; }
    for (const q of nbrs(i)) if (!used.has(key(i, q))) walk(i, q);
  }
  for (let i = 0; i < bits.length; i++) {
    if (!bits[i] || deg[i] !== 2) continue;
    const q = nbrs(i).find((j) => !used.has(key(i, j)));
    if (q !== undefined) walk(i, q);
  }
  const len = (px: number[]) => { let s = 0; for (let k = 1; k < px.length; k++) { const a = px[k - 1], b = px[k]; s += Math.hypot((a % w) - (b % w), Math.floor(a / w) - Math.floor(b / w)); } return s; };
  return lines
    .filter((l) => !((l.ends[0] === 1) !== (l.ends[1] === 1) && Math.max(l.ends[0], l.ends[1]) >= 3 && len(l.px) < spur))
    .map((l) => l.px.map((i) => ({ x: (i % w) + 0.5, y: Math.floor(i / w) + 0.5 })));
}

/** Moves a free end outwards along the line's last direction until it reaches the edge of the ink. */
export function extendToEdge(line: Vec[], atStart: boolean, ink: Bitmap): Vec[] {
  if (line.length < 2) return line;
  const n = line.length, end = atStart ? line[0] : line[n - 1];
  const back = atStart ? line[Math.min(n - 1, 3)] : line[Math.max(0, n - 4)];
  let dx = end.x - back.x, dy = end.y - back.y;
  const l = Math.hypot(dx, dy);
  if (l < 1e-9) return line;
  dx /= l; dy /= l;
  const inInk = (x: number, y: number) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    return ix >= 0 && iy >= 0 && ix < ink.width && iy < ink.height && ink.bits[iy * ink.width + ix] === 1;
  };
  let t = 0;
  while (t < 64 && inInk(end.x + dx * (t + 0.5), end.y + dy * (t + 0.5))) t += 0.5;
  if (t === 0) return line;
  const p = { x: end.x + dx * t, y: end.y + dy * t };
  return atStart ? [p, ...line] : [...line, p];
}

/** Ink bitmap → centre-line polylines in pixel coordinates (free ends reach the stroke ends). */
export function centerlines(ink: Bitmap, spur = 3): Vec[][] {
  const sk = thin(ink);
  const deg = (p: Vec) => {
    const x = Math.floor(p.x), y = Math.floor(p.y);
    let n = 0;
    for (let k = 0; k < 8; k++) { const qx = x + NX[k], qy = y + NY[k]; if (qx >= 0 && qy >= 0 && qx < sk.width && qy < sk.height && sk.bits[qy * sk.width + qx]) n++; }
    return n;
  };
  return skeletonPolylines(sk, spur).map((line) => {
    if (line.length < 2) return line;
    const closed = line.length > 2 && line[0].x === line[line.length - 1].x && line[0].y === line[line.length - 1].y;
    if (closed) return line;
    let out = line;
    if (deg(line[0]) === 1) out = extendToEdge(out, true, ink);
    if (deg(line[line.length - 1]) === 1) out = extendToEdge(out, false, ink);
    return out;
  });
}
