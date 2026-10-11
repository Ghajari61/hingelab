import { describe, expect, it } from "vitest";
import { createDocument } from "../doc";
import { apply } from "../geom";
import { syncLinks } from "../links";
import { findNode, worldBox } from "../scene";
import { copiesPerPosition, createTiledClones, rasterSampler, tileCopies, TILING_DEFAULTS, WALLPAPER_GROUPS, type WallpaperGroup } from "../tiling";
import type { Mat, PathNode } from "../types";

const S3 = Math.sqrt(3);
const det = (m: Mat) => Math.sign(m[0] * m[3] - m[1] * m[2]);
/** Marker (2, 1) from the tile centre of a 10 × 6 tile centred on the origin. */
const MARK = { x: 2, y: 1 };
const run = (group: WallpaperGroup) => tileCopies({ ...TILING_DEFAULTS, group, rows: 3, cols: 3, w: 10, h: 6, cx: 0, cy: 0 });

/** [row, col, copy, marker x, marker y, orientation (+1 turned, −1 mirrored)], worked out by hand. */
const EXPECT: Record<WallpaperGroup, { count: number; at: [number, number, number, number, number, number][] }> = {
  P1: { count: 9, at: [[0, 0, 0, 2, 1, 1], [0, 1, 0, 12, 1, 1], [2, 2, 0, 22, 13, 1]] },
  P2: { count: 9, at: [[0, 1, 0, 8, -1, 1], [1, 1, 0, 8, 5, 1], [2, 2, 0, 22, 13, 1]] },
  PM: { count: 9, at: [[0, 1, 0, 8, 1, -1], [1, 2, 0, 22, 7, 1], [2, 1, 0, 8, 13, -1]] },
  PG: { count: 9, at: [[1, 0, 0, -2, 7, -1], [1, 1, 0, 8, 7, -1], [2, 1, 0, 12, 13, 1]] },
  CM: { count: 9, at: [[0, 1, 0, 8, 1, -1], [1, 0, 0, -2, 7, -1], [1, 1, 0, 12, 7, 1], [2, 2, 0, 22, 13, 1]] },
  PMM: { count: 9, at: [[0, 1, 0, 8, 1, -1], [1, 0, 0, 2, 5, -1], [1, 1, 0, 8, 5, 1]] },
  PMG: { count: 9, at: [[0, 1, 0, 8, 1, -1], [1, 0, 0, -2, 5, 1], [1, 1, 0, 12, 5, -1]] },
  PGG: { count: 9, at: [[0, 1, 0, 12, -1, -1], [1, 0, 0, -2, 7, -1], [1, 1, 0, 8, 5, 1]] },
  CMM: { count: 9, at: [[0, 1, 0, 8, 1, -1], [1, 0, 0, 2, 5, -1], [1, 1, 0, 8, 5, 1], [2, 0, 0, -2, 13, -1], [2, 1, 0, 12, 13, 1]] },
  P4: { count: 9, at: [[0, 0, 0, 2, 1, 1], [0, 1, 0, 9, 2, 1], [1, 1, 0, 8, 9, 1], [1, 0, 0, 1, 8, 1], [0, 2, 0, 22, 1, 1], [2, 2, 0, 22, 21, 1], [2, 1, 0, 9, 22, 1]] },
  P4M: { count: 18, at: [[0, 0, 1, 1, 2, -1], [0, 1, 0, 9, 2, 1], [0, 1, 1, 8, 1, -1]] },
  P4G: { count: 18, at: [[0, 0, 1, -1, -2, -1], [0, 1, 1, 12, -1, -1], [1, 1, 0, 8, 9, 1]] },
  P3: { count: 27, at: [[0, 0, 1, S3 - 1, 4 + S3, 1], [0, 1, 0, 17, 1 + 5 * S3, 1], [1, 0, 2, -1 - S3, 4 - S3 + 10 * S3, 1]] },
  P3M1: { count: 54, at: [[0, 0, 3, 2, 5, -1], [0, 0, 4, -1 - S3, 3 + S3 - 1, -1]] },
  P31M: { count: 54, at: [[0, 0, 4, -2, 1, -1], [0, 0, 1, S3 - 1, 4 + S3, 1]] },
  P6: { count: 54, at: [[0, 0, 1, 1 + S3, 2 + S3, 1], [0, 0, 3, -2, 5, 1]] },
  P6M: { count: 108, at: [[0, 0, 6, 2, 5, -1], [0, 0, 9, -2, 1, -1], [0, 0, 1, 1 + S3, 2 + S3, 1]] },
};

