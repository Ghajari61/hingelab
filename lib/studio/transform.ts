/**
 * Transform panel maths (Illustrator-style): every edit is anchored at a reference point given as
 * fractions of the selection box ([0, 0] top-left … [1, 1] bottom-right).
 */
import { apply, decompose, invert, isEmptyBox, mul, rotateAt, scaleAt, shearAt, translate, type Box } from "./geom";
import { locate, selectionBox, transformNodes } from "./scene";
import type { Document, Mat, Vec } from "./types";

export type RefPoint = [number, number];

export const refAt = (b: Box, rp: RefPoint): Vec => ({ x: b.minX + (b.maxX - b.minX) * rp[0], y: b.minY + (b.maxY - b.minY) * rp[1] });

/** Moves the selection so its reference point lands on `v` along one axis. */
export function moveRefTo(d: Document, ids: string[], rp: RefPoint, axis: "x" | "y", v: number) {
  const b = selectionBox(d, ids);
  if (isEmptyBox(b)) return;
  const p = refAt(b, rp);
  transformNodes(d, ids, axis === "x" ? translate(v - p.x, 0) : translate(0, v - p.y));
}

/** Resizes the selection's box to `v` mm along one axis, keeping the reference point still. */
export function resizeTo(d: Document, ids: string[], rp: RefPoint, axis: "w" | "h", v: number, lockRatio = false) {
  const b = selectionBox(d, ids);
  if (isEmptyBox(b)) return;
  const cur = axis === "w" ? b.maxX - b.minX : b.maxY - b.minY;
  if (cur < 1e-9 || v <= 0) return;
  const f = v / cur;
  const p = refAt(b, rp);
  const other = lockRatio ? f : 1;
  transformNodes(d, ids, axis === "w" ? scaleAt(f, other, p.x, p.y) : scaleAt(other, f, p.x, p.y));
}

/** Rotation of one object, or 0 for several (then the value is applied as a turn). */
export function currentRotation(d: Document, ids: string[]): number {
  if (ids.length !== 1) return 0;
  const l = locate(d.root, ids[0]);
  return l ? decompose(l.world).rotation : 0;
}

export function currentShear(d: Document, ids: string[]): number {
  if (ids.length !== 1) return 0;
  const l = locate(d.root, ids[0]);
  return l ? decompose(l.world).skew : 0;
}

export function rotateTo(d: Document, ids: string[], rp: RefPoint, deg: number) {
  const b = selectionBox(d, ids);
  if (isEmptyBox(b)) return;
  const p = refAt(b, rp);
  transformNodes(d, ids, rotateAt(deg - currentRotation(d, ids), p.x, p.y));
}

/** Sets the horizontal shear angle of one object (or shears several by `deg`), keeping the reference point still. */
export function shearTo(d: Document, ids: string[], rp: RefPoint, deg: number) {
  const b = selectionBox(d, ids);
  if (isEmptyBox(b)) return;
  const p = refAt(b, rp);
  const clamped = Math.max(-80, Math.min(80, deg));
  if (ids.length !== 1) { transformNodes(d, ids, shearAt(clamped, 0, p.x, p.y)); return; }
  const l = locate(d.root, ids[0]);
  if (!l) return;
  const m = l.world, k = decompose(m);
  const t = Math.tan((clamped * Math.PI) / 180) * (k.sx / (Math.abs(k.sy) > 1e-9 ? k.sy : 1e-9));
  const r = (k.rotation * Math.PI) / 180;
  const rot: Mat = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
  const next = mul(translate(k.x, k.y), mul(rot, mul([1, 0, t, 1, 0, 0], [k.sx, 0, 0, k.sy, 0, 0])));
  const delta = mul(next, invert(m));
  const q = apply(delta, p);
  transformNodes(d, ids, mul(translate(p.x - q.x, p.y - q.y), delta));
}

export function flipAt(d: Document, ids: string[], rp: RefPoint, axis: "h" | "v") {
  const b = selectionBox(d, ids);
  if (isEmptyBox(b)) return;
  const p = refAt(b, rp);
  transformNodes(d, ids, axis === "h" ? scaleAt(-1, 1, p.x, p.y) : scaleAt(1, -1, p.x, p.y));
}
