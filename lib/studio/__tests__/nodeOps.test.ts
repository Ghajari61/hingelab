import { describe, expect, it } from "vitest";
import { createDocument } from "../doc";
import { rotateAt, scaleAt } from "../geom";
import { commit, emptyHistory, redo, undo } from "../history";
import {
  anchorsCenter, autoHandles, breakAt, canJoinEnds, curveSegments, deleteSegments, editAnchors, hasSelectedSegment, insertMidpoints, joinAnchors,
  joinEnds, mark, setKinds, straightenSegments, transformSelected, unmark, type MSub,
} from "../nodeOps";
import type { Document, PathNode, SceneNode, Subpath } from "../types";

const close = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const square = (): Subpath => ({ closed: true, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] });
const open3 = (): Subpath => ({ closed: false, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }] });
const sel = (ms: MSub[]) => unmark(ms).sel;
const path = (pid: string, subs: Subpath[], x = 0): PathNode => ({ id: pid, type: "path", transform: [1, 0, 0, 1, x, 0], layer: 0, subpaths: subs });
const docWith = (...nodes: SceneNode[]): Document => {
  const d = createDocument({ name: "T", id: "doc", now: "2026-01-01T00:00:00.000Z", sheet: { w: 300, h: 200 } });
  d.root.children.push(...nodes);
  return d;
};
const roundTrip = (d: Document, recipe: (d: Document) => unknown) => {
  const before = JSON.stringify(d);
  const c = commit(d, emptyHistory(), "Edit", (x) => { recipe(x); });
  expect(c.changed).toBe(true);
  const after = JSON.stringify(c.doc);
  const u = undo(c.doc, c.history);
  expect(JSON.stringify(u.doc)).toBe(before);
  expect(JSON.stringify(redo(u.doc, u.history).doc)).toBe(after);
};

describe("node types", () => {
  it("auto handles point from the previous to the next node, a third of each chord long", () => {
    const s: Subpath = { closed: false, nodes: [{ x: 0, y: 0 }, { x: 3, y: 3 }, { x: 6, y: 0 }] };
    const h = autoHandles(s, 1);
    close(h.i!.x, 3 - Math.sqrt(18) / 3); close(h.i!.y, 3);
    close(h.o!.x, 3 + Math.sqrt(18) / 3); close(h.o!.y, 3);
    const end = autoHandles(s, 0);
    expect(end.i).toBeUndefined();
    close(end.o!.x, 1); close(end.o!.y, 1);
  });

  it("smooth lines handles up, symmetric evens them, corner keeps them, auto follows the neighbours", () => {
    const s: Subpath = { closed: false, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0, i: { x: 8, y: 1 }, o: { x: 16, y: 1 } }, { x: 20, y: 0 }] };
    const at = (kind: Parameters<typeof setKinds>[1]) => unmark(setKinds(mark([s], [{ sub: 0, idx: 1 }]), kind)!).subs[0].nodes[1];
    const smooth = at("smooth");
    expect(smooth.k).toBe("smooth");
    const cross = (smooth.i!.x - 10) * (smooth.o!.y - 0) - (smooth.i!.y - 0) * (smooth.o!.x - 10);
    close(cross, 0, 1e-9);
    const sym = at("symmetric");
    close(Math.hypot(sym.i!.x - 10, sym.i!.y), Math.hypot(sym.o!.x - 10, sym.o!.y));
    expect(at("corner").i).toEqual({ x: 8, y: 1 });
    const auto = at("auto");
    expect(auto.k).toBe("auto");
    close(auto.i!.x, 10 - 10 / 3); close(auto.i!.y, 0); close(auto.o!.x, 10 + 10 / 3);
  });

  it("auto nodes follow when a neighbour moves", () => {
    const ms = setKinds(mark([open3()], [{ sub: 0, idx: 1 }]), "auto")!;
    const moved = transformSelected(mark(unmark(ms).subs, [{ sub: 0, idx: 2 }]), [1, 0, 0, 1, 0, 9])!;
    const mid = unmark(moved).subs[0].nodes[1];
    close(mid.o!.y, (9 / Math.hypot(20, 9)) * (Math.hypot(10, 9) / 3));
    close(mid.i!.y, -(9 / Math.hypot(20, 9)) * (10 / 3));
  });
});

