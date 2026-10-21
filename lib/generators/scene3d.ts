/**
 * Any generator's assembled design in 3D: every part as a slab where `place` puts it, upright parts
 * stood on edge, engraving as a thin dark skin. Explode lifts each layer away from the one below.
 */
import * as THREE from "three";
import { unionShapes } from "@/lib/letters/polygon";
import { finishScene, slab, slabs, type Scene3D } from "@/lib/three/flat";
import { ITEM_SEP, itemOf, itemSkinName } from "./items";
import type { Contour, GenImage, GenOutput, GenPart } from "./types";

const ENGRAVE = new THREE.MeshStandardMaterial({ color: "#3a2a1c", roughness: 0.9 });
ENGRAVE.userData.shared = true;
const SCORE_FILL = new THREE.MeshStandardMaterial({ color: "#3a2a1c", roughness: 0.9, transparent: true, opacity: 0.22, depthWrite: false });

/** Contours grouped by the item they were tagged as (undefined: not an item, a border). */
function byItem(cs: Contour[]): Map<string | undefined, Contour[]> {
  const out = new Map<string | undefined, Contour[]>();
  for (const c of cs) {
    const k = itemOf(c), group = out.get(k);
    if (group) group.push(c);
    else out.set(k, [c]);
  }
  return out;
}

/** An item's mesh: its own copy of `look` (so selecting it lights only it), kept in every look, left out of the dimensions. */
function itemMesh(mesh: THREE.Mesh, look: THREE.MeshStandardMaterial): THREE.Mesh {
  (mesh.material as THREE.Material).dispose();
  mesh.material = look.clone();
  mesh.userData.keepMaterial = true;
  mesh.userData.noMeasure = true;
  return mesh;
}

/** Scored outlines as lines at height z (y-down contours). */
function scoreLines(cs: Contour[], z: number, name: string): THREE.LineSegments {
  const pos: number[] = [];
  for (const c of cs) for (let i = 0; i + 1 < c.length; i++) pos.push(c[i][0], -c[i][1], z, c[i + 1][0], -c[i + 1][1], z);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: "#2a1d12", transparent: true, opacity: 0.9 }));
  lines.name = name;
  lines.userData.keepMaterial = true;
  lines.raycast = () => {};
  return lines;
}

/** A picture on a part's top face at height z: its clip outline (or its box) textured with it, shown once it has loaded. */
function pictureSkin(im: GenImage, z: number, name: string, loads: Promise<void>[]): THREE.Mesh | null {
  if (typeof Image === "undefined") return null;
  const c = im.clip ?? [[im.x, im.y], [im.x + im.w, im.y], [im.x + im.w, im.y + im.h], [im.x, im.y + im.h]];
  if (c.length < 3) return null;
  const geo = new THREE.ShapeGeometry(new THREE.Shape(c.map(([x, y]) => new THREE.Vector2(x, -y))), 1);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) - im.x) / im.w;
    uv.setXY(i, im.flip ? 1 - u : u, 1 - (-pos.getY(i) - im.y) / im.h);
  }
  geo.translate(0, 0, z);
  const tex = new THREE.Texture();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1 }));
  mesh.name = name;
  mesh.visible = false;
  mesh.userData.keepMaterial = true;
  mesh.userData.noMeasure = true;
  mesh.userData.noPick = true;
  loads.push(new Promise<void>((done) => {
    const img = new Image();
    img.onload = () => { tex.image = img; tex.needsUpdate = true; mesh.visible = true; done(); };
    img.onerror = () => done();
    img.src = im.href;
  }));
  return mesh;
}

