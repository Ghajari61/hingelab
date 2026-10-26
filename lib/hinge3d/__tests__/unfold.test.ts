/**
 * Opening out in 3D: assembled at 0, every cut part flat on its place on the sheet at 1, finite
 * all the way, for Hinge Boxes (lids, cabinets, drawers, caps) and generator designs.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { computeModel, layoutParts, type Model, type Params } from "@/lib/hinge";
import { HINGE_PRESETS, hingePresetParams } from "@/lib/hinge/presets";
import { buildHingeScene } from "../scene";
import { hingeUnfoldScene } from "../unfold";
import { modelBox } from "@/lib/three/dims";
import { arrangeGenerator } from "@/lib/generators/output";
import { generatorScene } from "@/lib/generators/scene3d";
import { BOXES } from "@/lib/generators/boxes";
import { CTX } from "@/lib/generators/__tests__/ctx";

const size = (g: THREE.Object3D) => modelBox(g).getSize(new THREE.Vector3());
const build = (id: string) => {
  const p = hingePresetParams(HINGE_PRESETS.find((x) => x.id === id)!.params) as Params;
  const m = computeModel(p) as Model;
  return { p, m, lay: layoutParts(m.parts, p.bedW, p.gap) };
};

describe("Hinge Box opening out", () => {
  for (const id of ["gift-box", "flip-top-box", "mini-cabinet", "desk-drawers", "shoebox", "stepped-jewel", "display-cabinet", "tea-chest"]) {
    it(`${id}: assembled at 0, flat on the sheet at 1`, () => {
      const { p, m, lay } = build(id);
      const sc = hingeUnfoldScene(m, p, lay);
      sc.explode!(0);
      const closed = size(sc.group), ref = size(buildHingeScene(m, p).group);
      // the same box as the static scene, standing on the floor
      expect(closed.x).toBeCloseTo(ref.x, 0);
      expect(closed.y).toBeCloseTo(ref.y, 0);
      expect(modelBox(sc.group).min.y).toBeCloseTo(0, 1);
      for (const e of [0.1, 0.25, 0.4, 0.55, 0.7, 0.85]) {
        sc.explode!(e);
        const s = size(sc.group);
        expect([s.x, s.y, s.z].every(Number.isFinite), `${id} at ${e}`).toBe(true);
        expect(modelBox(sc.group).min.y, `${id} at ${e}`).toBeGreaterThan(-1);
      }
      sc.explode!(1);
      const flat = size(sc.group);
      // every part lies flat: as thick as the sheet (a clear window may be a little thicker)
      expect(flat.y).toBeLessThan(p.T * 2 + 0.5);
      expect(flat.x).toBeCloseTo(lay.width - 10, -1);
      sc.dispose();
    });
  }
});

describe("generator designs opening out", () => {
  it("a jointed box's walls fall outwards and every part lands flat", () => {
    const p = BOXES.merge(BOXES.presets[0].params);
    const a = arrangeGenerator(BOXES, p, CTX);
    const out = BOXES.build(a.params, CTX);
    const sc = generatorScene(out, p.T, 0, 1, a.lay!);
    expect(sc.explode).toBeTypeOf("function");
    const closed = size(sc.group);
    sc.explode!(0.36);
    // the walls have fallen outwards: the design covers more of the floor
    const fallen = size(sc.group);
    expect(fallen.x * fallen.z).toBeGreaterThan(closed.x * closed.z * 1.5);
    sc.explode!(1);
    expect(size(sc.group).y).toBeLessThan(p.T + 0.6);
    sc.explode!(0);
    expect(size(sc.group).y).toBeCloseTo(closed.y, 3);
  });
});
