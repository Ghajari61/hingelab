/**
 * Tiled clones: a tile repeated over rows × columns with one of the 17 wallpaper (plane symmetry)
 * groups, plus per-row / per-column shift, scale and rotation, seeded randomness and an optional
 * image "trace" that scales each copy by the brightness under it.
 *
 * Cells (our own choice, from the standard definitions of the plane groups):
 * - Rectangular groups (P1 … CMM): one tile per grid position, w × h apart; the symmetry operation of a
 *   position depends on the parity of its row and column (mirrors and 180° turns about the tile centre).
 * - Square groups (P4, P4M, P4G): the tile sits in an s × s cell (s = the larger side); 2 × 2 cells turn
 *   about their shared corner. P4M and P4G add a reflection of each cell about one of its diagonals, so
 *   their tile is meant to be a triangle (half the cell) — a full rectangle overlaps its mirror image.
 * - Hexagonal groups (P3, P3M1, P31M, P6, P6M): every grid position is a flat-top hexagon of side w
 *   whose centre is the tile's bottom centre; the tile is meant to be the hexagon's top triangle
 *   (pointing down, side w). Copies turn by 120° (P3) or 60° (P6) about that centre; P3M1 mirrors in
 *   lines through the hexagon's corners, P31M through its edge midpoints, P6M in both. Columns are
 *   1.5·w apart and odd columns sit half a hexagon lower.
 */
import { seeded } from "./arrays";
import { apply, I, invert, mul, rotateAt, scaleAt, translate } from "./geom";
import { inParent, sourceGeometry } from "./links";
import { locate, type IdFactory } from "./scene";
import { newId } from "./doc";
import type { CloneNode, Document, GroupNode, Mat, SceneNode, Vec } from "./types";

export const WALLPAPER_GROUPS = ["P1", "P2", "PM", "PG", "CM", "PMM", "PMG", "PGG", "CMM", "P4", "P4M", "P4G", "P3", "P3M1", "P31M", "P6", "P6M"] as const;
export type WallpaperGroup = (typeof WALLPAPER_GROUPS)[number];

export const GROUP_INFO: Record<WallpaperGroup, string> = {
  P1: "Plain repeat",
  P2: "Every other column turned 180°",
  PM: "Every other column mirrored",
  PG: "Every other row mirrored (glide)",
  CM: "Mirrored in a checkerboard",
  PMM: "Mirrored across rows and columns",
  PMG: "Mirrored columns, turned rows",
  PGG: "Glides both ways",
  CMM: "Mirrored both ways, rows offset",
  P4: "Four turns of 90° around a corner",
  P4M: "Four turns plus diagonal mirrors",
  P4G: "Four turns plus off-centre mirrors",
  P3: "Three turns of 120°",
  P3M1: "Three turns, mirrors through the corners",
  P31M: "Three turns, mirrors through the edges",
  P6: "Six turns of 60°",
  P6M: "Six turns plus mirrors (kaleidoscope)",
};

const MX: Mat = [-1, 0, 0, 1, 0, 0];
const MY: Mat = [1, 0, 0, -1, 0, 0];
const R180: Mat = [-1, 0, 0, -1, 0, 0];
const D: Mat = [0, 1, 1, 0, 0, 0];
const E: Mat = [0, -1, -1, 0, 0, 0];
const odd = (n: number) => Math.abs(n % 2) === 1;
/** Reflection in the line through `o` at `deg` degrees. */
const reflectAt = (deg: number, o: Vec): Mat => {
  const t = (2 * deg * Math.PI) / 180;
  return mul(translate(o.x, o.y), mul([Math.cos(t), Math.sin(t), Math.sin(t), -Math.cos(t), 0, 0], translate(-o.x, -o.y)));
};