export function generatorScene(out: GenOutput, T: number, explode = 0): Scene3D {
  const inner = new THREE.Group();
  const loads: Promise<void>[] = [];
  // A part that bends is drawn as its flat pieces, each where it sits.
  const parts: GenPart[] = out.parts.flatMap((p) => p.views3d?.length
    ? p.views3d.map((v, i) => ({ ...p, id: `${p.id}-${i}`, outer: v.outer, holes: v.holes, cuts: undefined, score: undefined, engrave: v.engrave, images: undefined, pieces: undefined, place: v.place, views3d: undefined }))
    : [p]);
  const levels = [...new Set(parts.map((p) => p.place?.z ?? 0))].sort((a, b) => a - b);
  parts.forEach((p) => {
    const pl = p.place ?? { x: 0, y: 0, z: 0 };
    const t = p.t ?? T;
    const z = pl.z + explode * 30 * levels.indexOf(pl.z);
    const wrap = new THREE.Group();
    wrap.name = p.name;
    if (pl.m) {
      // A folded face: the plan matrix, between the scene's axes (x, -y, z) and the part's (u, -v, h).
      const m = pl.m, lift = explode * 30 * levels.indexOf(pl.z);
      wrap.matrix.set(m[0], -m[1], m[2], m[3], -m[4], m[5], -m[6], -m[7], m[8], -m[9], m[10], m[11] + lift, 0, 0, 0, 1);
      wrap.matrixAutoUpdate = false;
    } else if (pl.upright) wrap.position.set(pl.x, -z, -pl.y);
    else wrap.position.set(pl.x, -pl.y, z);
    if (pl.yaw) wrap.rotation.z = -(pl.yaw * Math.PI) / 180;
    const stand = new THREE.Group();
    if (pl.upright) stand.rotation.x = ((pl.tilt ?? 90) * Math.PI) / 180;
    const spin = new THREE.Group();
    spin.rotation.z = -((pl.rot ?? 0) * Math.PI) / 180;
    const tint = p.tone ?? (/hand/i.test(p.name) ? 0.72 : levels.indexOf(pl.z) % 2 ? 1.06 : 0.94);
    if (p.pieces?.length) {
      // Pieces drift apart from the middle as the view explodes.
      let cx = 0, cy = 0, n = 0;
      for (const c of p.pieces) for (const [x, y] of c) { cx += x; cy += y; n++; }
      cx /= n || 1; cy /= n || 1;
      p.pieces.forEach((c, i) => {
        let px = 0, py = 0;
        for (const [x, y] of c) { px += x; py += y; }
        px /= c.length; py /= c.length;
        const k = explode * 0.12;
        const m = slab(c.map(([x, y]) => [x + (px - cx) * k, y + (py - cy) * k] as [number, number]), [], 0, t, `${p.name} piece ${i + 1}`);
        m.userData.tint = tint * (i % 2 ? 1.03 : 0.97);
        spin.add(m);
      });
    } else {
      // Holes can hold islands (QR cut-outs): each filled region is its own slab.
      const shapes = p.holes.length ? unionShapes([p.outer, ...p.holes], [], true) : [{ outer: p.outer, holes: [] }];
      shapes.forEach((s, i) => {
        const mesh = slab(s.outer, s.holes, 0, t, i ? `${p.name} piece ${i}` : p.name);
        mesh.userData.tint = tint;
        if (p.color) {
          // A contrasting material (gold mirror acrylic and the like) keeps its own colour in every look.
          (mesh.material as THREE.Material).dispose();
          mesh.material = p.matte
            ? new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.92, metalness: 0, side: THREE.DoubleSide })
            : new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.28, metalness: 0.55, side: THREE.DoubleSide });
          mesh.userData.keepMaterial = true;
        }
        spin.add(mesh);
      });
    }
    const marked = !(p.pieces?.length && explode > 0);
    const engrave = marked ? byItem(p.engrave ?? []) : new Map<string | undefined, Contour[]>();
    for (const s of engrave.has(undefined) ? unionShapes(engrave.get(undefined)!, [], true) : []) {
      const e = slab(s.outer, s.holes, t, 0.2, `${p.name} engraving`);
      (e.material as THREE.Material).dispose();
      e.material = ENGRAVE;
      e.userData.keepMaterial = true;
      e.userData.noMeasure = true;
      spin.add(e);
    }
    // Each text, motif or number is a part of its own, so it can be picked and sized on its own.
    for (const [item, cs] of engrave) if (item) {
      const shapes = unionShapes(cs, [], true);
      if (shapes.length) spin.add(itemMesh(slabs(shapes, t, 0.2, itemSkinName(p.name, item)), ENGRAVE));
    }
    // Scored items: their outlines, over a faint fill that picks them.
    if (marked) for (const [item, cs] of byItem(p.score ?? [])) if (item) {
      const shapes = unionShapes(cs, [], true);
      if (!shapes.length) continue;
      const fill = itemMesh(slabs(shapes, t, 0.05, itemSkinName(p.name, item)), SCORE_FILL);
      fill.add(scoreLines(cs, t + 0.06, `${fill.name} lines`));
      spin.add(fill);
    }
    if (marked) for (const im of p.images ?? []) {
      const item = itemOf(im);
      const m = pictureSkin(im, item ? t + 0.02 : t, item ? `${p.name}${ITEM_SEP}${item}` : `${p.name} picture`, loads);
      if (m && item) delete m.userData.noPick;
      if (m) spin.add(m);
    }
    stand.add(spin);
    wrap.add(stand);
    inner.add(wrap);
  });
  const scene = finishScene(inner);
  return loads.length ? { ...scene, ready: Promise.all(loads) } : scene;
}
