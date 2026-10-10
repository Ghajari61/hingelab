/**
 * Load, validate, repair and normalise a source mesh. Runs in the worker and in Node tests.
 */
import type { BufferGeometry, Object3D } from "three";
import { LIMITS } from "../defaults";
import type { MeshData, MeshFormat, ModelUnits, SourceSettings, Vec3, Warning } from "../types";

export const UNIT_SCALE: Record<Exclude<ModelUnits, "auto">, number> = { mm: 1, cm: 10, m: 1000, in: 25.4 };

export function formatOf(fileName: string): MeshFormat | null {
  const ext = fileName.toLowerCase().split(".").pop();
  return ext === "stl" || ext === "obj" || ext === "glb" || ext === "gltf" ? ext : null;
}

/** Append one geometry (positions only, world matrix applied) to the running arrays. */
function appendGeometry(g: BufferGeometry, pos: number[], idx: number[]) {
  const p = g.getAttribute("position");
  if (!p) return;
  const base = pos.length / 3;
  for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
  const index = g.getIndex();
  if (index) for (let i = 0; i < index.count; i++) idx.push(base + index.getX(i));
  else for (let i = 0; i < p.count; i++) idx.push(base + i);
}

function collect(root: Object3D): MeshData {
  const pos: number[] = [], idx: number[] = [];
  root.updateMatrixWorld(true);
  root.traverse(o => {
    const mesh = o as unknown as { isMesh?: boolean; geometry?: BufferGeometry; matrixWorld: import("three").Matrix4 };
    if (!mesh.isMesh || !mesh.geometry) return;
    const g = mesh.geometry.clone();
    g.applyMatrix4(mesh.matrixWorld);
    appendGeometry(g, pos, idx);
    g.dispose();
  });
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}

/** Parse a model file with the matching three loader; every mesh is merged into one indexed geometry. */
export async function parseMeshFile(data: ArrayBuffer, format: MeshFormat): Promise<MeshData> {
  if (format === "stl") {
    const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
    const g = new STLLoader().parse(data);
    const pos: number[] = [], idx: number[] = [];
    appendGeometry(g, pos, idx);
    return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
  }
  if (format === "obj") {
    const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
    return collect(new OBJLoader().parse(new TextDecoder().decode(data)));
  }
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const gltf = await new GLTFLoader().parseAsync(data, "");
  return collect(gltf.scene);
}

export function bounds(m: MeshData): { min: Vec3; max: Vec3 } {
  const p = m.positions;
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) {
    if (p[i + k] < min[k]) min[k] = p[i + k];
    if (p[i + k] > max[k]) max[k] = p[i + k];
  }
  return { min, max };
}

export const diagonal = (m: MeshData) => { const b = bounds(m); return Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]); };

/**
 * Merge vertices closer than `tol` (grid hashing with neighbour lookup) and drop triangles that
 * collapse or have (near) zero area.
 */
export function weld(m: MeshData, tol: number): MeshData {
  const p = m.positions, n = p.length / 3;
  const cell = Math.max(tol, 1e-9);
  const grid = new Map<string, number[]>();
  const remap = new Uint32Array(n);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
    const gx = Math.floor(x / cell), gy = Math.floor(y / cell), gz = Math.floor(z / cell);
    let found = -1;
    search: for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const list = grid.get(`${gx + dx},${gy + dy},${gz + dz}`);
      if (!list) continue;
      for (const j of list) {
        if (Math.abs(out[j * 3] - x) <= tol && Math.abs(out[j * 3 + 1] - y) <= tol && Math.abs(out[j * 3 + 2] - z) <= tol) { found = j; break search; }
      }
    }
    if (found < 0) {
      found = out.length / 3;
      out.push(x, y, z);
      const k = `${gx},${gy},${gz}`;
      const list = grid.get(k);
      if (list) list.push(found); else grid.set(k, [found]);
    }
    remap[i] = found;
  }
  const ix = m.indices, tris: number[] = [];
  const minArea2 = (tol * tol) ** 2;
  for (let i = 0; i < ix.length; i += 3) {
    const a = remap[ix[i]], b = remap[ix[i + 1]], c = remap[ix[i + 2]];
    if (a === b || b === c || a === c) continue;
    const ux = out[b * 3] - out[a * 3], uy = out[b * 3 + 1] - out[a * 3 + 1], uz = out[b * 3 + 2] - out[a * 3 + 2];
    const vx = out[c * 3] - out[a * 3], vy = out[c * 3 + 1] - out[a * 3 + 1], vz = out[c * 3 + 2] - out[a * 3 + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * cx + cy * cy + cz * cz <= minArea2) continue;
    tris.push(a, b, c);
  }
  return { positions: new Float32Array(out), indices: new Uint32Array(tris) };
}

/** Edges not shared by exactly two triangles with opposite directions (holes, flips, non-manifold fans). */
export function openEdgeCount(m: MeshData) {
  const ix = m.indices;
  const count = new Map<string, number>();
  for (let i = 0; i < ix.length; i += 3) for (let k = 0; k < 3; k++) {
    const a = ix[i + k], b = ix[i + ((k + 1) % 3)];
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    count.set(key, (count.get(key) ?? 0) + (a < b ? 1 : 1000));
  }
  let open = 0;
  for (const c of count.values()) if (c !== 1001) open++;
  return open;
}

/** Scale to mm from the declared units; 'auto' assumes mm when the diagonal is 5–5000. */
export function unitsScale(units: ModelUnits, diag: number): { scale: number; ask: boolean } {
  if (units !== "auto") return { scale: UNIT_SCALE[units], ask: false };
  return { scale: 1, ask: !(diag >= 5 && diag <= 5000) };
}

