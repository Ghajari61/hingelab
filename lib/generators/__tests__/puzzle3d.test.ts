/** The puzzle in 3D: every piece is its own slab with a seam round it, and the cuts show on top. */
import { expect, it } from "vitest";
import * as THREE from "three";
import { PUZZLE } from "../puzzle";
import { generatorScene } from "../scene3d";
import { CTX } from "./ctx";

it("draws each preset's pieces apart from each other, with the piece cuts on the face", () => {
  for (const pr of PUZZLE.presets) {
    const p = PUZZLE.merge(pr.params), out = PUZZLE.build(p, CTX);
    const puzzle = out.parts.find((q) => q.pieces?.length)!;
    const scene = generatorScene(out, p.T);
    const pieces: THREE.Mesh[] = [];
    let lines = 0;
    scene.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && / piece \d+$/.test(o.name)) pieces.push(o as THREE.Mesh);
      if ((o as THREE.LineSegments).isLineSegments && /cut lines$/.test(o.name)) lines += (o as THREE.LineSegments).geometry.getAttribute("position").count / 2;
    });
    expect(pieces.length, pr.id).toBe(puzzle.pieces!.length);
    expect(lines, pr.id).toBeGreaterThan(puzzle.cuts!.length);
    // the seam: a piece is drawn smaller than its cell
    const area = (m: THREE.Mesh) => { m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox!; return (b.max.x - b.min.x) * (b.max.y - b.min.y); };
    const xs = puzzle.pieces![0].map((q) => q[0]), ys = puzzle.pieces![0].map((q) => q[1]);
    expect(area(pieces[0]), pr.id).toBeLessThan((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)));
    scene.dispose?.();
  }
});
