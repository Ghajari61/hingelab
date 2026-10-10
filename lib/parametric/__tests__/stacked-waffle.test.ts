import { describe, expect, it } from "vitest";
import { makeShape, pointInContour, signedArea } from "@/lib/letters/polygon";
import { mergeParametricParams } from "../defaults";
import { computeParametric, loadSource } from "../engine";
import { intervalsAlong } from "../methods/waffle";
import { cleanSection } from "../slice/clean";
import { prepareMesh } from "../source/mesh";
import type { Contour, MeshData, ParametricParams, Shape, SliceResult, Vec3 } from "../types";
import { crossings, manifold, rasterComponents } from "./helpers";

const base = (): ParametricParams => {
  const p = mergeParametricParams({ source: { kind: "library", id: "sphere", detail: 6 } });
  p.material.K = 0;
  p.quality.smoothing = 0;
  return p;
};

function boxMesh(sx: number, sy: number, sz: number): MeshData {
  const positions = new Float32Array(8 * 3);
  for (let i = 0; i < 8; i++) {
    positions[i * 3] = i & 1 ? sx : 0;
    positions[i * 3 + 1] = i & 2 ? sy : 0;
    positions[i * 3 + 2] = i & 4 ? sz : 0;
  }
  const indices = new Uint32Array([0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5]);
  return { positions, indices };
}

const toModel = (r: SliceResult, plane: number, [x, y]: [number, number]): Vec3 => {
  const pl = r.planes[plane];
  return [0, 1, 2].map(k => pl.u[k] * x + pl.w[k] * y + pl.normal[k] * pl.offset) as Vec3;
};

const centroidOf = (c: Contour): [number, number] => [c.reduce((a, q) => a + q[0], 0) / c.length, c.reduce((a, q) => a + q[1], 0) / c.length];

function checkInvariants(r: SliceResult) {
  for (const part of r.parts) {
    const { outer, holes } = part.shape;
    expect(signedArea(outer)).toBeGreaterThan(0);
    for (const h of holes) {
      expect(signedArea(h)).toBeLessThan(0);
      expect(h.every(q => pointInContour(q, outer))).toBe(true);
    }
    for (const h of part.innerCuts) expect(h.every(q => pointInContour(q, outer)), part.id).toBe(true);
    expect(crossings([outer, ...holes]), part.id).toBe(0);
    expect(rasterComponents(part.shape, 10), part.id).toBe(1);
    for (const v of part.placement) expect(Number.isFinite(v)).toBe(true);
  }
  expect(new Set(r.parts.map(q => q.id)).size).toBe(r.parts.length);
}

/** Part outlines rounded to 0.01 mm, for regression snapshots. */
const outlines = (r: SliceResult) =>
  JSON.stringify(
    r.parts.map(q => ({ id: q.id, outer: q.shape.outer.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]), holes: q.shape.holes.length, inner: q.innerCuts.length })),
    null,
    0,
  ).replace(/\},\{/g, "},\n{");

/** Material intervals along y on the line x, restricted to [t0, t1]. */
const within = (s: Shape[], x: number, t0: number, t1: number) =>
  intervalsAlong(s, x).map(([a, b]) => [Math.max(a, t0), Math.min(b, t1)] as [number, number]).filter(([a, b]) => b > a);

