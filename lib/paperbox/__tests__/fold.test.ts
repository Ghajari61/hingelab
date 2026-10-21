import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { PAPERBOX } from "@/lib/generators/paperbox";
import { generatorScene } from "@/lib/generators/scene3d";
import { CTX } from "@/lib/generators/__tests__/ctx";
import { buildBox, dielineSVG, listBoxStyles } from "..";
import { apply, assembled, foldFrames, markFolds, tucked } from "../fold";

type V = [number, number, number];
const dist = (a: V, b: V) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const STYLES = listBoxStyles().map((s) => s.id).filter((id) => !buildBox(id, {}).parts.some((p) => p.surface));

describe("Paper Box folding", () => {
  it.each(STYLES)("%s: 100 % is the assembled box, 0 % the flat net, and faces stay rigid on the way", (id) => {
    const d = buildBox(id, { paper: "custom", thickness: 0.5 });
    const frames = foldFrames(d.parts, d.poses, 0);
    const done = assembled(d.parts, d.poses, 0);
    done.forEach(({ face, m }, i) => {
      expect(frames[i]).toHaveLength(21);
      frames[i][20].forEach((v, k) => expect(v, `${id} ${face.id}`).toBeCloseTo(m[k], 6));
    });
    for (const part of d.parts) {
      const mine = done.map((x, i) => ({ ...x, i })).filter((x) => x.part === part);
      const at = (k: number) => mine.map((x) => ({ face: x.face, m: frames[x.i][k] }));
      // Flat: every point of every face on one plane.
      const pts = at(0).flatMap(({ face, m }) => face.poly.map(([x, y]) => apply(m, [x, y, 0])));
      const [a, b] = [pts[0], pts.find((q) => dist(q, pts[0]) > 1)!];
      const c = pts.find((q) => { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [q[0] - a[0], q[1] - a[1], q[2] - a[2]]; return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) > 1; })!;
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...n);
      for (const q of pts) expect(Math.abs(((q[0] - a[0]) * n[0] + (q[1] - a[1]) * n[1] + (q[2] - a[2]) * n[2]) / l), `${id} flat`).toBeLessThan(1e-6);
      // Rigid: edge lengths as on the sheet, at 0, 50 and 100 %.
      for (const k of [0, 10, 20]) {
        for (const { face, m } of at(k)) {
          if (face.parent2) continue;
          const P = face.poly.map(([x, y]) => apply(m, [x, y, 0]));
          face.poly.forEach((q, i) => {
            const r = face.poly[(i + 1) % face.poly.length];
            expect(dist(P[i], P[(i + 1) % P.length]), `${id} ${face.id} at ${k * 5} %`).toBeCloseTo(Math.hypot(r[0] - q[0], r[1] - q[1]), 6);
          });
        }
      }
    }
  });

  it("marks every folded crease valley or mountain, and can write mountains on their own layer", () => {
    const d = markFolds(buildBox("gable", {}));
    const creases = d.parts.flatMap((p) => p.paths.filter((q) => q.type === "crease"));
    expect(creases.filter((c) => c.fold === "valley").length).toBeGreaterThan(4);
    // The handles fold back the other way.
    expect(creases.some((c) => c.fold === "mountain")).toBe(true);
    const plain = dielineSVG(d), split = dielineSVG(d, { folds: true });
    expect(plain).not.toContain("crease-mountain");
    expect(split).toContain('id="crease-mountain"');
    expect(split).toContain("Crease (valley fold)");
    expect(dielineSVG(buildBox("gable", {}))).toBe(plain);
  });

  it("a face on two creases spans both as they fold", () => {
    const d = buildBox("reverse-tuck", {});
    const part = d.parts[0], front = part.faces.find((f) => f.id === "front")!, side = part.faces.find((f) => /side/i.test(f.name) && f.parent === front.id) ?? part.faces.find((f) => f.parent === front.id)!;
    // A test triangle on the front, joined to the side along their shared crease.
    const [h0, h1] = side.hinge!;
    const far = front.poly.reduce((a, q) => (Math.hypot(q[0] - h0[0], q[1] - h0[1]) > Math.hypot(a[0] - h0[0], a[1] - h0[1]) ? q : a));
    part.faces.push({ ...front, id: "test-gusset", name: "Test gusset", poly: [h0, h1, far], parent: front.id, hinge: [h0, far], parent2: side.id, hinge2: [h0, h1], printable: true });
    const placed = assembled([part], [], 0);
    const m = (id: string) => placed.find((x) => x.face.id === id)!.m;
    const g = apply(m("test-gusset"), [h1[0], h1[1], 0]), s = apply(m(side.id), [h1[0], h1[1], 0]);
    expect(dist(g, s)).toBeLessThan(1e-6);
    const g0 = apply(m("test-gusset"), [far[0], far[1], 0]), f0 = apply(m("front"), [far[0], far[1], 0]);
    expect(dist(g0, f0)).toBeLessThan(1e-6);
  });

  it("the 3D view: every face has its frames, folds flat in place, explodes apart and back", () => {
    const p = PAPERBOX.merge({ style: "reverse-tuck" });
    const out = PAPERBOX.build(p, CTX);
    const views = out.parts.flatMap((q) => q.views3d ?? []);
    expect(views.length).toBeGreaterThan(5);
    expect(views.every((q) => q.frames?.length === 21 && q.apart)).toBe(true);
    expect(views.some((q) => q.creases?.length)).toBe(true);
    const scene = generatorScene(out, p.T);
    const size = () => { scene.group.updateMatrixWorld(true); const s = new THREE.Box3().setFromObject(scene.group).getSize(new THREE.Vector3()); return [s.x, s.y, s.z]; };
    const folded = size();
    scene.fold!(0);
    const flat = size();
    // Flat: about one board thick (the scene's y is up), and wider than the box.
    expect(flat[1]).toBeLessThan(2);
    expect(Math.max(flat[0], flat[2])).toBeGreaterThan(Math.max(folded[0], folded[2]));
    scene.fold!(1);
    size().forEach((v, i) => expect(v).toBeCloseTo(folded[i], 3));
    scene.explode!(1);
    expect(size()[0]).toBeGreaterThan(folded[0]);
    scene.explode!(0);
    size().forEach((v, i) => expect(v).toBeCloseTo(folded[i], 3));
  });

  it("scores mountain folds dash-dot when asked, solid by default", () => {
    const solid = PAPERBOX.build(PAPERBOX.merge({ style: "gable" }), CTX);
    const dash = PAPERBOX.build(PAPERBOX.merge({ style: "gable", lines: { mountain: "dashdot" } }), CTX);
    const n = (o: typeof solid) => o.parts.reduce((k, q) => k + (q.score?.length ?? 0), 0);
    expect(n(dash)).toBeGreaterThan(n(solid));
    expect(tucked).toBeTypeOf("function");
  });
});
