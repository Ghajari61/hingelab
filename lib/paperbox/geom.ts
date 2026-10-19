/**
 * Building a flat net: faces (panels and flaps) placed edge to edge, creases on the shared edges,
 * the outline cut as the union of all faces. Flaps are drawn in a local frame (their hinge along
 * x from 0 to w, the flap reaching toward +y) and placed on any edge of the net.
 */
import { offsetShapes, shapeContours, unionShapes, makeShape } from "@/lib/letters/polygon";
import type { DielinePart, DielinePath, Face, Pt } from "./types";

const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
const len = (a: Pt) => Math.hypot(a[0], a[1]);
const unit = (a: Pt): Pt => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };

/** Points on an arc from a0 to a1 (radians) round c, about one every 0.6 mm. */
export function arc(c: Pt, r: number, a0: number, a1: number): Pt[] {
  const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / 0.6));
  return Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)] as Pt; });
}

/** The polygon with the corners at `at` (indices) rounded to radius r (clamped to fit). */
export function fillet(pts: Pt[], r: number, at: number[]): Pt[] {
  if (!(r > 0)) return pts;
  const out: Pt[] = [];
  pts.forEach((p, i) => {
    if (!at.includes(i)) { out.push(p); return; }
    const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
    const ua = unit(sub(a, p)), ub = unit(sub(b, p));
    const cos = Math.max(-1, Math.min(1, ua[0] * ub[0] + ua[1] * ub[1])), th = Math.acos(cos);
    if (th < 1e-3 || th > Math.PI - 1e-3) { out.push(p); return; }
    const rr = Math.min(r, (Math.min(len(sub(a, p)), len(sub(b, p))) * 0.49) * Math.tan(th / 2));
    const d = rr / Math.tan(th / 2), ta = add(p, mul(ua, d)), tb = add(p, mul(ub, d));
    const bis = unit(add(ua, ub)), c = add(p, mul(bis, rr / Math.sin(th / 2)));
    const a0 = Math.atan2(ta[1] - c[1], ta[0] - c[0]);
    let da = Math.atan2(tb[1] - c[1], tb[0] - c[0]) - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    out.push(...arc(c, rr, a0, a0 + da));
  });
  return out;
}

/** An edge of the net with its outward side: flaps placed on it reach away from `inside`. */
export interface Edge { a: Pt; b: Pt; n: Pt }
export function edge(a: Pt, b: Pt, inside: Pt): Edge {
  const u = unit(sub(b, a));
  let n: Pt = [-u[1], u[0]];
  const m = mul(add(a, b), 0.5);
  if ((inside[0] - m[0]) * n[0] + (inside[1] - m[1]) * n[1] > 0) n = [u[1], -u[0]];
  return { a, b, n };
}

// ---- flap shapes in the local frame: hinge from (0,0) to (w,0), flap toward +y

/** A rectangle w × d. */
export const rectFlap = (w: number, d: number): Pt[] => [[0, 0], [0, d], [w, d], [w, 0]];

/** A tuck flap: inset `s` each side, rounded far corners. */
export const tuckFlap = (w: number, d: number, r: number, s: number): Pt[] => fillet([[s, 0], [s, d], [w - s, d], [w - s, 0]], r, [1, 2]);

/** A dust flap: tapered toward its tip by `taper` on each side, rounded far corners. */
export const dustFlap = (w: number, d: number, taper: number, r: number, clear = 0.5): Pt[] =>
  fillet([[clear, 0], [clear + taper * 0.35, d], [w - clear - taper, d], [w - clear, 0]], r, [1, 2]);

/** A glue flap: ends cut back at `taper` degrees, so it folds clear of the corners. */
export function glueFlap(w: number, d: number, taperDeg: number): Pt[] {
  const k = Math.min(w / 2 - 0.5, d * Math.tan((taperDeg * Math.PI) / 180));
  return [[0, 0], [k, d], [w - k, d], [w, 0]];
}

/** Collects one part: faces, creases, cuts. */
export class Net {
  private polys: Pt[][] = [];
  private holes: Pt[][] = [];
  paths: DielinePath[] = [];
  faces: Face[] = [];

  /** A rectangular face (panel) on the sheet. */
  panel(id: string, name: string, x: number, y: number, w: number, h: number, more: Partial<Face> = {}): Face {
    const poly: Pt[] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    const f: Face = { id, name, poly, origin: [x, y], u: [1, 0], v: [0, 1], w, h, ...more };
    this.polys.push(poly);
    this.faces.push(f);
    return f;
  }

  /**
   * A flap on edge `e`: `shape` in the local frame (hinge along x, depth along +y outward). The
   * edge becomes a crease, less `slit` mm cut at each end (slit locks); `fold` false leaves no crease.
   */
  flap(id: string, name: string, e: Edge, shape: Pt[], more: Partial<Face> & { slit?: number; fold?: boolean } = {}): Face {
    const u = unit(sub(e.b, e.a)), w = len(sub(e.b, e.a));
    const to = (q: Pt): Pt => add(e.a, add(mul(u, q[0]), mul(e.n, q[1])));
    // A sliver over the hinge, so the union joins the flap to its panel.
    const poly = shape.map((q) => to([q[0], q[1] === 0 ? -0.02 : q[1]]));
    this.polys.push(poly);
    const depth = Math.max(...shape.map((q) => q[1]));
    const { slit = 0, fold = true, ...rest } = more;
    if (fold) {
      const s = Math.min(slit, w / 3);
      if (s > 0) {
        this.cut([e.a, add(e.a, mul(u, s))]);
        this.cut([add(e.a, mul(u, w - s)), e.b]);
      }
      this.crease([add(e.a, mul(u, s)), add(e.a, mul(u, w - s))]);
    }
    const f: Face = { id, name, poly: shape.map(to), origin: e.a, u, v: e.n, w, h: depth, hinge: [e.a, e.b], angle: 90, ...rest };
    this.faces.push(f);
    return f;
  }

  crease(pts: Pt[]) { this.paths.push({ type: "crease", pts, closed: false }); }
  cut(pts: Pt[], closed = false) { this.paths.push({ type: "cut", pts, closed }); }
  perforation(pts: Pt[]) { this.paths.push({ type: "perforation", pts, closed: false }); }
  /** A hole cut through (window, slot, hang hole). */
  hole(pts: Pt[]) { this.holes.push(pts); }

  /** The part: the outline (union of every face) and holes as cut paths, then creases and the rest; `bleed` adds the bleed line. */
  build(id: string, name: string, bleed = 0): DielinePart {
    const shapes = unionShapes(this.polys);
    const cuts: DielinePath[] = [];
    // Joins between faces can leave zero-width slivers in the union: those are not holes.
    const area = (c: Pt[]) => Math.abs(c.reduce((a, q, i) => { const r = c[(i + 1) % c.length]; return a + q[0] * r[1] - r[0] * q[1]; }, 0)) / 2;
    for (const s of shapes) {
      if (area(s.outer) < 0.5) continue;
      cuts.push({ type: "cut", pts: s.outer, closed: true });
      for (const h of s.holes) if (area(h) >= 0.5) cuts.push({ type: "cut", pts: h, closed: true });
    }
    for (const h of this.holes) cuts.push({ type: "cut", pts: h, closed: true });
    const extra: DielinePath[] = [];
    if (bleed > 0) for (const c of shapeContours(offsetShapes(shapes.map((s) => makeShape(s.outer, [])), bleed))) extra.push({ type: "bleed", pts: c, closed: true });
    return { id, name, paths: [...cuts, ...this.paths, ...extra], faces: this.faces };
  }
}
