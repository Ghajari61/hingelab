import { describe, expect, it } from "vitest";
import { IMAGE_DEFAULTS, mergeParametricParams } from "../defaults";
import { computeParametric, loadSource } from "../engine";
import { distanceToParts, measureDeviation, partGeom, sampleSurface } from "../quality";
import {
  autoMask, depthInput, depthInputSize, normaliseDepth, packDepth, processDepth, reliefGrid, reliefMesh, sampleDepth, unpackDepth,
  type DepthMap, type ReliefOptions,
} from "../source/relief";
import { openEdgeCount } from "../source/mesh";
import { mulberry32 } from "../quality";
import { tryManifold } from "../slice/section";
import type { ImageSource, MeshData, ParametricParams, Part } from "../types";
import { manifold } from "./helpers";

/** A head-like subject: an oval dome with a ridge (nose) on a flat, slightly noisy background. */
function portraitDepth(w = 120, h = 160, seed = 3): DepthMap {
  const rnd = mulberry32(seed);
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x - w / 2) / (w * 0.32), v = (y - h * 0.45) / (h * 0.36);
    const r2 = u * u + v * v;
    const dome = r2 < 1 ? 0.45 + 0.4 * Math.sqrt(1 - r2) + 0.15 * Math.exp(-((x - w / 2) ** 2) / 18 - ((y - h * 0.45) ** 2) / 300) : 0;
    data[y * w + x] = Math.max(dome, 0.05 + 0.02 * rnd());
  }
  return { w, h, data };
}

const opts = (o: Partial<ReliefOptions> = {}): ReliefOptions => ({ ...IMAGE_DEFAULTS, resolution: 96, width: 150, ...o });

/** Highest top-surface point of the mesh above (x, y), by brute force over the triangles. */
function heightAt(m: MeshData, x: number, y: number): number {
  const p = m.positions, ix = m.indices;
  let best = -Infinity;
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    const x0 = p[a], y0 = p[a + 1], x1 = p[b], y1 = p[b + 1], x2 = p[c], y2 = p[c + 1];
    const det = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
    if (Math.abs(det) < 1e-12) continue;
    const l0 = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / det, l1 = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / det, l2 = 1 - l0 - l1;
    if (l0 < -1e-9 || l1 < -1e-9 || l2 < -1e-9) continue;
    best = Math.max(best, l0 * p[a + 2] + l1 * p[b + 2] + l2 * p[c + 2]);
  }
  return best;
}

const imageParams = (o: Partial<ImageSource> = {}): ParametricParams => {
  const p = mergeParametricParams({ source: { ...IMAGE_DEFAULTS, fileName: "portrait.jpg", resolution: 96, width: 150, ...o } });
  p.material.T = 3;
  return p;
};

