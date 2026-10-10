import { beforeAll, describe, expect, it } from "vitest";
import { CAL_STRIP } from "@/lib/fit/calibration";
import { intersectShapes, offsetShapes, shapeContours, totalArea, unionShapes } from "@/lib/letters/polygon";
import { rotatePoint } from "@/lib/nest/outline";
import { mergeParametricParams } from "../defaults";
import { computeParametric, loadSource } from "../engine";
import { sheetSVG } from "../export";
import { nestSheets } from "../nest";
import { PARAMETRIC_PRESETS } from "../presets";
import { decimate, weld } from "../simplify";
import type { Contour, LibraryId, ParametricParams, SliceResult } from "../types";
import { crossings, manifold, rasterComponents } from "./helpers";

type Wasm = Awaited<ReturnType<typeof manifold>>;
let wasm: Wasm;
beforeAll(async () => { wasm = await manifold(); });

const folded = (id: LibraryId, faces: number, extra: Partial<ParametricParams> = {}): ParametricParams => {
  const d = mergeParametricParams();
  return mergeParametricParams({ ...extra, method: "folded", source: { kind: "library", id }, folded: { ...d.folded, faces }, material: { ...d.material, T: 0.3, K: 0, ...extra.material } });
};

/** Undirected edges used by exactly two triangles, every one of them. */
function closedManifold(tris: number[]) {
  const n = new Map<string, number>();
  for (let t = 0; t < tris.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = tris[t + k], b = tris[t + ((k + 1) % 3)];
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    n.set(key, (n.get(key) ?? 0) + 1);
  }
  return [...n.values()].every((c) => c === 2);
}

const triArea3 = (f: number[], i: number) => {
  const u = [f[i + 3] - f[i], f[i + 4] - f[i + 1], f[i + 5] - f[i + 2]];
  const v = [f[i + 6] - f[i], f[i + 7] - f[i + 1], f[i + 8] - f[i + 2]];
  return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
};

const segDist = (p: number[], a: number[], b: number[]) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};

/** Edges that cross each other clear of their ends (a corner resting on another edge does not count). */
function clearCrossings(cs: Contour[], tol = 1e-3): number {
  const e: [number[], number[]][] = [];
  for (const c of cs) for (let i = 0; i < c.length; i++) e.push([c[i], c[(i + 1) % c.length]]);
  let n = 0;
  for (let i = 0; i < e.length; i++) for (let j = i + 1; j < e.length; j++) {
    const [a, b] = e[i], [c, d] = e[j];
    if (crossings([[a as [number, number], b as [number, number]], [c as [number, number], d as [number, number]]]) === 0) continue;
    if (Math.min(segDist(a, c, d), segDist(b, c, d), segDist(c, a, b), segDist(d, a, b)) > tol) n++;
  }
  return n;
}

function onSheet(r: SliceResult, si: number) {
  return r.sheets[si].items.map((it) => {
    const part = r.parts.find((p) => p.id === it.partId)!;
    const cs: Contour[] = [part.shape.outer, ...part.shape.holes].map((c) => c.map((q) => { const [x, y] = rotatePoint(q, it.angle); return [x + it.x, y + it.y] as [number, number]; }));
    return { id: part.id, shapes: unionShapes(cs, [], true) };
  });
}

describe("decimate", () => {
  it("reaches the face count and stays a closed manifold", async () => {
    const p = folded("sphere", 80);
    const src = await loadSource(p);
    const welded = weld(src.mesh);
    expect(closedManifold(welded.tris)).toBe(true);
    for (const target of [200, 80, 40]) {
      const lp = decimate(welded, target);
      const n = lp.tris.length / 3;
      expect(n, `${target}`).toBeLessThanOrEqual(target);
      expect(n, `${target}`).toBeGreaterThanOrEqual(target - 4);
      expect(closedManifold(lp.tris), `${target}`).toBe(true);
    }
  });
});

