import { describe, expect, it } from "vitest";
import { cubicAt, flatten, polygonArea, segments } from "../geom";
import { brushOutline, brushProfile, bsplinePath, freehandPath, paraxialAppend, penSubpath, smoothThrough } from "../strokes";
import type { Subpath, Vec } from "../types";

const close = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const area = (subs: Subpath[]) => Math.abs(subs.reduce((a, s) => a + polygonArea(flatten(s, 0.001)), 0));
const line: Subpath = { closed: false, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }] };

describe("pen and pencil curve modes", () => {
  it("smooth mode passes through every point with matching tangents", () => {
    const pts: Vec[] = [{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }, { x: 30, y: 8 }];
    const s = smoothThrough(pts, false);
    expect(s.nodes.map((n) => [n.x, n.y])).toEqual(pts.map((p) => [p.x, p.y]));
    for (const n of s.nodes.slice(1, -1)) {
      const cross = (n.i!.x - n.x) * (n.o!.y - n.y) - (n.i!.y - n.y) * (n.o!.x - n.x);
      close(cross, 0, 1e-9);
    }
    const ring = smoothThrough(pts, true);
    expect(ring.closed).toBe(true);
    expect(segments(ring)).toHaveLength(4);
  });

  it("B-spline mode starts and ends on the end points and stays inside the control polygon", () => {
    const pts: Vec[] = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }, { x: 30, y: 10 }];
    const s = bsplinePath(pts, false);
    expect(s.nodes[0]).toMatchObject({ x: 0, y: 0 });
    expect(s.nodes[s.nodes.length - 1]).toMatchObject({ x: 30, y: 10 });
    for (const g of segments(s)) for (let t = 0; t <= 1; t += 0.25) {
      const p = cubicAt(g, t);
      expect(p.y).toBeGreaterThanOrEqual(-1e-9);
      expect(p.y).toBeLessThanOrEqual(10 + 1e-9);
    }
    const c = bsplinePath(pts, true);
    expect(c.closed).toBe(true);
    expect(c.nodes).toHaveLength(4);
  });

  it("paraxial mode adds horizontal and vertical segments, turning each time", () => {
    let n = paraxialAppend([], { x: 0, y: 0 });
    n = paraxialAppend(n, { x: 10, y: 5 });
    expect(n).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }]);
    n = paraxialAppend(n, { x: 20, y: 15 });
    expect(n.slice(3)).toEqual([{ x: 20, y: 5 }, { x: 20, y: 15 }]);
    expect(penSubpath("paraxial", n, false).nodes).toHaveLength(5);
  });

  it("freehand output modes all start at the first point", () => {
    const pts = Array.from({ length: 40 }, (_, k) => ({ x: k, y: Math.sin(k / 4) * 5 }));
    for (const m of ["bezier", "smooth", "bspline"] as const) {
      const s = freehandPath(pts, 0.1, false, m);
      close(s.nodes[0].x, 0, 1e-9);
      expect(s.nodes.length).toBeGreaterThan(2);
    }
  });
});

describe("brush outlines", () => {
  it("a constant brush along a 10 mm line is a 10 × w rectangle", () => {
    close(area(brushOutline(line, brushProfile("none", 2))), 20, 1e-6);
  });

  it("triangle and ellipse shapes taper the outline", () => {
    close(area(brushOutline(line, brushProfile("triangleOut", 2))), 10, 1e-3);
    close(area(brushOutline(line, brushProfile("triangleIn", 2))), 10, 1e-3);
    close(area(brushOutline(line, brushProfile("ellipse", 2))), (Math.PI * 10 * 2) / 4, 0.05);
  });

  it("a closed path becomes a band", () => {
    const sq: Subpath = { closed: true, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] };
    const out = brushOutline(sq, () => 2);
    expect(out).toHaveLength(2);
    close(area(out), 144 - 64, 1e-3);
  });
});
