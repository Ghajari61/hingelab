/**
 * The 3D preview as a binary glTF 2.0 file (.glb): every visible mesh and line set of a three.js
 * scene, with its placement baked into its vertices, its colour as a plain material, and its name.
 *
 * glTF counts in metres, so millimetres are scaled by 0.001 unless told otherwise. Meshes keep
 * their normals (computed when missing) and indices; line sets (score and cut lines) become LINES
 * primitives. Pictures and text textures are not written: the file is the shape and the colours.
 */
import * as THREE from "three";

export interface GlbResult {
  data: Uint8Array;
  meshes: number;
  lines: number;
  triangles: number;
}

interface Prim { name: string; mode: 1 | 4; pos: Float32Array; nrm?: Float32Array; idx?: Uint32Array; mat: number }

const GLB_MAGIC = 0x46546c67, CHUNK_JSON = 0x4e4f534a, CHUNK_BIN = 0x004e4942;

function colourOf(m: THREE.Material | THREE.Material[] | undefined): [number, number, number, number] {
  const mat = (Array.isArray(m) ? m[0] : m) as (THREE.Material & { color?: THREE.Color; opacity?: number; transparent?: boolean }) | undefined;
  const c = mat?.color ?? new THREE.Color(0.75, 0.6, 0.42);
  const a = mat?.transparent ? Math.min(1, Math.max(0, mat.opacity ?? 1)) : 1;
  return [c.r, c.g, c.b, a];
}

