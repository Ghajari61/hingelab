/**
 * Engraved part ids in a single-stroke font (the laser scores one line per stroke instead of
 * filling glyphs), with an arrow that points at the wall edge.
 *
 * Glyphs live on a 4 × 6 grid with y up from the baseline. Output paths are in part-local mm in
 * SVG orientation (y down), so the text reads correctly on the top face of the sheet.
 */
import { intersectShapes, pointInShape, shapeContours } from "@/lib/letters/polygon";
import type { Contour, Point, Shape } from "./types";

type Glyph = number[][][];
const O: number[][] = [[1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0]];
const P: number[][] = [[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]];

export const GLYPHS: Record<string, Glyph> = {
  "0": [O, [[1, 1], [3, 5]]],
  "1": [[[1, 5], [2, 6], [2, 0]], [[1, 0], [3, 0]]],
  "2": [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [0, 0], [4, 0]]],
  "3": [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [1, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]],
  "4": [[[3, 0], [3, 6], [0, 2], [4, 2]]],
  "5": [[[4, 6], [0, 6], [0, 3], [3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
  "6": [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]]],
  "7": [[[0, 6], [4, 6], [1, 0]]],
  "8": [[[1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3]]],
  "9": [[[4, 3], [1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0], [0, 1]]],
  A: [[[0, 0], [0, 4], [2, 6], [4, 4], [4, 0]], [[0, 3], [4, 3]]],
  B: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
  C: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1]]],
  D: [[[0, 0], [0, 6], [2, 6], [4, 4], [4, 2], [2, 0], [0, 0]]],
  E: [[[4, 6], [0, 6], [0, 0], [4, 0]], [[0, 3], [3, 3]]],
  F: [[[4, 6], [0, 6], [0, 0]], [[0, 3], [3, 3]]],
  G: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 3], [2, 3]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[1, 6], [3, 6]], [[2, 6], [2, 0]], [[1, 0], [3, 0]]],
  J: [[[4, 6], [4, 1], [3, 0], [1, 0], [0, 1]]],
  K: [[[0, 0], [0, 6]], [[4, 6], [0, 2]], [[1, 3], [4, 0]]],
  L: [[[0, 6], [0, 0], [4, 0]]],
  M: [[[0, 0], [0, 6], [2, 3], [4, 6], [4, 0]]],
  N: [[[0, 0], [0, 6], [4, 0], [4, 6]]],
  O: [O],
  P: [P],
  Q: [O, [[2, 2], [4, 0]]],
  R: [P, [[2, 3], [4, 0]]],
  S: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 4], [1, 3], [3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]],
  T: [[[0, 6], [4, 6]], [[2, 6], [2, 0]]],
  U: [[[0, 6], [0, 1], [1, 0], [3, 0], [4, 1], [4, 6]]],
  V: [[[0, 6], [2, 0], [4, 6]]],
  W: [[[0, 6], [1, 0], [2, 4], [3, 0], [4, 6]]],
  X: [[[0, 0], [4, 6]], [[0, 6], [4, 0]]],
  Y: [[[0, 6], [2, 3], [4, 6]], [[2, 3], [2, 0]]],
  Z: [[[0, 6], [4, 6], [0, 0], [4, 0]]],
  "-": [[[0.5, 3], [3.5, 3]]],
  ".": [[[1.6, 0], [2.4, 0], [2.4, 0.8], [1.6, 0.8], [1.6, 0]]],
  " ": [],
};

/** Advance per character in cap heights. */
const ADVANCE = 5 / 6;

/** Width of `text` set at cap height `h`, mm. */
export const textWidth = (text: string, h: number) => Math.max(0, text.length * ADVANCE * h - (h / 6));

/**
 * Stroke paths for `text` with cap height `h`, centred on (cx, cy), rotated by `angle` degrees
 * (counter-clockwise on screen). Lower-case letters use the capital glyph at 75 %.
 */
