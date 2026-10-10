/**
 * Closed polylines parametrised by arc length.
 */
import type { Contour, Point } from "./types";

export class Loop {
  readonly pts: Contour;
  /** cum[i] = arc length at pts[i]; cum[n] = total length. */
  readonly cum: number[];
  readonly length: number;

  constructor(pts: Contour) {
    this.pts = pts;
    const n = pts.length;
    this.cum = new Array<number>(n + 1);
    this.cum[0] = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      this.cum[i + 1] = this.cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    this.length = this.cum[n];
  }

  wrap(s: number) {
    const L = this.length;
    const w = s % L;
    return w < 0 ? w + L : w;
  }

  /** Index of the segment that contains arc length s (after wrapping). */
  segment(s: number) {
    const w = this.wrap(s), c = this.cum;
    let lo = 0, hi = this.pts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (c[mid] <= w) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  at(s: number): Point {
    const w = this.wrap(s), i = this.segment(w), n = this.pts.length;
    const a = this.pts[i], b = this.pts[(i + 1) % n];
    const len = this.cum[i + 1] - this.cum[i];
    const t = len > 0 ? (w - this.cum[i]) / len : 0;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  /** Unit direction of the segment that contains s. */
  tangent(s: number): Point {
    const i = this.segment(s), n = this.pts.length;
    const a = this.pts[i], b = this.pts[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  }

  /** The same loop, starting at arc length s (a vertex is inserted there unless one exists). */
  rotated(s: number): Loop {
    const w = this.wrap(s), i = this.segment(w), n = this.pts.length;
    const out: Contour = [];
    if (Math.abs(this.cum[i] - w) < 1e-9) {
      for (let k = 0; k < n; k++) out.push(this.pts[(i + k) % n]);
    } else {
      out.push(this.at(w));
      for (let k = 1; k <= n; k++) out.push(this.pts[(i + k) % n]);
    }
    return new Loop(dedupe(out));
  }

  /** The polyline between arc lengths s0 < s1 (no wrap), with interpolated end points. */
  slice(s0: number, s1: number): Point[] {
    const out: Point[] = [this.at(s0)];
    for (let i = 0; i < this.pts.length; i++) if (this.cum[i] > s0 && this.cum[i] < s1) out.push(this.pts[i]);
    out.push(s1 >= this.length ? this.pts[0] : this.at(s1));
    return out;
  }
}

function dedupe(pts: Contour): Contour {
  const out: Contour = [];
  for (const q of pts) {
    const l = out[out.length - 1];
    if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) > 1e-9) out.push(q);
  }
  while (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= 1e-9) out.pop();
  return out;
}

/** Signed turn at vertex i in radians (positive = clockwise on screen, toward the inside of an outer contour). */
export function turnAt(pts: Contour, i: number) {
  const n = pts.length;
  const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
  const a1 = Math.atan2(b[1] - a[1], b[0] - a[0]), a2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
  let d = a2 - a1;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * Local radius along a loop: arc length of the window divided by the turning across it.
 *
 * The turning is the angle between the tangents at s − half and s + half, each taken from a
 * chord of length 2·CHORD centred there; a sharp corner inside the window reads as tight.
 * Chords (rather than single edges) keep Clipper's micrometre rounding from adding noise.
 * (A circle through three points 1.5 mm apart is far noisier on curves flattened to 0.02 mm:
 * the flattening error is a sizeable share of such a short arc's sagitta.) On flattened arcs
 * the estimate is within about 4 % of the true radius, and reads low rather than high.
 */
export function windowRadius(loop: Loop, s: number, half = 1.5) {
  return (2 * half) / windowTurn(loop, s, half);
}

const CHORD = 1;

/** Turning (radians, absolute) between the tangents at s - half and s + half. */
export function windowTurn(loop: Loop, s: number, half = 1.5) {
  const dir = (u: number) => {
    const a = loop.at(u - CHORD), b = loop.at(u + CHORD);
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  };
  let d = dir(s + half) - dir(s - half);
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}