/** The scene's visible meshes and lines as a .glb file. */
export function sceneToGLB(root: THREE.Object3D, scale = 0.001): GlbResult {
  root.updateMatrixWorld(true);
  const prims: Prim[] = [];
  const mats: { key: string; rgba: [number, number, number, number]; line: boolean }[] = [];
  const matOf = (rgba: [number, number, number, number], line: boolean) => {
    const key = `${rgba.map((v) => v.toFixed(4)).join(",")}|${line}`;
    let i = mats.findIndex((m) => m.key === key);
    if (i < 0) { i = mats.length; mats.push({ key, rgba, line }); }
    return i;
  };
  const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  root.traverseVisible((o) => {
    const isLine = (o as THREE.LineSegments).isLineSegments === true;
    const isMesh = (o as THREE.Mesh).isMesh === true;
    if (!isLine && !isMesh) return;
    const src = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    const p = src?.getAttribute("position");
    if (!src || !p || p.count === 0) return;
    let geo = src;
    if (isMesh && !src.getAttribute("normal")) { geo = src.clone(); geo.computeVertexNormals(); }
    const pa = geo.getAttribute("position"), na = isMesh ? geo.getAttribute("normal") : undefined;
    const pos = new Float32Array(pa.count * 3), nrm = na ? new Float32Array(pa.count * 3) : undefined;
    nm.getNormalMatrix(o.matrixWorld);
    for (let i = 0; i < pa.count; i++) {
      v.set(pa.getX(i), pa.getY(i), pa.getZ(i)).applyMatrix4(o.matrixWorld).multiplyScalar(scale);
      pos.set([v.x, v.y, v.z], i * 3);
      if (na && nrm) { n.set(na.getX(i), na.getY(i), na.getZ(i)).applyMatrix3(nm).normalize(); nrm.set([n.x || 0, n.y || 0, n.z || 0], i * 3); }
    }
    const index = geo.getIndex();
    const idx = index ? Uint32Array.from({ length: index.count }, (_, i) => index.getX(i)) : undefined;
    if (geo !== src) geo.dispose();
    prims.push({ name: o.name || (isLine ? "lines" : "part"), mode: isLine ? 1 : 4, pos, nrm, idx, mat: matOf(colourOf((o as THREE.Mesh).material), isLine) });
  });

  // one binary buffer, each array 4-byte aligned
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const bufferViews: Record<string, unknown>[] = [], accessors: Record<string, unknown>[] = [];
  const view = (arr: Float32Array | Uint32Array, target: number) => {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    chunks.push(bytes);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength, target });
    offset += bytes.byteLength;
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { chunks.push(new Uint8Array(pad)); offset += pad; }
    return bufferViews.length - 1;
  };
  const meshes: Record<string, unknown>[] = [], nodes: Record<string, unknown>[] = [];
  let triangles = 0, lineSets = 0, meshCount = 0;
  for (const pr of prims) {
    const count = pr.pos.length / 3;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count; i++) for (let k = 0; k < 3; k++) { const x = pr.pos[i * 3 + k]; if (x < min[k]) min[k] = x; if (x > max[k]) max[k] = x; }
    accessors.push({ bufferView: view(pr.pos, 34962), componentType: 5126, count, type: "VEC3", min, max });
    const attributes: Record<string, number> = { POSITION: accessors.length - 1 };
    if (pr.nrm) { accessors.push({ bufferView: view(pr.nrm, 34962), componentType: 5126, count, type: "VEC3" }); attributes.NORMAL = accessors.length - 1; }
    const prim: Record<string, unknown> = { attributes, mode: pr.mode, material: pr.mat };
    if (pr.idx) { accessors.push({ bufferView: view(pr.idx, 34963), componentType: 5125, count: pr.idx.length, type: "SCALAR" }); prim.indices = accessors.length - 1; }
    meshes.push({ name: pr.name, primitives: [prim] });
    nodes.push({ name: pr.name, mesh: meshes.length - 1 });
    if (pr.mode === 4) { meshCount++; triangles += (pr.idx ? pr.idx.length : count) / 3; } else lineSets++;
  }
  const json = {
    asset: { version: "2.0", generator: "HingeLab" },
    scene: 0,
    scenes: [{ name: root.name || "HingeLab model", nodes: nodes.map((_, i) => i) }],
    nodes, meshes, accessors, bufferViews,
    materials: mats.map((m, i) => ({
      name: m.line ? `lines ${i + 1}` : `material ${i + 1}`,
      pbrMetallicRoughness: { baseColorFactor: m.rgba, metallicFactor: 0, roughnessFactor: 0.85 },
      ...(m.rgba[3] < 1 ? { alphaMode: "BLEND" } : {}),
      doubleSided: true,
    })),
    ...(offset ? { buffers: [{ byteLength: offset }] } : {}),
  };
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jpad = (4 - (jsonBytes.length % 4)) % 4;
  if (jpad) { const j = new Uint8Array(jsonBytes.length + jpad); j.set(jsonBytes); j.fill(0x20, jsonBytes.length); jsonBytes = j; }
  const total = 12 + 8 + jsonBytes.length + (offset ? 8 + offset : 0);
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, GLB_MAGIC, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true); dv.setUint32(16, CHUNK_JSON, true); out.set(jsonBytes, 20);
  if (offset) {
    let at = 20 + jsonBytes.length;
    dv.setUint32(at, offset, true); dv.setUint32(at + 4, CHUNK_BIN, true); at += 8;
    for (const c of chunks) { out.set(c, at); at += c.byteLength; }
  }
  return { data: out, meshes: meshCount, lines: lineSets, triangles };
}

/** Reads a .glb's header and JSON chunk, checking the layout a loader relies on; throws on a fault. */
export function readGLB(data: Uint8Array): { json: Record<string, unknown>; bin: Uint8Array | null } {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.byteLength < 20 || dv.getUint32(0, true) !== GLB_MAGIC) throw new Error("not a GLB file");
  if (dv.getUint32(4, true) !== 2) throw new Error("not glTF 2.0");
  if (dv.getUint32(8, true) !== data.byteLength) throw new Error("length in the header is wrong");
  const jl = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== CHUNK_JSON || jl % 4) throw new Error("the JSON chunk is missing or unaligned");
  const json = JSON.parse(new TextDecoder().decode(data.subarray(20, 20 + jl))) as Record<string, unknown>;
  let bin: Uint8Array | null = null;
  const at = 20 + jl;
  if (at < data.byteLength) {
    const bl = dv.getUint32(at, true);
    if (dv.getUint32(at + 4, true) !== CHUNK_BIN || bl % 4) throw new Error("the binary chunk is missing or unaligned");
    bin = data.subarray(at + 8, at + 8 + bl);
  }
  return { json, bin };
}