export function strokeText(text: string, h: number, cx: number, cy: number, angle = 0): Contour[] {
  const s = h / 6;
  const w = textWidth(text, h);
  const a = (-angle * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  const out: Contour[] = [];
  let x = -w / 2;
  for (const ch of text) {
    const up = ch.toUpperCase();
    const g = GLYPHS[up] ?? GLYPHS["-"];
    const k = ch !== up ? 0.75 : 1;
    for (const line of g) {
      out.push(line.map(([gx, gy]) => {
        const lx = x + (gx * k + (1 - k) * 2) * s, ly = h / 2 - gy * k * s;
        return [cx + lx * ca - ly * sa, cy + lx * sa + ly * ca] as Point;
      }));
    }
    x += ADVANCE * h;
  }
  return out;
}

/** An arrow of length `len` at (x, y) pointing toward -y (the wall edge in part-local SVG orientation). */
export function wallArrow(x: number, y: number, len: number): Contour[] {
  const top = y - len / 2, bot = y + len / 2, head = len * 0.35;
  return [[[x, bot], [x, top]], [[x - head * 0.8, top + head], [x, top], [x + head * 0.8, top + head]]];
}

/** Whether the rectangle lies inside the shape (sampled every 1 mm). */
export function rectInside(s: Shape, x0: number, y0: number, x1: number, y1: number) {
  const nx = Math.max(2, Math.ceil((x1 - x0) / 1)), ny = Math.max(2, Math.ceil((y1 - y0) / 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    if (!pointInShape([x0 + ((x1 - x0) * i) / nx, y0 + ((y1 - y0) * j) / ny], s)) return false;
  }
  return true;
}

/**
 * Engrave paths for a fin id near its wall edge (the face that ends up deep between neighbours),
 * text plus an arrow pointing at the wall. Tries 4, 3 and 2.5 mm text; null when nothing fits.
 */
export function finLabel(s: Shape, text: string, opts: { arrow: boolean; nearWall: boolean }): Contour[] | null {
  for (const h of [4, 3, 2.5]) {
    const gap = h * 0.5;
    const aw = opts.arrow ? h * 0.9 + gap : 0;
    const bw = textWidth(text, h) + aw, bh = h * 1.15;
    const pad = 1;
    const { x0, x1, y1 } = s.bbox;
    const top = s.bbox.y0;
    // A rectangle fits only if its four corners do: its centre lies in the shape shifted by each corner
    // (corners pulled in 0.5 mm, below the 1 mm sampling of rectInside).
    const hx = Math.max(0, bw / 2 + pad - 0.5), hy = Math.max(0, bh / 2 + pad - 0.5);
    const shifted = (dx: number, dy: number) => shapeContours([s]).map(c => c.map(([x, y]) => [x + dx, y + dy] as Point));
    let core = intersectShapes(shifted(-hx, -hy), shifted(hx, -hy));
    if (core.length) core = intersectShapes(shapeContours(core), shifted(hx, hy));
    if (core.length) core = intersectShapes(shapeContours(core), shifted(-hx, hy));
    if (!core.length) continue;
    const xs: number[] = [];
    const mid = (x0 + x1) / 2;
    for (let d = 0; d <= (x1 - x0) / 2; d += 2) { xs.push(mid - d); if (d) xs.push(mid + d); }
    const ys: number[] = [];
    if (opts.nearWall) for (let y = top + pad + bh / 2; y <= y1 - pad - bh / 2; y += 1) ys.push(y);
    else { const c = (top + y1) / 2; for (let d = 0; d <= (y1 - top) / 2; d += 1) { ys.push(c - d); if (d) ys.push(c + d); } }
    for (const cy of ys) for (const cx of xs) {
      if (!core.some(k => k.bbox.x0 <= cx && cx <= k.bbox.x1 && k.bbox.y0 <= cy && cy <= k.bbox.y1 && pointInShape([cx, cy], k))) continue;
      if (!rectInside(s, cx - bw / 2 - pad, cy - bh / 2 - pad, cx + bw / 2 + pad, cy + bh / 2 + pad)) continue;
      const tx = cx - bw / 2 + aw + textWidth(text, h) / 2;
      const paths = strokeText(text, h, tx, cy);
      if (opts.arrow) paths.push(...wallArrow(cx - bw / 2 + h * 0.45, cy, h * 1.1));
      return paths;
    }
  }
  return null;
}

export const polylineLength = (c: Contour) => c.reduce((a, q, i) => (i ? a + Math.hypot(q[0] - c[i - 1][0], q[1] - c[i - 1][1]) : 0), 0);
