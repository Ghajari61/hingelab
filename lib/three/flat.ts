/**
 * "Lay flat" 3D view shared by the products: every cut part as a T-thick slab where it lies on the
 * sheet, with the hinge cuts drawn on top. Sheet coordinates are y-down; the scene is y-up with
 * the sheet on the floor, its top edge away from the viewer.
 */
import * as THREE from "three";
import type { Point } from "@/lib/hinge";
import { flatArtwork } from './flatArtwork';

export interface Scene3D {
  group: THREE.Group;
  /** Size as shown, mm: x, y (height), z. */
  size: [number, number, number];
  dispose: () => void;
  /** Settles when textures that load later (pictures) are in place. */
  ready?: Promise<unknown>;
  /** Pulls the parts apart in place (0 = assembled, 1 = fully exploded), when the model can. */
  explode?: (e: number) => void;
  /** Folds a box in place (0 = the flat net, 1 = folded), when the model can. */
  fold?: (amount: number) => void;
}

export interface FlatPart {
  name: string;
  outer: Point[];
  holes: Point[][];
  /** A secondary stock can differ from the design's default material. */
  t?: number;
}

/**
 * A ring without the points that make the triangulator fold a triangle over (drawn as a dark sliver
 * or a stray line across the face): repeated points, the closing copy of the first point, and
 * spikes where the outline doubles back on itself.
 */
export function cleanRing(c: Point[], eps = 1e-4): Point[] {
  let r = c.slice();
  for (let pass = 0; pass < 8; pass++) {
    const out: Point[] = [];
    for (const q of r) { const l = out[out.length - 1]; if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) > eps) out.push(q); }
    while (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= eps) out.pop();
    const n = out.length, keep: Point[] = [];
    let changed = n !== r.length;
    for (let i = 0; i < n; i++) {
      const a = out[(i + n - 1) % n], q = out[i], b = out[(i + 1) % n];
      const ux = q[0] - a[0], uy = q[1] - a[1], vx = b[0] - q[0], vy = b[1] - q[1];
      const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
      // collinear with its neighbours: a spike (it goes back) or a point on a straight run
      if (n > 3 && Math.abs(ux * vy - uy * vx) <= 1e-9 * Math.max(1, lu * lv)) { changed = true; continue; }
      keep.push(q);
    }
    r = keep;
    if (!changed || r.length <= 3) break;
  }
  return r;
}

const toPath = (raw: Point[], path: THREE.Path) => {
  const c = cleanRing(raw);
  c.forEach((q, i) => (i ? path.lineTo(q[0], -q[1]) : path.moveTo(q[0], -q[1])));
  path.closePath();
  return path;
};

/**
 * The flat caps of an extrusion face up (top) and down (bottom). The triangulator can still fold a
 * triangle over where an outline nearly touches itself; turned the right way round it lies flat with
 * its neighbours instead of showing as a dark line.
 */
export function faceCapsOut(geo: THREE.BufferGeometry, z0: number, z1: number) {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute, nor = geo.getAttribute("normal") as THREE.BufferAttribute | undefined;
  const idx = geo.getIndex();
  const tri = (k: number) => (idx ? idx.getX(k) : k);
  const count = idx ? idx.count : pos.count;
  const e = 1e-5 * Math.max(1, Math.abs(z1 - z0));
  let fixed = 0;
  for (let k = 0; k + 2 < count; k += 3) {
    const i = tri(k), j = tri(k + 1), l = tri(k + 2);
    const za = pos.getZ(i), zb = pos.getZ(j), zc = pos.getZ(l);
    const top = Math.abs(za - z1) < e && Math.abs(zb - z1) < e && Math.abs(zc - z1) < e;
    const bottom = Math.abs(za - z0) < e && Math.abs(zb - z0) < e && Math.abs(zc - z0) < e;
    if (!top && !bottom) continue;
    const nz = (pos.getX(j) - pos.getX(i)) * (pos.getY(l) - pos.getY(i)) - (pos.getY(j) - pos.getY(i)) * (pos.getX(l) - pos.getX(i));
    if ((top && nz < 0) || (bottom && nz > 0)) {
      if (idx) { idx.setX(k + 1, l); idx.setX(k + 2, j); }
      else for (const a of [pos, nor]) if (a) { for (let c = 0; c < a.itemSize; c++) { const t = a.getComponent(j, c); a.setComponent(j, c, a.getComponent(l, c)); a.setComponent(l, c, t); } }
      fixed++;
    }
    if (nor) for (const v of [i, j, l]) nor.setXYZ(v, 0, 0, top ? 1 : -1);
  }
  if (fixed) { pos.needsUpdate = true; if (nor) nor.needsUpdate = true; if (idx) idx.needsUpdate = true; }
  return fixed;
}

/** An extruded slab from a y-down outline, z from z0 up t. */
export function slab(outer: Point[], holes: Point[][], z0: number, t: number, name: string) {
  return slabs([{ outer, holes }], z0, t, name);
}

/** One mesh of several extruded y-down regions (a word's letters), z from z0 up t. */
export function slabs(regions: { outer: Point[]; holes: Point[][] }[], z0: number, t: number, name: string) {
  const shapes = regions.map(({ outer, holes }) => {
    const shape = toPath(outer, new THREE.Shape()) as THREE.Shape;
    for (const h of holes) if (h.length > 2) shape.holes.push(toPath(h, new THREE.Path()));
    return shape;
  });
  const geo = new THREE.ExtrudeGeometry(shapes.length === 1 ? shapes[0] : shapes, { depth: t, bevelEnabled: false, curveSegments: 1 });
  faceCapsOut(geo, 0, t);
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
        if (!mat.userData.shared) mat.dispose();
      }
    }),
  };
}

/** Cut lines (SVG path data in sheet mm) painted on a transparent sheet just above the parts. */
export function cutOverlay(d: string[], width: number, height: number, z: number): THREE.Mesh | null {
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
  plane.userData.noMeasure = true;
  plane.userData.noPick = true;
  plane.renderOrder = 2;
  return plane;
}

/** Parts lying flat as cut, `T` thick, hinge cuts drawn on them. */
export function flatScene(parts: FlatPart[], T: number, cuts?: { d?: string[]; svg?: string; width: number; height: number }): Scene3D {
  const inner = new THREE.Group();
  for (const p of parts) if (p.outer.length > 2) inner.add(slab(p.outer, p.holes, 0, p.t ?? T, p.name));
  const ov = cuts?.d ? cutOverlay(cuts.d, cuts.width, cuts.height, T + 0.05) : null;
  if (ov) inner.add(ov);
  const art = cuts?.svg ? flatArtwork(cuts.svg, parts, T, cuts.width, cuts.height) : null;
  if (art) inner.add(art.group);
  return { ...finishScene(inner), ready: art?.ready };
}
