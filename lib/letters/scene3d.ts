/**
 * three.js model of the assembled letters: plates extruded from the cut shapes, walls as
 * T-thick bands along their centerlines with the hinge zones tinted. No renderer here, so it
 * builds in Node for tests. Letter coordinates are y-down; the scene is y-up with the text
 * lying on the floor, read from the front.
 */
import * as THREE from "three";
import { stackLayersOf, wallHeightOf } from "./defaults";
import { ZONE_COLORS } from "./export";
import type { Contour, LetterModel, LetterParams, Wall } from "./types";
import type { Layout } from "@/lib/hinge";
import type { LetterPart } from "./types";
import type { FlatPart } from "@/lib/three/flat";
import { unionShapes } from "./polygon";

export const WOOD = { base: "#c99a63", lid: "#ddb27c", lip: "#b88a55", wall: "#d5a76f", piece: "#e6c08e" } as const;

export interface LetterScene {
  group: THREE.Group;
  /** Size of the model as shown, mm: x, y (height), z. */
  size: [number, number, number];
  dispose: () => void;
  explode: (amount: number) => void;
}

export function letterFlatParts(lay: Layout<LetterPart>): FlatPart[] {
  return lay.items.flatMap(({ pt, ox, oy }) => {
    const outer = pt.kind === "solid" || pt.kind === "plate" ? pt.outer : pt.outline;
    const holes = pt.kind === "solid" ? pt.holes : pt.kind === "plate" ? [...pt.holes, ...pt.slots] : [];
    const move = (c: Contour) => c.map(([x, y]) => [x + ox, y + oy] as [number, number]);
    return unionShapes([outer, ...holes], [], true).map(s => ({ name: pt.name, outer: move(s.outer), holes: s.holes.map(move) }));
  });
}

const toPath = (c: Contour, path: THREE.Path) => {
  c.forEach((q, i) => (i ? path.lineTo(q[0], -q[1]) : path.moveTo(q[0], -q[1])));
  path.closePath();
  return path;
};

function slab(outer: Contour, holes: Contour[], z0: number, t: number, color: string, name: string) {
  const shape = toPath(outer, new THREE.Shape()) as THREE.Shape;
  for (const h of holes) shape.holes.push(toPath(h, new THREE.Path()));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, z0);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 }));
  mesh.name = name;
  return mesh;
}

/** Wall colour at arc length s: wood on flats, wood tinted by the bend verdict on curves. */
function wallColor(w: Wall, s: number, hinge: boolean) {
  const c = new THREE.Color(WOOD.wall);
  if (!hinge || w.style !== "hinge") return c;
  const z = w.zones.find(z => s >= z.s0 - 1e-6 && s <= z.s1 + 1e-6);
  if (!z || z.kind === "flat") return c;
  return c.lerp(new THREE.Color(ZONE_COLORS[z.verdict ?? "ok"]), 0.55);
}

/** A closed band of thickness t around the centerline, from z0 up h: inner and outer faces and top and bottom rims. */
function band(w: Wall, t: number, z0: number, h: number, hinge: boolean) {
  const c = w.centerline, n = c.length;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = c[(i - 1 + n) % n], b = c[(i + 1) % n];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l;
    const nx = -ty * t / 2, ny = tx * t / 2;
    if (i) s += Math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]);
    const k = wallColor(w, s, hinge);
    // 0: side A bottom, 1: side A top, 2: side B bottom, 3: side B top
    for (const [x, y, z] of [[c[i][0] + nx, c[i][1] + ny, z0], [c[i][0] + nx, c[i][1] + ny, z0 + h], [c[i][0] - nx, c[i][1] - ny, z0], [c[i][0] - nx, c[i][1] - ny, z0 + h]]) {
      pos.push(x, -y, z);
      col.push(k.r, k.g, k.b);
    }
  }
  const quad = (p: number, q: number, r: number, u: number) => idx.push(p, q, r, p, r, u);
  for (let i = 0; i < n; i++) {
    const a = 4 * i, b = 4 * ((i + 1) % n);
    quad(a, b, b + 1, a + 1);         // side A
    quad(a + 2, a + 3, b + 3, b + 2); // side B
    quad(a + 1, b + 1, b + 3, a + 3); // top rim
    quad(a, a + 2, b + 2, b);         // bottom rim
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }));
  mesh.name = `wall ${w.letter} ${w.contour}`;
  return mesh;
}

