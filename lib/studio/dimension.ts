/**
 * Dimension lines as a drawing shows them (CorelDRAW's Dimension tools): parallel, horizontal and
 * vertical lengths with extension lines and arrows, angles with an arc, radius and diameter
 * leaders. Everything is in the dimension's own coordinates (mm); the label is placed along the
 * dimension line, turned to read from below or the right.
 */
import { newId } from "./doc";
import { apply, invert, setDimensionPaths } from "./geom";
import { ensureMeasureLayer } from "./measure";
import type { IdFactory } from "./scene";
import type { DimensionKind, DimensionNode, Document, Subpath, Vec } from "./types";

/** Arrow length, extension-line gap and overshoot, label height, mm. */
export const DIM = { arrow: 2.2, gap: 1, over: 1.6, text: 3 };

export interface DimensionDrawing {
  /** Extension lines, dimension line or arc, leaders. */
  lines: Subpath[];
  /** Filled arrowheads. */
  arrows: Subpath[];
  /** The measured value: mm for lengths, degrees for angles. */
  value: number;
  unit: "length" | "angle";
  prefix: string;
  label: { at: Vec; angle: number };
}

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
const len = (a: Vec) => Math.hypot(a.x, a.y);
const unit = (a: Vec): Vec => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
const line = (...p: Vec[]): Subpath => ({ closed: false, nodes: p.map((q) => ({ x: q.x, y: q.y })) });

/** An arrowhead with its tip at `tip`, pointing along `dir`. */
function arrow(tip: Vec, dir: Vec): Subpath {
  const d = unit(dir), n = { x: -d.y, y: d.x }, back = sub(tip, mul(d, DIM.arrow)), w = DIM.arrow * 0.32;
  return { closed: true, nodes: [tip, add(back, mul(n, w)), sub(back, mul(n, w))].map((q) => ({ x: q.x, y: q.y })) };
}

/** A label angle (degrees, y down) that reads left to right, never upside down. */
const readable = (deg: number) => { let a = ((deg % 360) + 360) % 360; if (a > 90 && a <= 270) a -= 180; return a; };

/** A length between two feet with the dimension line at `p0`–`p1` (parallel to them). */
function lengthDim(a: Vec, b: Vec, p0: Vec, p1: Vec, value: number): DimensionDrawing {
  const lines: Subpath[] = [];
  for (const [foot, at] of [[a, p0], [b, p1]] as const) {
    const d = sub(at, foot), l = len(d);
    if (l > DIM.gap + 0.01) { const u = unit(d); lines.push(line(add(foot, mul(u, DIM.gap)), add(at, mul(u, DIM.over)))); }
  }
  lines.push(line(p0, p1));
  const along = sub(p1, p0), L = len(along);
  // arrows point outwards when the line is too short to hold them inside
  const inside = L > 3 * DIM.arrow;
  const arrows = L > 1e-6 ? [arrow(p0, inside ? mul(along, -1) : along), arrow(p1, inside ? along : mul(along, -1))] : [];
  if (!inside && L > 1e-6) { const u = unit(along); lines.push(line(p0, sub(p0, mul(u, DIM.arrow * 2))), line(p1, add(p1, mul(u, DIM.arrow * 2)))); }
  const u = unit(along), n = { x: u.y, y: -u.x };
  const deg = (Math.atan2(along.y, along.x) * 180) / Math.PI;
  // the label sits just off the line, on the side away from the measured feet
  const side = len(sub(p0, a)) > 1e-6 ? Math.sign((p0.x - a.x) * n.x + (p0.y - a.y) * n.y) || 1 : 1;
  const mid = add(mul(add(p0, p1), 0.5), mul(n, side * DIM.text * 0.35));
  return { lines, arrows, value, unit: "length", prefix: "", label: { at: mid, angle: readable(deg) } };
}

