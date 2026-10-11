import { describe, expect, it } from "vitest";
import { createDocument } from "../doc";
import { flatten, nodePaths, polygonArea, segments, transformSubpaths } from "../geom";
import { commit, emptyHistory, redo, undo } from "../history";
import { booleanOp } from "../pathfinder";
import {
  cutPathNodes, cutSubpath, flattenNodes, fractureNodes, insetOutsetNodes, joinNearbyEndpoints, removeDuplicateNodes, removeDuplicateNodesIn,
  splitGroups, splitPathNodes, strokeOutline, strokeToPathNodes,
} from "../pathMenu";
import { locate } from "../scene";
import type { Document, PathNode, SceneNode, Subpath } from "../types";

let seq = 0;
const id = () => `n${++seq}`;
const close = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const rect = (x: number, y: number, w: number, h: number): Subpath => ({
  closed: true, nodes: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }],
});
const path = (subs: Subpath[], layer = 0, at = { x: 0, y: 0 }): PathNode => ({ id: id(), type: "path", transform: [1, 0, 0, 1, at.x, at.y], layer, subpaths: subs });
const sq = (x: number, y: number, s: number, layer = 0) => path([rect(0, 0, s, s)], layer, { x, y });
const line = (a: { x: number; y: number }, b: { x: number; y: number }, layer = 0) => path([{ closed: false, nodes: [{ ...a }, { ...b }] }], layer);
const docWith = (...nodes: SceneNode[]): Document => {
  const d = createDocument({ name: "T", id: "doc", now: "2026-01-01T00:00:00.000Z", sheet: { w: 300, h: 200 } });
  d.root.children.push(...nodes);
  return d;
};
const subsArea = (subs: Subpath[]) => Math.abs(subs.reduce((a, s) => a + polygonArea(flatten(s, 0.001)), 0));
const areaOf = (d: Document, nid: string) => {
  const l = locate(d.root, nid)!;
  return subsArea(transformSubpaths(nodePaths(l.node), l.world));
};
const pathLength = (s: Subpath) => { const p = flatten(s, 0.001); let t = 0; for (let k = 1; k < p.length; k++) t += Math.hypot(p[k].x - p[k - 1].x, p[k].y - p[k - 1].y); return t; };

/** Commits `recipe` as one undo step, then checks undo restores the original and redo the result exactly. */
const roundTrip = (d: Document, label: string, recipe: (d: Document) => unknown) => {
  const before = JSON.stringify(d);
  const c = commit(d, emptyHistory(), label, (x) => { recipe(x); });
  expect(c.changed).toBe(true);
  const after = JSON.stringify(c.doc);
  const u = undo(c.doc, c.history);
  expect(JSON.stringify(u.doc)).toBe(before);
  const r = redo(u.doc, u.history);
  expect(JSON.stringify(r.doc)).toBe(after);
};

describe("Stroke to Path", () => {
  it("a 10 mm line, 2 mm wide with butt caps, is a 20 mm² outline", () => {
    const out = strokeOutline([{ closed: false, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }], 2, "miter", "butt");
    expect(out).toHaveLength(1);
    close(subsArea(out), 20, 1e-6);
  });

  it("square caps add half the width at each end, round caps a disc", () => {
    const l: Subpath[] = [{ closed: false, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }];
    close(subsArea(strokeOutline(l, 2, "miter", "square")), 24, 1e-6);
    close(subsArea(strokeOutline(l, 2, "round", "round")), 20 + Math.PI, 0.05);
  });

  it("a closed square becomes a ring and the object keeps its id and cut layer", () => {
    const a = sq(10, 10, 10, 3);
    const d = docWith(a);
    const out = strokeToPathNodes(d, [a.id], 2, "miter", "butt");
    expect(out).toEqual([a.id]);
    const n = d.root.children[0] as PathNode;
    expect(n.layer).toBe(3);
    expect(n.subpaths).toHaveLength(2);
    close(areaOf(d, a.id), 12 * 12 - 8 * 8, 1e-6);
    roundTrip(docWith(sq(0, 0, 10)), "Stroke to Path", (x) => strokeToPathNodes(x, [x.root.children[0].id], 1, "round", "round"));
  });
});

