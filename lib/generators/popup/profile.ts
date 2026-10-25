/**
 * The profile curve: how high each ring sits, from the centre (t = 0) to the rim (t = 1). `rise`
 * goes from 0 to 1 outward; the form turns it into heights for a bowl (centre low) or a tower,
 * shade or tiered stand (centre high).
 */
import type { PopupParams } from "./params";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Points of a custom curve, "across:up" in %, sorted, with the ends pinned to 0 and 100. */
export function parseCurve(s: string): [number, number][] {
  const pts: [number, number][] = [];
  for (const m of s.matchAll(/(-?\d+(?:\.\d+)?)\s*[:/]\s*(-?\d+(?:\.\d+)?)/g)) {
    pts.push([clamp01(parseFloat(m[1]) / 100), clamp01(parseFloat(m[2]) / 100)]);
  }
  pts.sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const q of pts) if (!out.length || q[0] - out[out.length - 1][0] > 1e-6) out.push(q);
  if (!out.length || out[0][0] > 0) out.unshift([0, out[0]?.[1] ?? 0]);
  if (out[out.length - 1][0] < 1) out.push([1, out.length > 1 ? out[out.length - 1][1] : 1]);
  return out;
}

/** A smooth curve through the points that never overshoots them (monotone cubic, Fritsch–Carlson). */
function monotone(pts: [number, number][]): (t: number) => number {
  const n = pts.length;
  if (n < 2) return () => pts[0]?.[1] ?? 0;
  const dx = pts.slice(1).map((q, i) => q[0] - pts[i][0]);
  const sl = pts.slice(1).map((q, i) => (q[1] - pts[i][1]) / dx[i]);
  const m = pts.map((_, i) => (i === 0 ? sl[0] : i === n - 1 ? sl[n - 2] : sl[i - 1] * sl[i] <= 0 ? 0 : (sl[i - 1] + sl[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (sl[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / sl[i], b = m[i + 1] / sl[i], h = a * a + b * b;
    if (h > 9) { const k = 3 / Math.sqrt(h); m[i] = k * a * sl[i]; m[i + 1] = k * b * sl[i]; }
  }
  return (t) => {
    const x = clamp01(t);
    let i = 0;
    while (i < n - 2 && x > pts[i + 1][0]) i++;
    const h = dx[i], u = (x - pts[i][0]) / h;
    const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
    return clamp01(h00 * pts[i][1] + h10 * h * m[i] + h01 * pts[i + 1][1] + h11 * h * m[i + 1]);
  };
}

/** The rise (0 at the centre, 1 at the rim) at t. */
export function riseFn(form: PopupParams["form"]): (t: number) => number {
  switch (form.profile) {
    case "straight": return (t) => clamp01(t);
    case "round": return (t) => { const x = clamp01(t); return 1 - Math.sqrt(Math.max(0, 1 - x * x)); };
    case "soft": return (t) => { const x = clamp01(t); return 1 - (1 - x) * (1 - x); };
    case "bell": return (t) => { const x = clamp01(t); return x * x * (3 - 2 * x); };
    case "flat": {
      const a = clamp01(form.flat / 100) * 0.95;
      return (t) => { const x = clamp01(t); if (x <= a) return 0; const u = (x - a) / (1 - a); return 1 - Math.sqrt(Math.max(0, 1 - u * u)); };
    }
    case "stepped": {
      // k flat levels, the first round the centre: a two-tier stand has a top tray and a bottom tray.
      const k = Math.max(2, Math.round(form.tiers));
      return (t) => Math.min(1, Math.floor(clamp01(t) * k + 1e-9) / (k - 1));
    }
    case "custom": return monotone(parseCurve(form.curve));
  }
}

/** The centre sits low (a bowl, a sleeve) rather than high (a tower, a shade, a tiered stand). */
export function centreLow(p: PopupParams): boolean {
  const low = p.mode === "bowl" || p.mode === "sleeve";
  return p.form.invert ? !low : low;
}

/** Height above the lowest ring at t, mm (0 … depth). */
export function heightFn(p: PopupParams): (t: number) => number {
  const f = riseFn(p.form), D = Math.max(0, p.form.depth), low = centreLow(p);
  return (t) => D * (low ? f(t) : 1 - f(t));
}

/**
 * Where the ring edges fall, as shares of the way from the centre to the rim (n + 1 values from 0 to
 * 1). Even spacing by default; `even` spaces them along the slope instead, so steep parts get narrower
 * rings and every ring's slope is about as long (`span` is the radial distance in mm).
 */
export function ringStops(p: PopupParams, n: number, span: number): number[] {
  if (!p.cut.even || p.form.profile === "stepped") return Array.from({ length: n + 1 }, (_, i) => i / n);
  const h = heightFn(p), N = 400, L: number[] = [0];
  for (let i = 1; i <= N; i++) {
    const a = (i - 1) / N, b = i / N;
    L.push(L[i - 1] + Math.hypot(span / N, h(b) - h(a)));
  }
  const total = L[N], out = [0];
  let j = 1;
  for (let i = 1; i < n; i++) {
    const want = (total * i) / n;
    while (j < N && L[j] < want) j++;
    const f = (want - L[j - 1]) / Math.max(1e-9, L[j] - L[j - 1]);
    out.push((j - 1 + f) / N);
  }
  out.push(1);
  // Never narrower than a third of the even width, so no ring vanishes on a vertical step.
  for (let i = 1; i <= n; i++) out[i] = Math.max(out[i], out[i - 1] + 1 / (3 * n));
  const k = out[n];
  return out.map((v) => v / k);
}
