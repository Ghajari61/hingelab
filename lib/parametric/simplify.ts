/**
 * Mesh decimation by quadric error edge collapse (Garland and Heckbert): the cheapest edge folds
 * into one point until the face count reaches the target. A collapse is refused when it would make
 * the surface non-manifold (the edge's ends must share exactly two neighbours) or flip a face.
 * Open-boundary vertices stay where they are.
 */
import type { MeshData } from "./types";

export interface IndexedMesh {
  /** xyz per vertex. */
  pos: number[];
  /** Vertex index triples, winding kept from the input. */
  tris: number[];
}

/** Merge vertices at the same position (to 1e-5 mm) and drop degenerate faces. */
export function weld(m: MeshData): IndexedMesh {
  const ids = new Map<string, number>();
  const pos: number[] = [];
  const nv = m.positions.length / 3;
  const map = new Int32Array(nv);
  for (let v = 0; v < nv; v++) {
    const x = m.positions[3 * v], y = m.positions[3 * v + 1], z = m.positions[3 * v + 2];
    const key = `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
    let id = ids.get(key);
    if (id === undefined) { id = pos.length / 3; ids.set(key, id); pos.push(x, y, z); }
    map[v] = id;
  }
  const tris: number[] = [];
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = map[m.indices[t]], b = map[m.indices[t + 1]], c = map[m.indices[t + 2]];
    if (a !== b && b !== c && a !== c) tris.push(a, b, c);
  }
  return { pos, tris };
}

class Heap {
  cost: number[] = [];
  a: number[] = [];
  b: number[] = [];
  stamp: number[] = [];
  size = 0;
  push(c: number, a: number, b: number, s: number) {
    let i = this.size++;
    this.cost[i] = c; this.a[i] = a; this.b[i] = b; this.stamp[i] = s;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cost[p] <= this.cost[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): [number, number, number] {
    const out: [number, number, number] = [this.a[0], this.b[0], this.stamp[0]];
    this.size--;
    if (this.size > 0) {
      this.cost[0] = this.cost[this.size]; this.a[0] = this.a[this.size]; this.b[0] = this.b[this.size]; this.stamp[0] = this.stamp[this.size];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.size && this.cost[l] < this.cost[m]) m = l;
        if (r < this.size && this.cost[r] < this.cost[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return out;
  }
  private swap(i: number, j: number) {
    [this.cost[i], this.cost[j]] = [this.cost[j], this.cost[i]];
    [this.a[i], this.a[j]] = [this.a[j], this.a[i]];
    [this.b[i], this.b[j]] = [this.b[j], this.b[i]];
    [this.stamp[i], this.stamp[j]] = [this.stamp[j], this.stamp[i]];
  }
}

/** The mesh with at most `target` faces (fewer only when no further collapse is allowed). */
export function decimate(input: IndexedMesh, target: number): IndexedMesh {
  const pos = input.pos.slice();
  const tris = input.tris.slice();
  const nV = pos.length / 3, nT = tris.length / 3;
  let alive = nT;
  if (alive <= target) return { pos, tris };
  const dead = new Uint8Array(nT);
  const vtris: number[][] = Array.from({ length: nV }, () => []);
  for (let t = 0; t < nT; t++) for (let k = 0; k < 3; k++) vtris[tris[3 * t + k]].push(t);

  // Boundary vertices (on an edge with one face) are pinned.
  const pinned = new Uint8Array(nV);
  const edgeCount = new Map<number, number>();
  const ek = (a: number, b: number) => (a < b ? a * nV + b : b * nV + a);
  for (let t = 0; t < nT; t++) for (let k = 0; k < 3; k++) {
    const key = ek(tris[3 * t + k], tris[3 * t + ((k + 1) % 3)]);
    edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
  }
  for (const [key, n] of edgeCount) if (n !== 2) { pinned[Math.floor(key / nV)] = 1; pinned[key % nV] = 1; }

  // Quadrics: 10 coefficients per vertex, from the planes of its faces weighted by area.
  const Q = new Float64Array(nV * 10);
  const P = (v: number): [number, number, number] => [pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]];
  for (let t = 0; t < nT; t++) {
    const [a, b, c] = [P(tris[3 * t]), P(tris[3 * t + 1]), P(tris[3 * t + 2])];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let nx = u[1] * w[2] - u[2] * w[1], ny = u[2] * w[0] - u[0] * w[2], nz = u[0] * w[1] - u[1] * w[0];
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-12) continue;
    const area = l / 2;
    nx /= l; ny /= l; nz /= l;
    const d = -(nx * a[0] + ny * a[1] + nz * a[2]);
    const q = [nx * nx, nx * ny, nx * nz, nx * d, ny * ny, ny * nz, ny * d, nz * nz, nz * d, d * d];
    for (let k = 0; k < 3; k++) { const v = tris[3 * t + k]; for (let i = 0; i < 10; i++) Q[v * 10 + i] += q[i] * area; }
  }
  const err = (q: Float64Array | number[], o: number, x: number, y: number, z: number) =>
    q[o] * x * x + 2 * q[o + 1] * x * y + 2 * q[o + 2] * x * z + 2 * q[o + 3] * x + q[o + 4] * y * y + 2 * q[o + 5] * y * z + 2 * q[o + 6] * y + q[o + 7] * z * z + 2 * q[o + 8] * z + q[o + 9];
  const sumQ = new Float64Array(10);
  /** Best target point for collapsing b into a, and its cost. */
  const plan = (a: number, b: number): { cost: number; x: [number, number, number] } | null => {
    if (pinned[a] && pinned[b]) return null;
    for (let i = 0; i < 10; i++) sumQ[i] = Q[a * 10 + i] + Q[b * 10 + i];
    const pa = P(a), pb = P(b);
    const cands: [number, number, number][] = pinned[a] ? [pa] : pinned[b] ? [pb] : [pa, pb, [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2]];
    let best = cands[0], bc = Infinity;
    for (const c of cands) { const e = err(sumQ, 0, c[0], c[1], c[2]); if (e < bc) { bc = e; best = c; } }
    // Ties go to shorter edges, so flat regions collapse evenly.
    const len = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
    return { cost: Math.max(0, bc) + len * 1e-9, x: best };
  };
  const stamp = new Int32Array(nV);
  const heap = new Heap();
  const neighbours = (v: number) => {
    const s = new Set<number>();
    for (const t of vtris[v]) if (!dead[t]) for (let k = 0; k < 3; k++) if (tris[3 * t + k] !== v) s.add(tris[3 * t + k]);
    return s;
  };
  const pushEdge = (a: number, b: number) => {
    const pl = plan(a, b);
    // Stamps only grow, so an unchanged sum means neither end moved since the push.
    if (pl) heap.push(pl.cost, a, b, stamp[a] + stamp[b]);
  };
  for (const key of edgeCount.keys()) pushEdge(Math.floor(key / nV), key % nV);

  const normalOf = (t: number, moved: number, x: [number, number, number]) => {
    const q = [0, 1, 2].map((k) => (tris[3 * t + k] === moved ? x : P(tris[3 * t + k])));
    const u = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]], w = [q[2][0] - q[0][0], q[2][1] - q[0][1], q[2][2] - q[0][2]];
    return [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  };
  const removed = new Uint8Array(nV);
  while (alive > target && heap.size) {
    const [a0, b0, s] = heap.pop();
    if (removed[a0] || removed[b0] || s !== stamp[a0] + stamp[b0]) continue;
    const pl = plan(a0, b0);
    if (!pl) continue;
    // Keep the pinned end.
    const [a, b] = pinned[b0] ? [b0, a0] : [a0, b0];
    const na = neighbours(a), nb = neighbours(b);
    if (!na.has(b)) continue;
    let shared = 0;
    for (const v of na) if (nb.has(v)) shared++;
    if (shared !== 2) continue;
    // No face may flip or collapse to a sliver.
    let bad = false;
    for (const v of [a, b]) {
      for (const t of vtris[v]) {
        if (dead[t]) continue;
        let hasA = false, hasB = false;
        for (let k = 0; k < 3; k++) { hasA ||= tris[3 * t + k] === a; hasB ||= tris[3 * t + k] === b; }
        if (hasA && hasB) continue;
        const n0 = normalOf(t, -1, pl.x), n1 = normalOf(t, v, pl.x);
        const l0 = Math.hypot(n0[0], n0[1], n0[2]), l1 = Math.hypot(n1[0], n1[1], n1[2]);
        if (l1 < 1e-9 * Math.max(1, l0) || (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2]) / (l0 * l1) < 0.2) { bad = true; break; }
      }
      if (bad) break;
    }
    if (bad) continue;
    for (const t of vtris[b]) {
      if (dead[t]) continue;
      let hasA = false;
      for (let k = 0; k < 3; k++) hasA ||= tris[3 * t + k] === a;
      if (hasA) { dead[t] = 1; alive--; continue; }
      for (let k = 0; k < 3; k++) if (tris[3 * t + k] === b) tris[3 * t + k] = a;
      vtris[a].push(t);
    }
    vtris[a] = vtris[a].filter((t) => !dead[t]);
    vtris[b] = [];
    removed[b] = 1;
    pos[3 * a] = pl.x[0]; pos[3 * a + 1] = pl.x[1]; pos[3 * a + 2] = pl.x[2];
    for (let i = 0; i < 10; i++) Q[a * 10 + i] += Q[b * 10 + i];
    stamp[a]++;
    for (const v of neighbours(a)) pushEdge(a, v);
  }
  // Compact.
  const remap = new Int32Array(nV).fill(-1);
  const outPos: number[] = [], outTris: number[] = [];
  for (let t = 0; t < nT; t++) {
    if (dead[t]) continue;
    for (let k = 0; k < 3; k++) {
      const v = tris[3 * t + k];
      if (remap[v] < 0) { remap[v] = outPos.length / 3; outPos.push(pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]); }
      outTris.push(remap[v]);
    }
  }
  return { pos: outPos, tris: outTris };
}
