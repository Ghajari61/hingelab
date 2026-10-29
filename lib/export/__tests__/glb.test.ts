import { describe, expect, it } from "vitest";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { MINIATURE } from "@/lib/generators/miniature";
import { BOXES } from "@/lib/generators/boxes";
import { generatorScene } from "@/lib/generators/scene3d";
import { CTX } from "@/lib/generators/__tests__/ctx";
import { readGLB, sceneToGLB } from "../glb";
import { bomCSV, bomRows } from "../bom";

const parseGLB = (data: Uint8Array) => new Promise<{ scene: THREE.Group }>((ok, fail) => {
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  new GLTFLoader().parse(buf, "", (g) => ok(g as unknown as { scene: THREE.Group }), fail);
});

describe("GLB export", () => {
  for (const [def, preset] of [[MINIATURE, "country-farmhouse"], [MINIATURE, "fit-test"], [BOXES, undefined]] as const) {
    it(`${def.id}${preset ? ` ${preset}` : ""}: a valid glTF 2.0 binary that three's loader reads back`, async () => {
      const p = def.merge(preset ? def.presets.find((x) => x.id === preset)!.params : def.defaults());
      const out = def.build(p as never, CTX);
      const scene = generatorScene(out, (p as { T: number }).T, 0);
      const r = sceneToGLB(scene.group);
      expect(r.meshes).toBeGreaterThan(0);
      const { json, bin } = readGLB(r.data);
      const accessors = json.accessors as { bufferView: number; count: number; componentType: number; type: string; min?: number[]; max?: number[] }[];
      const views = json.bufferViews as { byteOffset: number; byteLength: number }[];
      expect((json.asset as { version: string }).version).toBe("2.0");
      for (const a of accessors) {
        const v = views[a.bufferView], size = (a.type === "VEC3" ? 3 : 1) * 4;
        expect(v.byteOffset + v.byteLength).toBeLessThanOrEqual(bin!.byteLength);
        expect(a.count * size).toBe(v.byteLength);
      }
      for (const m of json.meshes as { primitives: { attributes: { POSITION: number } }[] }[]) {
        const a = accessors[m.primitives[0].attributes.POSITION];
        expect(a.min!.every(Number.isFinite) && a.max!.every(Number.isFinite)).toBe(true);
      }
      const g = await parseGLB(r.data);
      let meshes = 0;
      g.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
      expect(meshes).toBe(r.meshes);
      // millimetres become metres: the model is a few tenths of a metre across
      const box = new THREE.Box3().setFromObject(g.scene), s = box.getSize(new THREE.Vector3());
      expect(Math.max(s.x, s.y, s.z)).toBeGreaterThan(0.01);
      expect(Math.max(s.x, s.y, s.z)).toBeLessThan(2);
      scene.dispose();
    });
  }
});

describe("parts list", () => {
  it("counts identical parts together, totals the rest and writes clean CSV", () => {
    const p = MINIATURE.merge(MINIATURE.presets.find((x) => x.id === "country-farmhouse")!.params);
    const out = MINIATURE.build(p, CTX);
    const rows = bomRows(out.parts, p.T);
    expect(rows.reduce((n, r) => n + r.qty, 0)).toBe(out.parts.length);
    expect(rows.find((r) => r.name === "Porch post")!.qty).toBeGreaterThan(1);
    const csv = bomCSV(rows, { title: p.name, material: p.material, T: p.T });
    const lines = csv.trim().split("\r\n");
    expect(lines[2]).toBe("Part,Qty,Width mm,Height mm,Thickness mm,Area each cm²,Cut each mm,Score each mm,Holes,Engraved");
    expect(lines.length).toBe(rows.length + 4);
    const total = lines[lines.length - 1].split(",");
    expect(total[0]).toBe("Total");
    expect(Number(total[1])).toBe(out.parts.length);
    for (const r of rows) for (const v of [r.w, r.h, r.area, r.cut]) expect(Number.isFinite(v) && v > 0).toBe(true);
  });
});