/** The dimension's drawing in its own coordinates. */
export function dimensionDrawing(n: Pick<DimensionNode, "kind" | "points" | "offset">): DimensionDrawing | null {
  const [a, b, c] = n.points;
  if (!a || !b) return null;
  const o = n.offset;
  switch (n.kind) {
    case "linear": {
      const d = sub(b, a);
      if (len(d) < 1e-6) return null;
      const u = unit(d), nn = { x: -u.y, y: u.x };
      return lengthDim(a, b, add(a, mul(nn, o)), add(b, mul(nn, o)), len(d));
    }
    case "horizontal": {
      if (Math.abs(b.x - a.x) < 1e-6) return null;
      const y = o < 0 ? Math.min(a.y, b.y) + o : Math.max(a.y, b.y) + o;
      return lengthDim(a, b, { x: a.x, y }, { x: b.x, y }, Math.abs(b.x - a.x));
    }
    case "vertical": {
      if (Math.abs(b.y - a.y) < 1e-6) return null;
      const x = o < 0 ? Math.min(a.x, b.x) + o : Math.max(a.x, b.x) + o;
      return lengthDim(a, b, { x, y: a.y }, { x, y: b.y }, Math.abs(b.y - a.y));
    }
    case "angular": {
      if (!c) return null;
      // vertex a, arms to b and c; the arc on the inside of the angle (under 180°)
      const r = o > 0 ? o : Math.max(6, Math.min(len(sub(b, a)), len(sub(c, a))) * 0.6);
      const t0 = Math.atan2(b.y - a.y, b.x - a.x);
      let t1 = Math.atan2(c.y - a.y, c.x - a.x);
      let sweep = t1 - t0;
      while (sweep > Math.PI) sweep -= 2 * Math.PI;
      while (sweep < -Math.PI) sweep += 2 * Math.PI;
      t1 = t0 + sweep;
      const steps = Math.max(8, Math.ceil(Math.abs(sweep) / 0.08));
      const pts = Array.from({ length: steps + 1 }, (_, k) => { const t = t0 + (sweep * k) / steps; return { x: a.x + r * Math.cos(t), y: a.y + r * Math.sin(t) }; });
      const lines: Subpath[] = [line(...pts)];
      // arms reach the arc when it is past their ends
      for (const [p, t] of [[b, t0], [c, t1]] as const) if (len(sub(p, a)) < r) lines.push(line(p, { x: a.x + (r + DIM.over) * Math.cos(t), y: a.y + (r + DIM.over) * Math.sin(t) }));
      const s = Math.sign(sweep) || 1;
      const tan = (t: number, dir: number): Vec => ({ x: -Math.sin(t) * dir, y: Math.cos(t) * dir });
      const arrows = Math.abs(sweep) * r > 3 * DIM.arrow ? [arrow(pts[0], tan(t0, -s)), arrow(pts[steps], tan(t1, s))] : [];
      const tm = t0 + sweep / 2, at = { x: a.x + (r + DIM.text * 0.9) * Math.cos(tm), y: a.y + (r + DIM.text * 0.9) * Math.sin(tm) };
      return { lines, arrows, value: (Math.abs(sweep) * 180) / Math.PI, unit: "angle", prefix: "", label: { at, angle: readable((tm * 180) / Math.PI + 90) } };
    }
    case "radius":
    case "diameter": {
      const d = sub(b, a), r = len(d);
      if (r < 1e-6) return null;
      const u = unit(d), from = n.kind === "diameter" ? sub(a, d) : a;
      const lines = [line(from, b)];
      const arrows = [arrow(b, u), ...(n.kind === "diameter" ? [arrow(from, mul(u, -1))] : [])];
      const deg = (Math.atan2(d.y, d.x) * 180) / Math.PI, nn = { x: u.y, y: -u.x };
      const at = add(n.kind === "diameter" ? a : add(a, mul(d, 0.5)), mul(nn, DIM.text * 0.55));
      return { lines, arrows, value: n.kind === "diameter" ? 2 * r : r, unit: "length", prefix: n.kind === "diameter" ? "⌀" : "R", label: { at, angle: readable(deg) } };
    }
  }
}

/** The label as text: lengths in the document's units, angles in degrees. */
export function dimensionText(d: DimensionDrawing, units: string, text?: string): string {
  if (text?.trim()) return text.trim();
  if (d.unit === "angle") return `${Math.round(d.value * 10) / 10}°`;
  const v = units === "in" ? d.value / 25.4 : d.value;
  const s = units === "in" ? (Math.round(v * 1000) / 1000).toString() : (Math.round(v * 10) / 10).toString();
  return `${d.prefix ? `${d.prefix} ` : ""}${s} ${units}`;
}

/** The outlines a dimension shows (for selection, its box and hit tests). */
export function dimensionPaths(n: DimensionNode): Subpath[] {
  const d = dimensionDrawing(n);
  return d ? [...d.lines, ...d.arrows] : n.points.length > 1 ? [line(...n.points)] : [];
}

/** A new dimension of `kind` through world points, on the measurements layer (never sent to the laser). */
export function addDimensionOf(doc: Document, kind: DimensionKind, pts: Vec[], offset: number, id: IdFactory = newId): string {
  const layer = ensureMeasureLayer(doc);
  const inv = invert(doc.root.transform);
  const node: DimensionNode = { id: id(), type: "dimension", name: DIMENSION_NAMES[kind], transform: [1, 0, 0, 1, 0, 0], layer, kind, points: pts.map((p) => apply(inv, p)), offset };
  doc.root.children.push(node);
  return node.id;
}

export const DIMENSION_NAMES: Record<DimensionKind, string> = {
  linear: "Parallel dimension", horizontal: "Horizontal dimension", vertical: "Vertical dimension", angular: "Angular dimension", radius: "Radius dimension", diameter: "Diameter dimension",
};

/** Offset of the dimension line that puts it through `p` (for the click that places it). */
export function offsetThrough(kind: DimensionKind, a: Vec, b: Vec, p: Vec): number {
  switch (kind) {
    case "horizontal": return p.y < Math.min(a.y, b.y) ? p.y - Math.min(a.y, b.y) : p.y - Math.max(a.y, b.y);
    case "vertical": return p.x < Math.min(a.x, b.x) ? p.x - Math.min(a.x, b.x) : p.x - Math.max(a.x, b.x);
    case "angular": return len(sub(p, a));
    default: {
      const u = unit(sub(b, a));
      return (p.x - a.x) * -u.y + (p.y - a.y) * u.x;
    }
  }
}

setDimensionPaths(dimensionPaths);
