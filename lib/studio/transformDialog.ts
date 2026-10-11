/**
 * The Transform dialog: Move, Scale, Rotate, Skew and Matrix tabs, applied to the selection as one
 * box or to each object around its own box. Every matrix is in world space and anchored at the
 * reference point (fractions of the box, as in the Properties panel).
 */
import { invert, isEmptyBox, mul, rotateAt, scaleAt, translate, type Box } from "./geom";
import { locate, selectionBox, topLevel, transformNodes, transformNodesEach, worldBox } from "./scene";
import { refAt, type RefPoint } from "./transform";
import type { Document, Mat } from "./types";

export type XformTab = "move" | "scale" | "rotate" | "skew" | "matrix";

export interface XformSpec {
  move: { x: number; y: number; relative: boolean };
  /** Percent or mm; with `proportional` the height follows the width. */
  scale: { w: number; h: number; unit: "%" | "mm"; proportional: boolean };
  rotate: { angle: number; dir: "cw" | "ccw" };
  /** Degrees, or mm of sideways shift of the far edge. */
  skew: { h: number; v: number; unit: "deg" | "mm" };
  /** `edit`: one object's world matrix becomes exactly [a b c d e f]; otherwise the matrix is applied on top at the reference point. */
  matrix: { m: Mat; edit: boolean };
}

export const XFORM_DEFAULTS: XformSpec = {
  move: { x: 0, y: 0, relative: true },
  scale: { w: 100, h: 100, unit: "%", proportional: true },
  rotate: { angle: 0, dir: "ccw" },
  skew: { h: 0, v: 0, unit: "deg" },
  matrix: { m: [1, 0, 0, 1, 0, 0], edit: false },
};

/** The world matrix one tab applies to an object (or selection) with bounds `b`, or null when it would do nothing useful. */
export function xformMatrix(tab: Exclude<XformTab, "matrix">, spec: XformSpec, b: Box, rp: RefPoint): Mat | null {
  if (isEmptyBox(b)) return null;
  const p = refAt(b, rp);
  const w = b.maxX - b.minX, h = b.maxY - b.minY;
  switch (tab) {
    case "move": return spec.move.relative ? translate(spec.move.x, spec.move.y) : translate(spec.move.x - p.x, spec.move.y - p.y);
    case "scale": {
      const s = spec.scale;
      const sx = s.unit === "%" ? s.w / 100 : w > 1e-9 ? s.w / w : 1;
      const sy = s.proportional ? sx : s.unit === "%" ? s.h / 100 : h > 1e-9 ? s.h / h : 1;
      if (Math.abs(sx) < 1e-9 || Math.abs(sy) < 1e-9) return null;
      return scaleAt(sx, sy, p.x, p.y);
    }
    case "rotate": return rotateAt(spec.rotate.dir === "cw" ? spec.rotate.angle : -spec.rotate.angle, p.x, p.y);
    case "skew": {
      const k = spec.skew;
      const tx = k.unit === "deg" ? Math.tan((clampDeg(k.h) * Math.PI) / 180) : h > 1e-9 ? k.h / h : 0;
      const ty = k.unit === "deg" ? Math.tan((clampDeg(k.v) * Math.PI) / 180) : w > 1e-9 ? k.v / w : 0;
      return mul(translate(p.x, p.y), mul([1, ty, tx, 1, 0, 0], translate(-p.x, -p.y)));
    }
  }
}

const clampDeg = (v: number) => Math.max(-89, Math.min(89, v));

/** Matrix tab applied on top: a b c d act around the reference point, e f move. */
export function matrixOnTop(m: Mat, b: Box, rp: RefPoint): Mat {
  const p = refAt(b, rp);
  return mul(translate(p.x, p.y), mul(m, translate(-p.x, -p.y)));
}

/** Applies one tab to the selection (as a whole, or each object around its own box). Returns the world matrix used for the whole selection, if any. */
export function applyXform(d: Document, ids: string[], tab: XformTab, spec: XformSpec, rp: RefPoint, each: boolean): Mat | null {
  const top = topLevel(d.root, ids);
  if (!top.length) return null;
  if (tab === "matrix" && spec.matrix.edit) {
    if (top.length !== 1) return null;
    const l = locate(d.root, top[0]);
    if (!l) return null;
    const det = spec.matrix.m[0] * spec.matrix.m[3] - spec.matrix.m[1] * spec.matrix.m[2];
    if (Math.abs(det) < 1e-12) return null;
    l.node.transform = mul(invert(l.parentWorld), spec.matrix.m);
    return null;
  }
  const make = (b: Box) => (tab === "matrix" ? (Math.abs(spec.matrix.m[0] * spec.matrix.m[3] - spec.matrix.m[1] * spec.matrix.m[2]) < 1e-12 ? null : matrixOnTop(spec.matrix.m, b, rp)) : xformMatrix(tab, spec, b, rp));
  if (!each || top.length === 1) {
    const m = make(selectionBox(d, top));
    if (m) transformNodes(d, top, m);
    return m;
  }
  const boxes = top.map((id) => worldBox(d.root, id));
  transformNodesEach(d, top.flatMap((id, k): [string, Mat][] => { const m = make(boxes[k]); return m ? [[id, m]] : []; }));
  return null;
}

/** The world matrix of one object, for "edit current matrix". */
export function worldMatrix(d: Document, id: string): Mat | null {
  return locate(d.root, id)?.world ?? null;
}
