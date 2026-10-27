/**
 * Character charms, drawn from circles, ellipses and strokes (original designs): a snowman, a
 * reindeer, a cat face and a gingerbread friend. Each gives its silhouette, the area the name is
 * fitted in, the engraved and scored details (eyes, whiskers, icing) and the small pieces that can
 * be cut separately to paint or cut from another colour (a hat, a carrot or a red nose). The
 * separate pieces are also part of the silhouette, so they glue on in their place.
 */
import { offsetShapes, shapeContours, unionShapes } from "@/lib/letters/polygon";
import type { Shape } from "@/lib/letters/types";
import { bboxOf, circle, ellipse, roundedRect, stadium, transform } from "../geom";
import { orient } from "../shapes";
import type { Contour, Pt } from "../types";

export const CHARACTERS = ["snowman", "reindeer", "cat", "gingerbread"] as const;
export type CharacterKind = (typeof CHARACTERS)[number];
export type HatKind = "none" | "tophat" | "santa" | "beanie";
export const CHARACTER_NAMES: Record<CharacterKind, string> = { snowman: "Snowman", reindeer: "Reindeer", cat: "Cat face", gingerbread: "Gingerbread" };
export const isCharacter = (v: unknown): v is CharacterKind => (CHARACTERS as readonly string[]).includes(v as string);

export interface Character {
  outline: Contour;
  /** Where the name goes. */
  fit: Contour;
  engrave: Contour[];
  score: Contour[];
  pieces: { name: string; c: Contour }[];
}

const largest = (ss: Shape[]) => ss.reduce((a, b) => (b.area > a.area ? b : a));
const union = (cs: Contour[]) => largest(unionShapes(cs.map(orient))).outer;
const line = (a: Pt, b: Pt, w: number) => orient(stadium(a[0], a[1], b[0], b[1], w));
const open = (c: Contour) => c;

/** A hat sitting on a head of radius r centred at (cx, cy), tilted `tilt` degrees. */
function hat(kind: HatKind, cx: number, cy: number, r: number, tilt = 0): Contour | null {
  if (kind === "none") return null;
  const rot = (c: Contour) => transform(c, { x: 0, y: 0, rot: tilt }).map(([x, y]) => [x + cx, y + cy] as Pt);
  const top = -r * 0.82;
  switch (kind) {
    case "tophat": return rot(union([roundedRect(-r * 1.05, top - r * 0.16, r * 2.1, r * 0.2, r * 0.06), roundedRect(-r * 0.62, top - r * 1.0, r * 1.24, r * 0.9, r * 0.06)]));
    case "beanie": return rot(union([ellipse(0, top + r * 0.1, r * 0.92, r * 0.62, 72), roundedRect(-r * 0.98, top, r * 1.96, r * 0.26, r * 0.12), circle(0, top - r * 0.55, r * 0.22)]));
    case "santa": {
      const cone: Contour = [[-r * 0.9, top + r * 0.12], [r * 0.9, top + r * 0.12], [r * 0.35, top - r * 0.75], [r * 1.05, top - r * 0.62]];
      return rot(union([roundedRect(-r * 1.0, top, r * 2.0, r * 0.3, r * 0.15), cone, circle(r * 1.08, top - r * 0.6, r * 0.2)]));
    }
  }
}

function snowman(hatKind: HatKind): Character {
  const R = 50, r = 33, hy = -R - r * 0.72;
  const body = circle(0, 0, R), head = circle(0, hy, r);
  const h = hat(hatKind, 0, hy, r);
  const nose: Contour = [[r * 0.08, hy + r * 0.12], [r * 0.08, hy + r * 0.32], [r * 0.72, hy + r * 0.24]];
  const outline = union([body, head, ...(h ? [h] : [])]);
  return {
    outline,
    fit: circle(0, R * 0.08, R * 0.82),
    engrave: [circle(-r * 0.32, hy - r * 0.12, r * 0.1), circle(r * 0.32, hy - r * 0.12, r * 0.1)],
    score: [open(transform(circle(0, hy, r * 0.55), { x: 0, y: 0 }).filter((q) => q[1] > hy + r * 0.3))],
    pieces: [...(h ? [{ name: "Hat", c: h }] : []), { name: "Carrot nose", c: orient(nose) }],
  };
}

