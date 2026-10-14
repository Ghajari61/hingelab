import { describe, expect, it } from "vitest";
import { createDocument } from "../doc";
import { recognise, threePointCurve, threePointEllipse, threePointRect, type PlacedShape } from "../drawTools";
import { cubicAt, flatten, nodePaths, polygonArea, segments, shapePaths, transformSubpaths } from "../geom";
import { locate } from "../scene";
import { cropToBox, deleteVirtualSegment, subpathPiece, virtualSegmentAt } from "../toolOps";
import { nodeShift, type TweakBrush } from "../tweak";
import { alignSelected, extractSubpaths, type MSub } from "../nodeOps";
import { contourNodes, createBoundary } from "../pathfinder";
import { EFFECTS } from "../effects";
import { applyDistort } from "../effects/distort";
import type { DistortParams, Document, PathNode, SceneNode, Vec } from "../types";

let seq = 0;
const id = () => `d${++seq}`;
const close = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const box = (pts: Vec[]) => ({
  minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)),
  minY: Math.min(...pts.map((p) => p.y)), maxY: Math.max(...pts.map((p) => p.y)),
});
const worldPts = (p: PlacedShape) => transformSubpaths(shapePaths(p.shape), p.transform).flatMap((s) => flatten(s, 0.001));
const path = (closed: boolean, pts: [number, number][]): PathNode => ({
  id: id(), type: "path", transform: [1, 0, 0, 1, 0, 0], layer: 0, subpaths: [{ closed, nodes: pts.map(([x, y]) => ({ x, y })) }],
});
const docWith = (...nodes: SceneNode[]): Document => {
  const d = createDocument({ name: "T", id: "doc", now: "2026-01-01T00:00:00.000Z", sheet: { w: 300, h: 200 } });
  d.root.children.push(...nodes);
  return d;
};
const areaOf = (d: Document, nid: string) => {
  const l = locate(d.root, nid)!;
  return Math.abs(transformSubpaths(nodePaths(l.node), l.world).reduce((a, s) => a + (s.closed ? polygonArea(flatten(s, 0.001)) : 0), 0));
};

/** A hand-drawn-looking stroke: points every `step` mm along the polyline with a small deterministic wobble. */
function stroke(corners: Vec[], step = 0.5, wobble = 0.15): Vec[] {
  const out: Vec[] = [];
  let k = 0;
  for (let i = 0; i < corners.length - 1; i++) {
    const a = corners[i], b = corners[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.round(len / step));
    for (let j = i ? 1 : 0; j <= n; j++) {
      const t = j / n, w = Math.sin(++k * 1.7) * wobble;
      out.push({ x: a.x + (b.x - a.x) * t + w, y: a.y + (b.y - a.y) * t - w });
    }
  }
  return out;
}
const circleStroke = (cx: number, cy: number, rx: number, ry: number, n = 120) =>
  Array.from({ length: n + 1 }, (_, k) => ({ x: cx + rx * Math.cos((2 * Math.PI * k) / n) + Math.sin(k * 2.3) * 0.1, y: cy + ry * Math.sin((2 * Math.PI * k) / n) }));
const opts = { tol: 1, smooth: 0.5 };

