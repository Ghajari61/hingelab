/**
 * Text on a circle: a line of shaped text (centred on (0, 0), x along the line, y down) bent so its
 * centre line follows a circle of radius R about the origin. Along the top it reads clockwise with
 * the letters standing outward; along the bottom it reads anticlockwise with them standing inward,
 * so both read left to right. The whole line is bent at once, which keeps the font's spacing.
 */
import type { Contour, Pt } from "./types";

/** Points at most `step` mm apart, so straight strokes bend with the circle. */
export function densify(c: Contour, step = 0.5): Contour {
  const out: Contour = [];
  for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length];
    const n = Math.max(1, Math.min(200, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

/** Arc length the text spans, as an angle (radians) on radius R. */
export const arcSpan = (width: number, R: number) => (R > 0 ? width / R : Infinity);

export function bendAround(cs: Contour[], R: number, at: "top" | "bottom"): Contour[] {
  const top = at === "top";
  return cs.map((c) => densify(c).map(([x, y]): Pt => {
    const t = top ? x / R : Math.PI - x / R;
    const r = top ? R - y : R + y;
    return [r * Math.sin(t), -r * Math.cos(t)];
  }));
}
