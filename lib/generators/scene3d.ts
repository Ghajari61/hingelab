/**
 * Any generator's assembled design in 3D: every part as a slab where `place` puts it, upright parts
 * stood on edge, engraving as a thin dark skin. Explode lifts each layer away from the one below.
 */
import * as THREE from "three";
import { unionShapes } from "@/lib/letters/polygon";
import { finishScene, slab, type Scene3D } from "@/lib/three/flat";
import type { GenOutput } from "./types";

const ENGRAVE = new THREE.MeshStandardMaterial({ color: "#3a2a1c", roughness: 0.9 });
ENGRAVE.userData.shared = true;

export function generatorScene(out: GenOutput, T: number, explode = 0): Scene3D {
  const inner = new THREE.Group();
  const levels = [...new Set(out.parts.map((p) => p.place?.z ?? 0))].sort((a, b) => a - b);
  out.parts.forEach((p) => {
    const pl = p.place ?? { x: 0, y: 0, z: 0 };
    const t = p.t ?? T;
    const z = pl.z + explode * 30 * levels.indexOf(pl.z);
    const wrap = new THREE.Group();
    wrap.name = p.name;
    if (pl.upright) wrap.position.set(pl.x, -z, -pl.y);
    else wrap.position.set(pl.x, -pl.y, z);
    const stand = new THREE.Group();
    if (pl.upright) stand.rotation.x = Math.PI / 2;
    const spin = new THREE.Group();
    spin.rotation.z = -((pl.rot ?? 0) * Math.PI) / 180;
    const tint = /hand/i.test(p.name) ? 0.72 : levels.indexOf(pl.z) % 2 ? 1.06 : 0.94;
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
      const mesh = slab(p.outer, p.holes, 0, t, p.name);
      mesh.userData.tint = tint;
      spin.add(mesh);
    }
    for (const s of p.engrave?.length && !(p.pieces?.length && explode > 0) ? unionShapes(p.engrave, [], true) : []) {
      const e = slab(s.outer, s.holes, t, 0.2, `${p.name} engraving`);
      (e.material as THREE.Material).dispose();
      e.material = ENGRAVE;
      e.userData.keepMaterial = true;
      spin.add(e);
    }
    stand.add(spin);
    wrap.add(stand);
    inner.add(wrap);
  });
  return finishScene(inner);
}