describe("3-point tools", () => {
  it("3-point rectangle: the first side, then the height on either side", () => {
    const r = threePointRect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 4 })!;
    expect(r.shape).toMatchObject({ kind: "rect", w: 10, h: 4 });
    const b = box(worldPts(r));
    close(b.minX, 0, 1e-6); close(b.maxX, 10, 1e-6); close(b.minY, 0, 1e-6); close(b.maxY, 4, 1e-6);
    // A side drawn straight down with the height to its right on screen (−x).
    const v = box(worldPts(threePointRect({ x: 0, y: 0 }, { x: 0, y: 10 }, { x: -3, y: 5 })!));
    close(v.minX, -3, 1e-6); close(v.maxX, 0, 1e-6); close(v.minY, 0, 1e-6); close(v.maxY, 10, 1e-6);
    expect(threePointRect({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 3, y: 3 })).toBeNull();
  });

  it("3-point rectangle at an angle keeps its side length and height", () => {
    const a = { x: 2, y: 3 }, b = { x: 2 + 6 * Math.cos(0.5), y: 3 + 6 * Math.sin(0.5) };
    const c = { x: b.x - 2 * Math.sin(0.5), y: b.y + 2 * Math.cos(0.5) };
    const r = threePointRect(a, b, c)!;
    expect(r.shape).toMatchObject({ kind: "rect" });
    close((r.shape as { w: number }).w, 6, 1e-9);
    close((r.shape as { h: number }).h, 2, 1e-9);
    const pts = worldPts(r);
    expect(pts.some((p) => Math.hypot(p.x - a.x, p.y - a.y) < 1e-6)).toBe(true);
    expect(pts.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < 1e-6)).toBe(true);
  });

  it("3-point ellipse: one axis, then the other radius", () => {
    const e = threePointEllipse({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 7, y: -3 })!;
    expect(e.shape).toMatchObject({ kind: "ellipse", rx: 5, ry: 3 });
    const b = box(worldPts(e));
    close(b.minX, 0, 1e-3); close(b.maxX, 10, 1e-3); close(b.minY, -3, 1e-3); close(b.maxY, 3, 1e-3);
  });

  it("3-point curve passes through the third point", () => {
    const s = threePointCurve({ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 8, y: 6 });
    const g = segments(s)[0];
    const m = cubicAt(g, 0.5);
    close(m.x, 8, 1e-9); close(m.y, 6, 1e-9);
    expect(s.nodes[0]).toMatchObject({ x: 0, y: 0 });
    expect(s.nodes[1]).toMatchObject({ x: 20, y: 0 });
  });
});

describe("Smart Drawing", () => {
  it("a shaky straight stroke becomes a line", () => {
    const r = recognise(stroke([{ x: 0, y: 0 }, { x: 40, y: 10 }]), opts)!;
    expect(r.kind).toBe("line");
    if ("sub" in r) expect(r.sub.nodes).toHaveLength(2);
  });

  it("corners become a polyline, a bend stays a curve", () => {
    const l = recognise(stroke([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }]), opts)!;
    expect(l.kind).toBe("polyline");
    if ("sub" in l) expect(l.sub.nodes).toHaveLength(3);
    const arc = Array.from({ length: 80 }, (_, k) => ({ x: 20 * Math.cos((Math.PI * k) / 79), y: -20 * Math.sin((Math.PI * k) / 79) }));
    expect(recognise(arc, opts)!.kind).toBe("curve");
  });

  it("a closed box becomes a live rectangle, level or turned", () => {
    const r = recognise(stroke([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 20 }, { x: 0, y: 20 }, { x: 0, y: 0 }]), opts)!;
    expect(r.kind).toBe("rect");
    if (!("placed" in r)) throw new Error("expected a shape");
    const sh = r.placed.shape as { w: number; h: number };
    close(sh.w, 40, 0.6); close(sh.h, 20, 0.6);
    expect(r.placed.transform.slice(0, 4)).toEqual([1, 0, 0, 1]);

    const t = (x: number, y: number) => ({ x: x * Math.cos(0.5) - y * Math.sin(0.5), y: x * Math.sin(0.5) + y * Math.cos(0.5) });
    const turned = recognise(stroke([t(0, 0), t(40, 0), t(40, 20), t(0, 20), t(0, 0)]), opts)!;
    expect(turned.kind).toBe("rect");
    if (!("placed" in turned)) throw new Error("expected a shape");
    const m = turned.placed.transform;
    const deg = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
    close(((deg % 90) + 90) % 90, 28.65, 2);
  });

  it("round strokes become circles and ellipses, three corners a triangle", () => {
    const c = recognise(circleStroke(50, 50, 15, 15), opts)!;
    expect(c).toMatchObject({ kind: "ellipse", name: "Circle" });
    if ("placed" in c) close((c.placed.shape as { rx: number }).rx, 15, 0.5);
    const e = recognise(circleStroke(0, 0, 30, 12), opts)!;
    expect(e).toMatchObject({ kind: "ellipse", name: "Ellipse" });
    if ("placed" in e) { close((e.placed.shape as { rx: number }).rx, 30, 0.6); close((e.placed.shape as { ry: number }).ry, 12, 0.6); }
    const tri = recognise(stroke([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 20, y: 30 }, { x: 0, y: 0 }]), opts)!;
    expect(tri.kind).toBe("triangle");
    if ("sub" in tri) { expect(tri.sub.closed).toBe(true); expect(tri.sub.nodes).toHaveLength(3); }
  });

  it("ignores a stroke smaller than the tolerance", () => {
    expect(recognise([{ x: 0, y: 0 }, { x: 0.2, y: 0.1 }], opts)).toBeNull();
  });
});

