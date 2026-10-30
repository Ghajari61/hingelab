import { describe, expect, it } from "vitest";
import { createDocument } from "../doc";
import { dimensionDrawing, dimensionText, segmentAt } from "../dimension";
import { bSpline } from "../drawTools";
import { applyBlockShadow, applyDepth } from "../effects/shadow";
import { EFFECTS } from "../effects";
import { roundedRoute } from "../connectors";
import { flatten, polygonArea, shapeForBox, shapePaths, subpathsBox } from "../geom";
import { SHAPE_LIBRARY, burstPaths, crossedStar } from "../shapeLibrary";
import { tweakSubpaths } from "../tweak";
import type { Document, SceneNode, Subpath } from "../types";

const area = (subs: Subpath[]) => subs.filter((s) => s.closed).reduce((a, s) => a + Math.abs(polygonArea(flatten(s, 0.05))), 0);
const sq = (s: number): Subpath[] => [{ closed: true, nodes: [{ x: 0, y: 0 }, { x: s, y: 0 }, { x: s, y: s }, { x: 0, y: s }] }];

describe("Shape Library, Burst Lines and crossed stars", () => {
  it("every library shape draws inside its box, with area", () => {
    for (const s of SHAPE_LIBRARY) {
      const subs = shapePaths({ kind: "library", id: s.id, w: 60, h: 40 });
      expect(subs.length, s.id).toBeGreaterThan(0);
      const b = subpathsBox(subs);
      expect(b.maxX - b.minX, s.id).toBeLessThanOrEqual(60.5);
      expect(b.maxY - b.minY, s.id).toBeLessThanOrEqual(40.5);
      expect(area(subs), s.id).toBeGreaterThan(60 * 40 * 0.15);
    }
    expect(new Set(SHAPE_LIBRARY.map((s) => s.group))).toEqual(new Set(["Basic", "Arrows", "Flowchart", "Banners", "Callouts"]));
    expect(shapeForBox("library", 30, 20)).toMatchObject({ kind: "library", w: 30, h: 20 });
  });
  it("burst lines: one ray per count, between the radii", () => {
    const rays = burstPaths(24, 50, 25, 0.5, 0.3, 7);
    expect(rays).toHaveLength(24);
    for (const r of rays) for (const p of r.nodes) expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(50.01);
    expect(JSON.stringify(burstPaths(24, 50, 25, 0.5, 0.3, 7))).toBe(JSON.stringify(rays));
  });
  it("crossed stars: {7/3} is one loop, {6/2} two triangles; the star shape switches over", () => {
    expect(crossedStar(7, 3, 20)).toHaveLength(1);
    expect(crossedStar(6, 2, 20)).toHaveLength(2);
    expect(shapePaths({ kind: "star", points: 5, r: 20, inner: 0.5, round: 0, skip: 2 })[0].nodes).toHaveLength(5);
    expect(shapePaths({ kind: "star", points: 5, r: 20, inner: 0.5, round: 0 })[0].nodes).toHaveLength(10);
  });
});

describe("Spline, Smooth brush, rounded connectors", () => {
  it("a B-spline starts and ends on its end points and stays inside its control polygon", () => {
    const ctrl = [{ x: 0, y: 0 }, { x: 10, y: 20 }, { x: 30, y: 20 }, { x: 40, y: 0 }];
    const s = bSpline(ctrl, false);
    expect(s.nodes[0]).toMatchObject({ x: 0, y: 0 });
    expect(s.nodes.at(-1)).toMatchObject({ x: 40, y: 0 });
    const b = subpathsBox([s]);
    expect(b.maxY).toBeLessThan(20);
    const closed = bSpline(ctrl, true);
    expect(closed.closed).toBe(true);
    expect(closed.nodes).toHaveLength(4);
  });
  it("the Smooth brush evens out a spike", () => {
    const zig: Subpath = { closed: false, nodes: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 8 }, { x: 15, y: 0 }, { x: 20, y: 0 }] };
    const r = tweakSubpaths([zig], "smooth", { c: { x: 10, y: 4 }, r: 12, force: 100, delta: { x: 0, y: 0 }, invert: false, fidelity: 50, rnd: Math.random });
    expect(r.changed).toBe(true);
    expect(r.subs[0].nodes[2].y).toBeLessThan(8);
    expect(r.subs[0].nodes[0]).toMatchObject({ x: 0, y: 0 });
  });
  it("rounded routes keep their ends and round each bend", () => {
    const s = roundedRoute([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }], 4);
    expect(s.nodes[0]).toMatchObject({ x: 0, y: 0 });
    expect(s.nodes.at(-1)).toMatchObject({ x: 20, y: 20 });
    expect(s.nodes).toHaveLength(4);
    expect(s.nodes[1].o).toBeTruthy();
  });
});

