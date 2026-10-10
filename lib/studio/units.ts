import type { Units } from "./types";

/** Millimetres per unit. */
export const MM_PER: Record<Units, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72 };

export const UNIT_LIST: Units[] = ["mm", "cm", "in", "pt"];

export const toMM = (v: number, u: Units) => v * MM_PER[u];
export const fromMM = (mm: number, u: Units) => mm / MM_PER[u];

const DECIMALS: Record<Units, number> = { mm: 2, cm: 3, in: 3, pt: 1 };

/** A length for display: trimmed decimals, no trailing zeros. */
export function fmtLength(mm: number, u: Units, withUnit = false): string {
  const v = fromMM(mm, u);
  const s = (Math.round(v * 10 ** DECIMALS[u]) / 10 ** DECIMALS[u]).toString();
  return withUnit ? `${s} ${u}` : s;
}

export function isUnits(v: unknown): v is Units {
  return typeof v === "string" && (UNIT_LIST as string[]).includes(v);
}