/** Copies a grid position holds, as matrices in the tile's frame (origin at the tile centre; position (0, 0) copy 0 is the tile itself). */
export function symmetryOps(g: WallpaperGroup, row: number, col: number, w: number, h: number): Mat[] {
  const r = row, c = col;
  const at = (op: Mat) => mul(translate(c * w, r * h), op);
  switch (g) {
    case "P1": return [at(I)];
    case "P2": return [at(odd(c) ? R180 : I)];
    case "PM": return [at(odd(c) ? MX : I)];
    case "PG": return [at(odd(r) ? MX : I)];
    case "CM": return [at(odd(r + c) ? MX : I)];
    case "PMM": return [at(mul(odd(c) ? MX : I, odd(r) ? MY : I))];
    case "PMG": return [at(mul(odd(r) ? R180 : I, odd(c) ? MX : I))];
    case "PGG": return [at(mul(odd(c) ? MY : I, odd(r) ? MX : I))];
    case "CMM": return [at(mul(odd(c + Math.floor(r / 2)) ? MX : I, odd(r) ? MY : I))];
    case "P4": case "P4M": case "P4G": {
      const s = Math.max(w, h);
      const q = [[0, 1], [3, 2]][Math.abs(r % 2)][Math.abs(c % 2)];
      const rot = mul(translate(2 * s * Math.floor(c / 2), 2 * s * Math.floor(r / 2)), rotateAt(90 * q, s / 2, s / 2));
      return g === "P4" ? [rot] : [rot, mul(rot, g === "P4M" ? D : E)];
    }
    default: {
      const a = w, o = { x: 0, y: h / 2 };
      const hx = translate(c * 1.5 * a, r * Math.sqrt(3) * a + (odd(c) ? (Math.sqrt(3) / 2) * a : 0));
      const turns = (n: number) => Array.from({ length: n }, (_, k) => rotateAt((360 * k) / n, o.x, o.y));
      const mirrors = (angles: number[]) => angles.map((deg) => reflectAt(deg, o));
      const ops = g === "P3" ? turns(3) : g === "P6" ? turns(6) : g === "P3M1" ? [...turns(3), ...mirrors([0, 60, 120])]
        : g === "P31M" ? [...turns(3), ...mirrors([30, 90, 150])] : [...turns(6), ...mirrors([0, 30, 60, 90, 120, 150])];
      return ops.map((op) => mul(hx, op));
    }
  }
}

export const copiesPerPosition = (g: WallpaperGroup): number => symmetryOps(g, 0, 0, 1, 1).length;

export interface TilingOptions {
  group: WallpaperGroup;
  rows: number;
  cols: number;
  /** Tile size, mm. */
  w: number;
  h: number;
  /** The tile's centre on the page (world mm). */
  cx: number;
  cy: number;
  /** Extra shift per row / per column, percent of the tile's width (X) and height (Y). */
  shift: { rowX: number; rowY: number; colX: number; colY: number };
  /** Size change per row / column, percent. */
  scale: { row: number; col: number };
  /** Turn per row / column, degrees. */
  rotate: { row: number; col: number };
  /** Random share of: position (percent of the tile), size (percent), turn (percent of ±180°). */
  random: { position: number; scale: number; rotate: number; seed: number };
}

export const TILING_DEFAULTS: Omit<TilingOptions, "w" | "h" | "cx" | "cy"> = {
  group: "P1", rows: 3, cols: 3,
  shift: { rowX: 0, rowY: 0, colX: 0, colY: 0 },
  scale: { row: 0, col: 0 },
  rotate: { row: 0, col: 0 },
  random: { position: 0, scale: 0, rotate: 0, seed: 1 },
};

export interface Trace {
  /** Brightness 0 (black) … 1 (white) at a world point, or null where there is no image. */
  sample: (p: Vec) => number | null;
  /** Dark areas make big copies (perforation patterns); otherwise light areas do. */
  invert: boolean;
}

export interface TileCopy { row: number; col: number; k: number; /** World matrix applied on top of the tile. */ m: Mat; centre: Vec }

export const MAX_TILE_COPIES = 5000;

