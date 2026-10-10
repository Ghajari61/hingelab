import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { pointInContour, pointInShape, signedArea } from "@/lib/letters/polygon";
import { LEAF_CLOCK, mergeParametricParams } from "../defaults";
import { computeParametric, loadSource } from "../engine";
import { assemblyGuideSVG, exportZip, sheetSVG } from "../export";
import { boundaryPolygon } from "../methods/curveNormal";
import { radialBasis } from "../methods/radial";
import { revolution } from "../source/library";
import { prepareMesh } from "../source/mesh";
import type { Contour, ParametricParams, Part, Point, SliceResult, Vec3 } from "../types";
import { crossings, manifold, rasterComponents } from "./helpers";

const base = (): ParametricParams => {
  const p = mergeParametricParams({ source: { kind: "library", id: "sphere", detail: 6 } });
  p.material.K = 0;
  p.material.T = 3;
  p.quality.smoothing = 0;
  return p;
};

const toModel = (r: SliceResult, part: Part, [x, y]: Point): Vec3 => {
  const pl = r.planes[part.plane];
  return [0, 1, 2].map(k => pl.u[k] * x + pl.w[k] * y + pl.normal[k] * pl.offset) as Vec3;
};
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function checkInvariants(r: SliceResult) {
  for (const part of r.parts) {
    const { outer, holes } = part.shape;
    expect(signedArea(outer), part.id).toBeGreaterThan(0);
    for (const h of holes) {
      expect(signedArea(h)).toBeLessThan(0);
      expect(h.every(q => pointInContour(q, outer))).toBe(true);
    }
    for (const c of part.innerCuts) expect(c.every(q => pointInContour(q, outer)), part.id).toBe(true);
    expect(crossings([outer, ...holes]), part.id).toBe(0);
    expect(rasterComponents(part.shape, 10), part.id).toBe(1);
    for (const v of part.placement) expect(Number.isFinite(v)).toBe(true);
  }
  expect(new Set(r.parts.map(q => q.id)).size).toBe(r.parts.length);
}

const cylinderParams = () => {
  const p = base();
  p.method = "radial";
  p.radial.axis = "Y";
  p.radial.count = 24;
  p.radial.innerRadius = 20;
  p.radial.hubPlates = 2;
  return p;
};
const cylinder = (p: ParametricParams) => prepareMesh(revolution(() => 80, 120, 8, 96), p.sourceSettings, { units: "mm", upAxis: "Y", anchor: "centre" });

const ellipseParams = () => {
  const p = base();
  p.method = "curveNormal";
  Object.assign(p.curveNormal, { guide: { kind: "ellipse", w: 120, h: 70 }, count: 48, finLength: "60", finHeight: "20", twist: "0", outerBoundary: { kind: "none" }, backPlate: true, centerFeature: "clock-insert", clockInsertDia: 60 });
  return p;
};

const outlines = (r: SliceResult) =>
  JSON.stringify(r.parts.map(q => ({ id: q.id, outer: q.shape.outer.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]), inner: q.innerCuts.length })), null, 0).replace(/\},\{/g, "},\n{");

