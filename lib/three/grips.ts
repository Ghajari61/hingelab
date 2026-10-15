/**
 * Handles on the selected part in the 3D views, like a 3D program's gizmo: drag a face to size the
 * design, an arrow to move it, a ring to turn it. The view draws them and turns the mouse into
 * millimetres or degrees; each editor says what a drag changes in its settings. No three.js here.
 *
 * Axes are the 3D views' world axes: x to the right, y up, z towards the front.
 */
export type GripAxis = "x" | "y" | "z";
export type GripKind = "size" | "move" | "turn";

export interface Grip {
  id: string;
  kind: GripKind;
  axis: GripAxis;
  /** Size: the face it sits on (1 = the far side along the axis, -1 = the near side). */
  side?: 1 | -1;
  /** Sits on the selected part's box instead of the whole design's. */
  part?: boolean;
  /**
   * A drag begins; `ext` is the size along the axis (mm) of the box the handle sits on. The returned
   * function applies a drag of `d` (size: mm outwards, move: mm along the axis, turn: degrees
   * counter-clockwise looking down the axis) from where it started, with `done` on release (one
   * undo step), and returns what to show beside the pointer.
   */
  start(ext: number): (d: number, done: boolean) => string;
}

export const GRIP_KINDS: { kind: GripKind; label: string; key: string }[] = [
  { kind: "move", label: "Move", key: "w" },
  { kind: "turn", label: "Turn", key: "e" },
  { kind: "size", label: "Size", key: "r" },
];

/** Millimetres along an axis for a pointer moved by (dx, dy) px, the axis drawn as `u` px per mm. */
export function axisDrag(dx: number, dy: number, u: [number, number]): number {
  const n = u[0] * u[0] + u[1] * u[1];
  return n < 1e-9 ? 0 : (dx * u[0] + dy * u[1]) / n;
}

/**
 * Degrees turned about an axis by a pointer going from `a` to `b` round the screen point `c`
 * (screen y down). `facing`: the axis points at the viewer, so counter-clockwise on screen is a
 * positive turn.
 */
export function turnDrag(c: [number, number], a: [number, number], b: [number, number], facing: boolean): number {
  const ax = a[0] - c[0], ay = c[1] - a[1], bx = b[0] - c[0], by = c[1] - b[1];
  if (Math.hypot(ax, ay) < 1 || Math.hypot(bx, by) < 1) return 0;
  const deg = (Math.atan2(ax * by - ay * bx, ax * bx + ay * by) * 180) / Math.PI;
  return facing ? deg : -deg;
}

/** Whole millimetres or degrees; Shift snaps to 5 mm or 15°. */
export function snapDrag(kind: GripKind, d: number, coarse: boolean): number {
  const step = kind === "turn" ? (coarse ? 15 : 1) : coarse ? 5 : 1;
  return Math.round(d / step) * step || 0;
}

/** `v` kept in [min, max] and on the `step` grid. */
export function clampStep(v: number, min: number, max: number, step = 0): number {
  const s = step > 0 ? Math.round(v / step) * step : v;
  return Math.min(max, Math.max(min, Math.round(s * 1000) / 1000));
}

/** A length for the readout, in the editor's units. */
export function lenText(mm: number, units: "mm" | "in"): string {
  return units === "in" ? `${(mm / 25.4).toFixed(2)} in` : `${Math.round(mm * 10) / 10} mm`;
}

export const AXIS_NAMES: Record<GripAxis, string> = { x: "Width", y: "Height", z: "Depth" };

/**
 * Size handles on both faces of the given axes (and the top face only for y: designs stand on the
 * ground), each set by `apply(v, ext)` from the box's size `ext` to `v`.
 */
export function sizeGrips(axes: GripAxis[], apply: (axis: GripAxis, ext: number, d: number, done: boolean) => string, part = false): Grip[] {
  const out: Grip[] = [];
  for (const axis of axes) for (const side of axis === "y" ? [1 as const] : [1 as const, -1 as const]) {
    out.push({ id: `size-${axis}${side > 0 ? "+" : "-"}`, kind: "size", axis, side, part, start: (ext) => (d, done) => apply(axis, ext, d, done) });
  }
  return out;
}

/** A number setting changed by a drag: `v0 + k·d`, clamped and stepped, written with `set`. */
export function numberGrip(id: string, kind: GripKind, axis: GripAxis, o: {
  v0: number; min: number; max: number; step?: number; k?: number; side?: 1 | -1; part?: boolean;
  set: (v: number, done: boolean) => void; show: (v: number) => string;
}): Grip {
  return {
    id, kind, axis, side: o.side, part: o.part,
    start: () => (d, done) => {
      const v = clampStep(o.v0 + (o.k ?? 1) * d, o.min, o.max, o.step);
      o.set(v, done);
      return o.show(v);
    },
  };
}
