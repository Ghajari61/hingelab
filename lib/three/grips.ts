/**
 * Handles on the selected part in the 3D views, like a 3D program's gizmos: the scale gizmo sizes the
 * design (an axis alone, two axes on a plane, all three in the middle, Shift keeps the proportions),
 * an arrow moves a part, a ring turns it. The view draws them and turns the mouse into growth,
 * millimetres or degrees; each editor says which settings they change. No three.js here.
 *
 * Axes are the 3D views' world axes: x to the right, y up, z towards the front.
 */
export type GripAxis = "x" | "y" | "z";
export type GripKind = "size" | "move" | "turn";
export type Factors = Record<GripAxis, number>;

export const AXES: GripAxis[] = ["x", "y", "z"];

/** A move arrow or a turn ring. */
export interface Grip {
  id: string;
  kind: "move" | "turn";
  axis: GripAxis;
  /** Sits on the selected part's box instead of the whole design's. */
  part?: boolean;
  /**
   * A drag begins; `ext` is the size along the axis (mm) of the box the handle sits on. The returned
   * function applies a drag of `d` (move: mm along the axis, turn: degrees counter-clockwise looking
   * down the axis) from where it started, with `done` on release (one undo step), and returns what to
   * show beside the pointer.
   */
  start(ext: number): (d: number, done: boolean) => string;
}

/** One setting the scale gizmo changes. */
export interface SizeSetting {
  key: string;
  /** The axes it sizes; they grow together (a diameter, a design scaled as a whole). */
  axes: GripAxis[];
  /**
   * The setting for the design grown by `f` along those axes (`ext`: its size along them, mm), kept
   * to the setting's limits and steps, and the growth that value really gives.
   */
  at(f: number, ext: number): { v: number; f: number };
  show(v: number): string;
}

/** The scale gizmo of a design: its settings, written together once a drag ends (one undo step). */
export interface SizeGizmo {
  settings: SizeSetting[];
  write(values: Record<string, number>): void;
  /** Sizes the selected part alone (a text, a picture): the gizmo sits on it and only it grows while dragged. */
  part?: boolean;
  /** Every handle grows all the gizmo's axes alike (a text's height sizes the whole text). */
  uniform?: boolean;
  /** No handle along an axis where the box is thinner than this (mm): a flat engraving is not made thicker. */
  thin?: number;
}

/** Everything a design can be dragged by in 3D. */
export interface GripSet {
  size?: SizeGizmo;
  grips?: Grip[];
}

export const GRIP_KINDS: { kind: GripKind; label: string; key: string }[] = [
  { kind: "move", label: "Move", key: "w" },
  { kind: "turn", label: "Turn", key: "e" },
  { kind: "size", label: "Scale", key: "r" },
];

/** The axes the gizmo has handles on. */
export function sizeAxes(g: SizeGizmo): GripAxis[] {
  return AXES.filter((a) => g.settings.some((s) => s.axes.includes(a)));
}

/** The axes the gizmo shows on a box of `size` (mm): its axes less those the box is too thin along. */
export function shownAxes(g: SizeGizmo, size: Factors): GripAxis[] {
  const all = sizeAxes(g);
  const kept = g.thin ? all.filter((a) => size[a] >= g.thin!) : all;
  return kept.length ? kept : all;
}

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

/**
 * Growth for an axis or plane handle, as in 3D programs: the pointer's distance from the gizmo's
 * centre `c` along the screen direction `u` (unit), over the distance where the handle was grabbed.
 */
export function scaleDrag(c: [number, number], u: [number, number], grab: [number, number], cur: [number, number]): number {
  const r0 = (grab[0] - c[0]) * u[0] + (grab[1] - c[1]) * u[1];
  if (r0 < 4) return 1;
  const r = (cur[0] - c[0]) * u[0] + (cur[1] - c[1]) * u[1];
  return Math.max(0.02, r / r0);
}

/** Growth for the gizmo's middle: up grows, down shrinks; 100 px doubles or halves. */
export function uniformDrag(dy: number): number {
  return Math.pow(2, -dy / 100);
}

/**
 * The growth along each axis for a drag of `f` on the handle sizing `axes` (one axis, a plane's two, or
 * all three); `keep` (Shift) grows every axis alike, keeping the proportions.
 */
export function dragFactors(axes: GripAxis[], f: number, keep: boolean): Factors {
  const out: Factors = { x: 1, y: 1, z: 1 };
  for (const a of keep ? AXES : axes) out[a] = f;
  return out;
}

/**
 * A size drag: the settings that change for growth `f` along each axis of a box sized `ext`, the
 * growth they really give (for the preview), and the readout. A setting on several axes follows the one that
 * grew or shrank the most.
 */
export function sizeResult(g: SizeGizmo, ext: Factors, f: Factors): { f: Factors; values: Record<string, number>; text: string } {
  const out: Factors = { x: 1, y: 1, z: 1 }, values: Record<string, number> = {}, changed: string[] = [], all: string[] = [];
  for (const s of g.settings) {
    const a = s.axes.reduce((b, x) => (Math.abs(Math.log(f[x])) > Math.abs(Math.log(f[b])) ? x : b));
    const r = s.at(f[a], ext[a]);
    for (const x of s.axes) out[x] = r.f;
    all.push(s.show(r.v));
    if (Math.abs(r.f - 1) > 1e-9) {
      values[s.key] = r.v;
      changed.push(s.show(r.v));
    }
  }
  return { f: out, values, text: (changed.length ? changed : all).join(" · ") };
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
 * A length setting the gizmo sizes: it changes by `k` mm per mm the design grows (whole mm), within
 * [min, max] on the `step` grid.
 */
export function mmSetting(key: string, axes: GripAxis[], o: { v0: number; min: number; max: number; step?: number; k?: number }, show: (v: number) => string): SizeSetting {
  const k = o.k ?? 1;
  return {
    key, axes, show,
    at: (f, ext) => {
      const d = Math.round(ext * (f - 1));
      if (!d || ext <= 0) return { v: o.v0, f: 1 };
      const v = clampStep(o.v0 + k * d, o.min, o.max, o.step);
      return { v, f: Math.max(0.01, 1 + (v - o.v0) / (k * ext)) };
    },
  };
}

/** A setting that scales with the design (a size, a scale factor): `v0 · f`, within [min, max] on the `step` grid. */
export function ratioSetting(key: string, axes: GripAxis[], o: { v0: number; min: number; max: number; step?: number }, show: (v: number) => string): SizeSetting {
  return {
    key, axes, show,
    at: (f) => {
      if (Math.abs(f - 1) < 1e-4 || !o.v0) return { v: o.v0, f: 1 };
      const v = clampStep(o.v0 * f, o.min, o.max, o.step);
      return { v, f: v / o.v0 };
    },
  };
}

/** A number setting changed by a move or turn drag: `v0 + k·d`, clamped and stepped, written with `set`. */
export function numberGrip(id: string, kind: "move" | "turn", axis: GripAxis, o: {
  v0: number; min: number; max: number; step?: number; k?: number; part?: boolean;
  set: (v: number, done: boolean) => void; show: (v: number) => string;
}): Grip {
  return {
    id, kind, axis, part: o.part,
    start: () => (d, done) => {
      const v = clampStep(o.v0 + (o.k ?? 1) * d, o.min, o.max, o.step);
      o.set(v, done);
      return o.show(v);
    },
  };
}