describe("folded nets", () => {
  for (const [id, faces] of [["sphere", 80], ["torus", 200], ["abstract-head-cc0", 150]] as const) {
    it(`${id}: one piece per net, every face unfolded once, no overlaps on the sheets`, async () => {
      const p = folded(id, faces);
      const r = computeParametric(p, await loadSource(p), wasm);
     expect(r.parts.length).toBeGreaterThan(0);
      let n3 = 0;
      for (const part of r.parts) {
        expect(part.kind).toBe("net");
        expect(part.faces3d && part.faces3d.length % 9 === 0, part.id).toBe(true);
        n3 += part.faces3d!.length / 9;
        expect(clearCrossings([part.shape.outer, ...part.shape.holes]), part.id).toBe(0);
        expect(rasterComponents(part.shape, 4), part.id).toBe(1);
        // The flat net (with its tabs) has at least the area of the faces it folds into.
        let a3 = 0;
        for (let i = 0; i < part.faces3d!.length; i += 9) a3 += triArea3(part.faces3d!, i);
        expect(part.shape.area, part.id).toBeGreaterThanOrEqual(a3 * 0.999);
        expect(part.engrave.length, part.id).toBeGreaterThan(0);
      }
      expect(n3).toBeLessThanOrEqual(faces);
      expect(n3).toBeGreaterThanOrEqual(faces - 4);
      expect(r.parts.some((q) => (q.score?.length ?? 0) > 0)).toBe(true);
      for (let si = 0; si < r.sheets.length; si++) {
        const sh = r.sheets[si];
        const ps = onSheet(r, si);
        for (const q of ps) for (const c of shapeContours(q.shapes)) for (const [x, y] of c) {
          expect(x >= -1e-3 && y >= -1e-3 && x <= sh.width + 1e-3 && y <= sh.height + 1e-3, q.id).toBe(true);
        }
        const grown = ps.map((q) => ({ id: q.id, s: shapeContours(offsetShapes(q.shapes, 0.5)) }));
        for (let i = 0; i < grown.length; i++) for (let j = i + 1; j < grown.length; j++) {
          expect(totalArea(intersectShapes(grown[i].s, grown[j].s)), `${grown[i].id} × ${grown[j].id}`).toBeLessThan(1e-3);
        }
      }
      const svg = sheetSVG(r, 0, p);
      expect(svg).toMatch(/Score lines/);
      expect(svg).not.toMatch(/NaN|Infinity|undefined/);
    }, 30000);
  }

  it("numbers off and tabs off leave plain nets", async () => {
    const d = mergeParametricParams();
    const p = folded("sphere", 80);
    p.folded = { ...d.folded, faces: 80, tabs: false, numbers: false };
    p.labels = { ...p.labels, enabled: false };
    const plain = computeParametric(p, await loadSource(p), wasm);
    const full = computeParametric(folded("sphere", 80), await loadSource(p), wasm);
    expect(plain.parts.every((q) => q.engrave.length === 0)).toBe(true);
    const area = (r: SliceResult) => r.parts.reduce((a, q) => a + q.shape.area, 0);
    expect(area(plain)).toBeLessThan(area(full));
  }, 30000);

  it("the calibration bar gets its own strip on every sheet", async () => {
    const d = mergeParametricParams();
    const p = folded("sphere", 80, { material: { ...d.material, T: 0.3, K: 0, calibration: true } });
    const r = computeParametric(p, await loadSource(p), wasm);
    for (let si = 0; si < r.sheets.length; si++) {
      const sh = r.sheets[si];
      expect(sh.calibration).toBeTruthy();
      expect(sh.height).toBe(p.material.sheetH);
      for (const q of onSheet(r, si)) for (const c of shapeContours(q.shapes)) for (const [, y] of c) expect(y).toBeLessThanOrEqual(sh.height - CAL_STRIP + 1e-3);
    }
    const svg = sheetSVG(r, 0, p);
    expect(svg).toMatch(/Score lines/);
  }, 30000);

  it("the folded presets build", async () => {
    const ids = PARAMETRIC_PRESETS.filter((pr) => pr.params.method === "folded").map((pr) => pr.id);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    for (const pr of PARAMETRIC_PRESETS.filter((q) => q.params.method === "folded")) {
      const p = mergeParametricParams(pr.params);
      const r = computeParametric(p, await loadSource(p), wasm);
     expect(r.parts.length, pr.id).toBeGreaterThan(0);
      expect(r.warnings.filter((w) => w.code === "PART_TOO_BIG"), pr.id).toEqual([]);
    }
  }, 60000);
});

describe("calibration strip with box nesting", () => {
  it("defaults leave nesting unchanged and the strip stays clear", () => {
    const m = mergeParametricParams().material;
    const parts = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, outline: [[[0, 0], [90, 0], [90, 60], [0, 60]] as Contour], area: 5400 }));
    const plain = nestSheets(parts, m);
    expect(plain.sheets.every((s) => !s.calibration)).toBe(true);
    const cal = nestSheets(parts, { ...m, calibration: true });
    for (const s of cal.sheets) {
      expect(s.calibration).toBeTruthy();
      expect(s.height).toBe(m.sheetH);
      for (const it of s.items) for (const q of parts[0].outline[0]) expect(rotatePoint(q, it.angle)[1] + it.y).toBeLessThanOrEqual(s.height - CAL_STRIP + 1e-6);
    }
  });
});
