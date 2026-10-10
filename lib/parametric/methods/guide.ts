/** The guide curve of curve-normal fins: kept apart so checks can measure it without the engine. */
import type { GuideCurve, Point } from "../types";

/** Point and outward unit normal of the guide at angle parameter phi. */
export function guideAt(g: GuideCurve, phi: number): { p: Point; n: Point } {
  const rx = g.kind === "circle" ? g.d / 2 : g.w / 2, ry = g.kind === "circle" ? g.d / 2 : g.h / 2;
  const nx = ry * Math.cos(phi), ny = rx * Math.sin(phi), l = Math.hypot(nx, ny);
  return { p: [rx * Math.cos(phi), ry * Math.sin(phi)], n: [nx / l, ny / l] };
}

/** Arc-length parametrisation: t in [0, 1) round the guide to phi. */
export function arcTable(g: GuideCurve, samples = 4096) {
  const len = new Float64Array(samples + 1);
  let prev = guideAt(g, 0).p;
  for (let i = 1; i <= samples; i++) {
    const q = guideAt(g, (2 * Math.PI * i) / samples).p;
    len[i] = len[i - 1] + Math.hypot(q[0] - prev[0], q[1] - prev[1]);
    prev = q;
  }
  const perimeter = len[samples];
  const phiAt = (t: number) => {
    const target = (((t % 1) + 1) % 1) * perimeter;
    let lo = 0, hi = samples;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (len[mid] <= target) lo = mid; else hi = mid; }
    const f = len[hi] > len[lo] ? (target - len[lo]) / (len[hi] - len[lo]) : 0;
    return ((lo + f) * 2 * Math.PI) / samples;
  };
  return { perimeter, phiAt };
}
