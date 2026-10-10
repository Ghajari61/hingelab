/**
 * three.js objects for the Parametric views: the source model, the slicing planes, and the parts
 * extruded to the sheet thickness at their assembly placement.
 */
import * as THREE from "three";
import type { MeshData, Part, Plane, SliceResult } from "@/lib/parametric";
import { placementOf } from "@/lib/parametric/slice/planes";

export const PART_COLOR = 0xc9a36a;

export function modelObject(m: MeshData): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8fa3b8, roughness: 0.8, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
  return new THREE.Mesh(g, mat);
}

/** Translucent rectangles for the planes, sized to the model bounds in the plane frame. */
export function planesObject(r: SliceResult): THREE.Group {
  const grp = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x4da6ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
  const edge = new THREE.LineBasicMaterial({ color: 0x4da6ff, transparent: true, opacity: 0.5 });
  const { min, max } = r.bounds;
  for (const pl of r.planes) {
    const [u0, u1] = range(pl.u, min, max);
    let [w0, w1] = range(pl.w, min, max);
    // Wall-mounted frames (W out of the wall) start at the wall.
    if (pl.w[2] > 0.5) w0 = Math.max(0, w0);
    w1 = Math.max(w0 + 1, w1);
    const g = new THREE.PlaneGeometry(u1 - u0, w1 - w0);
    g.translate((u0 + u1) / 2, (w0 + w1) / 2, 0);
    const mx = new THREE.Matrix4().fromArray(placementOf(pl));
    const mesh = new THREE.Mesh(g, mat);
    mesh.applyMatrix4(mx);
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(g), edge);
    line.applyMatrix4(mx);
    grp.add(mesh, line);
  }
  return grp;
}

function range(axis: Plane["u"], min: number[], max: number[]) {
  let lo = 0, hi = 0;
  for (let k = 0; k < 3; k++) {
    const a = axis[k] * min[k], b = axis[k] * max[k];
    lo += Math.min(a, b);
    hi += Math.max(a, b);
  }
  return [lo, hi];
}

export function partGeometry(part: Part, T: number): THREE.BufferGeometry {
  const s = new THREE.Shape(part.shape.outer.map(([x, y]) => new THREE.Vector2(x, y)));
  s.holes = part.shape.holes.map(h => new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -T / 2);
  return g;
}

/** Parts extruded to T at their placement; `explode` pushes them apart along their normals. */
export function partsObject(r: SliceResult, T: number, explode = 0): THREE.Group {
  const grp = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: PART_COLOR, roughness: 0.75 });
  const edge = new THREE.LineBasicMaterial({ color: 0x5a4220 });
  // Each family of parallel planes spreads about its own middle.
  const famKey = (pl: Plane) => pl.normal.join(",");
  const fam = new Map<string, number[]>();
  r.planes.forEach((pl, i) => fam.set(famKey(pl), [...(fam.get(famKey(pl)) ?? []), i]));
  for (const part of r.parts) {
    const g = partGeometry(part, T);
    const mx = new THREE.Matrix4().fromArray(part.placement);
    if (explode && part.plane >= 0) {
      const pl = r.planes[part.plane];
      const ids = fam.get(famKey(pl))!;
      const d = (ids.indexOf(part.plane) - (ids.length - 1) / 2) * explode;
      const n = pl.normal;
      mx.premultiply(new THREE.Matrix4().makeTranslation(n[0] * d, n[1] * d, n[2] * d));
    }
    const mesh = new THREE.Mesh(g, mat);
    mesh.applyMatrix4(mx);
    mesh.userData.partId = part.id;
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), edge);
    line.applyMatrix4(mx);
    grp.add(mesh, line);
  }
  return grp;
}

export function disposeTree(o: THREE.Object3D) {
  o.traverse(c => {
    const m = c as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else mat?.dispose();
  });
}
