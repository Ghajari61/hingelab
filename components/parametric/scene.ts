/**
 * three.js objects for the Parametric views: the source model, the slicing planes, and the parts
 * extruded to the sheet thickness at their assembly placement.
 */
import * as THREE from "three";
import type { MeshData, Part, Plane, SliceResult } from "@/lib/parametric";
import { placementOf } from "@/lib/parametric/slice/planes";
import { toSheet } from "@/lib/parametric/nest";
import { unionShapes } from "@/lib/letters/polygon";
import { flatScene, type FlatPart } from "@/lib/three/flat";

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
  r.planes.forEach((pl, i) => {
    let [u0, u1] = range(pl.u, min, max);
    let [w0, w1] = range(pl.w, min, max);
    // Radial and along-a-curve planes only show the half where their fins are.
    const own = r.parts.filter(q => q.plane === i && fanned(r, q));
    if (own.length) {
      u0 = Math.min(...own.map(q => q.shape.bbox.x0)) - 2; u1 = Math.max(...own.map(q => q.shape.bbox.x1)) + 2;
      w0 = Math.min(...own.map(q => q.shape.bbox.y0)) - 2; w1 = Math.max(...own.map(q => q.shape.bbox.y1)) + 2;
    }
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
  });
  return grp;
}

/** Fins that fan round an axis or a curve, one per plane. */
const fanned = (r: SliceResult, q: Part) => (r.method === "radial" || r.method === "curveNormal") && (q.kind === "radial-fin" || q.kind === "fin");

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

/** Part colour and edge colour for each 3D-view look. */
export const FINISH_COLORS: Record<"wood" | "dark" | "white", [number, number]> = {
  wood: [PART_COLOR, 0x5a4220],
  dark: [0x2b2a2c, 0x7a7670],
  white: [0xefebe4, 0x9c968c],
};

/** The same transformed cut contours and sheet offsets as the SVG/canvas, including all sheets. */
export function flatPartsObject(r: SliceResult, T: number, offsets: { x: number; y: number }[]): THREE.Group {
  const byId = new Map(r.parts.map(p => [p.id, p]));
  const parts: FlatPart[] = [];
  r.sheets.forEach((sheet, i) => {
    const offset = offsets[i];
    if (!offset) throw new Error('Missing sheet position for Lay Flat');
    for (const item of sheet.items) {
      const part = byId.get(item.partId);
      if (!part) continue;
      const contours = part.cut ? [...part.cut.outline, ...part.cut.inner] : [part.shape.outer, ...part.shape.holes, ...part.innerCuts];
      const move = (c: [number, number][]) => c.map(q => {
        const [x, y] = toSheet(q, item);
        return [x + offset.x, y + offset.y] as [number, number];
      });
      for (const s of unionShapes(contours, [], true)) parts.push({ name: part.id, outer: move(s.outer), holes: s.holes.map(move) });
    }
  });
  const group = flatScene(parts, T).group;
  group.traverse(o => { if (o instanceof THREE.Mesh) o.userData.partId = o.name; });
  return group;
}

export type MovingParts = THREE.Group & { explode: (amount: number) => void };

