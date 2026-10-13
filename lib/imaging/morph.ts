/**
 * Bitmap shape tools for cut-safe vectors: distance maps, grow / shrink by a radius, connected
 * pieces and bridges. Pure, on the trace Bitmap (1 = ink).
 */
import { emptyBitmap, type Bitmap } from "@/lib/studio/trace/raster";

/**
 * Euclidean distance (pixels) from every pixel to the nearest pixel whose value is not `value`
 * (exact, Felzenszwalb–Huttenlocher squared-distance transform). Pixels outside the image count
 * as `outside`.
 */
export function distanceTo(b: Bitmap, value: 0 | 1, outside: 0 | 1 = 0): Float32Array {
  const { width: w, height: h } = b, INF = 1e20;
  // Pad by one pixel so the border is "outside".
  const W = w + 2, H = h + 2, f = new Float64Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const inside = x > 0 && y > 0 && x <= w && y <= h;
    const v = inside ? b.bits[(y - 1) * w + (x - 1)] : outside;
    f[y * W + x] = v === value ? INF : 0;
  }
  const line = (get: (i: number) => number, set: (i: number, v: number) => void, n: number) => {
    const d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1), src = new Float64Array(n);
    for (let i = 0; i < n; i++) src[i] = get(i);
    let k = 0;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = ((src[q] + q * q) - (src[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((src[q] + q * q) - (src[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + src[v[k]]; }
    for (let i = 0; i < n; i++) set(i, d[i]);
  };
  for (let x = 0; x < W; x++) line((i) => f[i * W + x], (i, val) => { f[i * W + x] = val; }, H);
  for (let y = 0; y < H; y++) line((i) => f[y * W + i], (i, val) => { f[y * W + i] = val; }, W);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = Math.sqrt(f[(y + 1) * W + x + 1]);
  return out;
}

/** Shrinks the ink by `r` pixels. */
export function erode(b: Bitmap, r: number): Bitmap {
  if (r <= 0) return { ...b, bits: b.bits.slice() };
  const d = distanceTo(b, 1), out = emptyBitmap(b.width, b.height);
  for (let i = 0; i < d.length; i++) out.bits[i] = b.bits[i] && d[i] > r ? 1 : 0;
  return out;
}

/** Grows the ink by `r` pixels. */
export function dilate(b: Bitmap, r: number): Bitmap {
  if (r <= 0) return { ...b, bits: b.bits.slice() };
  const d = distanceTo(b, 0, 0), out = emptyBitmap(b.width, b.height);
  for (let i = 0; i < d.length; i++) out.bits[i] = b.bits[i] || d[i] <= r ? 1 : 0;
  return out;
}

/** Removes ink narrower than 2r (opening: shrink, then grow back). */
export const openBitmap = (b: Bitmap, r: number): Bitmap => (r <= 0 ? b : andBits(dilate(erode(b, r), r), b));

export function andBits(a: Bitmap, b: Bitmap): Bitmap {
  const out = emptyBitmap(a.width, a.height);
  for (let i = 0; i < out.bits.length; i++) out.bits[i] = a.bits[i] & b.bits[i];
  return out;
}

export interface Components {
  /** Component index per pixel, −1 where the pixel has the other value. */
  labels: Int32Array;
  sizes: number[];
  /** Whether the component touches the image border. */
  border: boolean[];
}

/** Connected pieces of pixels equal to `value` (8-connected for ink, 4-connected for background, like the tracer). */
export function components(b: Bitmap, value: 0 | 1): Components {
  const { width: w, height: h } = b, labels = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [], border: boolean[] = [], stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (labels[start] >= 0 || b.bits[start] !== value) continue;
    const id = sizes.length;
    let size = 0, edge = false;
    labels[start] = id; stack.push(start);
    while (stack.length) {
      const i = stack.pop()!, x = i % w, y = (i - x) / w;
      size++;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || (!value && dx && dy)) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (labels[j] < 0 && b.bits[j] === value) { labels[j] = id; stack.push(j); }
      }
    }
    sizes.push(size); border.push(edge);
  }
  return { labels, sizes, border };
}

