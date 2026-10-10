/**
 * Cut-time estimate from material speed presets (a typical 40–60 W CO2 laser). The estimate is
 * laser-on time for cutting and scoring plus a fixed allowance per contour for the pierce and the
 * move to it; it does not know the user's machine, so the UI calls it an estimate.
 */
import { MATERIALS } from "@/lib/hinge";

export interface CutSpeed {
  /** Cutting speed through the full thickness, mm/s. */
  cut: number;
  /** Passes needed to cut through. */
  passes: number;
  /** Scoring / line-engraving speed, mm/s. */
  engrave: number;
}

/** Seconds per contour for the pierce and the head moving to the next start point. */
export const CONTOUR_OVERHEAD = 0.4;

export const CUT_SPEEDS: Record<string, CutSpeed> = {
  birch3: { cut: 12, passes: 1, engrave: 150 },
  birch18: { cut: 11, passes: 1, engrave: 150 },
  poplar3: { cut: 15, passes: 1, engrave: 150 },
  mdf3: { cut: 10, passes: 1, engrave: 150 },
  card2: { cut: 30, passes: 1, engrave: 200 },
  acr3: { cut: 8, passes: 1, engrave: 120 },
};

/** The preset for a material id; custom materials scale the plywood speed by thickness. */
export function cutSpeedOf(materialId: string, T: number): CutSpeed {
  const known = CUT_SPEEDS[materialId];
  if (known && MATERIALS[materialId]) return known;
  const t = Math.max(0.5, T);
  return { cut: Math.max(1, 36 / t), passes: t > 6 ? 2 : 1, engrave: 150 };
}

/** "about 25 min", "about 1 h 40 min". */
export function fmtMinutes(min: number): string {
  if (!isFinite(min)) return "—";
  const m = Math.max(1, Math.round(min));
  return m < 60 ? `about ${m} min` : `about ${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
}

/** Minutes to cut `cutLength` mm and score `engraveLength` mm over `contours` separate paths. */
export function estimateCutMinutes(cutLength: number, engraveLength: number, contours: number, speed: CutSpeed): number {
  const s = (cutLength * speed.passes) / speed.cut + engraveLength / speed.engrave + contours * CONTOUR_OVERHEAD * speed.passes;
  return s / 60;
}
