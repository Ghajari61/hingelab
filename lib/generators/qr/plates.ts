/**
 * Plate outlines for QR signs and tags, sized round the content (code, quiet zone, label, header
 * picture and border): the shared sign shapes (arch, hexagon, shield, speech bubble…), and two made
 * for QR products: a dog-bone pet tag and a plant marker on a pointed stake.
 */
import { unionShapes } from "@/lib/letters/polygon";
import { bboxOf, circle, pointInContour, roundedRect, transform } from "../geom";
import { orient, shapeOutline, type ShapeKind } from "../shapes";
import type { Contour, Pt } from "../types";

export const PLATE_SHAPES = ["rect", "circle", "arch", "hexagon", "octagon", "shield", "bubble", "scalloped", "ticket", "bone", "stake"] as const;
export type PlateShape = (typeof PLATE_SHAPES)[number];
export const PLATE_NAMES: Record<PlateShape, string> = {
  rect: "Rectangle", circle: "Circle", arch: "Arch", hexagon: "Hexagon", octagon: "Octagon", shield: "Shield",
  bubble: "Speech bubble", scalloped: "Scalloped", ticket: "Ticket", bone: "Dog bone", stake: "Plant stake",
};
/** Shapes whose corners the corner radius rounds. */
export const CORNERED: PlateShape[] = ["rect", "hexagon", "octagon", "shield", "stake"];

export interface Plate {
  outline: Contour;
  /** The top of the plate, where a keyring tab goes. */
  top: number;
  /** The plate has a straight bottom edge (a stand's tabs or feet can go anywhere along it). */
  flatBottom: boolean;
}

/** Points round the box (x0, y0)–(x1, y1), about every `step` mm. */
function around(x0: number, y0: number, x1: number, y1: number, step: number): Pt[] {
  const pts: Pt[] = [];
  const nx = Math.max(2, Math.ceil((x1 - x0) / step)), ny = Math.max(2, Math.ceil((y1 - y0) / step));
  for (let i = 0; i <= nx; i++) { const x = x0 + ((x1 - x0) * i) / nx; pts.push([x, y0], [x, y1]); }
  for (let j = 1; j < ny; j++) { const y = y0 + ((y1 - y0) * j) / ny; pts.push([x0, y], [x1, y]); }
  return pts;
}

/**
 * A shared sign shape just big enough to hold the box (x0, y0)–(x1, y1): its width and height are
 * grown (smallest area first) and it is slid up and down until every point of the box is inside.
 */
function fitted(kind: ShapeKind, x0: number, y0: number, x1: number, y1: number, corner: number): Contour {
  const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2;
  const pts = around(x0, y0, x1, y1, Math.max(2, Math.min(w, h) / 12));
  const steps: number[] = [];
  for (let k = 1; k <= 2.6 + 1e-9; k += 0.05) steps.push(k);
  const tries: [number, number][] = [];
  // round shapes grow evenly; the others in width and height separately
  for (const a of steps) for (const b of steps) if (kind !== "scalloped" || a === b) tries.push([a, b]);
  tries.sort((p, q) => p[0] * p[1] - q[0] * q[1] || Math.abs(p[0] - p[1]) - Math.abs(q[0] - q[1]));
  for (const [a, b] of tries) {
    const W = w * a, H = h * b;
    const base = orient(shapeOutline(kind, W, H, CORNERED.includes(kind as PlateShape) ? corner : 0));
    for (let f = 0; f <= 1 + 1e-9; f += 0.125) {
      const c = transform(base, { x: cx - W / 2, y: y0 - (H - h) * f });
      if (pts.every((p) => pointInContour(p, c))) return c;
    }
  }
  return orient(shapeOutline(kind, w * 2.6, h * 2.6, 0)).map(([x, y]) => [x + cx - w * 1.3, y + y0 - h * 0.8] as Pt);
}

/** A bone: the box with two round lobes at each end. */
function bone(x0: number, y0: number, x1: number, y1: number, corner: number): Contour {
  const h = y1 - y0, r = h * 0.3, cy = (y0 + y1) / 2;
  const lobes = [x0 - r * 0.35, x1 + r * 0.35].flatMap((x) => [circle(x, cy - h * 0.24, r), circle(x, cy + h * 0.24, r)]);
  const body = roundedRect(x0 - r * 0.35, y0, x1 - x0 + r * 0.7, h, Math.min(corner, h * 0.2));
  const u = unionShapes([body, ...lobes].map(orient));
  return u.reduce((a, b) => (b.area > a.area ? b : a)).outer;
}

/** A plant marker: the box over a stake `stake` mm long that ends in a point. */
function stakeOf(x0: number, y0: number, x1: number, y1: number, corner: number, stake: number): Contour {
  const w = x1 - x0, cx = (x0 + x1) / 2, sw = Math.max(8, Math.min(w * 0.28, 22));
  const tip = Math.min(stake * 0.4, sw * 1.4);
  const s: Contour = [[cx - sw / 2, y1 - 1], [cx + sw / 2, y1 - 1], [cx + sw / 2, y1 + stake - tip], [cx, y1 + stake], [cx - sw / 2, y1 + stake - tip]];
  const u = unionShapes([orient(roundedRect(x0, y0, w, y1 - y0, corner)), orient(s)]);
  return u.reduce((a, b) => (b.area > a.area ? b : a)).outer;
}

/**
 * The plate round the content box (0, 0)–(cw, ch) with a border of `pad`. Rectangles and circles
 * are exact; other shapes are fitted round the bordered box.
 */
export function plateOutline(shape: PlateShape, cw: number, ch: number, pad: number, corner: number, stake = 0): Plate {
  const x0 = -pad, y0 = -pad, x1 = cw + pad, y1 = ch + pad;
  if (shape === "circle") {
    const R = Math.hypot(cw, ch) / 2 + pad;
    return { outline: circle(cw / 2, ch / 2, R), top: ch / 2 - R, flatBottom: false };
  }
  if (shape === "rect") return { outline: roundedRect(x0, y0, x1 - x0, y1 - y0, Math.max(0, corner)), top: y0, flatBottom: true };
  if (shape === "bone") { const o = bone(x0, y0, x1, y1, corner); return { outline: o, top: bboxOf([o]).y0, flatBottom: false }; }
  if (shape === "stake") return { outline: stakeOf(x0, y0, x1, y1, corner, Math.max(20, stake)), top: y0, flatBottom: false };
  const o = fitted(shape, x0, y0, x1, y1, corner);
  const b = bboxOf([o]);
  return { outline: o, top: b.y0, flatBottom: shape === "arch" || shape === "hexagon" || shape === "octagon" || shape === "ticket" };
}

/** Where a round hole of radius r sits nearest the plate's corner at (fx, fy) (0 or 1 of the box), clear of the edge by `edge`. */
export function cornerHole(outline: Contour, fx: number, fy: number, r: number, edge: number): Pt {
  const b = bboxOf([outline]);
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const sx = fx ? b.x1 : b.x0, sy = fy ? b.y1 : b.y0;
  const test = circle(0, 0, r + edge, 0.05);
  for (let t = 0; t <= 1; t += 0.01) {
    const p: Pt = [sx + (cx - sx) * t, sy + (cy - sy) * t];
    if (test.every(([x, y]) => pointInContour([p[0] + x, p[1] + y], outline))) return p;
  }
  return [cx, cy];
}
