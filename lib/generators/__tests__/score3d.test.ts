/**
 * Every scored line a generator cuts shows in the 3D view: tagged items (scored text) and untagged
 * lines alike (a scored frame or border, scored rings, a scored pattern, a score-only backer).
 */
import { expect, it } from "vitest";
import * as THREE from "three";
import { ALL_GENERATORS } from "../all";
import { setPath } from "../path";
import { generatorScene } from "../scene3d";
import type { AnyGenerator, Contour, GenOutput } from "../types";
import { CTX } from "./ctx";

const len = (cs: Contour[]) => cs.reduce((n, c) => n + c.slice(1).reduce((m, q, i) => m + Math.hypot(q[0] - c[i][0], q[1] - c[i][1]), 0), 0);
const scored = (out: GenOutput) => out.parts.reduce((n, p) => n + (p.views3d?.length ? p.views3d.reduce((m, v) => m + len(v.score ?? []), 0) : len(p.score ?? [])), 0);

/** Length of the score lines drawn in the scene (crease lines excluded). */
function drawn(out: GenOutput, T: number) {
  const scene = generatorScene(out, T);
  let n = 0;
  scene.group.traverse((o) => {
    const l = o as THREE.LineSegments;
    if (!l.isLineSegments || /mountain|valley/.test(o.name)) return;
    const a = l.geometry.getAttribute("position");
    for (let i = 0; i + 1 < a.count; i += 2) n += Math.hypot(a.getX(i + 1) - a.getX(i), a.getY(i + 1) - a.getY(i), a.getZ(i + 1) - a.getZ(i));
  });
  scene.dispose?.();
  return n;
}

const SWITCH: Record<string, Record<string, unknown>[]> = {
  charm: [{ "shape.frame": true }, { "style.operation": "score" }],
  topper: [{ "plate.frame": true }],
  keyrack: [{ "board.frame": true }],
  family: [{ "ring.frame": true, "layout.kind": "ring" }],
};

it("draws every scored line in 3D, on every preset and with the scored options on", () => {
  let checked = 0;
  for (const def of ALL_GENERATORS as AnyGenerator[]) {
    const variants = [{}, ...(SWITCH[def.id] ?? [])];
    for (const pr of def.presets) for (const v of variants) {
      let p = def.merge(pr.params);
      for (const [k, val] of Object.entries(v)) p = setPath(p, k, val);
      p = def.merge(p);
      const out = def.build(p, CTX);
      if (out.error) continue;
      const want = scored(out);
      if (want < 1) continue;
      checked++;
      const got = drawn(out, (p as { T: number }).T);
      expect(got, `${def.id}/${pr.id} ${JSON.stringify(v)}`).toBeGreaterThan(want * 0.98);
    }
  }
  expect(checked).toBeGreaterThan(20);
}, 600_000);
