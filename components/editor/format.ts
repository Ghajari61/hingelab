import { r3 } from "@/lib/hinge";

export type Units = "mm" | "in";

/** Display a stored millimeter length in the active unit. */
export function fmtLen(mm: number, units: Units, short = false) {
  if (!isFinite(mm)) return "—";
  return units === "in" ? `${(mm / 25.4).toFixed(short ? 2 : 3)} in` : `${Math.round(mm * 10) / 10} mm`;
}

export function dispVal(len: boolean, value: number, units: Units) {
  if (!len) return String(value);
  return units === "in" ? String(r3(value / 25.4)) : String(Math.round(value * 1000) / 1000);
}

/** Arrow-key and scrub steps. Inch steps match the prototype (1/8" or 0.01", finer while scrubbing). */
export function stepMM(step: number, len: boolean, units: Units, scrub: boolean) {
  if (!len) return step;
  if (units !== "in") return step;
  if (scrub) return step >= 1 ? 1.5875 : 0.127;
  return step >= 1 ? 3.175 : 0.254;
}
