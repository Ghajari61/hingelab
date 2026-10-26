/**
 * Pop-up engineering: where the bridges are, how hard they bend, and where holes and slots can go
 * without cutting into them.
 *
 * A bridge land joins two neighbouring rings across their cut, with a short relief slot on each
 * side, so it is a short beam `L` long (the relief length) and `T` thick. When one ring drops `δ`
 * below the next, the land bends as a guided beam (both ends stay flat in their rings): the surface
 * strain is ε = 3·T·δ / L². Plywood takes about 1 % before its face veneer cracks, MDF and acrylic
 * far less. A 3 mm bridge 6 mm long reaches 1 % at only 0.04 mm of drop, so bridges never carry a
 * pop-up's shape: they hold the blank together while it is cut, and the supports (ribs, cords or
 * bevelled rings) set the heights once they are snapped.
 */
import type { Contour, Pt } from '../types';
import { TAU } from '../geom';
import type { PopupParams } from './params';

/** Surface strain the stock takes in bending before it cracks (fraction), by material. */
export function allowedStrain(p: PopupParams): number {
  const m = `${p.stock} ${p.material}`.toLowerCase();
  if (/acryl/.test(m)) return 0.006;
  if (/mdf/.test(m)) return 0.004;
  return 0.01;
}

/** The angles (degrees) of the bridge lands on ring cut `index` (0 = the cut nearest the rim). */
export function bridgeAngles(p: PopupParams, index: number): number[] {
  const turn = (p.bridges.alternate ? index % 2 : index) * p.bridges.stagger;
  return Array.from({ length: p.bridges.count }, (_, j) => (((j * 360) / p.bridges.count + turn) % 360 + 360) % 360);
}

/** Angular distance between two directions, degrees (0..180). */
export const angleGap = (a: number, b: number) => { const d = Math.abs(((a - b) % 360 + 540) % 360 - 180); return 180 - d; };

/**
 * The turn (degrees) for a set of `n` evenly spaced features that keeps them furthest from every
 * bridge on the cuts `cuts`: cords, petal slits and handle slots then never land on a bridge.
 */
export function clearTurn(p: PopupParams, n: number, cuts: number): number {
  const bridges = new Set<number>();
  for (let i = 0; i < Math.max(1, Math.min(cuts, 4)); i++) for (const a of bridgeAngles(p, i)) bridges.add(Math.round(a * 10) / 10);
  // non-alternating staggers move every ring: take all the rings into account
  if (!p.bridges.alternate) for (let i = 4; i < cuts; i++) for (const a of bridgeAngles(p, i)) bridges.add(Math.round(a * 10) / 10);
  let best = 0, bestGap = -1;
  for (let t = 0; t < 360 / n; t += 1) {
    let gap = 180;
    for (let k = 0; k < n; k++) for (const b of bridges) gap = Math.min(gap, angleGap(t + (k * 360) / n, b));
    if (gap > bestGap + 1e-9) { bestGap = gap; best = t; }
  }
  return best;
}

/** How hard the worst bridge bends at the open shape: the largest drop between neighbouring rings and the strain it puts on the land. */
export function bridgeStrain(p: PopupParams, rings: { height: number }[], pitch: number) {
  let drop = 0;
  for (let i = 0; i + 1 < rings.length; i++) drop = Math.max(drop, Math.abs(rings[i].height - rings[i + 1].height));
  const length = Math.max(0.5, Math.min(p.bridges.length, pitch * 0.7));
  const strain = (3 * p.T * drop) / (length * length);
  return { drop, length, strain, allowed: allowedStrain(p), ratio: strain / allowedStrain(p) };
}

/**
 * Ring cuts whose bridges must be snapped: the two rings end up further apart in height than a
 * bridge bends without cracking. The rest (a pagoda's tiers, a flat centre) keep their bridges.
 */
export function cutsToSnap(p: PopupParams, rings: { height: number }[], pitch: number): number {
  const length = Math.max(0.5, Math.min(p.bridges.length, pitch * 0.7));
  const bends = (allowedStrain(p) * length * length) / (3 * p.T);
  let n = 0;
  for (let i = 0; i + 1 < rings.length; i++) if (Math.abs(rings[i].height - rings[i + 1].height) > bends) n++;
  return n;
}

/**
 * Where a spiral cut crosses the ray at `angle` (radians): the radii of every arm's slot. The strip
 * centres are the midpoints between neighbouring crossings.
 */
export function spiralCrossings(start: number, end: number, count: number, arms: number, angle: number): number[] {
  const turns = Math.max(1, count / arms), out: number[] = [];
  for (let arm = 0; arm < arms; arm++) {
    const base = (((angle - (arm * TAU) / arms) / TAU) % 1 + 1) % 1;
    for (let k = 0; k <= turns + 1; k++) {
      const t = (base + k) / turns;
      if (t >= 0 && t <= 1) out.push(start + t * (end - start));
    }
  }
  return out.sort((a, b) => a - b);
}

/** Midpoints of the strip between neighbouring spiral crossings along one ray. */
export function spiralStripCentres(start: number, end: number, count: number, arms: number, angle: number): number[] {
  const c = spiralCrossings(start, end, count, arms, angle), out: number[] = [];
  for (let i = 0; i + 1 < c.length; i++) out.push((c[i] + c[i + 1]) / 2);
  return out;
}

/** A point at radius r along `deg` degrees. */
export const polar = (r: number, deg: number): Pt => [r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180)];

/** True when the circle (or polygon) keeps `clear` mm from every contour in `cuts`. */
export function clearOf(poly: Contour, cuts: Contour[], clear: number): boolean {
  const seg = (q: Pt, a: Pt, b: Pt) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
    const t = L > 0 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L)) : 0;
    return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy);
  };
  for (const c of cuts) for (const q of poly) for (let i = 0; i < c.length; i++) if (seg(q, c[i], c[(i + 1) % c.length]) < clear) return false;
  return true;
}