describe("parametric photo to relief + quality", () => {
  it("relief mesh is watertight; heightfield sampling matches the depth map within 1 grid step", async () => {
    const wasm = await manifold();
    const depth = portraitDepth();
    for (const o of [opts(), opts({ subjectMask: "none" }), opts({ blur: 0, gamma: 0.6, invert: true, baseThickness: 4 })]) {
      const g = reliefGrid(depth, o);
      const m = reliefMesh(g);
      expect(openEdgeCount(m)).toBe(0);
      const solid = tryManifold(wasm, m);
      expect(solid, `manifold for ${JSON.stringify(o)}`).not.toBeNull();
      expect(solid!.volume()).toBeGreaterThan(0);
      expect(solid!.genus(), JSON.stringify({ ...o, inside: Array.from(g.inside).filter(v => v).length, of: g.inside.length })).toBe(0);
      solid!.delete();

      // Sample the top surface at random points of fully inside cells and compare with the depth map.
      const d = processDepth(depth, o);
      const rnd = mulberry32(11);
      let checked = 0;
      for (let k = 0; k < 4000 && checked < 150; k++) {
        const i = 1 + Math.floor(rnd() * (g.nx - 2)), j = 1 + Math.floor(rnd() * (g.ny - 2));
        let all = true;
        for (let dj = -1; dj <= 1 && all; dj++) for (let di = -1; di <= 1; di++) if (!g.inside[(j + dj) * g.nx + i + di]) { all = false; break; }
        if (!all) continue;
        const x = g.x0 + (i + rnd()) * g.cell, y = g.y0 - (j + rnd()) * g.cell;
        const z = heightAt(m, x, y);
        let lo = Infinity, hi = -Infinity;
        // The depth map within one grid step: a 5 × 5 pattern round the point plus the corners of its cell.
        const near: [number, number][] = [];
        for (const dx of [-1, -0.5, 0, 0.5, 1]) for (const dy of [-1, -0.5, 0, 0.5, 1]) near.push([x + dx * g.cell, y + dy * g.cell]);
        for (const [ci, cj] of [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]]) near.push([g.x0 + ci * g.cell, g.y0 - cj * g.cell]);
        for (const [qx, qy] of near) {
          const [ix, iy] = g.toImage(qx, qy);
          const v = g.heightOf(sampleDepth(d, ix, iy));
          lo = Math.min(lo, v); hi = Math.max(hi, v);
        }
        expect(z).toBeGreaterThanOrEqual(lo - 1e-3);
        expect(z).toBeLessThanOrEqual(hi + 1e-3);
        checked++;
      }
      expect(checked).toBe(150);
    }
  });

  it("a ragged subject mask still gives a closed solid (corner-only contacts are filled)", async () => {
    const wasm = await manifold();
    const rnd = mulberry32(7);
    const w = 80, h = 80;
    const data = new Float32Array(w * h).map(() => rnd());
    const g = reliefGrid({ w, h, data }, opts({ blur: 0.6, resolution: 80 }));
    const m = reliefMesh(g);
    expect(openEdgeCount(m)).toBe(0);
    const solid = tryManifold(wasm, m);
    expect(solid).not.toBeNull();
    solid!.delete();
  });

  it("auto mask keeps the subject, fills its holes and drops the background", () => {
    const d = portraitDepth();
    // An "eye": a deep hole inside the face.
    for (let y = 60; y < 66; y++) for (let x = 45; x < 52; x++) d.data[y * d.w + x] = 0.01;
    const m = autoMask(d);
    expect(m[72 * d.w + 60]).toBe(1);
    expect(m[62 * d.w + 48]).toBe(1);
    expect(m[2 * d.w + 2]).toBe(0);
    expect(m[(d.h - 3) * d.w + d.w - 3]).toBe(0);
  });

  it("depth maps: model input size and normalisation, output normalisation, file round trip", () => {
    expect(depthInputSize(1024, 768)).toEqual({ w: 518, h: 392 });
    expect(depthInputSize(768, 1024)).toEqual({ w: 392, h: 518 });
    const px = new Uint8ClampedArray([255, 0, 128, 255, 0, 255, 0, 255]);
    const t = depthInput(px, 2, 1);
    expect(t[0]).toBeCloseTo((1 - 0.485) / 0.229, 5);
    expect(t[2 + 1]).toBeCloseTo((1 - 0.456) / 0.224, 5);
    expect(t[4]).toBeCloseTo((128 / 255 - 0.406) / 0.225, 5);
    const raw = Float32Array.from({ length: 100 }, (_, i) => i * 3 + 7);
    const n = normaliseDepth(raw, 10, 10);
    expect(Math.min(...n.data)).toBe(0);
    expect(Math.max(...n.data)).toBe(1);
    expect(n.data[50]).toBeGreaterThan(0.45);
    const back = unpackDepth(packDepth(n));
    expect(back.w).toBe(10);
    expect(Array.from(back.data)).toEqual(Array.from(n.data));
    expect(() => unpackDepth(new ArrayBuffer(20))).toThrow(/damaged/);
  });

  it("a photo depth map slices into fins, with deviation and fidelity", async () => {
    const wasm = await manifold();
    const p = imageParams();
    const file = packDepth(portraitDepth());
    const src = await loadSource(p, file);
    expect(src.openEdges).toBe(0);
    const r = computeParametric(p, src, wasm, { deviation: true });
    expect(r.usesModel).toBe(true);
    expect(r.engine).toBe("manifold");
    expect(r.parts.filter(q => q.kind === "fin").length).toBeGreaterThan(10);
    const s = r.stats;
    expect(r.deviation!.values.length).toBe(2000);
    expect(s.meanDeviation!).toBeGreaterThan(0);
    expect(s.meanDeviation!).toBeLessThan(r.deviation!.spacing);
    expect(s.fidelity!).toBeCloseTo(Math.max(0, 1 - s.meanDeviation! / (2 * r.deviation!.spacing)), 9);
    await expect(loadSource(p)).rejects.toThrow(/depth map is missing/);
  });

  it("deviation: exact distances to a part prism, and the sphere's fins stay within one gap", async () => {
    const square: Part = {
      id: "P", kind: "fin", shape: { outer: [[0, 0], [10, 0], [10, 10], [0, 10]], holes: [[[4, 4], [4, 6], [6, 6], [6, 4]]], area: 96, bbox: { x0: 0, y0: 0, x1: 10, y1: 10 }, group: 0 },
      innerCuts: [], engrave: [], placement: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], plane: 0, neighbors: [],
    };
    const g = [partGeom(square)];
    expect(distanceToParts([2, 2, 0], g, 2)).toBe(0);
    expect(distanceToParts([2, 2, 3], g, 2)).toBeCloseTo(2, 12);
    expect(distanceToParts([15, 5, 0], g, 2)).toBeCloseTo(5, 12);
    expect(distanceToParts([5, 5, 0], g, 2)).toBeCloseTo(1, 12);
    expect(distanceToParts([13, 14, 1], g, 2)).toBeCloseTo(5, 12);

    const wasm = await manifold();
    const p = mergeParametricParams({ source: { kind: "library", id: "sphere", detail: 6 } });
    p.material.T = 3; p.material.K = 0;
    p.parallel.backboard = "none";
    p.quality.smoothing = 0;
    const src = await loadSource(p);
    const r = computeParametric(p, src, wasm, { deviation: true });
    const s = 2.5 * 3;
    expect(r.deviation!.spacing).toBe(s);
    // A point in the gap between two fins lies inside the section of the fin nearer the centre (the
    // sphere only shrinks outward), so it is at most the gap s − T from it (plus the chord tolerance).
    const pts = r.deviation!.points, vals = r.deviation!.values;
    const xs = r.planes.map(pl => pl.offset);
    const lo = Math.min(...xs), hi = Math.max(...xs);
    let inGaps = 0;
    for (let i = 0; i < vals.length; i++) {
      const x = pts[i * 3];
      if (x > lo && x < hi && pts[i * 3 + 2] > 1 && xs.every(f => Math.abs(x - f) > 1.5)) { expect(vals[i]).toBeLessThan(s - 3 + 0.15); inGaps++; }
    }
    expect(inGaps).toBeGreaterThan(400);
    expect(r.stats.meanDeviation!).toBeLessThan((s - 3) / 2);
    // Deterministic samples.
    expect(Array.from(sampleSurface(src.mesh, 5))).toEqual(Array.from(sampleSurface(src.mesh, 5)));
    expect(measureDeviation(r, src.mesh, p)!.mean).toBe(r.stats.meanDeviation);
  });
});
