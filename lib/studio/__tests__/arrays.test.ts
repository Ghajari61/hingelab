import { describe, expect, it } from "vitest";
import { createDocument } from "../doc";
import { boxCenter } from "../geom";
import { worldBox } from "../scene";
import { circularArray, distributeSpacing, gridArray, pathArray, samplePolyline, seeded, stepAndRepeat, transformEach } from "../arrays";
import type { Document, PathNode, SceneNode } from "../types";

let seq = 0;
const id = () => `a${++seq}`;
const close = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const sq = (x: number, y: number, s: number): PathNode => ({
  id: id(), type: "path", transform: [1, 0, 0, 1, x, y], layer: 0,
  subpaths: [{ closed: true, nodes: [{ x: 0, y: 0 }, { x: s, y: 0 }, { x: s, y: s }, { x: 0, y: s }] }],
});
const docWith = (...nodes: SceneNode[]): Document => {
  const d = createDocument({ name: "T", id: "doc", now: "2026-01-01T00:00:00.000Z", sheet: { w: 300, h: 200 } });
  d.root.children.push(...nodes);
  return d;
};
const centre = (d: Document, nid: string) => boxCenter(worldBox(d.root, nid));

describe("arrays", () => {
  it("steps and repeats with cumulative offset", () => {
    const a = sq(0, 0, 10);
    const d = docWith(a);
    const out = stepAndRepeat(d, [a.id], { copies: 3, dx: 20, dy: 5, rotate: 0, scale: 1 }, id);
    expect(out).toHaveLength(3);
    close(centre(d, out[2]).x, 65);
    close(centre(d, out[2]).y, 20);
  });

  it("makes a grid with edge-to-edge gaps", () => {
    const a = sq(0, 0, 10);
    const d = docWith(a);
    const out = gridArray(d, [a.id], { rows: 2, cols: 3, gapX: 5, gapY: 2 }, id);
    expect(out).toHaveLength(5);
    const xs = out.map((o) => worldBox(d.root, o).minX).sort((p, q) => p - q);
    expect(xs.at(-1)).toBeCloseTo(30);
    expect(Math.max(...out.map((o) => worldBox(d.root, o).minY))).toBeCloseTo(12);
  });

  it("spreads copies round a circle", () => {
    const a = sq(-5, -5, 10);
    const d = docWith(a);
    const out = circularArray(d, [a.id], { count: 4, radius: 50, angle: 360, rotateCopies: false }, id);
    expect(out).toHaveLength(3);
    const c = out.map((o) => centre(d, o));
    close(c[0].x, 50, 1e-6); close(c[0].y, 50, 1e-6);
    close(c[1].x, 0, 1e-6); close(c[1].y, 100, 1e-6);
    // Unrotated copies keep their size.
    close(worldBox(d.root, out[0]).maxX - worldBox(d.root, out[0]).minX, 10);
  });

  it("follows a path by length", () => {
    expect(samplePolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 3, false).map((s) => s.p)).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
    const a = sq(0, 0, 2);
    const guide: PathNode = { id: id(), type: "path", transform: [1, 0, 0, 1, 0, 0], layer: 0, subpaths: [{ closed: false, nodes: [{ x: 0, y: 50 }, { x: 100, y: 50 }] }] };
    const d = docWith(a, guide);
    const r = pathArray(d, [a.id, guide.id], { count: 5, rotate: true }, id);
    expect(r.ids).toHaveLength(4);
    close(centre(d, a.id).x, 0); close(centre(d, a.id).y, 50);
    close(centre(d, r.ids[3]).x, 100);
  });

  it("transforms each object around its own centre and distributes spacing", () => {
    const a = sq(0, 0, 10), b = sq(40, 0, 10), c = sq(100, 0, 10);
    const d = docWith(a, b, c);
    transformEach(d, [a.id, b.id], { scaleX: 2, scaleY: 2, dx: 0, dy: 0, rotate: 0, random: false, seed: 1 });
    close(centre(d, b.id).x, 45);
    close(worldBox(d.root, b.id).maxX - worldBox(d.root, b.id).minX, 20);
    distributeSpacing(d, [a.id, b.id, c.id], "x", 3);
    close(worldBox(d.root, b.id).minX, worldBox(d.root, a.id).maxX + 3);
    close(worldBox(d.root, c.id).minX, worldBox(d.root, b.id).maxX + 3);
    const r1 = seeded(7), r2 = seeded(7);
    expect([r1(), r1()]).toEqual([r2(), r2()]);
  });
});
