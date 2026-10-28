/** Piecewise-linear target height in millimetres, shared by forming ribs and the preview. */
export interface RadialSurface { samples: [radius:number,height:number][] }
export function radialHeight(surface:RadialSurface,r:number):number {
 const points=surface.samples;
 if(r<=points[0][0])return points[0][1];
 let lo=0,hi=points.length-1;
 while(hi-lo>1){const mid=(lo+hi)>>1;if(points[mid][0]<=r)lo=mid;else hi=mid;}
 if(r>=points[hi][0])return points[hi][1];
 const t=(r-points[lo][0])/(points[hi][0]-points[lo][0]);
 return points[lo][1]+t*(points[hi][1]-points[lo][1]);
}

/**
 * A continuous spiral cut in the blank (Archimedean, from `start` to `end` mm, `count` slots shared
 * by `arms` arms). With it, the formed blank rises like a stretched spring: each turn of the strip
 * stays level across its width and its height follows the strip's own centreline along its length.
 * A flat strip is very stiff in its own plane, so it cannot tilt across its width to lie on a cone
 * (the plain radial form) without twisting and bending sideways.
 */
export interface SpiralCut { start: number; end: number; count: number; arms: number }
export interface FormedSurface extends RadialSurface { spiral?: SpiralCut }

const TAU = Math.PI * 2;
/** Radii where the spiral's slot centrelines cross the ray at `angle` (radians), ascending. */
export function spiralCrossingsAt(s: SpiralCut, angle: number): number[] {
  // turns per arm, as cut (multi may have fewer than one)
  const turns = s.count / s.arms, out: number[] = [];
  for (let arm = 0; arm < s.arms; arm++) {
    const base = (((angle - (arm * TAU) / s.arms) / TAU) % 1 + 1) % 1;
    for (let k = 0; k <= turns + 1; k++) {
      const t = (base + k) / turns;
      if (t >= 0 && t <= 1) out.push(s.start + t * (s.end - s.start));
    }
  }
  return out.sort((a, b) => a - b);
}

/**
 * The radius whose target height a point of the blank takes, in design coordinates (y down as
 * drawn): its own radius for ring blanks; for a spiral, the centreline radius of the strip turn it
 * lies on, the centre land's inner edge inside the first slot crossing and the rim land's outside
 * the last one.
 */
export function formRadius(surface: FormedSurface, x: number, y: number): number {
  const r = Math.hypot(x, y), s = surface.spiral;
  if (!s) return r;
  if (r <= s.start) return s.start;
  if (r >= s.end) return s.end;
  // The nearest slot crossing inside and outside r on this ray, over every arm (the same crossings
  // as spiralCrossingsAt, found directly: this runs for every vertex of the 3D model).
  // turns per arm, as cut (multi may have fewer than one)
  const turns = s.count / s.arms, L = s.end - s.start, angle = Math.atan2(y, x);
  let lower = -Infinity, upper = Infinity;
  for (let arm = 0; arm < s.arms; arm++) {
    const base = (((angle - (arm * TAU) / s.arms) / TAU) % 1 + 1) % 1;
    const k = Math.floor(((r - s.start) / L) * turns - base);
    for (const j of [k - 1, k, k + 1, k + 2]) {
      const t = (base + j) / turns;
      if (t < 0 || t > 1) continue;
      const c = s.start + t * L;
      if (c <= r && c > lower) lower = c;
      if (c >= r && c < upper) upper = c;
    }
  }
  if (lower === -Infinity) return s.start;
  if (upper === Infinity) return s.end;
  // Turn centres run from start + pitch/2 to end - pitch/2; they are spread over the whole profile so
  // the innermost turn meets the centre land, and the outermost the rim, at the same height where
  // the slot begins and ends (a turn's centre jumped by half a pitch there).
  const pitch = L / s.count, span = L - pitch, centre = (lower + upper) / 2;
  return span > 0 ? Math.max(s.start, Math.min(s.end, s.start + ((centre - s.start - pitch / 2) * L) / span)) : centre;
}

/** Target height of a point of the formed blank (design coordinates). */
export function formHeight(surface: FormedSurface, x: number, y: number): number {
  return radialHeight(surface, formRadius(surface, x, y));
}
