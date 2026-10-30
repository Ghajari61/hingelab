/** Test helper: rasterise filled contours (even-odd, dark on white) and read the QR code in them. */
import jsQR from "jsqr";
import { bboxOf } from "../geom";
import type { Contour } from "../types";

export function decodeContours(dark: Contour[], module: number, px = 6): string | null {
  const bb = bboxOf(dark);
  const ppm = px / module, M = 6 * px;
  const w = Math.ceil((bb.x1 - bb.x0) * ppm) + 2 * M, h = Math.ceil((bb.y1 - bb.y0) * ppm) + 2 * M;
  const grey = new Uint8Array(w * h).fill(255);
  const edges: number[] = [];
  for (const c of dark) for (let i = 0; i < c.length; i++) { const a = c[i], b = c[(i + 1) % c.length]; edges.push(a[0], a[1], b[0], b[1]); }
  for (let y = 0; y < h; y++) {
    const py = (y + 0.5 - M) / ppm + bb.y0;
    const xs: number[] = [];
    for (let e = 0; e < edges.length; e += 4) { const ay = edges[e + 1], by = edges[e + 3]; if ((ay > py) !== (by > py)) xs.push(edges[e] + ((py - ay) * (edges[e + 2] - edges[e])) / (by - ay)); }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil((xs[k] - bb.x0) * ppm + M - 0.5)), x1 = Math.min(w - 1, Math.floor((xs[k + 1] - bb.x0) * ppm + M - 0.5));
      for (let x = x0; x <= x1; x++) grey[y * w + x] = 0;
    }
  }
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < grey.length; i++) { rgba[4 * i] = rgba[4 * i + 1] = rgba[4 * i + 2] = grey[i]; rgba[4 * i + 3] = 255; }
  const res = jsQR(rgba, w, h);
  return res ? new TextDecoder().decode(new Uint8Array(res.binaryData)) : null;
}
