/**
 * "Lay flat" 3D view shared by the products: every cut part as a T-thick slab where it lies on the
 * sheet, with the hinge cuts drawn on top. Sheet coordinates are y-down; the scene is y-up with
 * the sheet on the floor, its top edge away from the viewer.
 */
import * as THREE from "three";
import type { Point } from "@/lib/hinge";

export interface Scene3D {
  group: THREE.Group;
  /** Size as shown, mm: x, y (height), z. */
  size: [number, number, number];
  dispose: () => void;
}

export interface FlatPart {
  name: string;
  outer: Point[];
  holes: Point[][];
}

const toPath = (c: Point[], path: THREE.Path) => {
  c.forEach((q, i) => (i ? path.lineTo(q[0], -q[1]) : path.moveTo(q[0], -q[1])));
  path.closePath();
  return path;
};

/** An extruded slab from a y-down outline, z from z0 up t. */
export function slab(outer: Point[], holes: Point[][], z0: number, t: number, name: string) {
  const shape = toPath(outer, new THREE.Shape()) as THREE.Shape;
  for (const h of holes) if (h.length > 2) shape.holes.push(toPath(h, new THREE.Path()));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, z0);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: "#d9b07a", roughness: 0.8 }));
  mesh.name = name;
  return mesh;
}

/** Finish a model built in the y-down plane with z up: centre it on the origin, stand it on y = 0. */
export function finishScene(inner: THREE.Group): Scene3D {
  const bb = new THREE.Box3().setFromObject(inner);
  const c = bb.isEmpty() ? new THREE.Vector3() : bb.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -c.y, bb.isEmpty() ? 0 : -bb.min.z);
  const group = new THREE.Group();
  group.add(inner);
  group.rotation.x = -Math.PI / 2;
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const sz = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());
  return {
    group,
    size: [sz.x, sz.y, sz.z],
    dispose: () => group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.geometry) return;
      m.geometry.dispose();
      for (const mat of ([] as THREE.Material[]).concat(m.material ?? [])) {
        const map = (mat as THREE.MeshBasicMaterial).map;
        if (map && !map.userData.shared) map.dispose();
        mat.dispose();
      }
    }),
  };
}

/** Cut lines (SVG path data in sheet mm) painted on a transparent sheet just above the parts. */
function cutOverlay(d: string[], width: number, height: number, z: number): THREE.Mesh | null {
  if (!d.length || typeof document === "undefined" || typeof Path2D === "undefined" || width <= 0 || height <= 0) return null;
  const k = Math.min(8, 4096 / width, 4096 / height);
  const c = document.createElement("canvas");
  c.width = Math.max(2, Math.round(width * k));
  c.height = Math.max(2, Math.round(height * k));
  const g = c.getContext("2d");
  if (!g) return null;
  g.scale(k, k);
  g.strokeStyle = "rgba(60, 35, 15, 0.9)";
  g.lineWidth = Math.max(0.35, 1.2 / k);
  g.lineCap = "round";
  for (const s of d) g.stroke(new Path2D(s));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  plane.position.set(width / 2, -height / 2, z);
  plane.name = "cuts";
  plane.userData.keepMaterial = true;
  plane.renderOrder = 2;
  return plane;
}

/** Parts lying flat as cut, `T` thick, hinge cuts drawn on them. */
export function flatScene(parts: FlatPart[], T: number, cuts?: { d: string[]; width: number; height: number }): Scene3D {
  const inner = new THREE.Group();
  for (const p of parts) if (p.outer.length > 2) inner.add(slab(p.outer, p.holes, 0, T, p.name));
  const ov = cuts ? cutOverlay(cuts.d, cuts.width, cuts.height, T + 0.05) : null;
  if (ov) inner.add(ov);
  return finishScene(inner);
}