describe("Crop", () => {
  it("keeps what is inside, clips what crosses, deletes what is outside", () => {
    const inside = path(true, [[10, 10], [20, 10], [20, 20], [10, 20]]);
    const across = path(true, [[40, 10], [80, 10], [80, 30], [40, 30]]);
    const outside = path(true, [[200, 10], [210, 10], [210, 20], [200, 20]]);
    const line = path(false, [[0, 50], [100, 50]]);
    const d = docWith(inside, across, outside, line);
    const before = JSON.stringify(inside);
    const changed = cropToBox(d, null, { minX: 0, minY: 0, maxX: 60, maxY: 60 });
    expect(changed.sort()).toEqual([across.id, line.id, outside.id].sort());
    expect(JSON.stringify(d.root.children.find((n) => n.id === inside.id))).toBe(before);
    expect(d.root.children.some((n) => n.id === outside.id)).toBe(false);
    close(areaOf(d, across.id), 20 * 20, 0.01);
    const lp = d.root.children.find((n) => n.id === line.id) as PathNode;
    const xs = lp.subpaths[0].nodes.map((a) => a.x);
    close(Math.max(...xs), 60, 1e-3);
  });

  it("only touches the selection when given", () => {
    const a = path(true, [[40, 10], [80, 10], [80, 30], [40, 30]]), b = path(true, [[40, 40], [80, 40], [80, 50], [40, 50]]);
    const d = docWith(a, b);
    expect(cropToBox(d, [a.id], { minX: 0, minY: 0, maxX: 60, maxY: 60 })).toEqual([a.id]);
    close(areaOf(d, b.id), 400, 1e-6);
  });
});

describe("Virtual Segment Delete", () => {
  it("deletes the middle of a line between two crossing lines", () => {
    const h = path(false, [[0, 0], [30, 0]]);
    const v1 = path(false, [[10, -5], [10, 5]]), v2 = path(false, [[20, -5], [20, 5]]);
    const d = docWith(h, v1, v2);
    const hit = virtualSegmentAt(d, { x: 15, y: 0.1 }, 0.5)!;
    expect(hit.id).toBe(h.id);
    close(hit.from, 1 / 3, 1e-9); close(hit.to, 2 / 3, 1e-9);
    expect(deleteVirtualSegment(d, { x: 15, y: 0.1 }, 0.5)).toEqual([h.id]);
    const p = d.root.children.find((n) => n.id === h.id) as PathNode;
    expect(p.subpaths.map((s) => s.nodes.map((a) => [Math.round(a.x * 1e6) / 1e6, a.y]))).toEqual([[[0, 0], [10, 0]], [[20, 0], [30, 0]]]);
  });

  it("deletes the end piece of a line, and a whole path that crosses nothing", () => {
    const h = path(false, [[0, 0], [30, 0]]), v = path(false, [[10, -5], [10, 5]]), lone = path(false, [[0, 100], [10, 100]]);
    const d = docWith(h, v, lone);
    deleteVirtualSegment(d, { x: 25, y: 0 }, 0.5);
    const p = d.root.children.find((n) => n.id === h.id) as PathNode;
    expect(p.subpaths).toHaveLength(1);
    expect(p.subpaths[0].nodes.map((a) => a.x)).toEqual([0, 10]);
    expect(deleteVirtualSegment(d, { x: 5, y: 100 }, 0.5)).toEqual([lone.id]);
    expect(d.root.children.some((n) => n.id === lone.id)).toBe(false);
  });

  it("removes the part of a square between two crossings and keeps the rest as one open path", () => {
    const sq = path(true, [[0, 0], [20, 0], [20, 20], [0, 20]]);
    const cut = path(false, [[10, -5], [10, 25]]);
    const d = docWith(sq, cut);
    deleteVirtualSegment(d, { x: 20, y: 10 }, 0.5);
    const p = d.root.children.find((n) => n.id === sq.id) as PathNode;
    expect(p.subpaths).toHaveLength(1);
    const s = p.subpaths[0];
    expect(s.closed).toBe(false);
    expect(s.nodes.map((a) => [Math.round(a.x * 1e6) / 1e6, Math.round(a.y * 1e6) / 1e6])).toEqual([[10, 20], [0, 20], [0, 0], [10, 0]]);
  });

  it("a curve piece keeps its exact shape", () => {
    const s = threePointCurve({ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 8 });
    const piece = subpathPiece(s, 0.25, 0.75);
    const g = segments(s)[0], q = segments(piece)[0];
    for (const t of [0, 0.3, 0.5, 1]) {
      const a = cubicAt(q, t), b = cubicAt(g, 0.25 + t * 0.5);
      close(a.x, b.x, 1e-9); close(a.y, b.y, 1e-9);
    }
  });
});

