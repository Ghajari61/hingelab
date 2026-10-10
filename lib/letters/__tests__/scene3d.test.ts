import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as hb from "harfbuzzjs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { LETTER_DEFAULTS, computeLetterModel, loadFont, wallHeightOf } from "@/lib/letters";
import type { LetterModel, LetterParams, LoadedFont } from "@/lib/letters";
import { WOOD, buildLetterScene } from "@/lib/letters/scene3d";

function fixture(file: string, id: string, name: string): LoadedFont {
  const b = readFileSync(join(__dirname, "fonts", file));
  return loadFont(hb, id, name, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
}
const fredoka = fixture("Fredoka-Bold.ttf", "fredoka", "Fredoka Bold");
const vazir = fixture("Vazirmatn-Black.ttf", "vazirmatn", "Vazirmatn Black");

const params = (text: string, extra: Partial<LetterParams> = {}): LetterParams => ({
  ...LETTER_DEFAULTS, text, mode: "box", fontId: /[\u0600-\u06ff]/u.test(text) ? "vazirmatn" : "fredoka", ...extra,
});
function model(p: LetterParams): LetterModel {
  const r = computeLetterModel(p, p.fontId === "vazirmatn" ? vazir : fredoka, hb);
  if ("error" in r) throw new Error(r.error);
  return r;
}
const meshes = (g: THREE.Object3D) => {
  const out: THREE.Mesh[] = [];
  g.traverse(o => { if (o instanceof THREE.Mesh) out.push(o); });
  return out;
};

describe("letters 3D preview scene", () => {
  it("a closed box stands as tall as its depth, with one mesh per plate and wall", () => {
    const p = params("Sam");
    const m = model(p);
    const sc = buildLetterScene(m, p);
    const plates = m.parts.filter(pt => pt.kind === "plate").length;
    expect(meshes(sc.group)).toHaveLength(plates + m.box!.walls.length);
    expect(sc.size[1]).toBeCloseTo(p.depth, 3);
    const w = m.box!.filleted.reduce((r, s) => [Math.min(r[0], s.bbox.x0), Math.max(r[1], s.bbox.x1)], [Infinity, -Infinity]);
    expect(sc.size[0]).toBeCloseTo(w[1] - w[0] + p.K, 0);
    sc.dispose();
  });

  it("an open box is T + wall height tall; lifting the lid makes a closed one taller", () => {
    const p = params("O", { lid: "open" });
    expect(buildLetterScene(model(p), p).size[1]).toBeCloseTo(p.T + wallHeightOf(p), 3);
    const q = params("O");
    const mq = model(q);
    expect(buildLetterScene(mq, q, 1).size[1]).toBeGreaterThan(q.depth + 20);
  });

  it("hinge walls are tinted on their curves and plain wood on flats", () => {
    const p = params("D");
    const sc = buildLetterScene(model(p), p);
    const wood = new THREE.Color(WOOD.wall);
    const walls = meshes(sc.group).filter(o => o.name.startsWith("wall "));
    const cols = walls.flatMap(o => {
      const a = o.geometry.getAttribute("color");
      return Array.from({ length: a.count }, (_, i) => [a.getX(i), a.getY(i), a.getZ(i)]);
    });
    const plain = cols.filter(c => Math.abs(c[0] - wood.r) + Math.abs(c[1] - wood.g) + Math.abs(c[2] - wood.b) < 1e-4).length;
    expect(plain).toBeGreaterThan(0);
    expect(plain).toBeLessThan(cols.length);
  });

  it("marquee holes show in the lid", () => {
    const p = params("O", { marquee: { enabled: true, holeDia: 12, spacing: 30, margin: 5 } });
    const sc = buildLetterScene(model(p), p);
    const lid = meshes(sc.group).find(o => o.name === "O · lid")!;
    const plain = buildLetterScene(model(params("O")), params("O"));
    const lid0 = meshes(plain.group).find(o => o.name === "O · lid")!;
    expect(lid.geometry.getAttribute("position").count).toBeGreaterThan(lid0.geometry.getAttribute("position").count);
  });

  it("solid letters and stencils are flat sheets T thick", () => {
    for (const mode of ["solid", "stencil"] as const) {
      const p = params("سام", { mode });
      const sc = buildLetterScene(model(p), p);
      expect(sc.size[1]).toBeCloseTo(p.T, 3);
      expect(meshes(sc.group).length).toBeGreaterThan(0);
    }
  });
});
