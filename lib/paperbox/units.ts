/** Display units for the paper box engine, which works in millimetres. */
export type Unit = "mm" | "cm" | "in";

export const MM_PER: Record<Unit, number> = { mm: 1, cm: 10, in: 25.4 };

export const toMM = (v: number, u: Unit) => v * MM_PER[u];
export const fromMM = (mm: number, u: Unit) => mm / MM_PER[u];

/** A length for display: 2 decimals in cm and inches, 1 in mm. */
export function formatLength(mm: number, u: Unit): string {
  const v = fromMM(mm, u), d = u === "mm" ? 1 : 2;
  return `${Number(v.toFixed(d))} ${u}`;
}
