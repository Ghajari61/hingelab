/**
 * Plate outlines shared by the signs, table numbers, toppers and trophies: each fills the box
 * (0, 0)–(w, h), mm, y down, as one closed contour.
 */
import { differenceShapes, unionShapes } from "@/lib/letters/polygon";
import { arc, bboxOf, circle, ellipse, rect, roundCorners, roundedRect, signedArea, stadium, TAU } from "./geom";
import type { Contour, Pt } from "./types";
import { fitArt } from "./util";

export const SHAPE_KINDS = [
  "rect", "rounded", "circle", "arch", "house", "heart", "cloud", "hexagon", "octagon",
  "shield", "star", "scalloped", "banner", "ticket", "diamond", "pill", "tag", "bubble",
] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export const SHAPE_NAMES: Record<ShapeKind, string> = {
  rect: "Rectangle", rounded: "Rounded", circle: "Circle / oval", arch: "Arch", house: "House", heart: "Heart",
  cloud: "Cloud", hexagon: "Hexagon", octagon: "Octagon", shield: "Shield", star: "Star", scalloped: "Scalloped",
  banner: "Banner", ticket: "Ticket", diamond: "Diamond", pill: "Pill", tag: "Tag", bubble: "Speech bubble",
};

export const isShapeKind = (v: unknown): v is ShapeKind => typeof v === "string" && (SHAPE_KINDS as readonly string[]).includes(v);

let outerSign = 0;
/** The orientation Clipper gives outers (holes run the other way). */
function clipOuterSign(): number {
  if (!outerSign) outerSign = Math.sign(signedArea(unionShapes([rect(0, 0, 10, 10)])[0].outer)) || 1;
  return outerSign;
}

/** Turned to run like a union's outers, so nonzero unions with clipped shapes merge instead of cancel. */
export const orient = (c: Contour): Contour => (Math.sign(signedArea(c)) === clipOuterSign() ? c : c.slice().reverse());
/** Turned to run like a union's holes. */
export const orientHole = (c: Contour): Contour => (Math.sign(signedArea(c)) === -clipOuterSign() ? c : c.slice().reverse());

/** Stretch a contour so its bounding box fills (0, 0)–(w, h). */
export function fitBox(c: Contour, w: number, h: number): Contour {
  const b = bboxOf([c]);
  const sx = w / Math.max(1e-9, b.x1 - b.x0), sy = h / Math.max(1e-9, b.y1 - b.y0);
  return c.map(([x, y]) => [(x - b.x0) * sx, (y - b.y0) * sy] as Pt);
}

/** The largest outer of a union (the shapes here are always one piece). */
function largestOuter(cs: Contour[]): Contour {
  const shapes = unionShapes(cs.map(orient));
  return shapes.reduce((a, b) => (b.area > a.area ? b : a)).outer;
}

/** Heart curve (the classic 16 sin³ t form), unit size. */
export function heartCurve(n = 160): Contour {
  const out: Contour = [];
  for (let i = 0; i < n; i++) {
    const t = (TAU * i) / n, s = Math.sin(t);
    out.push([16 * s * s * s, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]);
  }
  return out;
}