describe("node edits", () => {
  it("inserts a node in the middle of each selected segment", () => {
    const ms = mark([square()], [{ sub: 0, idx: 0 }, { sub: 0, idx: 1 }]);
    const out = unmark(insertMidpoints(ms)!);
    expect(out.subs[0].nodes).toHaveLength(5);
    expect(out.subs[0].nodes[1]).toMatchObject({ x: 5, y: 0 });
    expect(out.sel).toEqual([{ sub: 0, idx: 0 }, { sub: 0, idx: 1 }, { sub: 0, idx: 2 }]);
    expect(insertMidpoints(mark([square()], [{ sub: 0, idx: 0 }, { sub: 0, idx: 2 }]))).toBeNull();
    const wrap = unmark(insertMidpoints(mark([square()], [{ sub: 0, idx: 3 }, { sub: 0, idx: 0 }]))!);
    expect(wrap.subs[0].nodes[4]).toMatchObject({ x: 0, y: 5 });
  });

  it("breaks a closed path open and an open path in two", () => {
    const c = unmark(breakAt(mark([square()], [{ sub: 0, idx: 2 }]))!);
    expect(c.subs).toHaveLength(1);
    expect(c.subs[0].closed).toBe(false);
    expect(c.subs[0].nodes.map((n) => [n.x, n.y])).toEqual([[10, 10], [0, 10], [0, 0], [10, 0], [10, 10]]);
    expect(c.sel).toHaveLength(2);
    const o = unmark(breakAt(mark([open3()], [{ sub: 0, idx: 1 }]))!);
    expect(o.subs.map((s) => s.nodes.length)).toEqual([2, 2]);
    expect(breakAt(mark([open3()], [{ sub: 0, idx: 0 }]))).toBeNull();
  });

  it("joins two end nodes into one, or with a new segment; two ends of one path close it", () => {
    const a: Subpath = { closed: false, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }] };
    const b: Subpath = { closed: false, nodes: [{ x: 12, y: 0 }, { x: 20, y: 0 }] };
    const merged = unmark(joinEnds(mark([a, b], [{ sub: 0, idx: 1 }, { sub: 1, idx: 0 }]), true)!);
    expect(merged.subs).toHaveLength(1);
    expect(merged.subs[0].nodes.map((n) => n.x)).toEqual([0, 11, 20]);
    const seg = unmark(joinEnds(mark([a, b], [{ sub: 0, idx: 0 }, { sub: 1, idx: 0 }]), false)!);
    expect(seg.subs[0].nodes.map((n) => n.x)).toEqual([10, 0, 12, 20]);
    const u: Subpath = { closed: false, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 2 }] };
    const closedU = unmark(joinEnds(mark([u], [{ sub: 0, idx: 0 }, { sub: 0, idx: 3 }]), true)!).subs[0];
    expect(closedU.closed).toBe(true);
    expect(closedU.nodes).toHaveLength(3);
    expect(closedU.nodes[0]).toMatchObject({ x: 0, y: 1 });
    expect(joinEnds(mark([open3()], [{ sub: 0, idx: 1 }, { sub: 0, idx: 2 }]), true)).toBeNull();
  });

  it("deletes the segment between two selected nodes", () => {
    const c = unmark(deleteSegments(mark([square()], [{ sub: 0, idx: 1 }, { sub: 0, idx: 2 }]))!);
    expect(c.subs).toHaveLength(1);
    expect(c.subs[0].closed).toBe(false);
    expect(c.subs[0].nodes.map((n) => [n.x, n.y])).toEqual([[10, 10], [0, 10], [0, 0], [10, 0]]);
    const o = unmark(deleteSegments(mark([open3()], [{ sub: 0, idx: 0 }, { sub: 0, idx: 1 }]))!);
    expect(o.subs.map((s) => s.nodes.length)).toEqual([2]);
    expect(o.subs[0].nodes[0].x).toBe(10);
  });

  it("straightens and curves segments", () => {
    const curved = unmark(curveSegments(mark([open3()], [{ sub: 0, idx: 0 }, { sub: 0, idx: 1 }]))!).subs[0];
    expect(curved.nodes[0].o).toEqual({ x: 10 / 3, y: 0 });
    expect(curved.nodes[1].i).toEqual({ x: 10 - 10 / 3, y: 0 });
    expect(curved.nodes[1].o).toBeUndefined();
    const straight = unmark(straightenSegments(mark([curved], [{ sub: 0, idx: 0 }, { sub: 0, idx: 1 }]))!).subs[0];
    expect(straight.nodes[0].o).toBeUndefined();
    expect(straight.nodes[1].i).toBeUndefined();
    expect(straightenSegments(mark([open3()], [{ sub: 0, idx: 0 }, { sub: 0, idx: 1 }]))).toBeNull();
  });

  it("scales and rotates only the selected nodes", () => {
    const ms = mark([square()], [{ sub: 0, idx: 0 }, { sub: 0, idx: 1 }]);
    const sc = unmark(transformSelected(ms, scaleAt(2, 2, 5, 0))!).subs[0].nodes;
    expect(sc.map((n) => n.x)).toEqual([-5, 15, 10, 0]);
    const rot = unmark(transformSelected(ms, rotateAt(90, 5, 0))!).subs[0].nodes;
    close(rot[0].x, 5); close(rot[0].y, -5);
    close(rot[1].x, 5); close(rot[1].y, 5);
    expect(rot[2]).toEqual({ x: 10, y: 10 });
  });
});

