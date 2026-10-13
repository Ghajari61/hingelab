/**
 * Ready-to-cut layouts built in Studio from AI Studio artwork (mm, top-left origin): a cake topper
 * with its stake, a sign board with the art engraved and hanging holes, a perforated lamp panel and
 * a stacked relief. Pure geometry, so it runs in the browser and in tests.
 */
import * as ClipperLib from "clipper-lib";
import type { Path } from "clipper-lib";
import { subpathsBox } from "@/lib/studio/geom";
import { pieces, regionOf, toPath, toSubpaths, union, areaOfPaths } from "@/lib/studio/pathfinder";
import type { Subpath, Vec } from "@/lib/studio/types";
import { perforation, type PerforationOptions } from "@/lib/imaging/relief";

const K = 0.5523;

export const rectPath = (x: number, y: number, w: number, h: number): Subpath =>
  ({ closed: true, nodes: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] });

export function roundRectPath(x: number, y: number, w: number, h: number, r: number): Subpath {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (r === 0) return rectPath(x, y, w, h);
  const c = r * K;
  return {
    closed: true,
    nodes: [
      { x: x + r, y, i: { x: x + r - c, y } },
      { x: x + w - r, y, o: { x: x + w - r + c, y } },
      { x: x + w, y: y + r, i: { x: x + w, y: y + r - c } },
      { x: x + w, y: y + h - r, o: { x: x + w, y: y + h - r + c } },
      { x: x + w - r, y: y + h, i: { x: x + w - r + c, y: y + h } },
      { x: x + r, y: y + h, o: { x: x + r - c, y: y + h } },
      { x, y: y + h - r, i: { x, y: y + h - r + c } },
      { x, y: y + r, o: { x, y: y + r - c } },
    ],
  };
}

export function circlePath(cx: number, cy: number, r: number): Subpath {
  const c = r * K;
  return {
    closed: true,
    nodes: [
      { x: cx + r, y: cy, i: { x: cx + r, y: cy - c }, o: { x: cx + r, y: cy + c } },
      { x: cx, y: cy + r, i: { x: cx + c, y: cy + r }, o: { x: cx - c, y: cy + r } },
      { x: cx - r, y: cy, i: { x: cx - r, y: cy + c }, o: { x: cx - r, y: cy - c } },
      { x: cx, y: cy - r, i: { x: cx - c, y: cy - r }, o: { x: cx + c, y: cy - r } },
    ],
  };
}

const outward = (p: Path): Path => (ClipperLib.Clipper.Orientation(p) ? p : p.slice().reverse());

export function moveSubpaths(subs: Subpath[], dx: number, dy: number): Subpath[] {
  const f = (p: Vec) => ({ x: p.x + dx, y: p.y + dy });
  return subs.map((s) => ({ closed: s.closed, nodes: s.nodes.map((n) => ({ ...f(n), ...(n.i ? { i: f(n.i) } : {}), ...(n.o ? { o: f(n.o) } : {}), ...(n.k ? { k: n.k } : {}) })) }));
}

/** The outer outline of the art, holes filled. */
export function silhouette(art: Subpath[]): Subpath[] {
  const outers = pieces(regionOf(art)).map((p) => outward(p[0]));
  return toSubpaths(union([outers]));
}

/** The largest single piece of the art, with its holes. */
export function largestPiece(art: Subpath[]): Subpath[] {
  const ps = pieces(regionOf(art));
  if (!ps.length) return [];
  return toSubpaths(ps.reduce((a, b) => (areaOfPaths(b) > areaOfPaths(a) ? b : a)));
}

export interface TopperOptions { stakeWidth: number; stakeLength: number; overlap: number }
export const TOPPER_DEFAULTS: TopperOptions = { stakeWidth: 8, stakeLength: 90, overlap: 6 };

/** The art joined to a pointed stake under its middle: one outline to cut. */
export function topperLayout(art: Subpath[], raw: Partial<TopperOptions> = {}): Subpath[] {
  const o = { ...TOPPER_DEFAULTS, ...raw };
  const b = subpathsBox(art);
  if (!Number.isFinite(b.minX)) return [];
  const cx = (b.minX + b.maxX) / 2, top = b.maxY - o.overlap, bottom = b.maxY + o.stakeLength, w = o.stakeWidth / 2;
  const stake: Vec[] = [{ x: cx - w, y: top }, { x: cx + w, y: top }, { x: cx + w, y: bottom - o.stakeWidth }, { x: cx, y: bottom }, { x: cx - w, y: bottom - o.stakeWidth }];
  return toSubpaths(union([regionOf(art).map(outward), [outward(toPath(stake))]]));
}

export interface SignOptions { margin: number; corner: number; holes: boolean; holeDiameter: number }
export const SIGN_DEFAULTS: SignOptions = { margin: 12, corner: 8, holes: true, holeDiameter: 5 };

/** A board around the art (engraved), with two hanging holes above it. */
export function signLayout(art: Subpath[], raw: Partial<SignOptions> = {}) {
  const o = { ...SIGN_DEFAULTS, ...raw };
  const b = subpathsBox(art);
  const top = o.holes ? o.margin + o.holeDiameter + 4 : o.margin;
  const width = b.maxX - b.minX + 2 * o.margin, height = b.maxY - b.minY + top + o.margin;
  const r = o.holeDiameter / 2;
  return {
    width, height,
    board: [roundRectPath(0, 0, width, height, o.corner)],
    art: moveSubpaths(art, o.margin - b.minX, top - b.minY),
    holes: o.holes ? [circlePath(o.margin + r, o.margin * 0.6 + r, r), circlePath(width - o.margin - r, o.margin * 0.6 + r, r)] : [],
  };
}

/** A lamp panel perforated with the art's silhouette. */
export function lampLayout(art: Subpath[], o: Partial<PerforationOptions> = {}) {
  return perforation(silhouette(art), o);
}

/**
 * A stacked relief: a backing plate, then one sheet per depth level cut to that level's outline,
 * laid out in rows `rowWidth` wide. Each sheet has the next one's outline scored on it as a glue
 * guide. `sheets` are outlines inside a `w × h` mm frame, back to front.
 */
export function reliefLayout(sheets: Subpath[][], w: number, h: number, gap = 8, rowWidth = 600) {
  const all = [[rectPath(0, 0, w, h)], ...sheets.filter((s) => s.length)];
  const perRow = Math.max(1, Math.floor((rowWidth + gap) / (w + gap)));
  return all.map((cut, k) => {
    const x = (k % perRow) * (w + gap), y = Math.floor(k / perRow) * (h + gap);
    return {
      name: k === 0 ? "Relief backing" : `Relief sheet ${k} of ${all.length - 1}`,
      cut: moveSubpaths(cut, x, y),
      score: k + 1 < all.length ? moveSubpaths(all[k + 1], x, y) : [],
    };
  });
}
