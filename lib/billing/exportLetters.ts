/**
 * Letters export with the plan applied: Free can export only a Letter Box of a single letter,
 * with the "Made with HingeLab" mark. Pure: the font and HarfBuzz are passed in, so the route
 * (and the tests) decide where they come from.
 */
import { computeLetterModel, exportLetterSVG, layoutLetters, mergeLetterParams, type HarfBuzz, type LetterParams, type LoadedFont } from "@/lib/letters";
import { addWatermark, lettersLock, needsWatermark, type Plan } from "@/lib/plans";

export type LettersExport = { ok: true; svg: string } | { ok: false; status: number; error: string };

/** Largest uploaded font an export request carries (base64 keeps the body under 4.5 MB). */
export const MAX_UPLOAD_FONT_BYTES = 3 * 1024 * 1024;

/** Longest text the server builds in one request. */
export const MAX_EXPORT_TEXT = 300;

/** Settings from a request, or an error for anything that is not a Letters settings object. */
export function parseLetterRequest(partial: unknown): LetterParams | { error: string } {
  if (!partial || typeof partial !== "object" || Array.isArray(partial)) return { error: "Missing letter settings." };
  const p = mergeLetterParams(partial as Partial<LetterParams>);
  if (typeof p.text !== "string" || typeof p.fontId !== "string" || !["box", "solid", "stencil"].includes(p.mode)) return { error: "Invalid letter settings." };
  if ([...p.text].length > MAX_EXPORT_TEXT) return { error: `Text is limited to ${MAX_EXPORT_TEXT} characters per export.` };
  return p;
}

export function exportLettersForPlan(p: LetterParams, plan: Plan, font: LoadedFont, hb: HarfBuzz): LettersExport {
  const lock = lettersLock(plan, p);
  if (lock) return { ok: false, status: 403, error: lock };
  const model = computeLetterModel(p, font, hb);
  if ("error" in model) return { ok: false, status: 422, error: model.error };
  const svg = exportLetterSVG(layoutLetters(model, p), p, font.name);
  return { ok: true, svg: needsWatermark(plan) ? addWatermark(svg) : svg };
}
