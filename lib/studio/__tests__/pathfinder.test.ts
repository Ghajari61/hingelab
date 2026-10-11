import { describe, expect, it } from "vitest";
import { createDocument } from "../doc";
import { flatten, nodePaths, polygonArea, transformSubpaths } from "../geom";
import { locate } from "../scene";
import { booleanOp, cleanupForLaser, editPaths, offsetNodes, ringArea, roundCorners, simplifySubpath, smoothSubpath } from "../pathfinder";
import type { Document, GroupNode, PathNode, SceneNode, Subpath } from "../types";

let seq = 0;
const id = () => `n${++seq}`;
const close = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const sq = (x: number, y: number, s: number, layer = 0): PathNode => ({
  id: id(), type: "path", transform: [1, 0, 0, 1, x, y], layer,
  subpaths: [{ closed: true, nodes: [{ x: 0, y: 0 }, { x: s, y: 0 }, { x: s, y: s }, { x: 0, y: s }] }],
});
const docWith = (...nodes: SceneNode[]): Document => {
  const d = createDocument({ name: "T", id: "doc", now: "2026-01-01T00:00:00.000Z", sheet: { w: 300, h: 200 } });
  d.root.children.push(...nodes);
  return d;
};
/** Filled area of a node (even-odd: holes subtract). */
const areaOf = (d: Document, nid: string) => {
  const l = locate(d.root, nid)!;
  const subs = transformSubpaths(nodePaths(l.node), l.world);
  return Math.abs(subs.reduce((a, s) => a + polygonArea(flatten(s, 0.001)), 0));
};
const groupArea = (d: Document, gid: string) => (locate(d.root, gid)!.node as GroupNode).children.reduce((a, c) => a + areaOf(d, c.id), 0);

