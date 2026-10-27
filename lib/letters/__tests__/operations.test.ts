import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as hb from "harfbuzzjs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { computeLetterModel, exportLetterSVG, layoutLetters, loadFont, mergeLetterParams } from "@/lib/letters";
import type { LetterParams } from "@/lib/letters";
import { letterLayerContent } from "../export";
import { buildLetterScene } from "../scene3d";
import { applyLook } from "@/lib/three/looks";

const font = (persian = false) => {
  const b = readFileSync(join(__dirname, "fonts", persian ? "Vazirmatn-Black.ttf" : "Fredoka-Bold.ttf"));
  return loadFont(hb, "fixture", "Fixture", b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
};
function build(extra: Partial<LetterParams>) {
  const p = mergeLetterParams({ mode: "solid", text: "iji BO", size: 30, ...extra });
  const model = computeLetterModel(p, font(/[\u0600-\u06ff]/.test(p.text)), hb);
  if ("error" in model) throw new Error(model.error);
  return { p, model };
}

describe("Letters Cut / Score and No Weld", () => {
  for (const text of ["iji BO", "ایران"]) it(`preserves separate dots in ${text} even when Weld dots was enabled`, () => {
    const { p, model } = build({ text, noWeld: true, weldDots: true, weld: "word" });
    const control = build({ text, weldDots: false, weld: "letters" }).model;
    expect(model.bridges).toHaveLength(0);
    expect(model.parts).toEqual(control.parts);
    expect(p.weldDots).toBe(true);
    expect(p.weld).toBe("word");
  });
  it("scores the whole text in its original positions without any letter or stock cut", () => {
    const { p, model } = build({ operation: "score", noWeld: true, K: 0.8, weldDots: true });
    expect(model.parts).toHaveLength(1);
    const lay = layoutLetters(model, p), layers = letterLayerContent(lay, p);
    expect(layers.outline).toHaveLength(0);
    expect(layers.slots).toHaveLength(0);
    expect(layers.labels).toHaveLength(0);
    expect(layers.score!.length).toBeGreaterThan(8);
    const svg = exportLetterSVG(lay, p);
    expect(svg).toContain('id="score"');
    expect(svg).toContain("no kerf compensation");
    expect(model.parts).toEqual(build({ operation: "score", noWeld: true, K: 0, weldDots: true }).model.parts);
  });
  it("shows score lines on preview stock in 3D", () => {
    const { p, model } = build({ operation: "score" });
    const scene = buildLetterScene(model, p);
    const marks = scene.group.getObjectByName("Scored letter outlines") as THREE.Mesh;
    const material = marks.material;
    for (const look of ["wood", "mdf", "acrylic"] as const) {
      applyLook(scene.group, look);
      expect(marks.material).toBe(material);
      expect((marks.material as THREE.MeshStandardMaterial).color.getHexString()).toBe("493322");
    }
    expect(scene.size.every(v => v > 0 && Number.isFinite(v))).toBe(true);
    scene.dispose();
  });
  it("keeps small punctuation score paths and rejects an empty stroke result", () => {
    const small = build({ text: ".", size: 5, operation: "score" });
    expect(Object.values(small.model.parts[0].bbox).every(Number.isFinite)).toBe(true);
    const p = mergeLetterParams({ mode: "solid", text: ".", size: 5, operation: "score", thicken: -100 });
    expect(computeLetterModel(p, font(), hb)).toHaveProperty("error");
  });
  it("does not turn a letter box or stencil's structural cuts into scores", () => {
    for (const mode of ["box", "stencil"] as const) {
      const { p, model } = build({ mode, text: "O", size: 120, operation: "score" });
      const layers = letterLayerContent(layoutLetters(model, p), p);
      expect(layers.outline.length).toBeGreaterThan(0);
    }
  });
  it("restores saved settings and treats absent or malformed new fields as old defaults", () => {
    expect(mergeLetterParams(JSON.parse('{"noWeld":true,"operation":"score","weld":"word","weldDots":true}'))).toMatchObject({ noWeld: true, operation: "score", weld: "word", weldDots: true });
    expect(mergeLetterParams(JSON.parse('{"noWeld":"false","operation":"bogus"}'))).toMatchObject({ noWeld: false, operation: "cut" });
  });
});