/** Every copy of the pattern, row by row. Copies whose traced size falls under 2 % are left out. */
export function tileCopies(o: TilingOptions, trace?: Trace): TileCopy[] {
  const rows = Math.max(1, Math.min(100, Math.round(o.rows))), cols = Math.max(1, Math.min(100, Math.round(o.cols)));
  const w = Math.max(o.w, 1e-6), h = Math.max(o.h, 1e-6);
  const rnd = seeded(o.random.seed);
  const toWorld = translate(o.cx, o.cy), toTile = translate(-o.cx, -o.cy);
  const out: TileCopy[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const ops = symmetryOps(o.group, r, c, w, h);
    for (let k = 0; k < ops.length; k++) {
      if (out.length >= MAX_TILE_COPIES) return out;
      const j = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1];
      const p0 = apply(ops[k], { x: 0, y: 0 });
      const dx = ((r * o.shift.rowX + c * o.shift.colX) / 100) * w + (j[0] * o.random.position / 100) * w;
      const dy = ((r * o.shift.rowY + c * o.shift.colY) / 100) * h + (j[1] * o.random.position / 100) * h;
      let s = Math.max(0.01, 1 + (r * o.scale.row + c * o.scale.col) / 100) * Math.max(0.01, 1 + (j[2] * o.random.scale) / 100);
      if (trace) {
        const b = trace.sample({ x: p0.x + dx + o.cx, y: p0.y + dy + o.cy });
        if (b !== null) {
          const f = trace.invert ? 1 - b : b;
          if (f < 0.02) continue;
          s *= f;
        }
      }
      const rot = r * o.rotate.row + c * o.rotate.col + (j[3] * o.random.rotate / 100) * 180;
      const local = mul(translate(dx, dy), mul(rotateAt(rot, p0.x, p0.y), mul(scaleAt(s, s, p0.x, p0.y), ops[k])));
      const m = mul(toWorld, mul(local, toTile));
      out.push({ row: r, col: c, k, m, centre: apply(m, { x: o.cx, y: o.cy }) });
    }
  }
  return out;
}

// ---------- image trace ----------

export interface Raster { width: number; height: number; data: ArrayLike<number> }
/** A raster shown by an image node: centred on its origin, w × h mm, placed by its world matrix. */
export interface PlacedRaster { raster: Raster; world: Mat; w: number; h: number }

/** Brightness under a world point from the first image that covers it (pass the topmost first); transparent pixels count as white. */
export function rasterSampler(images: PlacedRaster[]): (p: Vec) => number | null {
  const inv = images.map((im) => invert(im.world));
  return (p) => {
    for (let k = 0; k < images.length; k++) {
      const im = images[k], q = apply(inv[k], p);
      const u = (q.x + im.w / 2) / im.w, v = (q.y + im.h / 2) / im.h;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const { width, height, data } = im.raster;
      const x = Math.min(width - 1, Math.floor(u * width)), y = Math.min(height - 1, Math.floor(v * height));
      const i = (y * width + x) * 4;
      const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
      const a = data[i + 3] / 255;
      return 1 - a * (1 - lum);
    }
    return null;
  };
}

// ---------- document ----------

/**
 * Makes the pattern from one object: clones (they follow later edits of the tile) or plain copies,
 * gathered in one group right above the tile. Returns the group's id, or null.
 */
export function createTiledClones(d: Document, tileId: string, copies: TileCopy[], plain = false, id: IdFactory = newId): string | null {
  const l = locate(d.root, tileId);
  if (!l || !copies.length) return null;
  const children: SceneNode[] = copies.map((cp) => {
    const t = inParent(l.parentWorld, cp.m);
    if (plain) {
      const copy = JSON.parse(JSON.stringify(l.node)) as SceneNode;
      const fresh = (x: SceneNode) => { x.id = id(); if (x.type === "group") x.children.forEach(fresh); };
      fresh(copy);
      copy.transform = mul(t, l.node.transform);
      return copy;
    }
    const c: CloneNode = { id: id(), type: "clone", source: tileId, transform: t, layer: l.node.layer, cache: sourceGeometry(l.node) };
    return c;
  });
  const g: GroupNode = { id: id(), type: "group", transform: [...I], layer: l.node.layer, children, name: plain ? "Tiled copies" : "Tiled clones" };
  l.parent.children.splice(l.parent.children.indexOf(l.node) + 1, 0, g);
  return g.id;
}