describe("node edits on the document", () => {
  it("edits a path in place, keeps the node selection and undoes in one step", () => {
    const p = path("p", [square()], 5);
    const d = docWith(p);
    const refs = [{ id: "p", sub: 0, idx: 0 }, { id: "p", sub: 0, idx: 1 }];
    expect(hasSelectedSegment(d, refs)).toBe(true);
    expect(hasSelectedSegment(d, [refs[0], { id: "p", sub: 0, idx: 2 }])).toBe(false);
    expect(anchorsCenter(d, refs)).toEqual({ x: 10, y: 0 });
    const out = editAnchors(d, refs, insertMidpoints);
    expect(out).toHaveLength(3);
    expect((d.root.children[0] as PathNode).subpaths[0].nodes).toHaveLength(5);
    for (const fn of [insertMidpoints, breakAt, deleteSegments, curveSegments, (ms: MSub[]) => setKinds(ms, "auto"), (ms: MSub[]) => transformSelected(ms, [1, 0, 0, 1, 1, 1])]) {
      roundTrip(docWith(path("p", [square()], 5)), (x) => editAnchors(x, refs, fn));
    }
  });

  it("joins end nodes of two different paths into one path", () => {
    const d = docWith(path("a", [{ closed: false, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }]), path("b", [{ closed: false, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }], 12));
    const refs = [{ id: "a", sub: 0, idx: 1 }, { id: "b", sub: 0, idx: 0 }];
    expect(canJoinEnds(d, refs)).toBe(true);
    expect(canJoinEnds(d, [refs[0]])).toBe(false);
    const out = joinAnchors(d, refs, false)!;
    expect(out).toHaveLength(2);
    expect(d.root.children.map((n) => n.id)).toEqual(["a"]);
    expect((d.root.children[0] as PathNode).subpaths[0].nodes.map((n) => n.x)).toEqual([0, 10, 12, 22]);
    roundTrip(docWith(path("a", [{ closed: false, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }]), path("b", [{ closed: false, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }], 12)),
      (x) => joinAnchors(x, refs, true));
  });

  it("expands a live shape before editing its nodes", () => {
    const d = docWith({ id: "r", type: "shape", shape: { kind: "ellipse", rx: 5, ry: 5 }, transform: [1, 0, 0, 1, 0, 0], layer: 0 });
    expect(editAnchors(d, [{ id: "r", sub: 0, idx: 0 }], () => null)).toHaveLength(1);
    expect(d.root.children[0].type).toBe("shape");
    editAnchors(d, [{ id: "r", sub: 0, idx: 0 }], (ms) => setKinds(ms, "smooth"));
    expect(d.root.children[0].type).toBe("path");
  });
});
