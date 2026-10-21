import { describe, expect, it } from "vitest";
import { buildBoxes, type BoxesOutput } from "../boxes/build";
import { mergeBoxes } from "../boxes/params";
import { fretHoles, type FretTile } from "../fretwork";
import { distToContour, rect } from "../geom";
import { MOTIF_ART } from "../motifArt";
import { cleanPattern, patternOptions } from "../pattern";
import { SIGN } from "../sign";
import { encodeContours } from "../shadowbox/picPath";
import { randomiseParams } from "../randomise";
import type { Contour } from "../types";
import { CTX } from "./ctx";

const bbox = (c: Contour) => {
  const xs = c.map((q) => q[0]), ys = c.map((q) => q[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
};
const gap = (a: Contour, b: Contour) => Math.min(...a.map((q) => distToContour(q, b)), ...b.map((q) => distToContour(q, a)));

describe("your own seamless tile", () => {
  // A band right across the tile: repeated edge to edge it is one long band per row.
  const band: FretTile = { cs: [rect(0, 30, 100, 40)], w: 100, h: 100 };

  it("joins across the seams, then keeps a bar between neighbours", () => {
    const holes = fretHoles({ kind: "tile", cell: 20, bar: 2, tile: band }, 0, 0, 200, 100);
    // Rows 20 mm apart in 100 mm: four or five whole bands, each nearly the full width.
    expect(holes.length).toBeGreaterThanOrEqual(4);
    for (const h of holes) {
      const b = bbox(h);
      expect(b.x1 - b.x0).toBeGreaterThan(190);
      // 8 mm high (40 % of 20) less half a bar each side.
      expect(b.y1 - b.y0).toBeCloseTo(8 - 2, 1);
    }
    for (let i = 0; i < holes.length; i++) for (let j = i + 1; j < holes.length; j++) expect(gap(holes[i], holes[j])).toBeGreaterThanOrEqual(2 - 0.05);
  });

  it("the grids: square, brick, half drop and mirrored all differ, and stay a bar apart", () => {
    const corner: FretTile = { cs: [rect(5, 5, 50, 30)], w: 100, h: 100 };
    const sig = (grid: "square" | "brick" | "half" | "mirror") => fretHoles({ kind: "tile", cell: 30, bar: 2, tile: corner, grid }, 0, 0, 180, 180).map((h) => bbox(h)).map((b) => `${Math.round(b.x0)},${Math.round(b.y0)}`).sort().join(" ");
    const all = (["square", "brick", "half", "mirror"] as const).map(sig);
    expect(new Set(all).size).toBe(4);
    const m = fretHoles({ kind: "tile", cell: 30, bar: 2, tile: corner, grid: "mirror" }, 0, 0, 180, 180);
    for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) expect(gap(m[i], m[j])).toBeGreaterThanOrEqual(2 - 0.05);
  });

  it("a very fine tile is repeated larger rather than made of too many points", () => {
    const fine: FretTile = { cs: Array.from({ length: 40 }, (_, k) => rect((k % 8) * 12 + 1, Math.floor(k / 8) * 20 + 1, 8, 15)), w: 100, h: 100 };
    const t0 = performance.now();
    const holes = fretHoles({ kind: "tile", cell: 6, bar: 0.5, tile: fine }, 0, 0, 600, 600);
    expect(performance.now() - t0).toBeLessThan(20000);
    expect(holes.length).toBeGreaterThan(0);
    expect(holes.reduce((n, h) => n + h.length, 0)).toBeLessThan(400_000);
  });

  it("no picture yet: no holes, and Randomise never picks it", () => {
    expect(fretHoles({ kind: "tile", cell: 20, bar: 2 }, 0, 0, 100, 100)).toEqual([]);
    expect(patternOptions().find((o) => o.v === "tile")?.input).toBe("picture");
    for (let i = 0; i < 30; i++) {
      const p = randomiseParams(SIGN, SIGN.defaults() as never, new Set(), () => Math.random()) as { pattern?: { pattern: string } };
      expect(p.pattern?.pattern).not.toBe("tile");
    }
  });

  it("on a generator: the picture's edges are the repeat", () => {
    const art = { ...MOTIF_ART, aspect: 1, levels: encodeContours([rect(0, 300, 1000, 400)]) };
    const plain = SIGN.build(SIGN.merge({}), CTX);
    const out = SIGN.build(SIGN.merge({ pattern: { pattern: "tile", cell: 20, bar: 2, art } }), CTX);
    const n = (o: typeof out) => o.parts.reduce((k, p) => k + p.holes.length, 0);
    expect(n(out)).toBeGreaterThan(n(plain));
    expect(SIGN.build(SIGN.merge({ pattern: { pattern: "tile", cell: 20, bar: 2 } }), CTX).stats.find((s) => s.label === "Pattern")?.value).toMatch(/Waiting/);
    const box = buildBoxes(mergeBoxes({ design: "box", pierce: { pattern: "tile", on: "both", cell: 20, bar: 2, art } }), CTX) as BoxesOutput;
    expect(box.parts.find((p) => p.id === "front")!.holes.length).toBeGreaterThan(0);
  });

  it("grid and turn are checked, with the standard grid and no turn otherwise", () => {
    expect(cleanPattern({ pattern: "motif" }, [])).toMatchObject({ grid: "auto", turn: 0 });
    expect(cleanPattern({ pattern: "motif", grid: "brick", turn: 45 }, [])).toMatchObject({ grid: "brick", turn: 45 });
    expect(cleanPattern({ pattern: "motif", grid: "zigzag", turn: 900 }, [])).toMatchObject({ grid: "auto", turn: 180 });
    const b = mergeBoxes({ pierce: { pattern: "motif", grid: "mirror", turn: 30 } });
    expect(b.pierce).toMatchObject({ grid: "mirror", turn: 30 });
    expect("tile" in mergeBoxes({ pierce: { tile: { cs: [], w: 1, h: 1 } } }).pierce).toBe(false);
  });

  it("a motif on a square grid, turned", () => {
    const hex = fretHoles({ kind: "motif", cell: 16, bar: 2 }, 0, 0, 160, 160);
    const sq = fretHoles({ kind: "motif", cell: 16, bar: 2, grid: "square", turn: 90 }, 0, 0, 160, 160);
    expect(sq.length).toBeGreaterThan(0);
    expect(sq.length).not.toBe(hex.length);
  });
});