/** Parts extruded to T at their placement; `explode` pushes them apart along their normals. */
export function partsObject(r: SliceResult, T: number, explode = 0, finish: keyof typeof FINISH_COLORS = "wood", includeEdges = true): MovingParts {
  const grp = new THREE.Group() as MovingParts;
  const moves: { mesh: THREE.Object3D; line?: THREE.Object3D; base: THREE.Vector3; delta: THREE.Vector3 }[] = [];
  const [face, edgeColor] = FINISH_COLORS[finish] ?? FINISH_COLORS.wood;
  const mat = new THREE.MeshStandardMaterial({ color: face, roughness: finish === "dark" ? 0.55 : 0.75 });
  const edge = includeEdges ? new THREE.LineBasicMaterial({ color: edgeColor }) : undefined;
  // Each family of parallel planes spreads about its own middle.
  const famKey = (pl: Plane) => pl.normal.join(",");
  const fam = new Map<string, number[]>();
  r.planes.forEach((pl, i) => fam.set(famKey(pl), [...(fam.get(famKey(pl)) ?? []), i]));
  const card = new THREE.MeshStandardMaterial({ color: face, roughness: 0.85, side: THREE.DoubleSide, flatShading: true });
  for (const part of r.parts) {
    if (part.faces3d) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(part.faces3d), 3));
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, card);
      // Nets move apart along their average normal.
      const delta = new THREE.Vector3();
      {
        const n = new THREE.Vector3();
        const nm = g.getAttribute("normal");
        for (let i = 0; i < nm.count; i++) n.add(new THREE.Vector3(nm.getX(i), nm.getY(i), nm.getZ(i)));
        if (n.lengthSq() > 0) delta.copy(n.normalize());
      }
      mesh.userData.partId = part.id;
      const line = edge ? new THREE.LineSegments(new THREE.EdgesGeometry(g, 1), edge) : undefined;
      line?.position.copy(mesh.position);
      moves.push({ mesh, line, base: mesh.position.clone(), delta });
      grp.add(mesh);
      if (line) grp.add(line);
      continue;
    }
    const g = partGeometry(part, T);
    const mx = new THREE.Matrix4().fromArray(part.placement);
    const delta = new THREE.Vector3();
    if (part.plane >= 0) {
      const pl = r.planes[part.plane];
      // Radial and along-a-curve fins move outward along their own length instead.
      if (fanned(r, part)) {
        delta.set(...pl.u);
      } else {
        const ids = fam.get(famKey(pl))!;
        const d = ids.indexOf(part.plane) - (ids.length - 1) / 2;
        const n = pl.normal;
        delta.set(n[0] * d, n[1] * d, n[2] * d);
      }
    }
    const mesh = new THREE.Mesh(g, mat);
    mesh.applyMatrix4(mx);
    mesh.userData.partId = part.id;
    const line = edge ? new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), edge) : undefined;
    line?.applyMatrix4(mx);
    moves.push({ mesh, line, base: mesh.position.clone(), delta });
    grp.add(mesh);
    if (line) grp.add(line);
  }
  grp.explode = amount => {
    for (const { mesh, line, base, delta } of moves) {
      mesh.position.copy(base).addScaledVector(delta, amount);
      line?.position.copy(mesh.position);
    }
    grp.updateMatrixWorld(true);
  };
  grp.explode(explode);
  return grp;
}

const HEAT_STOPS = [new THREE.Color(0x2f6bff), new THREE.Color(0x2fd0c0), new THREE.Color(0xf5d33a), new THREE.Color(0xff3b2f)];

/** Blue (on a part) to red (a full spacing away); matches the `.pe-legend-bar` gradient. */
export function heatColor(t: number, out = new THREE.Color()): THREE.Color {
  const x = Math.min(1, Math.max(0, t)) * (HEAT_STOPS.length - 1);
  const i = Math.min(HEAT_STOPS.length - 2, Math.floor(x));
  return out.copy(HEAT_STOPS[i]).lerp(HEAT_STOPS[i + 1], x - i);
}

/** The deviation samples as coloured points, drawn over the model and parts. */
export function deviationObject(r: SliceResult): THREE.Points | undefined {
  const d = r.deviation;
  if (!d) return undefined;
  const n = d.values.length;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) heatColor(d.values[i] / d.spacing, c).toArray(col, i * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(d.points), 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 4, sizeAttenuation: false, vertexColors: true }));
  pts.renderOrder = 10;
  return pts;
}

export function disposeTree(o: THREE.Object3D) {
  o.traverse(c => {
    const m = c as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    const base = m.userData.base as THREE.Material | undefined;
    for (const material of new Set([...(Array.isArray(mat) ? mat : mat ? [mat] : []), ...(base ? [base] : [])])) {
      if (!material.userData.shared) material.dispose();
    }
  });
}