describe("Path operations", () => {
  it("booleans give exact areas", () => {
    const areas: Record<string, number> = { unite: 175, minusFront: 75, minusBack: 75, intersect: 25, exclude: 150 };
    for (const [op, want] of Object.entries(areas)) {
      const a = sq(0, 0, 10, 1), b = sq(5, 5, 10, 2);
      const d = docWith(a, b);
      const r = booleanOp(d, [a.id, b.id], op as Parameters<typeof booleanOp>[2], id);
      expect(r.error).toBeUndefined();
      close(r.ids.reduce((t, x) => t + areaOf(d, x), 0), want, 1e-6);
    }
  });

  it("Fracture makes every face its own path with the top-most cut layer; the area equals the union", () => {
    const a = sq(0, 0, 10, 1), b = sq(5, 5, 10, 2);
    const d = docWith(a, b);
    const r = fractureNodes(d, [a.id, b.id], id);
    expect(r.error).toBeUndefined();
    expect(r.ids).toHaveLength(3);
    expect(d.root.children).toHaveLength(3);
    expect(d.root.children.every((n) => n.type === "path")).toBe(true);
    close(r.ids.reduce((t, x) => t + areaOf(d, x), 0), 175, 1e-6);
    expect(d.root.children.map((n) => n.layer).sort()).toEqual([1, 2, 2]);
    roundTrip(docWith(sq(0, 0, 10, 1), sq(5, 5, 10, 2)), "Fracture", (x) => fractureNodes(x, x.root.children.map((n) => n.id), id));
  });

  it("Flatten removes what is hidden and deletes shapes hidden completely", () => {
    const a = sq(0, 0, 10, 1), b = sq(5, 5, 10, 2), hidden = sq(6, 6, 2, 3), top = sq(5, 5, 4, 4);
    const d = docWith(a, hidden, b, top);
    const r = flattenNodes(d, [a.id, hidden.id, b.id, top.id]);
    expect(r.error).toBeUndefined();
    expect(locate(d.root, hidden.id)).toBeNull();
    close(areaOf(d, a.id), 75, 1e-6);
    close(areaOf(d, b.id), 100 - 16, 1e-6);
    close(areaOf(d, top.id), 16, 1e-6);
    close(areaOf(d, a.id) + areaOf(d, b.id) + areaOf(d, top.id), 175, 1e-6);
    expect(flattenNodes(docWith(sq(0, 0, 5), sq(20, 0, 5)), ["n0"]).error).toBeDefined();
    roundTrip(docWith(sq(0, 0, 10, 1), sq(5, 5, 10, 2)), "Flatten", (x) => flattenNodes(x, x.root.children.map((n) => n.id)));
  });

  it("Split Path keeps holes with their outer contour and islands apart", () => {
    const groups = splitGroups([rect(0, 0, 30, 30), rect(5, 5, 20, 20), rect(10, 10, 10, 10), rect(40, 0, 10, 10)]);
    expect(groups.map((g) => g.length).sort()).toEqual([1, 1, 2]);
    const p = path([rect(0, 0, 30, 30), rect(10, 10, 10, 10), rect(40, 0, 10, 10)], 5);
    const d = docWith(p);
    const out = splitPathNodes(d, [p.id], id);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(p.id);
    const parts = d.root.children as PathNode[];
    expect(parts.map((n) => n.subpaths.length)).toEqual([2, 1]);
    expect(parts.every((n) => n.layer === 5)).toBe(true);
    expect(parts[0].subpaths.map((s) => subsArea([s]))).toEqual([900, 100]);
    roundTrip(docWith(path([rect(0, 0, 30, 30), rect(10, 10, 10, 10), rect(40, 0, 10, 10)])), "Split Path", (x) => splitPathNodes(x, [x.root.children[0].id], id));
  });

  it("Cut Path splits strokes where the top path crosses them", () => {
    const box = sq(0, 0, 10), cutter = line({ x: 5, y: -5 }, { x: 5, y: 15 });
    const d = docWith(box, cutter);
    const r = cutPathNodes(d, [box.id, cutter.id]);
    expect(r.error).toBeUndefined();
    expect(d.root.children).toHaveLength(1);
    const n = d.root.children[0] as PathNode;
    expect(n.subpaths).toHaveLength(2);
    expect(n.subpaths.every((s) => !s.closed)).toBe(true);
    close(n.subpaths.reduce((t, s) => t + pathLength(s), 0), 40, 1e-9);
    close(pathLength(n.subpaths[0]), 20, 1e-9);

    const l = line({ x: 0, y: 0 }, { x: 30, y: 0 }), c2 = path([rect(10, -5, 10, 10)]);
    const d2 = docWith(l, c2);
    cutPathNodes(d2, [l.id, c2.id]);
    expect((d2.root.children[0] as PathNode).subpaths).toHaveLength(3);

    const curve: Subpath = { closed: false, nodes: [{ x: 0, y: 0, o: { x: 5, y: 10 } }, { x: 10, y: 0, i: { x: 5, y: 10 } }] };
    const d3 = docWith(path([curve]), line({ x: 5, y: -5 }, { x: 5, y: 20 }));
    cutPathNodes(d3, d3.root.children.map((x) => x.id));
    const pieces = (d3.root.children[0] as PathNode).subpaths;
    expect(pieces).toHaveLength(2);
    close(pieces[0].nodes[pieces[0].nodes.length - 1].x, 5, 1e-9);
    expect(cutPathNodes(docWith(sq(0, 0, 5), line({ x: 20, y: 0 }, { x: 20, y: 9 })), ["x"]).error).toBeDefined();
    roundTrip(docWith(sq(0, 0, 10), line({ x: 5, y: -5 }, { x: 5, y: 15 })), "Cut Path", (x) => cutPathNodes(x, x.root.children.map((n) => n.id)));
  });

  it("cutSubpath splits a closed path at two points into two open pieces", () => {
    const parts = cutSubpath(rect(0, 0, 10, 10), [{ seg: 0, t: 0.5 }, { seg: 2, t: 0.5 }]);
    expect(parts).toHaveLength(2);
    expect(parts.map((p) => segments(p).length)).toEqual([3, 3]);
  });

  it("Inset and Outset move the outline by the step", () => {
    const a = sq(0, 0, 10), b = sq(20, 0, 10);
    const d = docWith(a, b);
    insetOutsetNodes(d, [a.id], -1);
    insetOutsetNodes(d, [b.id], 1);
    close(areaOf(d, a.id), 64, 1e-6);
    close(areaOf(d, b.id), 144, 1e-6);
    const n = locate(d.root, b.id)!.node as PathNode;
    const xs = n.subpaths[0].nodes.map((p) => p.x);
    close(Math.min(...xs), 19, 1e-9);
    const tiny = sq(0, 0, 1);
    const d2 = docWith(tiny);
    expect(insetOutsetNodes(d2, [tiny.id], -1)).toEqual([]);
    expect(d2.root.children).toHaveLength(0);
    roundTrip(docWith(sq(0, 0, 10)), "Inset", (x) => insetOutsetNodes(x, [x.root.children[0].id], -1));
    roundTrip(docWith(sq(0, 0, 10)), "Outset", (x) => insetOutsetNodes(x, [x.root.children[0].id], 1));
  });

  it("Remove Duplicate Nodes merges stacked nodes", () => {
    const s: Subpath = { closed: true, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }] };
    const r = removeDuplicateNodes(s);
    expect(r.removed).toBe(2);
    expect(r.sub.nodes).toHaveLength(4);
    const curve: Subpath = { closed: false, nodes: [{ x: 0, y: 0, o: { x: 3, y: 3 } }, { x: 0, y: 0, o: { x: 3, y: 3 } }, { x: 9, y: 0 }] };
    expect(removeDuplicateNodes(curve).removed).toBe(0);
    const p = path([s]);
    const d = docWith(p);
    expect(removeDuplicateNodesIn(d, [p.id])).toBe(2);
    roundTrip(docWith(path([s])), "Remove Duplicate Nodes", (x) => removeDuplicateNodesIn(x, [x.root.children[0].id]));
  });

  it("Join Nearby Endpoints joins ends within the tolerance", () => {
    const a = line({ x: 0, y: 0 }, { x: 10, y: 0 }), b = line({ x: 10.3, y: 0 }, { x: 20, y: 0 }), far = line({ x: 50, y: 0 }, { x: 60, y: 0 });
    const d = docWith(a, b, far);
    expect(joinNearbyEndpoints(d, [a.id, b.id, far.id], 0.5)).toBe(1);
    expect(d.root.children.map((n) => n.id)).toEqual([a.id, far.id]);
    const n = d.root.children[0] as PathNode;
    expect(n.subpaths).toHaveLength(1);
    expect(n.subpaths[0].nodes).toHaveLength(3);
    expect(joinNearbyEndpoints(docWith(line({ x: 0, y: 0 }, { x: 10, y: 0 }), line({ x: 11, y: 0 }, { x: 20, y: 0 })), ["n0"], 0.5)).toBe(0);
    const u: Subpath = { closed: false, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0.2, y: 0.1 }] };
    const d2 = docWith(path([u]));
    expect(joinNearbyEndpoints(d2, [d2.root.children[0].id], 0.5)).toBe(1);
    const closedSub = (d2.root.children[0] as PathNode).subpaths[0];
    expect(closedSub.closed).toBe(true);
    expect(closedSub.nodes).toHaveLength(3);
    roundTrip(docWith(line({ x: 0, y: 0 }, { x: 10, y: 0 }), line({ x: 10.3, y: 0 }, { x: 20, y: 0 })), "Join Nearby Endpoints",
      (x) => joinNearbyEndpoints(x, x.root.children.map((m) => m.id), 0.5));
  });
});
