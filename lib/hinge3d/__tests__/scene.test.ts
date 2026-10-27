import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { computeModel, layerContent, layoutParts, mergeParams, type Model, type Params } from "@/lib/hinge";
import { buildHingeScene, hingeFlatScene } from "../scene";
import { applyLook, lookOf } from "@/lib/three/looks";
import { HINGE_PRESETS, hingePresetParams } from "@/lib/hinge/presets";
import { arrangeHinge } from "@/lib/fit/hinge";
import { assertFlatSurface } from "@/lib/three/__tests__/previewAssertions";

const build = (x: Partial<Params>) => {
  const p = mergeParams(x);
  const m = computeModel(p);
  if ("error" in m) throw new Error(m.error);
  return { p, m: m as Model };
};
const meshes = (g: THREE.Object3D) => {
  const out: THREE.Mesh[] = [];
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); });
  return out;
};

describe("Hinge Box 3D scene", () => {
  it("every preset has non-overlapping flat solids and triangulated openings", () => {
    for (const pr of HINGE_PRESETS) {
      const p = hingePresetParams(pr.params), a = arrangeHinge(p);
      expect(a.lay, pr.id).not.toBeNull();
      const scene = hingeFlatScene(a.lay!, null, a.params);
      try { assertFlatSurface(scene.group); } finally { scene.dispose(); }
    }
  }, 120000);
  it("stands as tall as the box and as wide as its plates, for every shape and lid", () => {
    for (const shape of ["rect", "pill", "poly", "cyl"] as const) {
      for (const lid of ["open", "fixed", "removable"] as const) {
        const { p, m } = build({ shape, lid, cutStyle: "slot" });
        const sc = buildHingeScene(m, p);
        expect(sc.size[1], `${shape}/${lid}`).toBeCloseTo(p.H, 2);
        if (shape === "rect") {
          expect(sc.size[0]).toBeCloseTo(p.W + p.K, 0);
          expect(sc.size[2]).toBeCloseTo(p.D + p.K, 0);
        }
        const names = meshes(sc.group).map((o) => o.name);
        expect(names).toContain("base");
        expect(names).toContain("wall");
        expect(names.includes("lid")).toBe(lid !== "open");
        expect(names.includes("lid lip")).toBe(lid === "removable");
        sc.dispose();
      }
    }
  });

  it("rests on the ground, centred, and explodes upward", () => {
    const { p, m } = build({});
    const sc = buildHingeScene(m, p);
    const box = new THREE.Box3().setFromObject(sc.group);
    expect(box.min.y).toBeCloseTo(0, 6);
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(0, 6);
    expect(buildHingeScene(m, p, 1).size[1]).toBeGreaterThan(p.H + 20);
  });

  it("draws slit lines on the curved corners only, staggered like the lattice", () => {
    const { p, m } = build({});
    const lines = buildHingeScene(m, p).group.getObjectByName("slits") as THREE.LineSegments;
    const n = lines.geometry.getAttribute("position").count / 2;
    // Four quarter-turn corners at radius R, one column per pitch; odd columns have two cuts.
    const perCorner = Math.floor((m.R * Math.PI / 2) / p.pitch);
    expect(n).toBeGreaterThanOrEqual(4 * perCorner);
    expect(n).toBeLessThanOrEqual(8 * perCorner);
    expect(lines.userData.keepMaterial).toBe(true);
  });

  it("lays every cut part flat, T thick", () => {
    for (const lid of ["open", "removable"] as const) {
      const { p, m } = build({ lid });
      const lay = layoutParts(m.parts, p.bedW, p.gap);
      const sc = hingeFlatScene(lay, layerContent(m, lay, p), p);
      expect(meshes(sc.group).filter((o) => o.name !== "cuts")).toHaveLength(m.parts.length);
      expect(sc.size[1]).toBeCloseTo(p.T, 2);
      expect(sc.size[0]).toBeGreaterThan(p.W);
    }
  });
});

describe("material looks", () => {
  it("maps material presets to looks", () => {
    expect(lookOf("birch3")).toBe("wood");
    expect(lookOf("mdf3")).toBe("mdf");
    expect(lookOf("card2")).toBe("card");
    expect(lookOf("acr3")).toBe("acrylic");
    expect(lookOf("custom")).toBe("wood");
  });

  it("re-dresses the meshes but leaves cut lines alone; acrylic is see-through", () => {
    const { p, m } = build({ material: "acr3", T: 3, K: 0.1 });
    const sc = buildHingeScene(m, p);
    const lines = sc.group.getObjectByName("slits") as THREE.LineSegments;
    const lineMat = lines.material;
    applyLook(sc.group, "acrylic");
    for (const o of meshes(sc.group)) {
      const mat = o.material as THREE.MeshPhysicalMaterial;
      expect(mat.transparent).toBe(true);
      expect(mat.opacity).toBeLessThan(1);
    }
    expect(lines.material).toBe(lineMat);
    applyLook(sc.group, "wood");
    const wall = sc.group.getObjectByName("wall") as THREE.Mesh;
    expect((wall.material as THREE.MeshStandardMaterial).vertexColors).toBe(true);
    expect((wall.material as THREE.MeshStandardMaterial).transparent).toBe(false);
  });
});
