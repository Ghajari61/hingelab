/**
 * The assembled 3D view for the desktop app: the same three.js scene the website draws, flattened
 * to plain data (extruded outlines, triangles, lines and their placements). The app only draws it;
 * nothing here is recomputed on the client. Built twice (closed and fully exploded) so every object
 * carries the offset it moves by when the view is exploded.
 */
import * as THREE from "three";
import type { Scene3D } from "@/lib/three/flat";
import type { D3Material, D3Model, D3Object } from "./types";

/** Above this many numbers (a few MB of JSON) the model is not sent. */
export const MAX_MODEL_NUMBERS = 600_000;

const r2 = (v: number) => Math.round(v * 100) / 100 || 0;
const r6 = (v: number) => Math.round(v * 1e6) / 1e6 || 0;

interface Item { o: THREE.Mesh; rel: THREE.Matrix4 }

/** Every mesh and line set, with its placement relative to the model's own frame. */
function items(s: Scene3D): Item[] {
  const inner = s.group.children[0];
  s.group.updateMatrixWorld(true);
  const inv = inner.matrixWorld.clone().invert();
  const out: Item[] = [];
  inner.traverse((o) => {
    if ((o as THREE.Mesh).isMesh || (o as THREE.LineSegments).isLineSegments) out.push({ o: o as THREE.Mesh, rel: inv.clone().multiply(o.matrixWorld) });
  });
  return out;
}

const firstPoint = (it: Item) => {
  const p = it.o.geometry.getAttribute("position");
  return new THREE.Vector3(p.getX(0), p.getY(0), p.getZ(0)).applyMatrix4(it.rel);
};

const flat = (pts: THREE.Vector2[]) => {
  const n = pts.length > 1 && pts[0].equals(pts[pts.length - 1]) ? pts.length - 1 : pts.length;
  const a: number[] = [];
  for (let i = 0; i < n; i++) a.push(r2(pts[i].x), r2(pts[i].y));
  return a;
};

const own = (mat: THREE.Material): D3Material => {
  const m = mat as THREE.MeshStandardMaterial;
  return { color: `#${m.color.getHexString()}`, roughness: r2(m.roughness), metalness: r2(m.metalness) };
};

function serialize(it: Item, ex: [number, number, number], fade: boolean): D3Object | null {
  const o = it.o, geo = o.geometry;
  const pos = geo.getAttribute("position");
  if (!pos?.count) return null;
  const base = { name: o.name, m: it.rel.elements.map(r6), ex };
  const tint = typeof o.userData.tint === "number" ? { tint: r6(o.userData.tint) } : {};
  if ((o as unknown as THREE.LineSegments).isLineSegments) {
    const mat = o.material as THREE.LineBasicMaterial;
    return { ...base, kind: "lines", pos: Array.from(pos.array, r2), color: `#${mat.color.getHexString()}`, opacity: r2(mat.opacity) };
  }
  if (geo instanceof THREE.ExtrudeGeometry) {
    const shape = ([] as THREE.Shape[]).concat(geo.parameters.shapes)[0];
    const pts = shape.extractPoints(1);
    geo.computeBoundingBox();
    return {
      ...base, kind: "slab", outer: flat(pts.shape), holes: pts.holes.map(flat), z: r2(geo.boundingBox!.min.z), depth: r2(geo.parameters.options.depth ?? 1),
      ...tint, ...(o.userData.keepMaterial ? { mat: own(o.material as THREE.Material) } : {}), ...(fade ? { fade: true } : {}),
    };
  }
  const index = geo.getIndex();
  if (!index) return null;
  const col = geo.getAttribute("color");
  return {
    ...base, kind: "mesh", pos: Array.from(pos.array, r2), index: Array.from(index.array),
    ...(col ? { col: Array.from(col.array, (v) => Math.round(v * 1000) / 1000) } : {}),
    ...tint, ...(typeof o.userData.vertexBase === "string" ? { vertexBase: o.userData.vertexBase } : {}),
  };
}

const sizeOf = (o: D3Object) =>
  o.kind === "slab" ? o.outer.length + o.holes.reduce((s, h) => s + h.length, 0)
  : o.kind === "mesh" ? o.pos.length + o.index.length + (o.col?.length ?? 0)
  : o.pos.length;

/** The scene at `explode` 0 and 1 as plain data, or null when it is too large to send. */
export function sceneModel(at: (explode: number) => Scene3D): D3Model | null {
  const closed = items(at(0)), open = items(at(1));
  const twins = new Map<string, Item[]>();
  for (const it of open) twins.set(it.o.name, [...(twins.get(it.o.name) ?? []), it]);
  const objects: D3Object[] = [];
  let numbers = 0;
  for (const it of closed) {
    const twin = twins.get(it.o.name)?.shift();
    const d = twin ? firstPoint(twin).sub(firstPoint(it)) : new THREE.Vector3();
    const obj = serialize(it, [r2(d.x), r2(d.y), r2(d.z)], !twin);
    if (!obj) continue;
    numbers += sizeOf(obj);
    if (numbers > MAX_MODEL_NUMBERS) return null;
    objects.push(obj);
  }
  return { objects };
}