function rotationMatrix([rx, ry, rz]: Vec3): number[] {
  const [a, b, c] = [rx, ry, rz].map(d => (d * Math.PI) / 180);
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  // R = Rz · Ry · Rx (X applied first), row-major.
  return [
    cb * cc, sa * sb * cc - ca * sc, ca * sb * cc + sa * sc,
    cb * sc, sa * sb * sc + ca * cc, ca * sb * sc - sa * cc,
    -sb, sa * cb, ca * cb,
  ];
}

export interface NormaliseOptions {
  /** Declared units (meshes) or "mm" (library). */
  units: ModelUnits;
  upAxis: "Y" | "Z";
  /** "centre": centre on the origin. "wall": centre X and Y only and keep the authored back at z = 0. */
  anchor: "centre" | "wall";
}

/**
 * Units → up axis → centre → rotation → uniform scale and target size → position. Returns a new mesh.
 */
export function normalise(m: MeshData, settings: SourceSettings, o: NormaliseOptions): { mesh: MeshData; askUnits: boolean } {
  const p = new Float32Array(m.positions);
  const { scale, ask } = unitsScale(o.units, diagonal(m));
  for (let i = 0; i < p.length; i += 3) {
    let x = p[i] * scale, y = p[i + 1] * scale, z = p[i + 2] * scale;
    if (o.upAxis === "Z") [y, z] = [z, -y];
    p[i] = x; p[i + 1] = y; p[i + 2] = z;
  }
  const b0 = bounds({ positions: p, indices: m.indices });
  const c: Vec3 = [(b0.min[0] + b0.max[0]) / 2, (b0.min[1] + b0.max[1]) / 2, o.anchor === "wall" ? 0 : (b0.min[2] + b0.max[2]) / 2];
  const R = rotationMatrix(settings.transform.rotation);
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i] - c[0], y = p[i + 1] - c[1], z = p[i + 2] - c[2];
    p[i] = R[0] * x + R[1] * y + R[2] * z;
    p[i + 1] = R[3] * x + R[4] * y + R[5] * z;
    p[i + 2] = R[6] * x + R[7] * y + R[8] * z;
  }
  let s = settings.transform.uniformScale || 1;
  if (settings.targetSize && settings.targetSize.value > 0) {
    const b = bounds({ positions: p, indices: m.indices });
    const k = { width: 0, height: 1, depth: 2 }[settings.targetSize.axis];
    const ext = b.max[k] - b.min[k];
    if (ext > 1e-9) s = settings.targetSize.value / ext;
  }
  const [px, py, pz] = settings.transform.position;
  for (let i = 0; i < p.length; i += 3) {
    p[i] = p[i] * s + px; p[i + 1] = p[i + 1] * s + py; p[i + 2] = p[i + 2] * s + pz;
  }
  return { mesh: { positions: p, indices: m.indices }, askUnits: ask };
}

/** Simplify to the slice budget with meshoptimizer; returns the achieved error in mm. */
export async function simplifyToBudget(m: MeshData, budget: number = LIMITS.sliceTriangleBudget): Promise<{ mesh: MeshData; error: number } | null> {
  const tris = m.indices.length / 3;
  if (tris <= budget) return null;
  const { MeshoptSimplifier } = await import("meshoptimizer");
  await MeshoptSimplifier.ready;
  const [ix, err] = MeshoptSimplifier.simplify(m.indices, m.positions, 3, budget * 3, diagonal(m) * 0.05, ["ErrorAbsolute"]);
  const pos = new Float32Array(m.positions.length);
  const used = new Int32Array(m.positions.length / 3).fill(-1);
  const outIdx = new Uint32Array(ix.length);
  let next = 0;
  for (let i = 0; i < ix.length; i++) {
    const v = ix[i];
    if (used[v] < 0) { used[v] = next; pos.set(m.positions.subarray(v * 3, v * 3 + 3), next * 3); next++; }
    outIdx[i] = used[v];
  }
  return { mesh: { positions: pos.subarray(0, next * 3), indices: outIdx }, error: err };
}

export interface PreparedMesh {
  mesh: MeshData;
  openEdges: number;
  warnings: Warning[];
  askUnits: boolean;
}

/** Weld, validate, simplify and normalise. */
export async function prepareMesh(raw: MeshData, settings: SourceSettings, o: NormaliseOptions): Promise<PreparedMesh> {
  const warnings: Warning[] = [];
  if (raw.indices.length / 3 > LIMITS.maxInputTriangles) throw new Error(`This model has ${Math.round(raw.indices.length / 3).toLocaleString("en-US")} triangles; the limit is 2,000,000. Decimate it first.`);
  const welded = weld(raw, 1e-4 * Math.max(diagonal(raw), 1e-6));
  if (!welded.indices.length) throw new Error("The model has no usable triangles.");
  const n = normalise(welded, settings, o);
  let mesh = n.mesh;
  const simp = await simplifyToBudget(mesh);
  if (simp) {
    mesh = simp.mesh;
    warnings.push({ code: "SIMPLIFIED", message: `The model was simplified to ${(mesh.indices.length / 3).toLocaleString("en-US")} triangles (largest change ${simp.error.toFixed(2)} mm).` });
  }
  const openEdges = openEdgeCount(mesh);
  if (openEdges > 0) warnings.push({ code: "NON_MANIFOLD", message: `The mesh has ${openEdges} open edges; it was sliced with the fallback section method.` });
  return { mesh, openEdges, warnings, askUnits: n.askUnits };
}
