import { describe, expect, it } from "vitest";
import { createDocument } from "../doc";
import { alignAnchors, alignTarget, exchangePositions, removeOverlaps } from "../alignOps";
import { arrangeGrid, arrangePolar, gridSize } from "../arrange";
import { boxCenter, boxesTouch } from "../geom";
import { clipBox, pasteSize, pasteStyle } from "../pasteOps";
import { alignNodes, findNode, locate, worldBox } from "../scene";
import { applyXform, XFORM_DEFAULTS, type XformSpec } from "../transformDialog";
import type { Document, PathNode, SceneNode } from "../types";

let seq = 0;
const id = () => `p${++seq}`;
const rect = (x: number, y: number, w: number, h: number): PathNode => ({
  id: id(), type: "path", transform: [1, 0, 0, 1, x, y], layer: 0,
  subpaths: [{ closed: true, nodes: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }] }],
});
const docWith = (...nodes: SceneNode[]): Document => {
  const d = createDocument({ name: "T", id: "doc", now: "2026-01-01T00:00:00.000Z", sheet: { w: 300, h: 200 } });
  d.root.children.push(...nodes);
  return d;
};
const B = (d: Document, nid: string) => worldBox(d.root, nid);
const near = (a: { minX: number; minY: number; maxX: number; maxY: number }, b: typeof a) => {
  for (const k of ["minX", "minY", "maxX", "maxY"] as const) expect(a[k], k).toBeCloseTo(b[k], 9);
};
const spec = (p: Partial<XformSpec>): XformSpec => ({ ...XFORM_DEFAULTS, ...p });

