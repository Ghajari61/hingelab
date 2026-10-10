/**
 * Server export for generator designs that need Pro (for example puzzles over 50 pieces): the
 * design is built again here from its settings and the plan is checked before the SVG is sent.
 */
import { isGeneratorId } from "@/lib/generators/ids";
import { arrangeGenerator, genSVG } from "@/lib/generators/output";
import { loadGenerator } from "@/lib/generators/registry";
import { makeTextFn } from "@/lib/generators/text";
import type { BuildContext } from "@/lib/generators/types";
import type { LoadedFont } from "@/lib/letters/fonts";
import type { Plan } from "@/lib/plans";
import { bundledFont, serverHarfBuzz } from "./letterFonts";

export type GeneratorExport =
  | { ok: true; svg: string; fileName: string }
  | { ok: false; status: number; error: string };

export async function exportGeneratorForPlan(id: unknown, raw: unknown, plan: Plan): Promise<GeneratorExport> {
  if (!isGeneratorId(id)) return { ok: false, status: 400, error: "Unknown product." };
  const def = await loadGenerator[id]();
  const p = def.merge(raw);
  let ctx: BuildContext = {};
  const fontIds = def.fonts?.(p) ?? [];
  if (fontIds.length) {
    const hb = await serverHarfBuzz();
    const fonts: Record<string, LoadedFont> = {};
    for (const f of fontIds) {
      const lf = bundledFont(hb, f);
      if (!lf) return { ok: false, status: 400, error: "This design uses a font that is not available. Pick another font, then export." };
      fonts[f] = await lf;
    }
    ctx = { text: makeTextFn(hb, (k) => fonts[k] ?? null) };
  }
  const a = arrangeGenerator(def, p, ctx);
  if ("error" in a.result) return { ok: false, status: 422, error: a.result.error };
  if (!a.lay) return { ok: false, status: 422, error: "The design does not fit on the sheet." };
  const out = a.result.out;
  if (out.missing?.length) return { ok: false, status: 422, error: "The font is missing some characters. Pick another font, then export." };
  const lock = def.pro?.(a.params, out) ?? null;
  if (lock && plan !== "pro") return { ok: false, status: 403, error: lock };
  return { ok: true, svg: genSVG(def, a.params, a.lay), fileName: def.fileName(a.params) + ".svg" };
}
