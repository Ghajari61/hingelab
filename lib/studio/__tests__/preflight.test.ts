import { describe, expect, it } from "vitest";
import { createDocument } from "../doc";
import { preflightMessage, preflightPaths } from "../preflight";
import type { Document, GroupNode, Mat, PathNode, Vec } from "../types";

const I: Mat = [1, 0, 0, 1, 0, 0];

function doc(...nodes: (PathNode | GroupNode)[]): Document {
  const d = createDocument({ name: "P", id: "doc", now: "2026-01-01T00:00:00.000Z" });
  d.root.children.push(...nodes);
  return d;
}

const poly = (id: string, pts: Vec[], closed = true, transform: Mat = I): PathNode => ({
  id, type: "path", layer: 0, transform, subpaths: [{ closed, nodes: pts.map((p) => ({ x: p.x, y: p.y })) }],
});
const square = (id: string, x: number, y: number, s = 10, transform: Mat = I) =>
  poly(id, [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }], true, transform);

describe("pre-flight after path operations", () => {
  it("finds nothing wrong with separate closed shapes", () => {
    const d = doc(square("a", 0, 0), square("b", 30, 0));
    const r = preflightPaths(d, ["a", "b"]);
    expect(r).toEqual({ open: [], duplicates: [] });
    expect(preflightMessage(r, "Divide")).toBeNull();
  });

  it("reports open paths, unless told they are expected", () => {
    const d = doc(poly("line", [{ x: 0, y: 0 }, { x: 20, y: 5 }], false), square("b", 30, 0));
    expect(preflightPaths(d, ["line", "b"]).open).toEqual(["line"]);
    expect(preflightPaths(d, ["line", "b"], { open: false }).open).toEqual([]);
  });

  it("reports exact duplicates and pieces that share an edge", () => {
    const twins = doc(square("a", 0, 0), square("b", 0, 0), square("c", 50, 50));
    expect(preflightPaths(twins, ["a", "b", "c"]).duplicates).toEqual(["a", "b"]);
    const neighbours = doc(square("a", 0, 0), square("b", 10, 0));
    expect(preflightPaths(neighbours, ["a", "b"]).duplicates).toEqual(["a", "b"]);
    // A shared stretch shorter than the minimum is ignored.
    const touching = doc(square("a", 0, 0), square("b", 10, 9.8));
    expect(preflightPaths(touching, ["a", "b"]).duplicates).toEqual([]);
  });

  it("matches lines whatever their direction, including near-horizontal ones drawn either way", () => {
    const a = poly("a", [{ x: 0, y: 0 }, { x: 40, y: 0.001 }], false);
    const b = poly("b", [{ x: 35, y: 0.0005 }, { x: 5, y: -0.0002 }], false);
    expect(preflightPaths(doc(a, b), ["a", "b"]).duplicates).toEqual(["a", "b"]);
    const c = poly("c", [{ x: 0, y: 0 }, { x: 30, y: 30 }], false);
    const e = poly("e", [{ x: 25, y: 25 }, { x: 10, y: 10 }], false);
    expect(preflightPaths(doc(c, e), ["c", "e"]).duplicates).toEqual(["c", "e"]);
    const f = poly("f", [{ x: 0, y: 0.2 }, { x: 30, y: 30.2 }], false);
    expect(preflightPaths(doc(c, f), ["c", "f"]).duplicates).toEqual([]);
  });

  it("uses world coordinates and opens groups", () => {
    const g: GroupNode = { id: "g", type: "group", layer: 0, transform: [1, 0, 0, 1, 10, 0], children: [square("in", 0, 0)] };
    const d = doc(g, square("out", 10, 0), square("moved", 0, 0, 10, [1, 0, 0, 1, 40, 0]));
    const r = preflightPaths(d, ["g", "out", "moved"]);
    expect(r.duplicates).toEqual(["in", "out"]);
    expect(preflightMessage(r, "Fracture")).toBe("Fracture: 2 objects with lines on top of each other (cut twice)");
  });

  it("reports overlapping parts of the same path", () => {
    const p: PathNode = { ...square("p", 0, 0), subpaths: [...square("x", 0, 0).subpaths, ...square("y", 0, 0).subpaths] };
    expect(preflightPaths(doc(p), ["p"]).duplicates).toEqual(["p"]);
  });
});
