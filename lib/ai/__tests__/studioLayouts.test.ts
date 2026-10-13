import { describe, expect, it } from "vitest";
import { subpathsBox } from "@/lib/studio/geom";
import { pieces, regionOf } from "@/lib/studio/pathfinder";
import type { Subpath } from "@/lib/studio/types";
import { circlePath, lampLayout, largestPiece, rectPath, reliefLayout, roundRectPath, signLayout, silhouette, topperLayout } from "../studio/layouts";

/** A ring (outer square with a square hole) plus a separate small square. */
const ring: Subpath[] = [rectPath(0, 0, 40, 40), { closed: true, nodes: [...rectPath(10, 10, 20, 20).nodes].reverse() }];
const art: Subpath[] = [...ring, rectPath(60, 10, 10, 10)];

describe("AI Studio layouts", () => {
  it("silhouette fills holes; largest piece keeps them", () => {
    expect(pieces(regionOf(silhouette(ring)))).toHaveLength(1);
    expect(pieces(regionOf(silhouette(ring)))[0]).toHaveLength(1);
    const big = largestPiece(art);
    expect(pieces(regionOf(big))).toHaveLength(1);
    expect(subpathsBox(big).maxX).toBeCloseTo(40, 3);
  });

  it("a cake topper is one piece with a stake under the art", () => {
    const t = topperLayout(ring, { stakeLength: 80 });
    expect(pieces(regionOf(t))).toHaveLength(1);
    const b = subpathsBox(t);
    expect(b.maxY).toBeCloseTo(120, 3);
    expect(b.minY).toBeCloseTo(0, 3);
  });

  it("a sign puts the art inside a board with two holes above it", () => {
    const s = signLayout(art, { margin: 10, holes: true, holeDiameter: 5 });
    const board = subpathsBox(s.board), a = subpathsBox(s.art);
    expect(a.minX).toBeGreaterThanOrEqual(board.minX + 9.99);
    expect(a.maxX).toBeLessThanOrEqual(board.maxX - 9.99);
    expect(a.maxY).toBeLessThanOrEqual(board.maxY - 9.99);
    expect(s.holes).toHaveLength(2);
    for (const h of s.holes) expect(subpathsBox([h]).maxY).toBeLessThan(a.minY);
    expect(signLayout(art, { holes: false }).holes).toHaveLength(0);
  });

  it("a lamp panel repeats the silhouette inside the margin", () => {
    const p = lampLayout(art, { width: 200, height: 100, cell: 25, gap: 5, margin: 10, stagger: false });
    expect(p.count).toBe(7 * 3);
    const b = subpathsBox(p.holes);
    expect(b.minX).toBeGreaterThanOrEqual(10 - 1e-6);
    expect(b.maxY).toBeLessThanOrEqual(90 + 1e-6);
  });

  it("relief sheets: backing first, each scored with the next sheet's outline", () => {
    const sheets = [[rectPath(5, 5, 30, 30)], [rectPath(10, 10, 20, 20)], []];
    const r = reliefLayout(sheets, 40, 40, 8, 100);
    expect(r.map((x) => x.name)).toEqual(["Relief backing", "Relief sheet 1 of 2", "Relief sheet 2 of 2"]);
    expect(subpathsBox(r[0].score).minX).toBeCloseTo(5, 6);
    expect(r[2].score).toHaveLength(0);
    // two per row at 100 mm: the third sheet starts a new row
    expect(subpathsBox(r[2].cut).minY).toBeCloseTo(48 + 10, 6);
  });

  it("shape helpers", () => {
    expect(subpathsBox([roundRectPath(0, 0, 50, 20, 5)])).toMatchObject({ minX: 0, maxX: 50 });
    const c = subpathsBox([circlePath(10, 10, 5)]);
    expect(c.maxX).toBeCloseTo(15, 1);
    expect(c.minY).toBeCloseTo(5, 1);
  });
});
