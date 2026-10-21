/**
 * From what the user measured on the cut coupons to a calibration record for their material. The
 * arithmetic only: nothing is guessed, and a value the user did not measure stays out of the record.
 */
import type { Calibration } from "@/lib/materials/library";

/**
 * The true kerf from strips cut with kerf `K` (mm): `n` strips of design width `w` were offset out by
 * K/2 per edge and the beam removed k/2 per edge, so each measures w + K − k and n of them, pushed
 * together, measure `total`. Null when the measurement cannot be right (k outside 0…5 mm).
 */
export function kerfFromStrips(K: number, n: number, w: number, total: number): number | null {
  if (!(n > 0) || !(w > 0) || !(total > 0) || !Number.isFinite(K)) return null;
  const k = K + w - total / n;
  return k >= 0 && k <= 5 ? Math.round(k * 1000) / 1000 : null;
}

export interface CouponReadings {
  /** The kerf the coupons were cut with, mm (across X and across Y). */
  cutKx: number;
  cutKy: number;
  strips: number;
  width: number;
  /** The X strips (cuts along Y) pushed together, measured across, mm. */
  totalX?: number;
  totalY?: number;
  /** The ladder's clearance that fitted best, mm. */
  clearance?: number;
  /** The tightest radius a hinge zone bent to without cracking, mm. */
  hingeRadius?: number;
  notes?: string;
}

/** A calibration record from the readings, or an error naming the reading that cannot be right. */
export function calibrationFromCoupons(r: CouponReadings, date: string): { cal: Calibration } | { error: string } {
  const cal: Calibration = { date };
  if (r.totalX != null) {
    const k = kerfFromStrips(r.cutKx, r.strips, r.width, r.totalX);
    if (k == null) return { error: `The X strips measure ${r.totalX} mm together: check it is the ${r.strips} strips side by side, about ${r.strips * r.width} mm.` };
    cal.kx = k;
  }
  if (r.totalY != null) {
    const k = kerfFromStrips(r.cutKy, r.strips, r.width, r.totalY);
    if (k == null) return { error: `The Y strips measure ${r.totalY} mm together: check it is the ${r.strips} strips side by side, about ${r.strips * r.width} mm.` };
    cal.ky = k;
  }
  if (r.clearance != null) cal.clearance = r.clearance;
  if (r.hingeRadius != null) cal.hingeRadius = r.hingeRadius;
  if (r.notes?.trim()) cal.notes = r.notes.trim();
  if (cal.kx == null && cal.ky == null && cal.clearance == null && cal.hingeRadius == null) return { error: "Enter at least one measurement." };
  return { cal };
}
