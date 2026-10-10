import { describe, expect, it } from "vitest";
import { pointInContour, signedArea } from "@/lib/letters/polygon";
import { mergeParametricParams, minFeatureOf } from "../defaults";
import { computeParametric, loadSource } from "../engine";
import { icosphere, signedVolume } from "../source/library";
import { prepareMesh } from "../source/mesh";
import type { ParametricParams, SliceResult } from "../types";
import { crossings, manifold, rasterComponents } from "./helpers";

const sphereParams = (): ParametricParams => {
  const p = mergeParametricParams({ source: { kind: "library", id: "sphere", detail: 6 } });
  p.parallel.spacing = 10;
  p.material.K = 0;
  p.quality.smoothing = 0;
  return p;
};

/** Every fin vertex clear of the wall-corner rounding must sit on the circle of radius sqrt(100² − d²). */
function checkSphereFins(p: ParametricParams, r: SliceResult) {
  const clear = minFeatureOf(p) / 2 + 0.5;
  expect(r.planes.length).toBe(20);
  expect(r.parts.length).toBe(20);
  let worst = 0;
  for (const part of r.parts) {
    const d = r.planes[part.plane].offset;
    const R = Math.sqrt(100 * 100 - d * d);
    expect(part.shape.holes).toHaveLength(0);
    expect(part.shape.bbox.y0).toBeCloseTo(0, 6);
    let checked = 0;
    for (const [x, y] of part.shape.outer) {
      if (y <= clear) continue;
      worst = Math.max(worst, Math.abs(Math.hypot(x, y) - R));
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
    expect(part.shape.area).toBeGreaterThan(0.97 * (Math.PI * R * R) / 2);
    expect(part.shape.area).toBeLessThan((Math.PI * R * R) / 2 + 0.5);
  }
  expect(worst).toBeLessThanOrEqual(0.15);
}

function checkInvariants(r: SliceResult) {
  for (const part of r.parts) {
    const { outer, holes } = part.shape;
    expect(signedArea(outer)).toBeGreaterThan(0);
    for (const h of holes) {
      expect(signedArea(h)).toBeLessThan(0);
      expect(h.every(q => pointInContour(q, outer))).toBe(true);
    }
    expect(crossings([outer, ...holes]), part.id).toBe(0);
    expect(rasterComponents(part.shape, 10), part.id).toBe(1);
    for (const v of part.placement) expect(Number.isFinite(v)).toBe(true);
  }
}

describe("parametric parallel fins", () => {
  it("sphere parallel: every fin is a half-disc of radius sqrt(100² − d²) within 0.15 mm", async () => {
    const wasm = await manifold();
    const p = sphereParams();
    const src = await loadSource(p);
    expect(src.openEdges).toBe(0);
    const r = computeParametric(p, src, wasm);
    expect(r.engine).toBe("manifold");
    expect(r.planes.map(pl => pl.offset)[0]).toBeCloseTo(-95, 1);
    checkSphereFins(p, r);
    expect(r.warnings.filter(w => w.code !== "MIN_FEATURE_REMOVED")).toEqual([]);
  });

  it("the fallback section method gives the same sphere fins", async () => {
    const wasm = await manifold();
    const p = sphereParams();
    const src = await loadSource(p);
    const r = computeParametric(p, { ...src, openEdges: 1 }, wasm);
    expect(r.engine).toBe("fallback");
    checkSphereFins(p, r);
  });

  it("invariants 1–2 hold for the sphere and the abstract head", async () => {
    const wasm = await manifold();
    const sphere = computeParametric(sphereParams(), await loadSource(sphereParams()), wasm);
    checkInvariants(sphere);
    const head = mergeParametricParams({});
    const r = computeParametric(head, await loadSource(head), wasm);
    expect(r.engine).toBe("manifold");
    expect(r.parts.length).toBeGreaterThan(15);
    checkInvariants(r);
    for (const part of r.parts) expect(part.shape.bbox.y0).toBeGreaterThanOrEqual(-1e-6);
  });

  it("an open mesh is sliced with the fallback and reported as NON_MANIFOLD", async () => {
    const wasm = await manifold();
    const s = icosphere(100, 4);
    const keep: number[] = [];
    for (let i = 0; i < s.indices.length; i += 3) {
      const cy = (s.positions[s.indices[i] * 3 + 1] + s.positions[s.indices[i + 1] * 3 + 1] + s.positions[s.indices[i + 2] * 3 + 1]) / 3;
      if (cy < 98) keep.push(s.indices[i], s.indices[i + 1], s.indices[i + 2]);
    }
    const p = sphereParams();
    const src = await prepareMesh({ positions: s.positions, indices: new Uint32Array(keep) }, p.sourceSettings, { units: "mm", upAxis: "Y", anchor: "centre" });
    expect(src.openEdges).toBeGreaterThan(0);
    const r = computeParametric(p, src, wasm);
    expect(r.engine).toBe("fallback");
    expect(r.warnings.some(w => w.code === "NON_MANIFOLD" && w.message.includes(String(src.openEdges)))).toBe(true);
    expect(r.parts.length).toBeGreaterThan(10);
    checkInvariants(r);
  });

  it("short fins are dropped and reported; ids run F01…", async () => {
    const wasm = await manifold();
    const p = sphereParams();
    p.parallel.minFinHeight = 50;
    const r = computeParametric(p, await loadSource(p), wasm);
    const short = r.warnings.find(w => w.code === "SHORT_FIN_DROPPED");
    expect(short?.partIds?.length).toBeGreaterThan(0);
    expect(r.parts.length + (short?.partIds?.length ?? 0)).toBe(20);
    expect(new Set(r.parts.map(q => q.id)).size).toBe(r.parts.length);
    expect(r.parts.every(q => /^F\d\d$/.test(q.id))).toBe(true);
  });

  it("library meshes are closed and outward", async () => {
    for (const id of ["sphere", "torus", "abstract-head-cc0", "wave-panel", "ripple", "vase"] as const) {
      const src = await loadSource(mergeParametricParams({ source: { kind: "library", id } }));
      expect(src.openEdges, id).toBe(0);
      expect(signedVolume(src.mesh), id).toBeGreaterThan(0);
    }
  });
});