describe("Create Boundary and Contour", () => {
  it("boundary traces the outside of overlapping shapes and leaves them be", () => {
    const a = path(true, [[0, 0], [20, 0], [20, 20], [0, 20]]), b = path(true, [[10, 10], [30, 10], [30, 30], [10, 30]]);
    const ring = path(true, [[50, 0], [70, 0], [70, 20], [50, 20]]);
    ring.subpaths.push({ closed: true, nodes: [{ x: 55, y: 5 }, { x: 55, y: 15 }, { x: 65, y: 15 }, { x: 65, y: 5 }] });
    const d = docWith(a, b, ring);
    const out = createBoundary(d, [a.id, b.id, ring.id], 4, id)!;
    const n = d.root.children.find((c) => c.id === out) as PathNode;
    expect(n.layer).toBe(4);
    expect(n.subpaths).toHaveLength(2);
    close(areaOf(d, out), 400 + 400 - 100 + 400, 1e-3);
    expect(d.root.children).toHaveLength(4);
    expect(createBoundary(d, [path(false, [[0, 0], [5, 5]]).id], 0, id)).toBeNull();
  });

  it("contour makes evenly spaced outlines outside, inside and to the centre", () => {
    const sq = path(true, [[0, 0], [20, 0], [20, 20], [0, 20]]);
    const d = docWith(sq);
    const out = contourNodes(d, [sq.id], 2, 3, false, "miter", 10, id);
    expect(out).toHaveLength(3);
    const sizes = out.map((o) => Math.sqrt(areaOf(d, o))).sort((x, y) => x - y);
    sizes.forEach((s, k) => close(s, 20 + 4 * (k + 1), 1e-3));
    const d2 = docWith(path(true, [[0, 0], [20, 0], [20, 20], [0, 20]]));
    const inward = contourNodes(d2, [d2.root.children[0].id], 3, 1, true, "miter", 10, id);
    expect(inward).toHaveLength(3);
    close(Math.sqrt(areaOf(d2, inward[2])), 2, 1e-3);
  });
});

describe("node commands", () => {
  it("align nodes moves selected nodes and their handles onto one line", () => {
    const ms: MSub[] = [{ closed: false, nodes: [{ x: 0, y: 0, s: true }, { x: 5, y: 4, o: { x: 6, y: 5 }, s: true }, { x: 9, y: 9 }] }];
    const out = alignSelected(ms, [1, 0, 0, 1, 10, 0], "y", 2)!;
    expect(out[0].nodes.map((a) => a.y)).toEqual([2, 2, 9]);
    expect(out[0].nodes[1].o).toEqual({ x: 6, y: 3 });
    expect(alignSelected(out, [1, 0, 0, 1, 10, 0], "y", 2)).toBeNull();
  });

  it("extract subpath moves the subpath into its own object above", () => {
    const p = path(true, [[0, 0], [10, 0], [10, 10]]);
    p.subpaths.push({ closed: true, nodes: [{ x: 20, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }] });
    const d = docWith(p);
    const out = extractSubpaths(d, [{ id: p.id, sub: 1, idx: 0 }], id);
    expect(out).toHaveLength(1);
    expect(d.root.children.map((c) => c.id)).toEqual([p.id, out[0]]);
    expect((d.root.children[0] as PathNode).subpaths).toHaveLength(1);
    expect((d.root.children[1] as PathNode).subpaths[0].nodes[0]).toMatchObject({ x: 20, y: 0 });
    expect(extractSubpaths(d, [{ id: p.id, sub: 0, idx: 0 }], id)).toEqual([]);
  });
});