function reindeer(): Character {
  const hx = 0, hy = 0, rx = 34, ry = 40;
  const head = ellipse(hx, hy, rx, ry, 96), muzzle = ellipse(0, ry * 0.55, rx * 0.78, ry * 0.42, 72);
  const ear = (s: number) => transform(ellipse(0, 0, 16, 7, 40), { x: s * (rx + 6), y: -ry * 0.35, rot: s * 25 });
  const w = 6.5;
  const antler = (s: number) => {
    const p0: Pt = [s * 14, -ry * 0.75], p1: Pt = [s * 28, -ry * 1.45], p2: Pt = [s * 36, -ry * 2.05];
    return [line(p0, p1, w), line(p1, p2, w), line(p1, [s * 50, -ry * 1.62], w * 0.85), line([s * 32, -ry * 1.8], [s * 18, -ry * 2.15], w * 0.8), circle(p2[0], p2[1], w / 2), circle(s * 50, -ry * 1.62, w * 0.42), circle(s * 18, -ry * 2.15, w * 0.4)];
  };
  const nose = circle(0, ry * 0.24, 8);
  return {
    outline: union([head, muzzle, ear(1), ear(-1), ...antler(1), ...antler(-1)]),
    fit: ellipse(0, ry * 0.66, rx * 0.74, ry * 0.3, 60),
    engrave: [ellipse(-rx * 0.38, -ry * 0.18, 3.6, 4.4, 24), ellipse(rx * 0.38, -ry * 0.18, 3.6, 4.4, 24)],
    score: [],
    pieces: [{ name: "Red nose", c: orient(nose) }],
  };
}

function cat(hatKind: HatKind): Character {
  const rx = 46, ry = 38;
  const face = ellipse(0, 0, rx, ry, 120);
  const ear = (s: number): Contour => [[s * rx * 0.25, -ry * 0.72], [s * rx * 0.92, -ry * 0.48], [s * rx * 0.82, -ry * 1.32]];
  const h = hat(hatKind, -rx * 0.12, -ry * 0.25, rx * 0.62, -12);
  const whiskers: Contour[] = [];
  for (const s of [1, -1]) for (const k of [-1, 0, 1]) whiskers.push([[s * rx * 0.42, ry * 0.18 + k * 4], [s * rx * 0.9, ry * 0.12 + k * 9]]);
  return {
    outline: union([face, ear(1), ear(-1), ...(h ? [h] : [])]),
    fit: ellipse(0, ry * 0.4, rx * 0.62, ry * 0.36, 60),
    engrave: [ellipse(-rx * 0.32, -ry * 0.12, 4, 6, 24), ellipse(rx * 0.32, -ry * 0.12, 4, 6, 24), orient([[-4, ry * 0.04], [4, ry * 0.04], [0, ry * 0.14]])],
    score: whiskers,
    pieces: h ? [{ name: "Hat", c: h }] : [],
  };
}

function gingerbread(): Character {
  const r = 22;
  const head = circle(0, -48, r);
  const body = roundedRect(-26, -30, 52, 50, 18);
  const limb = (a: Pt, b: Pt) => line(a, b, 22);
  const arms = [limb([-20, -16], [-50, -24]), limb([20, -16], [50, -24])];
  const legs = [limb([-14, 14], [-26, 46]), limb([14, 14], [26, 46])];
  const icing = (a: Pt, b: Pt): Contour => {
    const out: Contour = [], n = 6;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
    for (let i = 0; i <= n; i++) { const t = i / n, s = i % 2 ? 3 : -3; out.push([a[0] + dx * t + nx * s, a[1] + dy * t + ny * s]); }
    return out;
  };
  return {
    outline: union([head, body, ...arms, ...legs]),
    fit: roundedRect(-22, -22, 44, 30, 8),
    engrave: [circle(-7, -52, 2.6), circle(7, -52, 2.6)],
    score: [icing([-42, -32], [-42, -16]), icing([42, -32], [42, -16]), icing([-30, 36], [-20, 40]), icing([30, 36], [20, 40]), [[-8, -42], [-3, -39], [3, -39], [8, -42]]],
    pieces: [circle(0, 12, 3.6), circle(0, 4, 3.6)].map((c, i) => ({ name: `Button ${i + 1}`, c: orient(c) })),
  };
}

/** The character in a w × h box (y down), every part fitted together. */
export function characterIn(kind: CharacterKind, w: number, h: number, hatKind: HatKind): Character {
  const c = kind === "snowman" ? snowman(hatKind) : kind === "reindeer" ? reindeer() : kind === "cat" ? cat(hatKind) : gingerbread();
  const b = bboxOf([c.outline]), k = Math.min(w / (b.x1 - b.x0), h / (b.y1 - b.y0));
  const ox = (w - (b.x1 - b.x0) * k) / 2 - b.x0 * k, oy = (h - (b.y1 - b.y0) * k) / 2 - b.y0 * k;
  const t = (q: Contour) => q.map(([x, y]) => [ox + x * k, oy + y * k] as Pt);
  // Separate pieces are a hair smaller than their place, so they drop into it after painting.
  const inset = (q: Contour) => { const s = offsetShapes(unionShapes([orient(t(q))]), -0.15); return s.length ? shapeContours([largest(s)])[0] : t(q); };
  return { outline: t(c.outline), fit: t(c.fit), engrave: c.engrave.map(t), score: c.score.map(t), pieces: c.pieces.map((p) => ({ name: p.name, c: inset(p.c) })) };
}
