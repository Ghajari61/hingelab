/**
 * Plane cross-sections. The primary path slices a manifold-3d solid; the fallback intersects
 * every triangle with the plane and stitches the segments into loops (for meshes with holes).
 */
import type { ManifoldToplevel, Manifold as ManifoldT } from "manifold-3d";
import type { Contour, MeshData, Vec3 } from "../types";
import { toFrameMatrix } from "./planes";

export interface SectionSource {
  engine: "manifold" | "fallback";
  /** Loops in the plane frame (u, w) for each offset. */
  slice(offsets: number[]): { loops: Contour[]; openChains: number }[];
  dispose(): void;
}

/** Transform positions into the frame [U; W; N]. */
function toFrame(m: MeshData, u: Vec3, w: Vec3, n: Vec3): Float32Array {
  const p = m.positions, out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    out[i] = u[0] * x + u[1] * y + u[2] * z;
    out[i + 1] = w[0] * x + w[1] * y + w[2] * z;
    out[i + 2] = n[0] * x + n[1] * y + n[2] * z;
  }
  return out;
}

/** Build a manifold solid; null when the mesh is not a closed 2-manifold. */
export function tryManifold(wasm: ManifoldToplevel, m: MeshData): ManifoldT | null {
  try {
    const mesh = new wasm.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices });
    mesh.merge();
    const solid = new wasm.Manifold(mesh);
    if (solid.status() !== "NoError" || solid.isEmpty()) { solid.delete(); return null; }
    return solid;
  } catch {
    return null;
  }
}

export function manifoldSections(wasm: ManifoldToplevel, solid: ManifoldT, u: Vec3, w: Vec3, n: Vec3): SectionSource {
  const framed = solid.transform(toFrameMatrix(u, w, n) as Parameters<ManifoldT["transform"]>[0]);
  return {
    engine: "manifold",
    slice: offsets => offsets.map(h => {
      const cs = framed.slice(h);
      const loops = cs.toPolygons().map(poly => poly.map(([x, y]) => [x, y] as [number, number]));
      cs.delete();
      return { loops, openChains: 0 };
    }),
    dispose: () => framed.delete(),
  };
}

/** Quantum for joining segment endpoints, mm. */
const Q = 1e-4;
/** Open chains shorter than this are noise and dropped, mm. */
const MIN_CHAIN = 1;

export function fallbackSections(m: MeshData, u: Vec3, w: Vec3, n: Vec3): SectionSource {
  const p = toFrame(m, u, w, n), ix = m.indices;
  return {
    engine: "fallback",
    slice: offsets => offsets.map(h => sliceTriangles(p, ix, h)),
    dispose: () => {},
  };
}

/** Intersect triangles with z = h (in the frame) and stitch the segments into loops. */
export function sliceTriangles(p: Float32Array, ix: Uint32Array, h: number): { loops: Contour[]; openChains: number } {
  const segs: [number, number, number, number][] = [];
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    const za = p[a + 2] - h, zb = p[b + 2] - h, zc = p[c + 2] - h;
    // Vertices exactly on the plane count as above, so every crossing edge is cut once.
    const sa = za >= 0, sb = zb >= 0, sc = zc >= 0;
    if (sa === sb && sb === sc) continue;
    const cut = (i: number, j: number, zi: number, zj: number): [number, number] => {
      const k = zi / (zi - zj);
      return [p[i] + (p[j] - p[i]) * k, p[i + 1] + (p[j + 1] - p[i + 1]) * k];
    };
    // Orient each segment so the solid lies on its left (outer loops come out counter-clockwise).
    let q0: [number, number], q1: [number, number];
    if (sa === sb) { q0 = cut(b, c, zb, zc); q1 = cut(c, a, zc, za); if (sc) [q0, q1] = [q1, q0]; }
    else if (sb === sc) { q0 = cut(c, a, zc, za); q1 = cut(a, b, za, zb); if (sa) [q0, q1] = [q1, q0]; }
    else { q0 = cut(a, b, za, zb); q1 = cut(b, c, zb, zc); if (sb) [q0, q1] = [q1, q0]; }
    segs.push([q0[0], q0[1], q1[0], q1[1]]);
  }
  const key = (x: number, y: number) => `${Math.round(x / Q)},${Math.round(y / Q)}`;
  const from = new Map<string, number[]>();
  segs.forEach((s, i) => { const k = key(s[0], s[1]); const l = from.get(k); if (l) l.push(i); else from.set(k, [i]); });
  const used = new Uint8Array(segs.length);
  const loops: Contour[] = [];
  let openChains = 0;
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const start = key(segs[i][0], segs[i][1]);
    const chain: Contour = [[segs[i][0], segs[i][1]]];
    let cur = i, closed = false;
    for (;;) {
      const s = segs[cur];
      const k = key(s[2], s[3]);
      if (k === start) { closed = true; break; }
      chain.push([s[2], s[3]]);
      const next = (from.get(k) ?? []).find(j => !used[j]);
      if (next === undefined) break;
      used[next] = 1;
      cur = next;
    }
    if (closed) { if (chain.length >= 3) loops.push(chain); continue; }
    let len = 0;
    for (let j = 1; j < chain.length; j++) len += Math.hypot(chain[j][0] - chain[j - 1][0], chain[j][1] - chain[j - 1][1]);
    if (len < MIN_CHAIN) continue;
    openChains++;
    if (chain.length >= 3) loops.push(chain);
  }
  return { loops, openChains };
}
