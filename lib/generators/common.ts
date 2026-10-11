/** Checks and options shared by the text-based generators (toppers, signs, table numbers, trophies, key holders). */
import type { Issue } from "@/lib/issues";

/** Missing glyphs: suggests a font that has the script (Vazirmatn for Persian and Arabic, Fredoka otherwise). */
export function missingGlyphs<P>(missing: string[] | undefined, current: string, set: (q: P, font: string) => P): Issue<P>[] {
  if (!missing?.length) return [];
  const persian = missing.some((c) => /[\u0600-\u06FF]/.test(c));
  const font = persian ? "vazirmatn" : "fredoka";
  return [{
    code: "MISSING_GLYPHS", level: "error",
    message: `The font has no ${missing.map((c) => `“${c}”`).join(" ")}.`,
    fixes: current === font ? [] : [{ id: "font", label: `Use ${persian ? "Vazirmatn" : "Fredoka"}`, safe: true, apply: (q: P) => set(q, font) }],
  }];
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const r1 = (v: number) => Math.round(v * 10) / 10;