describe("Transform dialog", () => {
  // A 20 × 10 rectangle at (10, 10); a 10 × 10 square at (50, 10).
  const two = () => { const a = rect(10, 10, 20, 10), b = rect(50, 10, 10, 10); return { a, b, d: docWith(a, b) }; };

  it("moves relative and absolute", () => {
    const { a, d } = two();
    applyXform(d, [a.id], "move", spec({ move: { x: 5, y: -2, relative: true } }), [0, 0], false);
    near(B(d, a.id), { minX: 15, minY: 8, maxX: 35, maxY: 18 });
    applyXform(d, [a.id], "move", spec({ move: { x: 100, y: 50, relative: false } }), [0.5, 0.5], false);
    near(B(d, a.id), { minX: 90, minY: 45, maxX: 110, maxY: 55 });
  });

  it("scales by percent or to a size, proportionally or not", () => {
    const { a, d } = two();
    applyXform(d, [a.id], "scale", spec({ scale: { w: 50, h: 300, unit: "%", proportional: true } }), [0, 0], false);
    near(B(d, a.id), { minX: 10, minY: 10, maxX: 20, maxY: 15 });
    applyXform(d, [a.id], "scale", spec({ scale: { w: 40, h: 20, unit: "mm", proportional: false } }), [1, 1], false);
    near(B(d, a.id), { minX: -20, minY: -5, maxX: 20, maxY: 15 });
  });

  it("rotates clockwise and counter-clockwise", () => {
    const { a, d } = two();
    applyXform(d, [a.id], "rotate", spec({ rotate: { angle: 90, dir: "cw" } }), [0, 0], false);
    near(B(d, a.id), { minX: 0, minY: 10, maxX: 10, maxY: 30 });
    applyXform(d, [a.id], "rotate", spec({ rotate: { angle: 90, dir: "ccw" } }), [0, 0], false);
    near(B(d, a.id), { minX: 0, minY: 0, maxX: 20, maxY: 10 });
  });

  it("skews by degrees or millimetres", () => {
    const { a, d } = two();
    applyXform(d, [a.id], "skew", spec({ skew: { h: 45, v: 0, unit: "deg" } }), [0, 1], false);
    near(B(d, a.id), { minX: 0, minY: 10, maxX: 30, maxY: 20 });
    const t = two();
    applyXform(t.d, [t.a.id], "skew", spec({ skew: { h: 0, v: 4, unit: "mm" } }), [0, 0], false);
    near(B(t.d, t.a.id), { minX: 10, minY: 10, maxX: 30, maxY: 24 });
  });

  it("applies a matrix on top or edits the current one", () => {
    const { a, d } = two();
    applyXform(d, [a.id], "matrix", spec({ matrix: { m: [2, 0, 0, 1, 3, 0], edit: false } }), [0, 0], false);
    near(B(d, a.id), { minX: 13, minY: 10, maxX: 53, maxY: 20 });
    applyXform(d, [a.id], "matrix", spec({ matrix: { m: [1, 0, 0, 1, 0, 0], edit: true } }), [0, 0], false);
    expect(locate(d.root, a.id)!.node.transform).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it("each object separately versus the selection as a group", () => {
    const g = two();
    applyXform(g.d, [g.a.id, g.b.id], "scale", spec({ scale: { w: 200, h: 200, unit: "%", proportional: true } }), [0.5, 0.5], false);
    near(B(g.d, g.b.id), { minX: 65, minY: 5, maxX: 85, maxY: 25 }); // around the selection's centre (35, 15)
    const e = two();
    applyXform(e.d, [e.a.id, e.b.id], "scale", spec({ scale: { w: 200, h: 200, unit: "%", proportional: true } }), [0.5, 0.5], true);
    near(B(e.d, e.b.id), { minX: 45, minY: 5, maxX: 65, maxY: 25 }); // around its own centre (55, 15)
    near(B(e.d, e.a.id), { minX: 0, minY: 5, maxX: 40, maxY: 25 });
  });
});

describe("Align upgrades", () => {
  it("aligns to first, last, biggest and smallest", () => {
    const a = rect(0, 0, 10, 10), b = rect(30, 5, 30, 20), c = rect(80, 40, 4, 4);
    const d = docWith(a, b, c);
    const order = [c.id, a.id, b.id];
    expect(alignTarget(d, order, "first")).toEqual(B(d, c.id));
    expect(alignTarget(d, order, "key")).toEqual(B(d, b.id));
    expect(alignTarget(d, order, "biggest")).toEqual(B(d, b.id));
    expect(alignTarget(d, order, "smallest")).toEqual(B(d, c.id));
    expect(alignTarget(d, order, "selection")).toBeUndefined();
    alignNodes(d, order, "left", alignTarget(d, order, "biggest"));
    expect([a, b, c].map((n) => B(d, n.id).minX)).toEqual([30, 30, 30]);
  });

  it("removes overlaps with a gap, deterministically and symmetrically", () => {
    const a = rect(0, 0, 10, 10), b = rect(6, 2, 10, 10);
    const d = docWith(a, b);
    removeOverlaps(d, [a.id, b.id], 2);
    near(B(d, a.id), { minX: -3, minY: 0, maxX: 7, maxY: 10 });
    near(B(d, b.id), { minX: 9, minY: 2, maxX: 19, maxY: 12 });
    const many = docWith(...[0, 1, 2, 3, 4].map((k) => rect(k * 3, k, 10, 10)));
    const ids = many.root.children.map((n) => n.id);
    removeOverlaps(many, ids, 1);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const p = B(many, ids[i]), q = B(many, ids[j]);
      const gap = Math.max(q.minX - p.maxX, p.minX - q.maxX, q.minY - p.maxY, p.minY - q.maxY);
      expect(gap).toBeGreaterThanOrEqual(1 - 1e-9);
    }
  });

  it("exchanges positions in selection, stack, clockwise and random order", () => {
    const mk = () => { const a = rect(0, 0, 2, 2), b = rect(20, 0, 2, 2), c = rect(20, 20, 2, 2); return { a, b, c, d: docWith(a, b, c) }; };
    const C = (d: Document, n: PathNode) => boxCenter(B(d, n.id));
    let t = mk();
    exchangePositions(t.d, [t.c.id, t.a.id, t.b.id], "selection");
    expect([C(t.d, t.c), C(t.d, t.a), C(t.d, t.b)]).toEqual([{ x: 1, y: 1 }, { x: 21, y: 1 }, { x: 21, y: 21 }]);
    t = mk();
    exchangePositions(t.d, [t.c.id, t.a.id, t.b.id], "stack");
    expect([C(t.d, t.a), C(t.d, t.b), C(t.d, t.c)]).toEqual([{ x: 21, y: 1 }, { x: 21, y: 21 }, { x: 1, y: 1 }]);
    t = mk();
    // Clockwise on screen around (≈14.3, ≈7.7): a (upper left) → b (upper right) → c (lower right) → a.
    exchangePositions(t.d, [t.b.id, t.c.id, t.a.id], "clockwise");
    expect([C(t.d, t.a), C(t.d, t.b), C(t.d, t.c)]).toEqual([{ x: 21, y: 1 }, { x: 21, y: 21 }, { x: 1, y: 1 }]);
    const r1 = mk(), r2 = mk();
    exchangePositions(r1.d, [r1.a.id, r1.b.id, r1.c.id], "random", 9);
    exchangePositions(r2.d, [r2.a.id, r2.b.id, r2.c.id], "random", 9);
    expect([C(r1.d, r1.a), C(r1.d, r1.b)]).toEqual([C(r2.d, r2.a), C(r2.d, r2.b)]);
    expect(C(r1.d, r1.a)).not.toEqual({ x: 1, y: 1 }); // a cyclic exchange always moves everything
  });

  it("aligns selected path nodes", () => {
    const p: PathNode = { id: "zig", type: "path", transform: [1, 0, 0, 1, 100, 0], layer: 0, subpaths: [{ closed: false, nodes: [{ x: 0, y: 0 }, { x: 5, y: 8, o: { x: 6, y: 9 } }, { x: 10, y: 3 }] }] };
    const d = docWith(p);
    alignAnchors(d, [{ id: "zig", sub: 0, idx: 0 }, { id: "zig", sub: 0, idx: 1 }, { id: "zig", sub: 0, idx: 2 }], "top");
    const n = findNode(d.root, "zig") as PathNode;
    expect(n.subpaths[0].nodes.map((a) => a.y)).toEqual([0, 0, 0]);
    expect(n.subpaths[0].nodes[1].o).toEqual({ x: 6, y: 1 });
    alignAnchors(d, [{ id: "zig", sub: 0, idx: 0 }, { id: "zig", sub: 0, idx: 2 }], "hcenter");
    expect((findNode(d.root, "zig") as PathNode).subpaths[0].nodes.map((a) => a.x)).toEqual([5, 5, 5]);
  });
});

describe("Arrange", () => {
  it("works out grid sizes", () => {
    expect(gridSize(7, 0, 0)).toEqual({ rows: 3, cols: 3 });
    expect(gridSize(7, 2, 0)).toEqual({ rows: 2, cols: 4 });
    expect(gridSize(7, 0, 2)).toEqual({ rows: 4, cols: 2 });
  });

  it("moves objects into a grid with spacing and alignment in the cell", () => {
    const a = rect(50, 50, 10, 10), b = rect(0, 0, 20, 4), c = rect(90, 30, 4, 6);
    const d = docWith(a, b, c);
    arrangeGrid(d, [a.id, b.id, c.id], { rows: 0, cols: 2, spacingX: 5, spacingY: 3, alignX: 0.5, alignY: 1, equal: false });
    // Grid starts at the selection's top-left (0, 0); columns 10 and 20 wide, rows 10 and 6 high.
    near(B(d, a.id), { minX: 0, minY: 0, maxX: 10, maxY: 10 });
    near(B(d, b.id), { minX: 15, minY: 6, maxX: 35, maxY: 10 });
    near(B(d, c.id), { minX: 3, minY: 13, maxX: 7, maxY: 19 });
    arrangeGrid(d, [a.id, b.id, c.id], { rows: 1, cols: 0, spacingX: 0, spacingY: 0, alignX: 0, alignY: 0, equal: true });
    expect([a, b, c].map((n) => B(d, n.id).minX)).toEqual([0, 20, 40]);
  });

  it("arranges on a circle around the first object, turning to follow", () => {
    const hub = rect(-5, -5, 10, 10), a = rect(100, 100, 2, 4), b = rect(0, 70, 2, 4), c = rect(30, 30, 2, 4), e = rect(60, 0, 2, 4);
    const d = docWith(hub, a, b, c, e);
    arrangePolar(d, [hub.id, a.id, b.id, c.id, e.id], { center: "first", rx: 20, ry: 10, start: -90, end: 270, rotate: false });
    const C = (n: PathNode) => boxCenter(B(d, n.id));
    expect(C(hub)).toEqual({ x: 0, y: 0 });
    expect(C(a).x).toBeCloseTo(0, 9); expect(C(a).y).toBeCloseTo(-10, 9);
    expect(C(b).x).toBeCloseTo(20, 9); expect(C(b).y).toBeCloseTo(0, 9);
    expect(C(c).x).toBeCloseTo(0, 9); expect(C(c).y).toBeCloseTo(10, 9);
    arrangePolar(d, [a.id, b.id], { center: "bbox", rx: 10, ry: 10, start: 0, end: 90, rotate: true });
    // b ends at 90° (straight below the centre), turned 180°: still 2 wide, 4 high.
    near(B(d, b.id), { minX: B(d, b.id).minX, minY: B(d, b.id).minY, maxX: B(d, b.id).minX + 2, maxY: B(d, b.id).minY + 4 });
    expect(boxesTouch(B(d, a.id), B(d, b.id))).toBe(false);
  });
});

describe("Paste size and style", () => {
  it("scales the selection or each object to the clipboard's size", () => {
    const clip = [rect(0, 0, 40, 10)];
    const target = clipBox(clip);
    expect(target).toEqual({ minX: 0, minY: 0, maxX: 40, maxY: 10 });
    const mk = () => { const a = rect(0, 0, 10, 10), b = rect(20, 0, 10, 20); return { a, b, d: docWith(a, b) }; };
    let t = mk();
    pasteSize(t.d, [t.a.id, t.b.id], target, "width", false, [0, 0]);
    near(B(t.d, t.b.id), { minX: 80 / 3, minY: 0, maxX: 40, maxY: 20 });
    t = mk();
    pasteSize(t.d, [t.a.id, t.b.id], target, "both", true, [0, 0]);
    near(B(t.d, t.a.id), { minX: 0, minY: 0, maxX: 40, maxY: 10 });
    near(B(t.d, t.b.id), { minX: 20, minY: 0, maxX: 60, maxY: 10 });
    t = mk();
    pasteSize(t.d, [t.b.id], target, "height", true, [0, 0], true);
    near(B(t.d, t.b.id), { minX: 20, minY: 0, maxX: 25, maxY: 10 });
  });

  it("gives the selection the clipboard object's layer and Live Effects", () => {
    const style: PathNode = { ...rect(0, 0, 1, 1), layer: 7, effects: [{ id: "e1", kind: "offset", enabled: true, params: { distance: 1, join: "round", miterLimit: 4 } }] };
    const a = rect(0, 0, 10, 10);
    const d = docWith(a);
    expect(pasteStyle(d, [a.id], style, () => "e2")).toBe(1);
    const n = findNode(d.root, a.id) as PathNode;
    expect(n.layer).toBe(7);
    expect(n.effects?.map((e) => [e.id, e.kind])).toEqual([["e2", "offset"]]);
  });
});
