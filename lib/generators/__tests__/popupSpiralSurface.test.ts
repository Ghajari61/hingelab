import { expect, it } from "vitest";
import * as THREE from "three";
import { POPUP } from "../popup";
import { mergePopup } from "../popup/params";
import { generatorScene } from "../scene3d";
import { formHeight, spiralCrossingsAt } from "@/lib/radialProfile";
// meshes are y-up; the form is defined as drawn (y down)
const at = (surface: Parameters<typeof formHeight>[0], q: THREE.Vector3) => formHeight(surface, q.x, -q.y);
import { CTX } from "./ctx";

/**
 * How far the formed spiral's surface strays from the target form: the middle of every cap
 * triangle against the target height at its radius. Before the fix the blank's caps were bent only
 * at their triangles' corners, and long triangles across the strip sagged as flat chords.
 */
function worstChord(kind: "spiral" | "multi", profile: string, depth: number) {
  const p = mergePopup({ pattern: { kind, arms: 2 }, profile: { kind: profile, depth }, outline: { width: 220, height: 220 } });
  const out = POPUP.build(p, CTX);
  expect(out.error).toBeUndefined();
  const surface = out.parts[0].views3d![0].radialSurface!;
  const scene = generatorScene(out, p.T);
  let worst = 0, triangles = 0;
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  scene.group.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !/^Continuous .*spiral$/i.test(o.name) || o.userData.noMeasure) return;
    o.updateWorldMatrix(true, false);
    const g = o.geometry as THREE.BufferGeometry, pos = g.getAttribute("position"), idx = g.index;
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k);
      // caps only: the three corners at one offset above the target surface (top or bottom face)
      const off = v.map((q) => q.z - at(surface, q));
      if (Math.max(...off) - Math.min(...off) > 1e-3) continue;
      // zero-area slivers (three points on one line) are invisible and have no interior to sag
      if (new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0])).length() / 2 < 0.05) continue;
      triangles++;
      const c = v[0].clone().add(v[1]).add(v[2]).divideScalar(3);
      const d = Math.abs(c.z - at(surface, c) - off[0]);
      if (d > worst) { worst = d; (globalThis as any).__worst = [v.map((q) => [q.x, q.y, q.z].map((x) => +x.toFixed(2))), off]; }
    }
  });
  scene.dispose();
  return { worst, triangles, at: JSON.stringify((globalThis as any).__worst) };
}

it("a formed spiral follows its target form instead of sagging between far-apart corners", () => {
  for (const [kind, profile, depth] of [["spiral", "dome", 40], ["spiral", "linear", 200], ["multi", "bell", 120]] as const) {
    const r = worstChord(kind, profile, depth);
    expect(r.triangles, `${kind} ${profile}`).toBeGreaterThan(1000);
    expect(r.worst, `${kind} ${profile} ${depth} ${r.at}`).toBeLessThan(1);
  }
}, 240000);

it("the form follows the cut slots, also with fewer turns than arms", () => {
  for (const [arms, count] of [[4, 2], [4, 3], [3, 2], [2, 6], [1, 5]] as const) {
    const p = mergePopup({ pattern: arms > 1 ? { kind: "multi", arms } : { kind: "spiral" }, rings: { by: "count", count }, outline: { width: 220, height: 220 } });
    const out = POPUP.build(p, CTX);
    expect(out.error).toBeUndefined();
    const s = out.parts[0].views3d![0].radialSurface!.spiral!;
    // every point on a slot edge lies within half a cut gap of a slot crossing on its ray
    for (const hole of out.parts[0].holes) for (const [x, y] of hole.filter((_, i) => i % 7 === 0)) {
      const r = Math.hypot(x, y);
      if (r < s.start + 1 || r > s.end - 1) continue;
      const near = Math.min(...spiralCrossingsAt(s, Math.atan2(y, x)).map((c) => Math.abs(c - r)));
      expect(near, `${arms} arms, ${count} turns at ${x.toFixed(1)},${y.toFixed(1)}`).toBeLessThan(p.rings.gap);
    }
    // and the formed mesh stays light (the old mismatch split it into millions of triangles)
    const scene = generatorScene(out, p.T);
    let triangles = 0;
    scene.group.traverse((o) => { if (o instanceof THREE.Mesh) triangles += (o.geometry.index?.count ?? o.geometry.getAttribute("position").count) / 3; });
    scene.dispose();
    expect(triangles, `${arms} arms, ${count} turns`).toBeLessThan(150000);
  }
}, 120000);