describe("pathfinder", () => {
  it("unites, subtracts, intersects and excludes overlapping squares", () => {
    const run = (op: Parameters<typeof booleanOp>[2]) => {
      const a = sq(0, 0, 10, 1), b = sq(5, 5, 10, 2);
      const d = docWith(a, b);
      const r = booleanOp(d, [a.id, b.id], op, id);
      expect(r.error).toBeUndefined();
      return { d, r };
    };
    let { d, r } = run("unite");
    close(areaOf(d, r.ids[0]), 175, 1e-3);
    expect(d.root.children).toHaveLength(1);
    expect(d.root.children[0].layer).toBe(2);
    ({ d, r } = run("minusFront"));
    close(areaOf(d, r.ids[0]), 75, 1e-3);
    expect(d.root.children[0].layer).toBe(1);
    ({ d, r } = run("minusBack"));
    close(areaOf(d, r.ids[0]), 75, 1e-3);
    ({ d, r } = run("intersect"));
    close(areaOf(d, r.ids[0]), 25, 1e-3);
    ({ d, r } = run("exclude"));
    close(areaOf(d, r.ids[0]), 150, 1e-3);
  });

  it("divides into every face, trims hidden parts and crops to the top object", () => {
    const a = sq(0, 0, 10, 1), b = sq(5, 5, 10, 2);
    let d = docWith(a, b);
    let r = booleanOp(d, [a.id, b.id], "divide", id);
    const g = locate(d.root, r.ids[0])!.node as GroupNode;
    expect(g.type).toBe("group");
    expect(g.children).toHaveLength(3);
    close(groupArea(d, g.id), 175, 1e-3);
    expect(g.children.map((c) => c.layer).sort()).toEqual([1, 2, 2]);

    const a2 = sq(0, 0, 10, 1), b2 = sq(5, 5, 10, 2);
    d = docWith(a2, b2);
    r = booleanOp(d, [a2.id, b2.id], "trim", id);
    close(groupArea(d, r.ids[0]), 175, 1e-3);

    const a3 = sq(0, 0, 10, 1), b3 = sq(5, 5, 10, 2);
    d = docWith(a3, b3);
    r = booleanOp(d, [a3.id, b3.id], "crop", id);
    expect(r.ids).toHaveLength(1);
    close(areaOf(d, r.ids[0]), 25, 1e-3);
    expect(d.root.children[0].layer).toBe(1);
  });

  it("reports shapes that do not overlap and needs closed areas", () => {
    const a = sq(0, 0, 10), b = sq(50, 50, 10);
    const d = docWith(a, b);
    expect(booleanOp(d, [a.id, b.id], "intersect", id).error).toMatch(/overlap/);
    expect(d.root.children).toHaveLength(2);
    const line: PathNode = { id: id(), type: "path", transform: [1, 0, 0, 1, 0, 0], layer: 0, subpaths: [{ closed: false, nodes: [{ x: 0, y: 0 }, { x: 5, y: 5 }] }] };
    const e = docWith(line, sq(0, 0, 10));
    expect(booleanOp(e, e.root.children.map((c) => c.id), "unite", id).error).toBeDefined();
  });

  it("offsets closed areas and outlines open paths, keeping the original", () => {
    const a = sq(0, 0, 10);
    const d = docWith(a);
    const [o] = offsetNodes(d, [a.id], 1, "miter", 4, id);
    expect(d.root.children).toHaveLength(2);
    close(areaOf(d, o), 144, 0.05);
    const [i] = offsetNodes(d, [a.id], -2, "miter", 4, id);
    close(areaOf(d, i), 36, 0.05);
    const line: PathNode = { id: id(), type: "path", transform: [1, 0, 0, 1, 0, 0], layer: 0, subpaths: [{ closed: false, nodes: [{ x: 0, y: 0 }, { x: 20, y: 0 }] }] };
    const e = docWith(line);
    const [w] = offsetNodes(e, [line.id], 1, "bevel", 4, id);
    close(areaOf(e, w), 40, 0.05);
  });

  it("rounds and chamfers straight corners only", () => {
    const s: Subpath = { closed: true, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] };
    const r = roundCorners(s, 2);
    expect(r.nodes).toHaveLength(8);
    close(ringArea(r), 100 - 4 * (4 - Math.PI), 0.05);
    const c = roundCorners(s, 2, "chamfer");
    close(ringArea(c), 100 - 4 * 2, 1e-9);
    const big = roundCorners(s, 50);
    close(ringArea(big), Math.PI * 25, 0.25);
  });

  it("simplifies and smooths paths", () => {
    const pts = Array.from({ length: 200 }, (_, k) => ({ x: 20 * Math.cos((k / 200) * 2 * Math.PI), y: 20 * Math.sin((k / 200) * 2 * Math.PI) }));
    const circle: Subpath = { closed: true, nodes: pts };
    const simple = simplifySubpath(circle, 0.2);
    expect(simple.nodes.length).toBeLessThan(40);
    close(ringArea(simple), ringArea(circle), ringArea(circle) * 0.02);
    const straight = simplifySubpath(circle, 0.2, true);
    expect(straight.nodes.every((n) => !n.i && !n.o)).toBe(true);
    const sm = smoothSubpath({ closed: true, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] });
    expect(sm.nodes.every((n) => n.i && n.o)).toBe(true);
    const shape: SceneNode = { id: id(), type: "shape", transform: [1, 0, 0, 1, 0, 0], layer: 0, shape: { kind: "rect", w: 10, h: 10, r: [0, 0, 0, 0], corner: "round" } } as SceneNode;
    const d = docWith(shape);
    editPaths(d, [shape.id], (s) => roundCorners(s, 1));
    expect(d.root.children[0].type).toBe("path");
  });

  it("cleans up for laser: repeated points, near-closed ends, empty paths and duplicates", () => {
    const a = sq(0, 0, 10, 2), dup = sq(0, 0, 10, 2), other = sq(0, 0, 10, 3);
    const open: PathNode = { id: id(), type: "path", transform: [1, 0, 0, 1, 0, 0], layer: 0, subpaths: [{ closed: false, nodes: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0.02, y: 0.01 }] }] };
    const empty: PathNode = { id: id(), type: "path", transform: [1, 0, 0, 1, 0, 0], layer: 0, subpaths: [{ closed: false, nodes: [{ x: 1, y: 1 }] }] };
    const d = docWith(a, dup, other, open, empty);
    const rep = cleanupForLaser(d, null);
    expect(rep).toEqual({ points: 2, closed: 1, removed: 1, duplicates: 1 });
    expect(d.root.children.map((c) => c.id)).toEqual([a.id, other.id, open.id]);
    const o = d.root.children[2] as PathNode;
    expect(o.subpaths[0].closed).toBe(true);
    expect(o.subpaths[0].nodes).toHaveLength(3);
  });
});