/** Paints a straight band of `value`, `width` pixels wide, from a to b. */
export function paintLine(b: Bitmap, ax: number, ay: number, bx: number, by: number, width: number, value: 0 | 1) {
  const r = Math.max(0.5, width / 2), len = Math.hypot(bx - ax, by - ay);
  const minX = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1)), maxX = Math.min(b.width - 1, Math.ceil(Math.max(ax, bx) + r + 1));
  const minY = Math.max(0, Math.floor(Math.min(ay, by) - r - 1)), maxY = Math.min(b.height - 1, Math.ceil(Math.max(ay, by) + r + 1));
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    let t = len ? ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (len * len) : 0;
    t = Math.max(0, Math.min(1, t));
    if (Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))) <= r) b.bits[y * b.width + x] = value;
  }
}

/**
 * For every pixel, the nearest pixel in `seed` and the distance to it: two raster sweeps that pass
 * each neighbour's nearest seed along (8SSEDT; within a pixel of exact, plenty for picking bridges).
 */
function nearestSeed(w: number, h: number, seed: (i: number) => boolean): { from: Int32Array; dist: Float32Array } {
  const from = new Int32Array(w * h).fill(-1), dist = new Float32Array(w * h).fill(Infinity);
  for (let i = 0; i < w * h; i++) if (seed(i)) { from[i] = i; dist[i] = 0; }
  const relax = (x: number, y: number, nx: number, ny: number) => {
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
    const s = from[ny * w + nx];
    if (s < 0) return;
    const sx = s % w, d = Math.hypot(x - sx, y - (s - sx) / w), i = y * w + x;
    if (d < dist[i]) { dist[i] = d; from[i] = s; }
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) { relax(x, y, x - 1, y); relax(x, y, x - 1, y - 1); relax(x, y, x, y - 1); relax(x, y, x + 1, y - 1); }
    for (let x = w - 1; x >= 0; x--) relax(x, y, x + 1, y);
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) { relax(x, y, x + 1, y); relax(x, y, x + 1, y + 1); relax(x, y, x, y + 1); relax(x, y, x - 1, y + 1); }
    for (let x = 0; x < w; x++) relax(x, y, x - 1, y);
  }
  return { from, dist };
}

/** Most pieces that get a bridge; smaller ones are left as they are (Cut-safety reports them). */
export const MAX_BRIDGES = 60;

/**
 * Connects pieces so nothing falls out:
 * - "islands": every separate ink piece is joined to the largest one with an ink bridge (one part).
 * - "holes": every enclosed background pocket (the middle of an O in a stencil) is joined to the
 *   outside with a background bridge across the ink, so the pocket stays attached to the sheet.
 * Pieces are joined largest first, each by the shortest bridge to what is already connected.
 */
export function connectPieces(src: Bitmap, mode: "islands" | "holes", width: number): { bitmap: Bitmap; bridges: number } {
  const b: Bitmap = { width: src.width, height: src.height, bits: src.bits.slice() };
  const value: 0 | 1 = mode === "islands" ? 1 : 0;
  const { labels, sizes, border } = components(b, value);
  if (sizes.length < 2 && mode === "islands") return { bitmap: b, bridges: 0 };
  const joined = new Set<number>();
  if (mode === "islands") joined.add(sizes.indexOf(Math.max(...sizes)));
  else border.forEach((e, k) => { if (e) joined.add(k); });
  if (!joined.size) return { bitmap: b, bridges: 0 };
  const rest = sizes.map((s, k) => ({ s, k })).filter((c) => !joined.has(c.k)).sort((p, q) => q.s - p.s).slice(0, MAX_BRIDGES);
  const { width: w, height: h } = b;
  let bridges = 0;
  // Bridges join a piece to the connected set; recompute the nearest map only every few bridges.
  let map = nearestSeed(w, h, (i) => joined.has(labels[i]));
  let since = 0;
  for (const c of rest) {
    if (since >= 8) { map = nearestSeed(w, h, (i) => joined.has(labels[i])); since = 0; }
    let best = -1, bd = Infinity;
    for (let i = 0; i < w * h; i++) if (labels[i] === c.k && map.dist[i] < bd) { bd = map.dist[i]; best = i; }
    if (best < 0 || !Number.isFinite(bd)) continue;
    const to = map.from[best];
    paintLine(b, best % w, Math.floor(best / w), to % w, Math.floor(to / w), width, value);
    joined.add(c.k);
    bridges++; since++;
  }
  return { bitmap: b, bridges };
}
