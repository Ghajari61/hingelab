/**
 * Hardware: what each fitting needs cut in the leather to mount it, and how it is counted.
 *
 * Every size is a nominal starting point set in the Hardware section; measure the hardware you
 * have (post diameter, prong spacing, tongue width) and set it there. Nothing here is a supplier's
 * specification.
 */
import { circle, rect } from "../geom";
import type { Contour, Pt } from "../types";

export type HwKind = "rivet" | "snap" | "magnet" | "buckle" | "dring" | "oring" | "grommet" | "eyelet" | "zipper" | "chicago" | "slider" | "foot" | "clip" | "keyring";
export const HW_NAMES: Record<HwKind, string> = {
  rivet: "Double-cap rivet", snap: "Snap fastener", magnet: "Magnetic clasp", buckle: "Buckle", dring: "D-ring", oring: "O-ring",
  grommet: "Grommet", eyelet: "Eyelet", zipper: "Zip", chicago: "Chicago screw", slider: "Strap slider", foot: "Bag foot", clip: "Snap hook (swivel clip)", keyring: "Split key ring",
};

export interface HwSizes {
  rivetCap: number; rivetHole: number;
  snapCap: number; snapHole: number;
  magnet: number;
  grommetHole: number;
  screwHole: number;
  footHole: number;
}

/** Holes for one fitting at `at`, its axis at `angle` radians (prongs and slots run across it). */
export function mountHoles(kind: HwKind, at: Pt, angle: number, s: HwSizes, width = 20): Contour[] {
  const [x, y] = at, c = Math.cos(angle), sn = Math.sin(angle);
  const slit = (dx: number, len: number, w: number): Contour => {
    // a slit across the axis, its centre dx along the axis from `at`
    const cx = x + c * dx, cy = y + sn * dx, hx = -sn * (len / 2), hy = c * (len / 2), wx = c * (w / 2), wy = sn * (w / 2);
    return [[cx - hx - wx, cy - hy - wy], [cx + hx - wx, cy + hy - wy], [cx + hx + wx, cy + hy + wy], [cx - hx + wx, cy - hy + wy]];
  };
  switch (kind) {
    case "rivet": return [circle(x, y, s.rivetHole / 2, 0.03)];
    case "snap": return [circle(x, y, s.snapHole / 2, 0.03)];
    case "chicago": return [circle(x, y, s.screwHole / 2, 0.03)];
    case "grommet": case "eyelet": return [circle(x, y, s.grommetHole / 2, 0.03)];
    case "foot": return [circle(x, y, s.footHole / 2, 0.03)];
    case "magnet": {
      // two prong slits either side of the centre
      const gap = s.magnet * 0.72, len = Math.max(3, s.magnet * 0.3);
      return [slit(-gap / 2, len, 1.2), slit(gap / 2, len, 1.2)];
    }
    case "buckle": return [slit(0, Math.max(3, width * 0.12), Math.max(8, width * 0.45)).map(([px, py]) => [px, py] as Pt)];
    default: return [];
  }
}

/** The area a fitting covers, as a circle radius round its centre, for clearance checks. */
export function footprint(kind: HwKind, s: HwSizes, width = 20): number {
  switch (kind) {
    case "rivet": return s.rivetCap / 2;
    case "snap": return s.snapCap / 2;
    case "magnet": return s.magnet / 2;
    case "chicago": return s.screwHole;
    case "grommet": case "eyelet": return s.grommetHole;
    case "foot": return s.footHole * 2.5;
    case "buckle": return width * 0.6;
    default: return 0;
  }
}

export interface HwLine { kind: HwKind; qty: number; note: string }

/** A zip's opening in a panel: a slot for the teeth, `gauge` the tape's tooth width class. */
export function zipSlot(x0: number, y0: number, length: number, gauge: 3 | 5): Contour {
  const w = gauge === 3 ? 6 : 8;
  return rect(x0, y0 - w / 2, length, w);
}
