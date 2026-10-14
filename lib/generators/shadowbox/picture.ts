/**
 * "Your picture": a photo, drawing or SVG (or a built-in sample shape) turned into the cut-outs of
 * every layer. A picture is traced once, on the device (lib/imaging/levels), into outlines at evenly
 * spaced brightness cut-offs; they are stored as compact path data in a box whose longest side is
 * PIC_BOX units, so the build stays a quick, pure function of the settings and the server can check
 * an export without the picture itself.
 *
 * Three ways to turn it into layers:
 * - levels: each layer cuts away everything darker than its own cut-off, so the darkest parts sit
 *   deepest (a posterised picture in depth);
 * - scale: one silhouette, nested from small at the back to large at the front, like a tunnel;
 * - grow: one silhouette grown by a fixed step on every layer toward the front (soft contour rings).
 * With "paper" the silhouette stays as paper and the window around it is cut away instead.
 */
import { differenceShapes, makeShape, offsetShapes, shapeContours, unionShapes } from "@/lib/letters/polygon";
import type { Shape } from "@/lib/letters/types";
import { bboxOf, circle, ellipse, rect, stadium, transform } from "../geom";
import { motif } from "../motifs";
import { orient } from "../shapes";
import type { Contour, Pt } from "../types";
import type { Sample, ShadowBoxParams } from "./params";
import { PIC_BOX, decodeContours } from "./picPath";

// ---------------------------------------------------------------- Stored outlines

const shapeCache = new Map<string, Shape[][]>();

/** The filled regions of every stored level (even-odd, so holes need no particular direction). */
export function pictureShapes(text: string): Shape[][] {
  let v = shapeCache.get(text);
  if (!v) {
    v = text.split("|").map((t) => unionShapes(decodeContours(t), [], true));
    if (shapeCache.size >= 3) shapeCache.delete(shapeCache.keys().next().value!);
    shapeCache.set(text, v);
  }
  return v;
}

// ---------------------------------------------------------------- Sample shapes

const closeUp = (cs: Contour[], r: number): Shape[] => offsetShapes(offsetShapes(unionShapes(cs.map(orient)), r), -r);

/** Sample silhouettes drawn here, about 100 units across, y down. */
const DRAWN: Partial<Record<Sample, () => Shape[]>> = {
  cat: () => {
    const tail: Contour[] = [];
    const pts: Pt[] = [];
    for (let k = 0; k <= 12; k++) { const a = Math.PI * (0.55 - 0.75 * (k / 12)); pts.push([18 + 30 * Math.cos(a), 40 - 34 * Math.sin(a) * (k / 12) - 4]); }
    for (let k = 1; k < pts.length; k++) tail.push(stadium(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], 9 - (k / 12) * 3));
    return closeUp([
      ellipse(0, 22, 27, 34, 96), circle(0, -22, 19, 0.3), ellipse(0, 50, 30, 8, 64),
      [[-18, -30], [-15, -54], [-3, -38]], [[18, -30], [15, -54], [3, -38]], ...tail,
    ], 3);
  },
  fish: () => {
    const body = closeUp([ellipse(0, 0, 40, 21, 96), [[30, 0], [60, -24], [53, 0], [60, 24]], [[-10, -18], [6, -32], [16, -16]], [[-4, 18], [8, 28], [12, 16]]], 2.5);
    return differenceShapes(shapeContours(body), [orient(circle(-25, -5, 4, 0.2))]);
  },
  bird: () => {
    const body = closeUp([
      transform(ellipse(0, 0, 32, 18, 96), { rot: -12 }), circle(26, -16, 13, 0.3), [[36, -20], [52, -14], [36, -10]],
      [[-24, -2], [-58, -18], [-52, 2], [-58, 14], [-24, 10]],
    ], 2);
    return differenceShapes(shapeContours(body), [orient(transform(ellipse(0, 0, 16, 7, 64), { x: -6, y: -2, rot: -18 })), orient(circle(29, -19, 2.6, 0.2))]);
  },
  pear: () => {
    const fruit = closeUp([circle(0, 20, 33, 0.3), circle(0, -14, 20, 0.3)], 12);
    const stem: Contour[] = [];
    for (let k = 1; k <= 6; k++) stem.push(stadium(2 * (k - 1) / 6, -32 - 4 * (k - 1), 2 * k / 6, -32 - 4 * k, 4));
    return closeUp([...shapeContours(fruit), ...stem, transform(ellipse(0, 0, 15, 6.5, 48), { x: 16, y: -52, rot: -20 })], 1);
  },
};

const sampleCache = new Map<Sample, { shapes: Shape[]; w: number; h: number }>();

/** A sample silhouette in a box with its longest side PIC_BOX units, corner at the origin. */
export function sampleShapes(id: Sample): { shapes: Shape[]; w: number; h: number } {
  let v = sampleCache.get(id);
  if (!v) {
    const drawn = DRAWN[id];
    const raw = drawn ? shapeContours(drawn()) : motif(id as Exclude<Sample, "cat" | "fish" | "bird" | "pear">, 100);
    const b = bboxOf(raw), k = PIC_BOX / Math.max(b.x1 - b.x0, b.y1 - b.y0);
    const cs = raw.map((c) => c.map(([x, y]) => [(x - b.x0) * k, (y - b.y0) * k] as Pt));
    v = { shapes: unionShapes(cs, [], true), w: (b.x1 - b.x0) * k, h: (b.y1 - b.y0) * k };
    sampleCache.set(id, v);
  }
  return v;
}

