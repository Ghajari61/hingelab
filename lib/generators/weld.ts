/**
 * Text and motifs welded into one cuttable piece (toppers, name signs, trophies): the shapes are
 * unioned, grown by a border, any islands left are bridged to the main piece, and sticks or tabs
 * are unioned on. Everything stays one part, so nothing falls out of the sheet.
 */
import { dropSpecks, makeShape, offsetShapes, shapeContours, unionShapes } from "@/lib/letters/polygon";
import type { Shape } from "@/lib/letters/types";
import { bboxOf, distToContour, stadium, transform } from "./geom";
import { orient } from "./shapes";
import { caseText, isPlainStyle, styleContours, type FullTextStyle } from "./textStyle";
import type { BuildContext, Contour, Pt } from "./types";

export interface TextBlock {
  /** Filled glyph regions, the block centred on (0, 0). */
  contours: Contour[];
  /** Each glyph's outlines in drawing order, in the same frame (plain style only; for weld and score). */
  glyphs?: Contour[][];
  width: number;
  height: number;
  /** A font is still loading (draw nothing yet). */
  loading: boolean;
}

export interface TextBlockOptions {
  /** Line pitch as a multiple of the cap height. */
  lead?: number;
  align?: "left" | "center" | "right";
  /** Extra mm between letters (negative tightens script so it joins up). */
  spacing?: number;
  /** Characters the font lacks are added here. */
  missing?: string[];
  /** Case, slant, width, thickening, curve or circle, and stencil bridges (the defaults change nothing). */
  style?: FullTextStyle;
}

/** Lines of text (split on new lines) set as one block, centred on (0, 0). */
export function textBlock(ctx: BuildContext, text: string, fontId: string, size: number, o: TextBlockOptions = {}): TextBlock {
  const lines = caseText(text, o.style?.case).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { contours: [], width: 0, height: 0, loading: false };
  if (!ctx.text) return { contours: [], width: 0, height: 0, loading: true };
  const lead = size * (o.lead ?? 1.35);
  const shaped = lines.map((l) => ctx.text!(l, fontId, size, o.spacing ?? 0));
  if (shaped.some((t) => !t)) return { contours: [], width: 0, height: 0, loading: true };
  const width = Math.max(...shaped.map((t) => t!.width));
  let cs: Contour[] = [];
  let glyphs: Contour[][] | undefined = [];
  shaped.forEach((t, k) => {
    for (const c of t!.missing) if (o.missing && !o.missing.includes(c)) o.missing.push(c);
    const dx = o.align === "left" ? (t!.width - width) / 2 : o.align === "right" ? (width - t!.width) / 2 : 0;
    const dy = (k - (lines.length - 1) / 2) * lead;
    for (const c of t!.contours) cs.push(c.map(([x, y]) => [x + dx, y + dy] as Pt));
    if (glyphs && t!.glyphs) for (const g of t!.glyphs) glyphs.push(g.map((c) => c.map(([x, y]) => [x + dx, y + dy] as Pt)));
    else glyphs = undefined;
  });
  if (!cs.length) return { contours: [], width: 0, height: 0, loading: false };
  if (!isPlainStyle(o.style)) {
    glyphs = undefined;
    const b0 = bboxOf(cs);
    const mx = (b0.x0 + b0.x1) / 2, my = (b0.y0 + b0.y1) / 2;
    cs = styleContours(cs.map((c) => c.map(([x, y]) => [x - mx, y - my] as Pt)), o.style!);
    if (!cs.length) return { contours: [], width: 0, height: 0, loading: false };
  }
  const b = bboxOf(cs);
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const sh = (c: Contour) => c.map(([x, y]) => [x - cx, y - cy] as Pt);
  return { contours: cs.map(sh), ...(glyphs?.length ? { glyphs: glyphs.map((g) => g.map(sh)) } : {}), width: b.x1 - b.x0, height: b.y1 - b.y0, loading: false };
}

/** Points of a contour, at most `max` of them (evenly picked). */
function sample(c: Contour, max = 240): Contour {
  if (c.length <= max) return c;
  const step = c.length / max, out: Contour = [];
  for (let i = 0; i < max; i++) out.push(c[Math.floor(i * step)]);
  return out;
}

/** The closest pair of points between two sets of contours. */
function closest(a: Contour[], b: Contour[]): { p: Pt; q: Pt; d: number } {
  let best = { p: [0, 0] as Pt, q: [0, 0] as Pt, d: Infinity };
  const sb = b.map((c) => sample(c, 160));
  for (const ca of a) for (const p of sample(ca)) for (const cb of sb) for (const q of cb) {
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < best.d) best = { p, q, d };
  }
  return best;
}

/**
 * Join every island to the largest piece with straight bridges `width` wide (nearest points first),
 * so the result is one shape. Returns the shapes unchanged when there is only one.
 */
export function bridgeIslands(shapes: Shape[], width: number): Shape[] {
  let cur = shapes;
  for (let guard = 0; cur.length > 1 && guard < 60; guard++) {
    const main = cur.reduce((a, b) => (b.area > a.area ? b : a));
    const mainCs = [main.outer, ...main.holes];
    let best: { p: Pt; q: Pt; d: number } | null = null;
    for (const s of cur) {
      if (s === main) continue;
      const c = closest(mainCs, [s.outer]);
      if (!best || c.d < best.d) best = c;
    }
    if (!best) break;
    // Reach a little into both pieces so the bridge overlaps them.
    const dx = best.q[0] - best.p[0], dy = best.q[1] - best.p[1], L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L, e = width * 0.6;
    const bridge = orient(stadium(best.p[0] - ux * e, best.p[1] - uy * e, best.q[0] + ux * e, best.q[1] + uy * e, width));
    const next = unionShapes([...shapeContours(cur), bridge]);
    if (next.length >= cur.length) {
      // Fallback: a wider bridge (the narrow one fell between two contours).
      const wide = orient(stadium(best.p[0] - ux * e * 3, best.p[1] - uy * e * 3, best.q[0] + ux * e * 3, best.q[1] + uy * e * 3, width * 1.6));
      const again = unionShapes([...shapeContours(cur), wide]);
      if (again.length >= cur.length) break;
      cur = again;
    } else cur = next;
  }
  return cur;
}

