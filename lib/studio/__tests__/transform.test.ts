import { describe, expect, it } from "vitest";
import { createDocument } from "../doc";
import { decompose } from "../geom";
import { locate, selectionBox } from "../scene";
import { currentShear, flipAt, moveRefTo, refAt, resizeTo, rotateTo, shearTo } from "../transform";
import type { Document, PathNode } from "../types";

const close = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const square = (id: string, x: number, y: number, s = 10): PathNode => ({
  id, type: "path", transform: [1, 0, 0, 1, x, y], layer: 0,
  subpaths: [{ closed: true, nodes: [{ x: 0, y: 0 }, { x: s, y: 0 }, { x: s, y: s }, { x: 0, y: s }] }],
});
const docWith = (...nodes: PathNode[]): Document => {
  const d = createDocument({ name: "T", id: "doc", now: "2026-01-01T00:00:00.000Z", sheet: { w: 300, h: 200 } });
  d.root.children.push(...nodes);
  return d;
};

describe("transform panel", () => {
  it("reads and moves the reference point", () => {
    const d = docWith(square("a", 10, 20, 10), square("b", 40, 20, 10));
    const b = selectionBox(d, ["a", "b"]);
    expect(refAt(b, [0.5, 0.5])).toEqual({ x: 30, y: 25 });
    moveRefTo(d, ["a", "b"], [1, 1], "x", 100);
    const m = selectionBox(d, ["a", "b"]);
    close(m.maxX, 100);
    close(m.minX, 60);
  });

  it("resizes around the reference point, optionally keeping proportions", () => {
    const d = docWith(square("a", 10, 10, 20));
    resizeTo(d, ["a"], [1, 1], "w", 40);
    let b = selectionBox(d, ["a"]);
    close(b.maxX, 30); close(b.minX, -10); close(b.maxY - b.minY, 20);
    resizeTo(d, ["a"], [0.5, 0.5], "h", 40, true);
    b = selectionBox(d, ["a"]);
    close(b.maxY - b.minY, 40); close(b.maxX - b.minX, 80); close((b.minY + b.maxY) / 2, 20);
  });

  it("sets rotation and shear absolutely and keeps the reference point still", () => {
    const d = docWith(square("a", 0, 0, 10));
    rotateTo(d, ["a"], [0, 0], 30);
    close(decompose(locate(d.root, "a")!.world).rotation, 30);
    rotateTo(d, ["a"], [0, 0], 30);
    close(decompose(locate(d.root, "a")!.world).rotation, 30);

    const e = docWith(square("s", 0, 0, 10));
    const before = refAt(selectionBox(e, ["s"]), [0, 1]);
    shearTo(e, ["s"], [0, 1], 20);
    close(currentShear(e, ["s"]), 20, 1e-9);
    const after = refAt(selectionBox(e, ["s"]), [0, 1]);
    close(after.y, before.y);
    shearTo(e, ["s"], [0, 1], 0);
    close(currentShear(e, ["s"]), 0, 1e-9);
    const b = selectionBox(e, ["s"]);
    close(b.maxX - b.minX, 10); close(b.maxY - b.minY, 10);
  });

  it("flips across the reference point", () => {
    const d = docWith(square("a", 10, 10, 10));
    flipAt(d, ["a"], [0, 0], "h");
    const b = selectionBox(d, ["a"]);
    close(b.minX, 0); close(b.maxX, 10);
  });
});
