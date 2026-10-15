/**
 * Server export for generator designs that need Pro (for example puzzles over 50 pieces): the
 * design is built again here from its settings and the plan is checked before the SVG is sent.
 */
import { isGeneratorId } from "@/lib/generators/ids";
import { arrangeGenerator, genSVG } from "@/lib/generators/output";
import { loadGenerator } from "@/lib/generators/registry";
import { sanitizeGeneratorParams } from "@/lib/generators/sanitize";
import { makeTextFn } from "@/lib/generators/text";
import type { AnyGenerator, BuildContext, GenBase } from "@/lib/generators/types";
import type { LoadedFont } from "@/lib/letters/fonts";
import { batchLimitMessage, designBatchCount, hasPro, type Plan } from "@/lib/plans";
import { bundledFont, FontError, serverHarfBuzz, uploadedFont } from "./letterFonts";

export type GeneratorExport =
  | { ok: true; svg: string; fileName: string }
  | { ok: false; status: number; error: string };

/** Most uploaded fonts one generator export request carries. */
export const MAX_REQUEST_FONTS = 2;

/** An uploaded font sent with a request: its id in the design, name and bytes as base64. */
export interface FontUpload { id: string; name: string; data: string }

/** Uploaded fonts from a request body, at most MAX_REQUEST_FONTS well-formed ones. */
export function fontUploads(raw: unknown): FontUpload[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is FontUpload => !!f && typeof f === "object" && typeof f.id === "string" && f.id.length <= 100 && typeof f.data === "string" && (f.name === undefined || typeof f.name === "string"))
    .slice(0, MAX_REQUEST_FONTS)
    .map((f) => ({ id: f.id, name: String(f.name ?? ""), data: f.data }));
}

/**
 * The build context with the fonts the design asks for: bundled ones from the server, uploaded ones
 * from the request. Null when a font is neither; a readable error for an upload that is not a font.
 */
export async function serverBuildContext(def: AnyGenerator, p: GenBase, uploads: FontUpload[] = []): Promise<BuildContext | null | { error: string }> {
  const fontIds = def.fonts?.(p) ?? [];
  if (!fontIds.length) return {};
  const hb = await serverHarfBuzz();
  const fonts: Record<string, LoadedFont> = {};
  for (const f of fontIds) {
    const lf = bundledFont(hb, f);
    if (lf) { fonts[f] = await lf; continue; }
    const up = uploads.find((u) => u.id === f);
    if (!up) return null;
    try {
      fonts[f] = uploadedFont(hb, f, up.name, up.data);
    } catch (e) {
      return { error: e instanceof FontError ? e.message : "The uploaded font could not be read. Pick another font, then export." };
    }
  }
  return { text: makeTextFn(hb, (k) => fonts[k] ?? null) };
}

export async function exportGeneratorForPlan(id: unknown, raw: unknown, plan: Plan, uploads: FontUpload[] = []): Promise<GeneratorExport> {
  if (!isGeneratorId(id)) return { ok: false, status: 400, error: "Unknown product." };
  const def = await loadGenerator[id]();
  const p = sanitizeGeneratorParams(def, def.merge(raw));
  const over = batchLimitMessage(plan, designBatchCount(p));
  if (over) return { ok: false, status: 403, error: over };
  const ctx = await serverBuildContext(def, p, uploads);
  if (!ctx) return { ok: false, status: 400, error: "This design uses a font that is not available. Pick another font, then export." };
  if ("error" in ctx) return { ok: false, status: 422, error: ctx.error as string };
  const a = arrangeGenerator(def, p, ctx);
  if ("error" in a.result) return { ok: false, status: 422, error: a.result.error };
  if (!a.lay) return { ok: false, status: 422, error: "The design does not fit on the sheet." };
  const out = a.result.out;
  if (out.missing?.length) return { ok: false, status: 422, error: "The font is missing some characters. Pick another font, then export." };
  const lock = def.pro?.(a.params, out) ?? null;
  if (lock && !hasPro(plan)) return { ok: false, status: 403, error: lock };
  return { ok: true, svg: genSVG(def, a.params, a.lay), fileName: def.fileName(a.params) + ".svg" };
}