describe("parametric radial + along a curve", () => {
  it("cylinder radial: every fin is a 60 × 120 rectangle plus its hub tabs, 15° apart, no hub collision", async () => {
    const wasm = await manifold();
    const p = cylinderParams();
    const src = await cylinder(p);
    expect(src.openEdges).toBe(0);
    const r = computeParametric(p, src, wasm);
    expect(r.engine).toBe("manifold");
    const fins = r.parts.filter(q => q.kind === "radial-fin"), hubs = r.parts.filter(q => q.kind === "hub");
    expect(fins.map(q => q.id)).toEqual(Array.from({ length: 24 }, (_, i) => `R${String(i + 1).padStart(2, "0")}`));
    expect(hubs).toHaveLength(2);
    expect(r.warnings.some(w => w.code === "FINS_COLLIDE_AT_HUB")).toBe(false);

    const T = p.material.T;
    for (const f of fins) {
      const xa = dot(r.planes[f.plane].u, [0, 0, 0]);
      const { bbox } = f.shape;
      expect(bbox.x0 - xa).toBeCloseTo(20, 3);
      expect(bbox.x1 - xa).toBeCloseTo(80, 3);
      expect(bbox.y0).toBeCloseTo(-60 - T, 3);
      expect(bbox.y1).toBeCloseTo(60 + T, 3);
      const tabArea = 2 * (f.tabs![0][1] - f.tabs![0][0]) * T;
      expect(Math.abs(f.shape.area - tabArea - 60 * 120)).toBeLessThan(0.05);
    }
    // Exactly 15° between neighbouring fin planes, measured round the axis.
    const { e1, e2 } = radialBasis("Y");
    const ang = fins.map(f => { const u = r.planes[f.plane].u; return Math.atan2(dot(u, e2), dot(u, e1)); });
    for (let i = 1; i < ang.length; i++) {
      let d = ((ang[i] - ang[i - 1]) * 180) / Math.PI;
      if (d < 0) d += 360;
      expect(Math.abs(d - 15)).toBeLessThan(1e-9);
    }
    // Every tab lands in exactly one slot of each hub, of the slot's length.
    for (const hub of hubs) {
      const hp = r.planes[hub.plane];
      expect(hub.innerCuts).toHaveLength(24);
      for (const f of fins) {
        const [a, b] = f.tabs![0];
        const yTab = hp.offset < 0 ? -60 - T / 2 : 60 + T / 2;
        const P = toModel(r, f, [(a + b) / 2, yTab]);
        const local: Point = [dot(hp.u, P), dot(hp.w, P)];
        const hits = hub.innerCuts.filter(c => pointInContour(local, c));
        expect(hits, `${f.id} in ${hub.id}`).toHaveLength(1);
        const slot = hits[0];
        expect(Math.hypot(slot[1][0] - slot[0][0], slot[1][1] - slot[0][1])).toBeCloseTo(b - a, 9);
        expect(Math.hypot(slot[3][0] - slot[0][0], slot[3][1] - slot[0][1])).toBeCloseTo(T + p.joints.slotClearance, 9);
      }
    }
    checkInvariants(r);
  });

  it("a set number of tabs: three hub tabs per fin on a wide hub, each in its own slot; four tabs per fin along a curve", async () => {
    const wasm = await manifold();
    const p = cylinderParams();
    p.radial.hubWidth = 50;
    p.joints.tabCount = 3;
    const r = computeParametric(p, await cylinder(p), wasm);
    const T = p.material.T;
    const fins = r.parts.filter(q => q.kind === "radial-fin"), hubs = r.parts.filter(q => q.kind === "hub");
    expect(fins).toHaveLength(24);
    for (const hub of hubs) {
      expect(hub.innerCuts).toHaveLength(72);
      const hp = r.planes[hub.plane];
      for (const f of fins) {
        expect(f.tabs).toHaveLength(3);
        for (const [a, b] of f.tabs!) {
          expect(pointInShape([(a + b) / 2, hp.offset < 0 ? -60 - T / 2 : 60 + T / 2], f.shape), `${f.id} keeps its tab`).toBe(true);
          const P = toModel(r, f, [(a + b) / 2, hp.offset < 0 ? -60 - T / 2 : 60 + T / 2]);
          expect(hub.innerCuts.filter(c => pointInContour([dot(hp.u, P), dot(hp.w, P)], c)), `${f.id} in ${hub.id}`).toHaveLength(1);
        }
      }
    }
    checkInvariants(r);

    const c = ellipseParams();
    c.joints.tabCount = 4;
    const rc = computeParametric(c, await loadSource(c), wasm);
    const cf = rc.parts.filter(q => q.kind === "fin");
    expect(cf.every(f => f.tabs!.length === 4)).toBe(true);
    expect(rc.parts.find(q => q.kind === "backboard")!.innerCuts).toHaveLength(48 * 4 + 1);
    checkInvariants(rc);
  });

  it("hub collision: 80 fins round a 20 mm hub report FINS_COLLIDE_AT_HUB with maxCount 31", async () => {
    const wasm = await manifold();
    const p = cylinderParams();
    p.radial.count = 80;
    const r = computeParametric(p, await cylinder(p), wasm);
    const w = r.warnings.find(x => x.code === "FINS_COLLIDE_AT_HUB");
    expect(w?.data?.maxCount).toBe(Math.floor((2 * Math.PI * 20) / (p.material.T + 1)));
    expect(w?.data?.maxCount).toBe(31);
    expect(w?.message).toContain("at most 31 fins");
    expect(w!.data!.minRadius).toBeCloseTo((80 * 4) / (2 * Math.PI), 9);
  });

  it("radial-profile formula: fins built straight from f(theta, s) match fins sliced from its mesh", async () => {
    const wasm = await manifold();
    const p = base();
    p.source = { kind: "formula", type: "radial-profile", expression: "10 + s/4", domain: { x: [20, 100], y: [0, 0] }, height: 0, variables: {}, resolution: 96, base: 3 };
    p.method = "radial";
    Object.assign(p.radial, { axis: "Z", count: 12, innerRadius: 20, hubPlates: 0, profileSource: "formula", axisPoint: [0, 0, 0] });
    const src = await loadSource(p);
    const direct = computeParametric(p, src, wasm);
    expect(direct.usesModel).toBe(false);
    p.radial.profileSource = "mesh";
    const sliced = computeParametric(p, src, wasm);
    expect(sliced.usesModel).toBe(true);
    expect(direct.parts).toHaveLength(12);
    expect(sliced.parts).toHaveLength(12);
    direct.parts.forEach((f, i) => {
      const xa = 0;
      for (const [x, y] of f.shape.outer) {
        if (y < 1 || x < xa + 21 || x > xa + 99) continue;
        expect(Math.abs(y - (10 + (x - 20) / 4)), f.id).toBeLessThan(0.11);
      }
      expect(Math.abs(f.shape.area - sliced.parts[i].shape.area)).toBeLessThan(0.01 * f.shape.area);
    });
    checkInvariants(direct);
  });

  it("ellipse curveNormal: fins square to the ellipse within 0.01°, no crossings, slots on the footprints within 1e-6 mm", async () => {
    const wasm = await manifold();
    const p = ellipseParams();
    const r = computeParametric(p, await loadSource(p), wasm);
    expect(r.usesModel).toBe(false);
    const fins = r.parts.filter(q => q.kind === "fin");
    const plate = r.parts.find(q => q.kind === "backboard")!;
    expect(fins).toHaveLength(48);
    expect(r.warnings.some(w => w.code === "FINS_COLLIDE")).toBe(false);
    const rx = 60, ry = 35, T = p.material.T;
    const feet: [Point, Point][] = [];
    let si = 0;
    for (const f of fins) {
      const pl = r.planes[f.plane];
      const g0 = toModel(r, f, [f.shape.bbox.x0, 0]);
      expect(Math.abs(g0[2])).toBeLessThan(1e-9);
      // Outlines sit on the 0.001 mm grid: slide the start point along the fin onto the ellipse.
      const A2 = (pl.u[0] / rx) ** 2 + (pl.u[1] / ry) ** 2;
      const B2 = 2 * ((g0[0] * pl.u[0]) / rx ** 2 + (g0[1] * pl.u[1]) / ry ** 2);
      const C2 = (g0[0] / rx) ** 2 + (g0[1] / ry) ** 2 - 1;
      const disc = Math.sqrt(B2 * B2 - 4 * A2 * C2);
      const shift = [(-B2 + disc) / (2 * A2), (-B2 - disc) / (2 * A2)].reduce((a, b) => (Math.abs(a) < Math.abs(b) ? a : b));
      expect(Math.abs(shift), f.id).toBeLessThan(0.001);
      const g = [g0[0] + pl.u[0] * shift, g0[1] + pl.u[1] * shift];
      const nx = g[0] / (rx * rx), ny = g[1] / (ry * ry), nl = Math.hypot(nx, ny);
      const angle = (Math.acos(Math.min(1, (pl.u[0] * nx + pl.u[1] * ny) / nl)) * 180) / Math.PI;
      expect(angle, f.id).toBeLessThan(0.01);
      expect(f.shape.bbox.x1 - f.shape.bbox.x0).toBeCloseTo(60, 6);
      expect(f.shape.bbox.y1).toBeCloseTo(20, 6);
      feet.push([[g[0], g[1]], [g[0] + pl.u[0] * 60, g[1] + pl.u[1] * 60]]);
      for (const [a, b] of f.tabs!) {
        const slot = plate.innerCuts[si++];
        const A = toModel(r, f, [a, 0]), B = toModel(r, f, [b, 0]);
        const m0: Point = [(slot[0][0] + slot[3][0]) / 2, (slot[0][1] + slot[3][1]) / 2], m1: Point = [(slot[1][0] + slot[2][0]) / 2, (slot[1][1] + slot[2][1]) / 2];
        expect(Math.hypot(m0[0] - A[0], m0[1] - A[1])).toBeLessThan(1e-6);
        expect(Math.hypot(m1[0] - B[0], m1[1] - B[1])).toBeLessThan(1e-6);
        expect(Math.hypot(slot[3][0] - slot[0][0], slot[3][1] - slot[0][1])).toBeCloseTo(T + p.joints.slotClearance, 9);
      }
    }
    expect(si).toBe(plate.innerCuts.length - 1);
    // The clock insert hole: 60 mm + 0.2 press fit.
    const hole = plate.innerCuts.at(-1)!;
    expect(2 * Math.sqrt(Math.abs(signedArea(hole)) / Math.PI)).toBeCloseTo(60.2, 1);
    // No two footprints come closer than T.
    const segDist = (p0: Point, a: Point, b: Point) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p0[0] - a[0]) * dx + (p0[1] - a[1]) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(p0[0] - a[0] - t * dx, p0[1] - a[1] - t * dy);
    };
    for (let i = 0; i < feet.length; i++) for (let j = i + 1; j < feet.length; j++) {
      let d = Infinity;
      for (let k = 0; k <= 60; k++) { const q: Point = [feet[i][0][0] + ((feet[i][1][0] - feet[i][0][0]) * k) / 60, feet[i][0][1] + ((feet[i][1][1] - feet[i][0][1]) * k) / 60]; d = Math.min(d, segDist(q, feet[j][0], feet[j][1])); }
      expect(d).toBeGreaterThan(T);
    }
    checkInvariants(r);
  });

  it("curveNormal reports fins that touch at the guide, and the leaf clock ends every fin on its outline", async () => {
    const wasm = await manifold();
    const p = ellipseParams();
    p.curveNormal.count = 200;
    const crowded = computeParametric(p, await loadSource(p), wasm);
    expect(crowded.warnings.some(w => w.code === "FINS_COLLIDE")).toBe(true);

    const leaf = base();
    leaf.method = "curveNormal";
    leaf.curveNormal = structuredClone(LEAF_CLOCK);
    const r = computeParametric(leaf, await loadSource(leaf), wasm);
    const outline = boundaryPolygon(LEAF_CLOCK.outerBoundary)!;
    const fins = r.parts.filter(q => q.kind === "fin");
    expect(fins.length).toBeGreaterThan(40);
    for (const f of fins) {
      // The fin's wall edge is where its plane meets z = 0 (twisted fins lean, so that is not local y = 0).
      const pl = r.planes[f.plane];
      const end = toModel(r, f, [f.shape.bbox.x1, (-pl.normal[2] * pl.offset) / pl.w[2]]);
      expect(Math.abs(end[2])).toBeLessThan(1e-9);
      let d = Infinity;
      for (let i = 0; i < outline.length; i++) {
        const a = outline[i], b = outline[(i + 1) % outline.length];
        const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((end[0] - a[0]) * dx + (end[1] - a[1]) * dy) / (dx * dx + dy * dy)));
        d = Math.min(d, Math.hypot(end[0] - a[0] - t * dx, end[1] - a[1] - t * dy));
      }
      expect(d, f.id).toBeLessThan(2);
    }
    const plate = r.parts.find(q => q.kind === "backboard")!;
    expect(Math.abs(plate.shape.area - Math.abs(signedArea(outline)))).toBeLessThan(1);
    checkInvariants(r);
  });

  it("exports sheets, the assembly guide and the ZIP for both methods", async () => {
    const wasm = await manifold();
    const cp = cylinderParams();
    const ep = ellipseParams();
    for (const [p, r] of [[cp, computeParametric(cp, await cylinder(cp), wasm)], [ep, computeParametric(ep, await loadSource(ep), wasm)]] as const) {
      const guide = assemblyGuideSVG(r, p);
      expect(guide).not.toMatch(/NaN|Infinity|undefined/);
      expect(guide).toContain(p.method === "radial" ? "radial fins" : "fins along a curve");
      for (let i = 0; i < r.sheets.length; i++) expect(sheetSVG(r, i, p)).not.toMatch(/NaN|Infinity|undefined/);
      expect(Object.keys(unzipSync(exportZip(r, p)))).toContain("assembly-guide.svg");
    }
  });

  it("regression: part outlines of the analytic cases", async () => {
    const wasm = await manifold();
    const cp = cylinderParams();
    await expect(outlines(computeParametric(cp, await cylinder(cp), wasm))).toMatchFileSnapshot("./__snapshots__/cylinder-radial.json");
    const ep = ellipseParams();
    await expect(outlines(computeParametric(ep, await loadSource(ep), wasm))).toMatchFileSnapshot("./__snapshots__/ellipse-curve-normal.json");
  });
});

export type { Contour };