export interface WeldOptions {
  /** Grow the shapes by this much, mm (a border around the letters; 0 keeps them as drawn). */
  border: number;
  /** Fill every hole (a solid silhouette). */
  solid?: boolean;
  /** Holes smaller than this are filled (too small to cut cleanly), mm². */
  minHole?: number;
  /** Bridge width for islands, mm. */
  bridge?: number;
}

/** Union, grow, fill small holes and bridge islands: one piece (or none for empty input). */
export function weld(contours: Contour[], o: WeldOptions): Shape | null {
  if (!contours.length) return null;
  let shapes = unionShapes(contours);
  if (o.border > 0) shapes = offsetShapes(shapes, o.border, "round");
  shapes = dropSpecks(shapes, 0.5);
  if (o.solid) shapes = shapes.map((s) => makeShape(s.outer, []));
  else if (o.minHole) shapes = shapes.map((s) => makeShape(s.outer, s.holes.filter((h) => Math.abs(areaOf(h)) >= o.minHole!)));
  if (shapes.length > 1) shapes = bridgeIslands(shapes, Math.max(1, o.bridge ?? Math.max(2, o.border * 1.5)));
  if (o.solid && shapes.length === 1) shapes = [makeShape(shapes[0].outer, [])];
  if (!shapes.length) return null;
  return shapes.reduce((a, b) => (b.area > a.area ? b : a));
}

function areaOf(c: Contour) {
  let s = 0;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) s += c[j][0] * c[i][1] - c[i][0] * c[j][1];
  return s / 2;
}

/** Lowest point of the outline at x (y down), or null when x misses it. */
export function bottomAt(c: Contour, x: number): number | null {
  let y: number | null = null;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const [x0, y0] = c[j], [x1, y1] = c[i];
    if ((x0 <= x && x < x1) || (x1 <= x && x < x0)) {
      const yy = y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
      if (y == null || yy > y) y = yy;
    }
  }
  return y;
}

/**
 * Tab centres under an outline W wide whose lowest point is at H: two tabs `w` wide as far apart as
 * `spread` (from the centre) allows while the edge above them is within a few mm of the lowest point,
 * else one wider tab in the middle (hearts, diamonds, stars).
 */
export function tabsUnder(outer: Contour, W: number, H: number, spread: number, w: number): { xs: number[]; w: number } {
  const flat = (x: number) => [x - w / 2, x, x + w / 2].every((u) => (bottomAt(outer, u) ?? -Infinity) >= H - Math.max(3, H * 0.04));
  for (let s = spread; s >= w; s -= 1) {
    if (flat(W / 2 - s) && flat(W / 2 + s)) return { xs: [W / 2 - s, W / 2 + s], w };
  }
  return { xs: [W / 2], w: w + 6 };
}

export interface StickSpec {
  /** Centre line, mm. */
  x: number;
  /** Length below the lowest point of the shape, mm (every stick ends level). */
  length: number;
  width: number;
  /** Pointed tip length, mm (0 = square end). */
  tip: number;
  /** How far the stick reaches up into the shape, mm. */
  overlap?: number;
}

/** A stick hanging from the bottom of `outer` at `s.x`. */
export function stickFor(outer: Contour, s: StickSpec): Contour {
  const b = bboxOf([outer]);
  const x = Math.min(b.x1 - s.width / 2, Math.max(b.x0 + s.width / 2, s.x));
  const lo = Math.max(bottomAt(outer, x - s.width / 2) ?? b.y1, bottomAt(outer, x) ?? b.y1, bottomAt(outer, x + s.width / 2) ?? b.y1);
  const top = lo - (s.overlap ?? Math.min(12, s.width * 2));
  const end = b.y1 + s.length, w = s.width / 2, tip = Math.min(s.tip, s.length * 0.5);
  return orient(tip > 0
    ? [[x - w, top], [x + w, top], [x + w, end - tip], [x, end], [x - w, end - tip]]
    : [[x - w, top], [x + w, top], [x + w, end], [x - w, end]]);
}

/** The shape with sticks unioned on (bridged so it stays one piece). */
export function withSticks(shape: Shape, sticks: StickSpec[]): Shape {
  if (!sticks.length) return shape;
  const extra = sticks.map((s) => stickFor(shape.outer, s));
  let shapes = unionShapes([...shapeContours([shape]), ...extra]);
  if (shapes.length > 1) shapes = bridgeIslands(shapes, Math.max(2, Math.min(...sticks.map((s) => s.width))));
  return shapes.reduce((a, b) => (b.area > a.area ? b : a));
}

/** Contours moved by (dx, dy). */
export const shift = (cs: Contour[], dx: number, dy: number): Contour[] => cs.map((c) => transform(c, { x: dx, y: dy }));

/** Mirror contours left to right about x = cx (orientation kept). */
export const mirrorX = (cs: Contour[], cx = 0): Contour[] => cs.map((c) => c.map(([x, y]) => [2 * cx - x, y] as Pt).reverse());

/** Distance from a point to the nearest contour. */
export const distTo = (p: Pt, cs: Contour[]) => Math.min(...cs.map((c) => distToContour(p, c)));