describe("Block Shadow and Depth", () => {
  it("block shadow: separate gives the shape plus a shadow piece; fused one bigger outline", () => {
    const sep = applyBlockShadow(sq(10), { angle: 45, depth: 3, output: "separate" });
    expect(sep.length).toBeGreaterThanOrEqual(2);
    const fused = applyBlockShadow(sq(10), { angle: 45, depth: 3, output: "fused" });
    expect(fused).toHaveLength(1);
    const b = subpathsBox(fused);
    expect(b.maxX).toBeCloseTo(10 + 3 * Math.SQRT1_2, 1);
    expect(area(fused)).toBeGreaterThan(100);
    const sh = applyBlockShadow(sq(10), { angle: 45, depth: 3, output: "shadow" });
    expect(area(sh) + 100).toBeCloseTo(area(fused), 0);
    // a frame keeps its window where the shadow does not reach
    const frame: Subpath[] = [...sq(30), { closed: true, nodes: [{ x: 5, y: 5 }, { x: 5, y: 25 }, { x: 25, y: 25 }, { x: 25, y: 5 }] }];
    const f = applyBlockShadow(frame, { angle: 0, depth: 2, output: "fused" });
    expect(f.length).toBe(2);
    const areas = f.map((q) => Math.abs(polygonArea(flatten(q, 0.05)))).sort((a, b) => a - b);
    expect(areas[0]).toBeCloseTo(18 * 20, 0);
    expect(areas[1]).toBeCloseTo(32 * 30, 0);
  });
  it("depth draws the back face and side edges as open lines; hidden lines are dropped", () => {
    const all = applyDepth(sq(10), { angle: -45, depth: 6, scale: 1, hidden: false });
    const open = all.filter((s) => !s.closed);
    expect(open.length).toBeGreaterThanOrEqual(5);
    const hid = applyDepth(sq(10), { angle: -45, depth: 6, scale: 1, hidden: true }).filter((s) => !s.closed);
    const len = (ss: Subpath[]) => ss.reduce((a, s) => a + flatten(s, 0.05).reduce((k, p, i, arr) => (i ? k + Math.hypot(p.x - arr[i - 1].x, p.y - arr[i - 1].y) : 0), 0), 0);
    expect(len(hid)).toBeLessThan(len(open));
    expect(EFFECTS.depth.defaults(sq(10)).depth).toBeGreaterThan(0);
  });
});

describe("Segment dimension and callouts", () => {
  it("a click on a segment finds its end nodes", () => {
    const d: Document = createDocument({ name: "T", id: "doc", now: "2026-01-01T00:00:00.000Z", sheet: { w: 300, h: 200 } });
    const n: SceneNode = { id: "p", type: "path", transform: [1, 0, 0, 1, 10, 10], layer: 0, subpaths: sq(20) };
    d.root.children.push(n);
    const seg = segmentAt(d, { x: 20, y: 10.5 }, 2)!;
    expect(seg.map((p) => [p.x, p.y])).toEqual([[10, 10], [30, 10]]);
    expect(segmentAt(d, { x: 100, y: 100 }, 2)).toBeNull();
  });
  it("a callout has a leader with an arrow and its note level at the end", () => {
    const g = dimensionDrawing({ kind: "callout", points: [{ x: 0, y: 0 }, { x: 10, y: -10 }, { x: 25, y: -10 }], offset: 0 })!;
    expect(g.arrows).toHaveLength(1);
    expect(g.label.anchor).toBe("start");
    expect(dimensionText(g, "mm")).toBe("Note");
    expect(dimensionText(g, "mm", "Drill here")).toBe("Drill here");
  });
});