describe("tiled clones", () => {
  it("covers all 17 wallpaper groups", () => expect(WALLPAPER_GROUPS).toHaveLength(17));

  for (const g of WALLPAPER_GROUPS) {
    it(`${g}: count, positions and orientation on a 3 × 3 grid`, () => {
      const copies = run(g);
      expect(copies).toHaveLength(EXPECT[g].count);
      expect(copies.length).toBe(9 * copiesPerPosition(g));
      // The first copy is the tile itself.
      expect(apply(copies[0].m, MARK)).toEqual(MARK);
      for (const [r, c, k, x, y, o] of EXPECT[g].at) {
        const cp = copies.find((q) => q.row === r && q.col === c && q.k === k)!;
        const p = apply(cp.m, MARK);
        expect(p.x, `${g} ${r},${c},${k} x`).toBeCloseTo(x, 9);
        expect(p.y, `${g} ${r},${c},${k} y`).toBeCloseTo(y, 9);
        expect(det(cp.m), `${g} ${r},${c},${k} orientation`).toBe(o);
      }
    });
  }

  it("applies shift, scale, rotation per row and column and seeded randomness", () => {
    const base = { ...TILING_DEFAULTS, rows: 2, cols: 2, w: 10, h: 10, cx: 5, cy: 5 };
    const a = tileCopies({ ...base, shift: { rowX: 50, rowY: 0, colX: 0, colY: 10 } });
    expect(a[2].centre).toEqual({ x: 10, y: 15 }); // row 1, col 0: +5 mm across
    expect(a[1].centre).toEqual({ x: 15, y: 6 }); // row 0, col 1: +1 mm down
    const b = tileCopies({ ...base, scale: { row: 0, col: 50 }, rotate: { row: 90, col: 0 } });
    expect(Math.hypot(b[1].m[0], b[1].m[1])).toBeCloseTo(1.5, 12);
    expect(b[2].m[1]).toBeCloseTo(1, 12); // turned 90°
    expect(b[1].centre).toEqual({ x: 15, y: 5 }); // scaled around its own centre
    const r1 = tileCopies({ ...base, random: { position: 20, scale: 20, rotate: 20, seed: 4 } });
    const r2 = tileCopies({ ...base, random: { position: 20, scale: 20, rotate: 20, seed: 4 } });
    expect(r1).toEqual(r2);
    expect(r1[1].centre).not.toEqual(a[1].centre);
  });

  it("traces an image: darker pixels make bigger copies, white ones are left out", () => {
    // 2 × 1 image, left black, right white, 20 × 10 mm centred at (10, 5).
    const raster = { width: 2, height: 1, data: [0, 0, 0, 255, 255, 255, 255, 255] };
    const sample = rasterSampler([{ raster, w: 20, h: 10, world: [1, 0, 0, 1, 10, 5] }]);
    expect(sample({ x: 5, y: 5 })).toBe(0);
    expect(sample({ x: 15, y: 5 })).toBe(1);
    expect(sample({ x: 50, y: 5 })).toBeNull();
    const copies = tileCopies({ ...TILING_DEFAULTS, rows: 1, cols: 2, w: 10, h: 10, cx: 5, cy: 5 }, { sample, invert: true });
    expect(copies).toHaveLength(1);
    expect(copies[0].col).toBe(0);
  });

  it("creates clones that follow the tile, or plain copies, in one group", () => {
    const d = createDocument({ name: "T", id: "doc", now: "2026-01-01T00:00:00.000Z" });
    const tile: PathNode = { id: "t", type: "path", transform: [1, 0, 0, 1, 0, 0], layer: 2, subpaths: [{ closed: true, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 6 }] }] };
    d.root.children.push(tile);
    const copies = tileCopies({ ...TILING_DEFAULTS, group: "PM", rows: 1, cols: 2, w: 10, h: 6, cx: 5, cy: 3 });
    let seq = 0;
    const g = createTiledClones(d, "t", copies, false, () => `c${++seq}`)!;
    expect(findNode(d.root, g)?.type).toBe("group");
    expect(worldBox(d.root, g)).toEqual({ minX: 0, minY: 0, maxX: 20, maxY: 6 });
    // Documents are immutable in the editor: an edited tile is a new object.
    d.root.children[0] = { ...tile, subpaths: [{ closed: true, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 12 }] }] };
    const d2 = syncLinks(d);
    expect(worldBox(d2.root, g).maxY).toBe(12);
    const gp = createTiledClones(d, "t", copies, true, () => `p${++seq}`)!;
    const kids = (findNode(d.root, gp) as { children: { type: string }[] }).children;
    expect(kids.map((k) => k.type)).toEqual(["path", "path"]);
  });
});
