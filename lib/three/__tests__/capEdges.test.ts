/**
 * The 3D view drew stray lines across flat faces (a puzzle piece, a QR plate): the triangulator left
 * slivers folded over, and edge lines were computed from those slivers' wobbly corners. Every part's
 * top and bottom must face out, and the edge overlay must draw nothing inside a flat face.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ALL_GENERATORS } from "@/lib/generators/all";
import { CTX } from "@/lib/generators/__tests__/ctx";
import { generatorScene } from "@/lib/generators/scene3d";
import { featureEdges } from "../edges";
import { cleanRing, slab } from "../flat";

const key = (x: number, y: number, z: number) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;

/** Edges drawn inside a flat face, and cap triangles facing in, for one mesh. */
function faults(mesh: THREE.Mesh) {
  const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const a = geo.attributes.position.array as ArrayLike<number>;
  const flatSides = new Map<string, number[]>();
  let zmin = Infinity, zmax = -Infinity;
  for (let i = 2; i < a.length; i += 3) { zmin = Math.min(zmin, a[i]); zmax = Math.max(zmax, a[i]); }
  let facingIn = 0;
  for (let i = 0; i < a.length; i += 9) {
    const A = new THREE.Vector3(a[i], a[i + 1], a[i + 2]), B = new THREE.Vector3(a[i + 3], a[i + 4], a[i + 5]), C = new THREE.Vector3(a[i + 6], a[i + 7], a[i + 8]);
    const n = B.clone().sub(A).cross(C.clone().sub(A));
    const flat = A.z === B.z && B.z === C.z;
    if (flat && n.lengthSq() > 1e-10 && ((A.z === zmax && n.z < 0) || (A.z === zmin && n.z > 0))) facingIn++;
    const ks = [A, B, C].map((v) => key(v.x, v.y, v.z));
    for (const [s, t] of [[0, 1], [1, 2], [2, 0]]) { const e = [ks[s], ks[t]].sort().join("|"); (flatSides.get(e) ?? flatSides.set(e, []).get(e)!).push(flat ? 1 : 0); }
  }
  const E = featureEdges(mesh.geometry, 28).attributes.position.array as ArrayLike<number>;
  let inside = 0;
  for (let i = 0; i < E.length; i += 6) {
    const e = [key(E[i], E[i + 1], E[i + 2]), key(E[i + 3], E[i + 4], E[i + 5])].sort().join("|");
    const f = flatSides.get(e) ?? [];
    if (f.length === 2 && f[0] === 1 && f[1] === 1) inside++;
  }
  return { inside, facingIn };
}

describe("3D caps and edge lines", () => {
  it("cleanRing drops repeats, the closing copy and spikes", () => {
    const r = cleanRing([[0, 0], [10, 0], [10, 0], [20, 0], [15, 0], [20, 0], [20, 10], [0, 10], [0, 0]]);
    expect(r.map((q) => q.join(",")).sort()).toEqual(["0,0", "0,10", "20,0", "20,10"]);
  });

  it("a part outline that nearly touches itself still lies flat", () => {
    // a neck 0.02 mm wide, as a puzzle knob leaves after the seam offset
    const ring: [number, number][] = [[0, 0], [40, 0], [40, 20], [20.01, 20], [20.01, 40], [30, 40], [30, 60], [10, 60], [10, 40], [19.99, 40], [19.99, 20], [0, 20]];
    const f = faults(slab(ring, [], 0, 3, "neck"));
    expect(f).toEqual({ inside: 0, facingIn: 0 });
  });

  const CASES: [string, string[]][] = [
    ["puzzle", ["heart-24", "round-36", "photo-100", "studio-logic-puzzle", "numbered-48"]],
    ["qr", ["business-card", "studio-guest-wifi", "wifi-card"]],
    ["shadowbox", ["flower-eight", "sunflower", "fish-scales"]],
    ["popup", ["precision-orbit-bowl", "pagoda-tower-decor"]],
    ["boxes", ["lattice-box", "card-us"]],
    ["clock", ["station"]],
  ];
  for (const [id, presets] of CASES) it(`${id}: no folded caps or stray edge lines`, () => {
    const def = ALL_GENERATORS.find((g) => g.id === id)!;
    for (const pid of presets) {
      const pr = def.presets.find((q) => q.id === pid);
      if (!pr) continue;
      const p = def.merge(pr.params);
      const scene = generatorScene(def.build(p, CTX), p.T);
      let inside = 0, facingIn = 0;
      scene.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) { const f = faults(o as THREE.Mesh); inside += f.inside; facingIn += f.facingIn; } });
      expect({ pid, inside, facingIn }).toEqual({ pid, inside: 0, facingIn: 0 });
    }
  }, 300_000);
});