describe("parametric stacked + waffle", () => {
  it("sphere stacked: layer i is a disc of radius sqrt(100² − h_i²) within 0.15 mm; dowel holes are concentric through the stack", async () => {
    const wasm = await manifold();
    const p = base();
    p.method = "stacked";
    p.stacked.axis = "Y";
    p.material.T = 3;
    const r = computeParametric(p, await loadSource(p), wasm);
    expect(r.engine).toBe("manifold");
    expect(r.planes.length).toBe(67);
    expect(r.parts.every(q => q.kind === "layer" && /^L\d\d$/.test(q.id))).toBe(true);
    let worst = 0;
    for (const part of r.parts) {
      const h = r.planes[part.plane].offset;
      const R = Math.sqrt(100 * 100 - h * h);
      for (const q of part.shape.outer) worst = Math.max(worst, Math.abs(Math.hypot(q[0], q[1]) - R));
    }
    expect(worst).toBeLessThanOrEqual(0.15);
    expect(r.parts.length).toBeGreaterThan(60);

    // One chain through every layer (the discs are concentric); the 10 mm top layer leaves room for one dowel.
    expect(r.warnings.some(w => w.code === "DOWEL_CHAIN_SPLIT" || w.code === "NO_DOWEL")).toBe(false);
    const ref = r.parts[0].innerCuts.map(c => toModel(r, r.parts[0].plane, centroidOf(c)));
    expect(ref.length).toBeGreaterThanOrEqual(1);
    for (const part of r.parts) {
      expect(part.innerCuts, part.id).toHaveLength(ref.length);
      const got = part.innerCuts.map(c => toModel(r, part.plane, centroidOf(c)));
      got.forEach((g, k) => {
        expect(Math.abs(g[0] - ref[k][0]), part.id).toBeLessThanOrEqual(1e-6);
        expect(Math.abs(g[2] - ref[k][2]), part.id).toBeLessThanOrEqual(1e-6);
      });
      const d = 2 * Math.sqrt(Math.abs(signedArea(part.innerCuts[0])) / Math.PI);
      expect(d).toBeCloseTo(p.joints.dowelDia + p.joints.slotClearance, 1);
    }
    // Registration marks: every layer under a smaller layer carries its outline.
    const mid = r.parts.find(q => r.planes[q.plane].offset > 50)!;
    expect(mid.engrave.length).toBeGreaterThan(1);
    checkInvariants(r);
    expect(r.guide.some(g => g.includes("dowel"))).toBe(true);
  });

  it("stacked hollow keeps every layer in one piece and the dowel holes intact", async () => {
    const wasm = await manifold();
    const p = base();
    p.method = "stacked";
    p.material.T = 6;
    p.stacked.hollow = true;
    p.stacked.shell = 8;
    const solid = computeParametric({ ...p, stacked: { ...p.stacked, hollow: false } }, await loadSource(p), wasm);
    const r = computeParametric(p, await loadSource(p), wasm);
    const area = (x: SliceResult) => x.parts.reduce((a, q) => a + q.shape.area, 0);
    expect(area(r)).toBeLessThan(0.6 * area(solid));
    expect(r.parts.map(q => q.id)).toEqual(solid.parts.map(q => q.id));
    expect(r.parts.some(q => q.shape.holes.length > 0)).toBe(true);
    checkInvariants(r);
  });

  it("box waffle: ribs are notched rectangles, the two slots of every crossing fill its overlap, kerfed slots are T + c − K", async () => {
    const wasm = await manifold();
    const p = base();
    p.method = "waffle";
    p.waffle.familyAxes = ["X", "Z"];
    p.waffle.spacingA = 50;
    p.waffle.spacingB = 50;
    const src = await prepareMesh(boxMesh(200, 100, 150), p.sourceSettings, { units: "mm", upAxis: "Y", anchor: "centre" });
    expect(src.openEdges).toBe(0);
    const r = computeParametric(p, src, wasm);
    expect(r.engine).toBe("manifold");
    const A = r.parts.filter(q => q.kind === "rib-x"), B = r.parts.filter(q => q.kind === "rib-y");
    expect(A.length).toBe(4);
    expect(B.length).toBe(3);
    const cs = r.crossings ?? [];
    expect(cs.length).toBe(12);
    const sw = p.material.T + p.joints.halfLapClearance;
    for (const [ribs, w] of [[A, 150], [B, 200]] as const) {
      for (const q of ribs) {
        expect(q.shape.bbox.x1 - q.shape.bbox.x0).toBeCloseTo(w, 3);
        expect(q.shape.bbox.y1 - q.shape.bbox.y0).toBeCloseTo(100, 3);
        const slots = cs.filter(c => c.a === q.id || c.b === q.id).length;
        expect(slots).toBe(ribs === A ? 3 : 4);
        expect(q.shape.area).toBeCloseTo(w * 100 - slots * sw * 50, 1);
        expect(q.shape.holes).toHaveLength(0);
      }
    }
    for (const c of cs) {
      const a = r.parts.find(q => q.id === c.a)!, b = r.parts.find(q => q.id === c.b)!;
      const ma = within([a.shape], c.xa, c.t0, c.t1), mb = within([b.shape], c.xb, c.t0, c.t1);
      const len = (iv: [number, number][]) => iv.reduce((s, [x, y]) => s + y - x, 0);
      expect(c.t1 - c.t0).toBeCloseTo(100, 6);
      expect(Math.abs(len(ma) + len(mb) - (c.t1 - c.t0))).toBeLessThanOrEqual(1e-6);
      for (const [x0, x1] of ma) for (const [y0, y1] of mb) expect(Math.min(x1, y1) - Math.max(x0, y0)).toBeLessThanOrEqual(1e-6);
      expect(a.neighbors).toContain(b.id);
      expect(b.neighbors).toContain(a.id);
    }
    checkInvariants(r);

    // Kerf: the cut outline narrows every slot to T + clearance − K.
    const K = 0.2;
    p.material.K = K;
    const rk = computeParametric(p, src, wasm);
    for (const c of rk.crossings ?? []) {
      const a = rk.parts.find(q => q.id === c.a)!;
      const y = (c.t0 + c.m) / 2;
      const swapped = a.cut!.outline.map(ct => ct.map(([x, yy]) => [yy, x] as [number, number]));
      const xs = intervalsAlong(swapped.map(ct => makeShape(ct, [])), y);
      const gap = xs.map((iv, k) => (k ? iv[0] - xs[k - 1][1] : NaN)).find((g, k) => k > 0 && xs[k - 1][1] < c.xa && xs[k][0] > c.xa);
      expect(gap).toBeCloseTo(sw - K, 2);
    }
  });

  it("smoothing and the minimum-feature clean-up keep square corners square", () => {
    const rect: Contour = [[-100, -75], [100, -75], [100, 75], [-100, 75]];
    for (const smoothing of [0, 0.5, 1]) {
      const c = cleanSection([rect], { evenOdd: false, clipToWall: false, chordTolerance: 0.1, smoothing, minFeature: 4, minIslandArea: 1 });
      expect(c.shapes).toHaveLength(1);
      expect(c.shapes[0].area, `smoothing ${smoothing}`).toBeGreaterThan(200 * 150 - 4);
    }
  });

  it("regression: part outlines of the analytic cases", async () => {
    const wasm = await manifold();
    const par = base();
    par.parallel.spacing = 10;
    par.parallel.backboard = "none";
    await expect(outlines(computeParametric(par, await loadSource(par), wasm))).toMatchFileSnapshot("./__snapshots__/sphere-parallel.json");
    const st = base();
    st.method = "stacked";
    st.material.T = 6;
    await expect(outlines(computeParametric(st, await loadSource(st), wasm))).toMatchFileSnapshot("./__snapshots__/sphere-stacked.json");
    const wf = base();
    wf.method = "waffle";
    wf.waffle.spacingA = 50;
    wf.waffle.spacingB = 50;
    const box = await prepareMesh(boxMesh(200, 100, 150), wf.sourceSettings, { units: "mm", upAxis: "Y", anchor: "centre" });
    await expect(outlines(computeParametric(wf, box, wasm))).toMatchFileSnapshot("./__snapshots__/box-waffle.json");
  });
});