describe("Distort effect", () => {
  const square = { closed: true, nodes: [{ x: -10, y: -10 }, { x: 10, y: -10 }, { x: 10, y: 10 }, { x: -10, y: 10 }] };
  const base = { ...(EFFECTS.distort.defaults([square]) as DistortParams) };
  it("defaults centre on the input", () => {
    expect(base.cx).toBe(0);
    expect(base.cy).toBe(0);
  });

  it("push moves corners out and bows the sides in; pull does the reverse", () => {
    const push = applyDistort([square], { ...base, mode: "pushPull", amount: 50 })[0];
    expect(push.nodes[0]).toMatchObject({ x: -12.5, y: -12.5 });
    const mid = cubicAt(segments(push)[0], 0.5);
    expect(Math.abs(mid.y)).toBeLessThan(10);
    const pull = applyDistort([square], { ...base, mode: "pushPull", amount: -50 })[0];
    expect(Math.abs(cubicAt(segments(pull)[0], 0.5).y)).toBeGreaterThan(10);
    expect(applyDistort([square], { ...base, mode: "pushPull", amount: 0 })[0]).toBe(square);
  });

  it("zipper adds teeth alternately out and in along every side", () => {
    const z = applyDistort([square], { ...base, mode: "zipper", amplitude: 1, frequency: 3, smooth: false })[0];
    expect(z.closed).toBe(true);
    expect(z.nodes).toHaveLength(4 * 6);
    const off = z.nodes.slice(0, 6).map((a) => Math.round((a.y + 10) * 1e6) / 1e6);
    expect(off).toEqual([0, 1, 0, -1, 0, 1]);
    const same = applyDistort([square], { ...base, mode: "zipper", random: true, seed: 7 });
    expect(applyDistort([square], { ...base, mode: "zipper", random: true, seed: 7 })).toEqual(same);
  });

  it("twister keeps the centre and turns the far points by the full angle", () => {
    const t = applyDistort([square], { ...base, mode: "twister", angle: 90 })[0];
    const pts = flatten(t, 0.01);
    const far = pts.reduce((m, q) => Math.max(m, Math.hypot(q.x, q.y)), 0);
    close(far, Math.hypot(10, 10), 0.3);
    // A quarter turn takes the corner (−10, −10) to (10, −10).
    expect(pts.some((q) => Math.hypot(q.x - 10, q.y + 10) < 0.5)).toBe(true);
    expect(applyDistort([square], { ...base, mode: "twister", angle: 0 })[0]).toBe(square);
  });
});

describe("Tweak twirl", () => {
  const brush = (invert = false): TweakBrush => ({ c: { x: 0, y: 0 }, r: 10, force: 100, delta: { x: 0, y: 0 }, invert, fidelity: 50, rnd: () => 0.5 });
  it("turns nodes around the brush centre, keeping their distance", () => {
    const q = { x: 3, y: 0 };
    const d = nodeShift("twirl", q, { x: 0, y: 1 }, brush());
    const r = Math.hypot(q.x + d.x, q.y + d.y);
    close(r, 3, 1e-9);
    expect(d.y).toBeGreaterThan(0);
    expect(nodeShift("twirl", q, { x: 0, y: 1 }, brush(true)).y).toBeLessThan(0);
    expect(nodeShift("twirl", { x: 20, y: 0 }, { x: 0, y: 1 }, brush())).toEqual({ x: 0, y: 0 });
  });
});
