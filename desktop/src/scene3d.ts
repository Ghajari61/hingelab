/**
 * Draws the server's 3D model: outlines extruded, triangles and lines placed exactly as sent. No
 * design geometry is computed here; exploding only slides each object by the offset it came with.
 */
import * as THREE from "three";
import type { D3Model, D3Object } from "../../lib/desktop/types";
import { finishScene, type Scene3D } from "../../lib/three/flat";

export interface Model3D extends Scene3D {
  /** 0 = assembled, 1 = fully exploded. */
  explode: (e: number) => void;
  /** The solid parts (for picking and display modes). */
  meshes: THREE.Mesh[];
}

const pairs = (a: number[]) => {
  const out: THREE.Vector2[] = [];
  for (let i = 0; i + 1 < a.length; i += 2) out.push(new THREE.Vector2(a[i], a[i + 1]));
  return out;
};

function object(o: D3Object): THREE.Mesh | THREE.LineSegments | null {
  if (o.kind === "slab") {
    if (o.outer.length < 6) return null;
    const shape = new THREE.Shape(pairs(o.outer));
    for (const h of o.holes) if (h.length >= 6) shape.holes.push(new THREE.Path(pairs(h)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: o.depth, bevelEnabled: false, curveSegments: 1 });
    geo.translate(0, 0, o.z);
    const mat = o.mat
      ? new THREE.MeshStandardMaterial({ color: o.mat.color, roughness: o.mat.roughness, metalness: o.mat.metalness, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ color: "#d9b07a", roughness: 0.8 });
    const mesh = new THREE.Mesh(geo, mat);
    if (o.mat) mesh.userData.keepMaterial = true;
    if (o.tint != null) mesh.userData.tint = o.tint;
    return mesh;
  }
  if (o.kind === "mesh") {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(o.pos, 3));
    if (o.col) geo.setAttribute("color", new THREE.Float32BufferAttribute(o.col, 3));
    geo.setIndex(o.index);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: !!o.col, roughness: 0.8, side: THREE.DoubleSide }));
    if (o.tint != null) mesh.userData.tint = o.tint;
    if (o.vertexBase) mesh.userData.vertexBase = o.vertexBase;
    return mesh;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(o.pos, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: o.color, transparent: true, opacity: o.opacity }));
  lines.userData.keepMaterial = true;
  return lines;
}

export function buildModel(model: D3Model): Model3D {
  const inner = new THREE.Group();
  const placed: { obj: THREE.Object3D; base: THREE.Matrix4; ex: THREE.Vector3; fade: boolean }[] = [];
  const meshes: THREE.Mesh[] = [];
  for (const o of model.objects) {
    const obj = object(o);
    if (!obj) continue;
    obj.name = o.name;
    obj.matrixAutoUpdate = false;
    const base = new THREE.Matrix4().fromArray(o.m);
    obj.matrix.copy(base);
    inner.add(obj);
    placed.push({ obj, base, ex: new THREE.Vector3(...o.ex), fade: o.kind === "slab" && !!o.fade });
    if ((obj as THREE.Mesh).isMesh) meshes.push(obj as THREE.Mesh);
  }
  const scene = finishScene(inner);
  const shift = new THREE.Matrix4();
  const explode = (e: number) => {
    for (const p of placed) {
      p.obj.matrix.copy(p.base).premultiply(shift.makeTranslation(p.ex.x * e, p.ex.y * e, p.ex.z * e));
      p.obj.matrixWorldNeedsUpdate = true;
      p.obj.visible = !(p.fade && e > 0.001);
    }
  };
  return { ...scene, explode, meshes };
}