/** Star polygon: `n` points, inner radius as a fraction of the outer. */
export function starPolygon(n: number, R: number, inner = 0.45, cx = 0, cy = 0, rot = 0): Contour {
  const out: Contour = [];
  for (let i = 0; i < 2 * n; i++) {
    const a = rot - Math.PI / 2 + (Math.PI * i) / n, r = i % 2 ? R * inner : R;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 24): Contour {
  const out: Contour = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
}

/**
 * The outline of `kind` filling (0, 0)–(w, h). `r` rounds the corners of the straight-sided kinds
 * (mm); circles, hearts, clouds and pills are round already.
 */
export function shapeOutline(kind: ShapeKind, w: number, h: number, r = 0): Contour {
  w = Math.max(1, w); h = Math.max(1, h);
  const round = (c: Contour) => (r > 0 ? fitBox(roundCorners(c, r), w, h) : c);
  const unit = (pts: [number, number][]) => round(fitBox(pts, w, h));
  switch (kind) {
    case "rect": return round(rect(0, 0, w, h));
    case "rounded": return roundedRect(0, 0, w, h, Math.max(r, Math.min(w, h) * 0.12));
    case "circle": return ellipse(w / 2, h / 2, w / 2, h / 2, Math.max(48, Math.round((w + h) / 2)));
    case "pill": return w >= h ? stadium(h / 2, h / 2, w - h / 2, h / 2, h) : stadium(w / 2, w / 2, w / 2, h - w / 2, w);
    case "arch": {
      const rx = w / 2, ry = Math.min(h * 0.6, rx);
      const top: Contour = [];
      const n = Math.max(32, Math.round(rx));
      for (let i = 0; i <= n; i++) { const a = Math.PI + (Math.PI * i) / n; top.push([rx + rx * Math.cos(a), ry + ry * Math.sin(a)]); }
      const rr = Math.min(r, w / 2 - 0.5, h - ry - 0.5);
      return rr > 0
        ? [...top, ...arc(w - rr, h - rr, rr, 0, Math.PI / 2), ...arc(rr, h - rr, rr, Math.PI / 2, Math.PI)]
        : [...top, [w, h], [0, h]];
    }
    case "house": {
      const roof = Math.min(h * 0.42, w * 0.5);
      return round([[w / 2, 0], [w, roof], [w, h], [0, h], [0, roof]]);
    }
    case "heart": return fitBox(heartCurve(Math.max(120, Math.round(w + h))), w, h);
    case "cloud": {
      const parts = [circle(26, 60, 22, 0.02), circle(47, 40, 30, 0.02), circle(73, 52, 24, 0.02), circle(86, 70, 14, 0.02), roundedRect(10, 55, 85, 30, 14)];
      return fitBox(largestOuter(parts), w, h);
    }
    case "hexagon": return unit([[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]]);
    case "octagon": { const k = 0.29; return unit([[k, 0], [1 - k, 0], [1, k], [1, 1 - k], [1 - k, 1], [k, 1], [0, 1 - k], [0, k]]); }
    case "diamond": return unit([[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]);
    case "banner": return unit([[0, 0], [1, 0], [0.9, 0.5], [1, 1], [0, 1], [0.1, 0.5]]);
    case "tag": return unit([[0.2, 0], [1, 0], [1, 1], [0.2, 1], [0, 0.5]]);
    case "star": return round(fitBox(starPolygon(5, 50, 0.48), w, h));
    case "shield": {
      const c: Contour = [[0, 0], [100, 0], [100, 40], ...cubic([100, 40], [100, 75], [70, 92], [50, 100]), ...cubic([50, 100], [30, 92], [0, 75], [0, 40])];
      return fitBox(round(c), w, h);
    }
    case "scalloped": {
      const n = 18, R = 50, br = R * Math.sin(Math.PI / n) * 1.25;
      const cs: Contour[] = [circle(50, 50, R - br * 0.4, 0.01)];
      for (let i = 0; i < n; i++) { const a = (TAU * i) / n; cs.push(circle(50 + (R - br) * Math.cos(a), 50 + (R - br) * Math.sin(a), br, 0.01)); }
      return fitBox(largestOuter(cs), w, h);
    }
    case "ticket": {
      const nr = Math.min(w, h) * 0.14;
      const cut = [circle(0, 0, nr), circle(w, 0, nr), circle(w, h, nr), circle(0, h, nr)].map(orient);
      const s = differenceShapes([orient(rect(0, 0, w, h))], cut);
      return s.reduce((a, b) => (b.area > a.area ? b : a)).outer;
    }
    case "bubble": {
      const bh = h * 0.8, rr = Math.min(w, bh) * 0.18;
      const body = roundedRect(0, 0, w, bh, rr);
      const tail: Contour = [[w * 0.22, bh - 1], [w * 0.42, bh - 1], [w * 0.18, h]];
      return largestOuter([body, tail]);
    }
  }
}

/** Rail picture for a shape. */
export function shapeArt(kind: ShapeKind): { d: string; fill?: boolean }[] {
  const [w, h] = kind === "circle" || kind === "heart" || kind === "star" || kind === "scalloped" || kind === "octagon" || kind === "diamond" ? [36, 36] : [52, 34];
  return [{ d: fitArt([shapeOutline(kind, w, h, kind === "rect" ? 0 : 1)], 38)[0], fill: true }];
}
