/**
 * Kerf by machine axis, without geometry libraries. `kx` is the width the beam removes across a cut
 * that runs along Y (a vertical edge), `ky` across one that runs along X; between them the kerf
 * follows an ellipse with half-axes kx/2 and ky/2.
 */
type Point = [number, number];

/** Half the cut width across an edge whose unit normal is `n`. */
export const kerfAcross = (n: Point, kx: number, ky: number) => Math.hypot(n[0] * kx, n[1] * ky) / 2;

/** The point of the kerf ellipse whose outward normal is `n`. */
export function kerfPoint(n: Point, kx: number, ky: number): Point {
  const a = kx / 2, b = ky / 2, h = Math.hypot(a * n[0], b * n[1]);
  return h < 1e-12 ? [0, 0] : [(a * a * n[0]) / h, (b * b * n[1]) / h];
}

/** A closed ellipse (clockwise on screen, y down), `n` points. */
export function ellipse(cx: number, cy: number, rx: number, ry: number, n = 64): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}
