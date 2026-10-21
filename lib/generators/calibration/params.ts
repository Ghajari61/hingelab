import { DEFAULTS as HINGE, clone } from "@/lib/hinge/defaults";
import { FIT_OFF } from "@/lib/fit/fitToSheets";
import { clamp } from "../common";
import { JOB_EXTRAS, SHEET_DEFAULTS, type GenBase } from "../types";
import { mergeInto } from "../util";

export interface CalibrationParams extends GenBase {
  /** Strips cut with the design's kerf, measured side by side to find the true kerf. */
  kerf: { on: boolean; strips: number; width: number; length: number; both: boolean };
  /** A plate of slots, each the thickness plus one clearance, from `from` to `to` in `step`s (mm). */
  ladder: { on: boolean; from: number; to: number; step: number; depth: number };
  /** A living-hinge strip in zones whose slit spacing grows from `pitchFrom` to `pitchTo`. */
  hinge: { on: boolean; width: number; zones: number; zone: number; pitchFrom: number; pitchTo: number; slit: number; bridge: number };
}

export const CALIBRATION_DEFAULTS: CalibrationParams = {
  name: "Calibration coupons",
  material: "birch3",
  T: HINGE.T,
  K: HINGE.K,
  bedW: 600,
  bedH: 400,
  gap: 4,
  fit: { ...FIT_OFF },
  sheet: { ...SHEET_DEFAULTS },
  job: { ...JOB_EXTRAS },
  layers: clone(HINGE.layers),
  kerf: { on: true, strips: 5, width: 10, length: 40, both: true },
  ladder: { on: true, from: -0.1, to: 0.2, step: 0.05, depth: 12 },
  hinge: { on: true, width: 30, zones: 4, zone: 24, pitchFrom: 1.5, pitchTo: 3, slit: 20, bridge: 3 },
};

/** Most slots on the ladder. */
export const MAX_SLOTS = 13;

export function mergeCalibration(raw: unknown): CalibrationParams {
  const p = mergeInto(clone(CALIBRATION_DEFAULTS), raw);
  const k = p.kerf, l = p.ladder, h = p.hinge;
  k.strips = clamp(Math.round(k.strips), 2, 10);
  k.width = clamp(k.width, 3, 30);
  k.length = clamp(k.length, 10, 120);
  l.step = clamp(l.step, 0.01, 0.5);
  l.from = clamp(l.from, -1, 1);
  l.to = clamp(Math.max(l.to, l.from), -1, 2);
  l.depth = clamp(l.depth, 5, 40);
  h.width = clamp(h.width, 15, 120);
  h.zones = clamp(Math.round(h.zones), 1, 8);
  h.zone = clamp(h.zone, 10, 80);
  h.pitchFrom = clamp(h.pitchFrom, 0.5, 20);
  h.pitchTo = clamp(Math.max(h.pitchTo, h.pitchFrom), 0.5, 20);
  h.bridge = clamp(h.bridge, 1, 20);
  h.slit = clamp(h.slit, 3, h.width);
  return p;
}

/** The ladder's clearances, mm (rounded to 0.001). */
export function ladderSteps(l: CalibrationParams["ladder"]): number[] {
  const n = Math.min(MAX_SLOTS, Math.floor((l.to - l.from) / l.step + 1e-6) + 1);
  return Array.from({ length: n }, (_, i) => Math.round((l.from + i * l.step) * 1000) / 1000);
}

/** The hinge strip's slit spacings, mm, one per zone. */
export function hingePitches(h: CalibrationParams["hinge"]): number[] {
  if (h.zones === 1) return [h.pitchFrom];
  return Array.from({ length: h.zones }, (_, i) => Math.round((h.pitchFrom + ((h.pitchTo - h.pitchFrom) * i) / (h.zones - 1)) * 100) / 100);
}

export const CALIBRATION_VERSION = 1;