/** Rail picture contours of a sample (any scale). */
export const sampleArt = (id: Sample): Contour[] => shapeContours(sampleShapes(id).shapes);

// ---------------------------------------------------------------- Layers

type Pic = ShadowBoxParams["picture"];

export interface PicSource {
  /** Regions per level, darkest cut-off first (one level for an SVG or a sample). */
  levels: Shape[][];
  /** The picture's box in path units. */
  w: number;
  h: number;
  /** Traced from a photo or drawing (several levels). */
  traced: boolean;
}

export function pictureSource(pic: Pic): PicSource {
  if (pic.levels) {
    const levels = pictureShapes(pic.levels), a = pic.aspect;
    return { levels, w: a >= 1 ? PIC_BOX : PIC_BOX * a, h: a >= 1 ? PIC_BOX / a : PIC_BOX, traced: levels.length > 1 };
  }
  const s = sampleShapes(pic.sample);
  return { levels: [s.shapes], w: s.w, h: s.h, traced: false };
}

/** The level nearest a brightness cut-off (%), of `n` evenly spaced from 5 % to 95 %. */
export const levelAt = (pct: number, n: number) => (n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((pct - 5) / 90) * (n - 1)))));

/** How the layers are made: levels need a traced picture; one shape grows instead. */
export const pictureMode = (pic: Pic, src: PicSource) => (pic.mode === "levels" && !src.traced ? "grow" : pic.mode);

/** The silhouette of scale and grow, in path units: the shape, or the picture's dark (or light) parts. */
export function silhouette(pic: Pic, src: PicSource): Shape[] {
  if (!src.traced) return src.levels[0];
  const lv = src.levels[levelAt(pic.cut, src.levels.length)];
  return pic.invert ? differenceShapes([orient(rect(0, 0, src.w, src.h))], shapeContours(lv)) : lv;
}

/** Scale by k about (ux, uy), turn by `rot` degrees and centre on (cx, cy). */
function mapper(k: number, ux: number, uy: number, cx: number, cy: number, rot: number): (p: Pt) => Pt {
  const a = (rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return ([x, y]) => { const dx = (x - ux) * k, dy = (y - uy) * k; return [cx + dx * c - dy * s, cy + dx * s + dy * c]; };
}
const mapShapes = (ss: Shape[], f: (p: Pt) => Pt): Shape[] => ss.map((s) => makeShape(s.outer.map(f), s.holes.map((h) => h.map(f))));

export interface PicWin { x0: number; y0: number; w: number; h: number; cx: number; cy: number }

/**
 * The cut-outs of pattern layer i (0 = the back one) of L, as contours with their orientation (outers
 * positive, holes negative) so the build unions them without losing the holes.
 */
export function pictureCuts(p: ShadowBoxParams, src: PicSource, sil: Shape[], w: PicWin, winCs: Contour[], i: number, L: number): Contour[] {
  const pic = p.picture, g = p.design;
  const t = L > 1 ? i / (L - 1) : 1;
  const mode = pictureMode(pic, src);
  let cut: Shape[];
  if (mode === "levels") {
    // The picture covers the window (like the photo) at 100 %, moved by a share of the spare room.
    const k = (Math.max(w.w / src.w, w.h / src.h) * pic.size) / 100;
    const cx = w.cx + ((src.w * k - w.w) / 2) * (pic.x / 100), cy = w.cy + ((src.h * k - w.h) / 2) * (pic.y / 100);
    const f = mapper(k, src.w / 2, src.h / 2, cx, cy, g.rotate);
    const th = pic.dark + (pic.light - pic.dark) * t, n = src.levels.length;
    cut = pic.invert
      ? mapShapes(differenceShapes([orient(rect(0, 0, src.w, src.h))], shapeContours(src.levels[levelAt(100 - th, n)])), f)
      : mapShapes(src.levels[levelAt(th, n)], f);
  } else {
    if (!sil.length) return [];
    const b = bboxOf(sil.map((s) => s.outer));
    const ux = (b.x0 + b.x1) / 2, uy = (b.y0 + b.y1) / 2;
    const fit = Math.min(w.w / Math.max(1e-6, b.x1 - b.x0), w.h / Math.max(1e-6, b.y1 - b.y0));
    let shape: Shape[];
    if (mode === "scale") {
      const s = (g.min + (g.max - g.min) * t) / 100;
      if (s <= 0) return [];
      const vx = w.cx + ((g.shiftX / 100) * w.w * (1 - t)) / 2, vy = w.cy + ((g.shiftY / 100) * w.h * (1 - t)) / 2;
      shape = mapShapes(sil, mapper(fit * s, ux, uy, vx, vy, g.rotate + g.twist * i));
    } else {
      const base = mapShapes(sil, mapper((fit * pic.size) / 100, ux, uy, w.cx + ((pic.x / 100) * w.w) / 2, w.cy + ((pic.y / 100) * w.h) / 2, g.rotate));
      const d = pic.step * (pic.paper ? L - 1 - i : i);
      shape = d > 0 ? offsetShapes(base, d, "round") : base;
    }
    cut = pic.paper ? differenceShapes(winCs, shapeContours(shape)) : shape;
  }
  if (pic.detail > 0 && cut.length) cut = offsetShapes(offsetShapes(cut, -pic.detail / 2), pic.detail / 2);
  return shapeContours(cut);
}
