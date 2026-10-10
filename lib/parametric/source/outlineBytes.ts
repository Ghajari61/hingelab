import type { Contour } from "../types";

const MAGIC = 0x48_4c_54_58; // "HLTX"

/** Glyph contours → bytes for the worker: [magic, count], then per contour [n, x0, y0, x1, y1, …]. */
export function packOutline(contours: Contour[]): ArrayBuffer {
  const n = contours.reduce((a, c) => a + 1 + 2 * c.length, 2);
  const out = new Float64Array(n);
  out[0] = MAGIC; out[1] = contours.length;
  let k = 2;
  for (const c of contours) {
    out[k++] = c.length;
    for (const [x, y] of c) { out[k++] = x; out[k++] = y; }
  }
  return out.buffer;
}

export function unpackOutline(buf: ArrayBuffer): Contour[] {
  const bad = () => new Error("The text outline is damaged. Edit the text to rebuild it.");
  if (buf.byteLength < 16 || buf.byteLength % 8) throw bad();
  const a = new Float64Array(buf);
  if (a[0] !== MAGIC) throw bad();
  const out: Contour[] = [];
  let k = 2;
  for (let i = 0; i < a[1]; i++) {
    const n = a[k++];
    if (!(n >= 0) || k + 2 * n > a.length) throw bad();
    const c: Contour = [];
    for (let j = 0; j < n; j++, k += 2) c.push([a[k], a[k + 1]]);
    out.push(c);
  }
  return out;
}
