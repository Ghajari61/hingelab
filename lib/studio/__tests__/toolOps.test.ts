import { describe, expect, it } from "vitest";
import { createDocument } from "../doc";
import { apply, flatten, nodePaths, polygonArea, transformSubpaths } from "../geom";
import { locate } from "../scene";
import { buildShapes, builderFaces, curvaturePath, eraseAlong, faceAt, knifeCut, lassoHits, scissorsAt, shearAt } from "../toolOps";
import type { Document, PathNode, SceneNode } from "../types";

let seq = 0;
const id = () => `t${++seq}`;
const close = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const sq = (x: number, y: number, s: number, layer = 0): PathNode => ({
  id: id(), type: "path", transform: [1, 0, 0, 1, x, y], layer,
  subpaths: [{ closed: true, nodes: [{ x: 0, y: 0 }, { x: s, y: 0 }, { x: s, y: s }, { x: 0, y: s }] }],
});
const line = (x0: number, y0: number, x1: number, y1: number): PathNode => ({
  id: id(), type: "path", transform: [1, 0, 0, 1, 0, 0], layer: 0, subpaths: [{ closed: false, nodes: [{ x: x0, y: y0 }, { x: x1, y: y1 }] }],
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

describe("tool operations", () => {
  it("scissors open a closed path and split an open one", () => {
    const a = sq(0, 0, 10);
    const d = docWith(a);
    expect(scissorsAt(d, { x: 5, y: 0.2 }, 0.5, id)).toEqual([a.id]);
    const p = d.root.children[0] as PathNode;
    expect(p.subpaths[0].closed).toBe(false);
    expect(p.subpaths[0].nodes).toHaveLength(6);
    expect(p.subpaths[0].nodes[0]).toMatchObject({ x: 5, y: 0 });
    expect(p.subpaths[0].nodes[5]).toMatchObject({ x: 5, y: 0 });

    const l = line(0, 0, 20, 0);
    const d2 = docWith(l);
    const r = scissorsAt(d2, { x: 15, y: 0 }, 0.5, id)!;
    expect(r).toHaveLength(2);
    expect((d2.root.children[0] as PathNode).subpaths[0].nodes.at(-1)).toMatchObject({ x: 15, y: 0 });
    expect((d2.root.children[1] as PathNode).subpaths[0].nodes[0]).toMatchObject({ x: 15, y: 0 });
    expect(scissorsAt(d2, { x: 50, y: 50 }, 0.5, id)).toBeNull();
  });

  it("knife splits only shapes it crosses completely", () => {
    const a = sq(0, 0, 10, 3), b = sq(30, 0, 10);
    const d = docWith(a, b);
    const out = knifeCut(d, null, [{ x: 5, y: -5 }, { x: 5, y: 15 }], id);
    expect(out).toHaveLength(2);
    expect(d.root.children).toHaveLength(3);
    close(areaOf(d, out[0]) + areaOf(d, out[1]), 100, 0.05);
    expect(d.root.children.filter((n) => n.layer === 3)).toHaveLength(2);
    // A cut that stops inside the shape changes nothing.
    expect(knifeCut(d, [b.id], [{ x: 35, y: -5 }, { x: 35, y: 5 }], id)).toEqual([]);
  });

  it("erases a hole in an area and a gap in a line", () => {
    const a = sq(0, 0, 20), l = line(0, 40, 20, 40);
    const d = docWith(a, l);
    const changed = eraseAlong(d, null, [{ x: 10, y: 10 }], 4);
    expect(changed).toEqual([a.id]);
    close(areaOf(d, a.id), 400 - Math.PI * 4, 0.1);
    eraseAlong(d, null, [{ x: 10, y: 35 }, { x: 10, y: 45 }], 2);
    const lp = d.root.children.find((n) => n.id === l.id) as PathNode;
    expect(lp.subpaths).toHaveLength(2);
    // Erasing everything removes the object.
    eraseAlong(d, [l.id], [{ x: -5, y: 40 }, { x: 25, y: 40 }], 4);
    expect(d.root.children.some((n) => n.id === l.id)).toBe(false);
  });

  it("shape builder merges and removes faces", () => {
    const a = sq(0, 0, 10, 1), b = sq(5, 5, 10, 2);
    const d = docWith(a, b);
    const faces = builderFaces(d, [a.id, b.id]);
    expect(faces).toHaveLength(3);
    const left = faceAt(faces, { x: 2, y: 2 }), mid = faceAt(faces, { x: 7, y: 7 }), right = faceAt(faces, { x: 13, y: 13 });
    expect(new Set([left, mid, right]).size).toBe(3);
    expect(faceAt(faces, { x: 50, y: 50 })).toBe(-1);
    const out = buildShapes(d, [a.id, b.id], [left, mid], [right], id);
    expect(out).toHaveLength(1);
    close(areaOf(d, out[0]), 100, 1e-3);
    expect(d.root.children).toHaveLength(1);
  });

  it("lasso selects objects with outline inside, curvature keeps corners, shear moves by height", () => {
    const a = sq(0, 0, 10), b = sq(50, 50, 10);
    const d = docWith(a, b);
    expect(lassoHits(d, [{ x: -5, y: -5 }, { x: 5, y: -5 }, { x: 5, y: 5 }, { x: -5, y: 5 }])).toEqual([a.id]);
    const s = curvaturePath([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }], new Set([1]), false);
    expect(s.nodes[1].i).toBeUndefined();
    expect(s.nodes[0].o).toBeDefined();
    const m = shearAt(0.5, "x", { x: 0, y: 10 });
    expect(apply(m, { x: 0, y: 20 })).toEqual({ x: 5, y: 20 });
    expect(apply(m, { x: 3, y: 10 })).toEqual({ x: 3, y: 10 });
  });
});
