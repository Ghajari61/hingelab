/**
 * Curvature zones of a wall centerline: flat stretches (tabs go there) and curve stretches
 * (the hinge goes there).
 */
import { Loop, windowRadius, windowTurn } from "./path";

/** Sample spacing along the centerline, mm. */
const DS = 0.5;
/** Turning over the 3 mm window below which the wall counts as flat (also covers radius > 400 mm). */
const FLAT_TURN = (0.5 * Math.PI) / 180;

export interface RawZone {
  s0: number;
  s1: number;
  kind: "flat" | "curve";
}

/**
 * Classify a closed centerline into flat and curve zones and merge curve zones separated by
 * flats shorter than `minFlat` (too short for a tab). Zones cover [start, start + length)
 * without gaps, in loop order; `start` may be negative or the zones may run past the length.
 */
export function curvatureZones(loop: Loop, minFlat: number): RawZone[] {
  const L = loop.length;
  const n = Math.max(8, Math.ceil(L / DS));
  const ds = L / n;
  const flat: boolean[] = [];
  for (let j = 0; j < n; j++) flat.push(windowTurn(loop, j * ds) < FLAT_TURN);
  if (flat.every(f => f === flat[0])) return [{ s0: 0, s1: L, kind: flat[0] ? "flat" : "curve" }];

  // runs of equal kind, starting at a kind change
  const j0 = flat.findIndex((f, j) => f !== flat[(j - 1 + n) % n]);
  const runs: { kind: "flat" | "curve"; a: number; b: number }[] = [];
  for (let k = 0; k < n; k++) {
    const j = j0 + k, kind = flat[j % n] ? "flat" : "curve";
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) last.b = j;
    else runs.push({ kind, a: j, b: j });
  }
  let zones: RawZone[] = runs.map(r => ({ kind: r.kind, s0: (r.a - 0.5) * ds, s1: (r.b + 0.5) * ds }));

  // short flats between curves become curve; then join neighbours of the same kind (circularly)
  for (;;) {
    const m = zones.length;
    if (m < 2) break;
    let changed = false;
    zones.forEach((z, i) => {
      if (z.kind === "flat" && z.s1 - z.s0 < minFlat && zones[(i - 1 + m) % m].kind === "curve" && zones[(i + 1) % m].kind === "curve") {
        z.kind = "curve";
        changed = true;
      }
    });
    const joined: RawZone[] = [];
    for (const z of zones) {
      const last = joined[joined.length - 1];
      if (last && last.kind === z.kind) last.s1 = z.s1;
      else joined.push({ ...z });
    }
    if (joined.length > 1 && joined[0].kind === joined[joined.length - 1].kind) {
      const last = joined.pop()!;
      joined[0] = { kind: last.kind, s0: last.s0 - L, s1: joined[0].s1 };
    }
    zones = joined;
    if (!changed) break;
  }
  if (zones.length === 1) return [{ s0: 0, s1: L, kind: zones[0].kind }];
  return zones;
}

/** Tightest radius inside [s0, s1], sampled every DS. */
export function tightestRadius(loop: Loop, s0: number, s1: number) {
  let r = Infinity;
  const n = Math.max(1, Math.ceil((s1 - s0) / DS));
  for (let j = 0; j <= n; j++) r = Math.min(r, windowRadius(loop, s0 + ((s1 - s0) * j) / n));
  return r;
}

/** The point of largest radius inside [s0, s1], keeping `keep` mm from both ends. */
export function widestPoint(loop: Loop, s0: number, s1: number, keep: number) {
  const a = s0 + keep, b = s1 - keep;
  if (b <= a) return (s0 + s1) / 2;
  let best = (a + b) / 2, bestR = -1;
  const n = Math.max(1, Math.ceil((b - a) / 1));
  for (let j = 0; j <= n; j++) {
    const s = a + ((b - a) * j) / n, r = windowRadius(loop, s);
    if (r > bestR) { bestR = r; best = s; }
  }
  return best;
}