/** `explode` 0..1 lifts the lid (and the pieces glued on it) off the walls. */
export function buildLetterScene(model: LetterModel, p: LetterParams, explode = 0): LetterScene {
  const inner = new THREE.Group();
  const T = p.T;
  if (model.box) {
    const hBody = wallHeightOf(p);
    const hinge = model.box.style === "hinge";
    const lift = 0;
    const top = T + hBody;
    let pieceZ = 0;
    for (const pt of model.parts) {
      if (pt.kind !== "plate") continue;
      if (/· base( \d+)?$/u.test(pt.name)) inner.add(slab(pt.outer, pt.holes, 0, T, WOOD.base, pt.name));
      else if (/· lid lip( \d+)?$/u.test(pt.name)) inner.add(slab(pt.outer, pt.holes, top - T + lift, T, WOOD.lip, pt.name));
      else if (/· lid( \d+)?$/u.test(pt.name)) { inner.add(slab(pt.outer, pt.holes, top + lift, T, WOOD.lid, pt.name)); pieceZ = top + T + lift; }
    }
    for (const w of model.box.walls) inner.add(band(w, T, T, hBody, hinge));
    // flat small pieces sit on the lid, or on the base of an open box, as one stack each
    const layers = stackLayersOf(p);
    for (const pt of model.parts) {
      if (pt.kind !== "solid" || !pt.name.includes("· dot")) continue;
      if (layers > 1 && !pt.name.endsWith(` 1/${layers}`)) continue;
      inner.add(slab(pt.outer, pt.holes, pieceZ || T, T * layers, WOOD.piece, pt.name));
    }
  } else {
    for (const pt of model.parts) if (pt.kind === "solid") {
      inner.add(slab(pt.outer, pt.holes, 0, T, WOOD.piece, pt.name));
      if (pt.scoreOnly) {
        // Thin mesh strips survive the desktop scene serializer as well as the web renderer.
        const positions: number[] = [], halfWidth = 0.08;
        for (const c of pt.scoreOnly) for (let i = 0; i < c.length; i++) {
          const a = c[i], b = c[(i + 1) % c.length];
          const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
          if (len < 1e-8) continue;
          const nx = -dy / len * halfWidth, ny = dx / len * halfWidth;
          const q = [[a[0] + nx, -a[1] - ny], [b[0] + nx, -b[1] - ny], [b[0] - nx, -b[1] + ny], [a[0] - nx, -a[1] + ny]];
          for (const j of [0, 1, 2, 0, 2, 3]) positions.push(q[j][0], q[j][1], T + 0.015);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.computeVertexNormals();
        const marks = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: "#493322", roughness: 1, side: THREE.DoubleSide }));
        marks.name = "Scored letter outlines";
        marks.userData.keepMaterial = true;
        marks.userData.noMeasure = true;
        marks.userData.noPick = true;
        inner.add(marks);
      }
    }
  }

  // centre on the origin, then stand the text up: letter z becomes scene y
  const bb = new THREE.Box3().setFromObject(inner);
  const c = bb.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -c.y, -bb.min.z);
  const group = new THREE.Group();
  group.add(inner);
  group.rotation.x = -Math.PI / 2;
  group.updateMatrixWorld(true);

  const movable = inner.children.filter(o => /· lid(?: lip)?(?: \d+)?$/u.test(o.name) || (p.lid !== "open" && o.name.includes("· dot")));
  const move = (amount: number) => {
    const z = model.box ? Math.min(1, Math.max(0, amount)) * (wallHeightOf(p) * 0.8 + 20) : 0;
    for (const o of movable) o.position.z = z;
    group.updateMatrixWorld(true);
  };
  move(explode);
  const sz = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());

  return {
    group,
    size: [sz.x, sz.y, sz.z],
    explode: move,
    dispose: () => group.traverse(o => {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    }),
  };
}
