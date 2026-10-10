/**
 * Calibration bar for the bottom of a sheet: a scored 100 mm scale (50 mm on narrow sheets) to check
 * the machine cuts at true size, and a 10 mm square cut with the kerf compensation, which should
 * measure 10.0 mm once it drops out.
 */
import type { Contour } from "@/lib/letters/types";
import { strokeText } from "@/lib/parametric/label";

/** Height of the bar, mm. */
export const CAL_H = 12;
/** Strip kept free for it along the bottom of each sheet, mm. */
export const CAL_STRIP = CAL_H + 3;
const SQUARE = 10, SQ_GAP = 4;

/** Scale length that fits `width` mm (0 = nothing fits). */
export const calibrationLength = (width: number) => (width >= 100 + SQ_GAP + SQUARE ? 100 : width >= 50 + SQ_GAP + SQUARE ? 50 : 0);

/** The bar with its top-left corner at (x, y), at most `width` mm wide. */
export function calibrationBar(x: number, y: number, width: number, K: number): { cut: Contour[]; score: Contour[] } {
  const L = calibrationLength(width);
  if (!L) return { cut: [], score: [] };
  const base = y + 8;
  const score: Contour[] = [[[x, base], [x + L, base]]];
  for (let mm = 0; mm <= L; mm++) {
    const major = mm % 10 === 0;
    if (!major && mm > 10) continue;
    const h = mm % 50 === 0 ? 6 : major ? 4 : mm === 5 ? 3 : 2;
    score.push([[x + mm, base], [x + mm, base - h]]);
  }
  score.push(...strokeText(`${L} mm`, 2.5, x + L / 2, base + 2.3));
  const k = K / 2, sx = x + L + SQ_GAP, sy = y + 1;
  const cut: Contour[] = [[[sx - k, sy - k], [sx + SQUARE + k, sy - k], [sx + SQUARE + k, sy + SQUARE + k], [sx - k, sy + SQUARE + k]]];
  return { cut, score };
}
