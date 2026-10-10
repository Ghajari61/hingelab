/**
 * Hinge Box export with the plan applied: Pro features are refused for Free, and Free exports get
 * the "Made with HingeLab" mark. Runs on the server (/api/export) so the plan is checked there.
 */
import { computeModel, exportSVG, layoutParts, mergeParams, type Params } from "@/lib/hinge";
import { addWatermark, hingeLocks, needsWatermark, type Plan } from "@/lib/plans";

export type HingeExport = { ok: true; svg: string } | { ok: false; status: number; error: string };

export function exportHingeForPlan(partial: unknown, plan: Plan): HingeExport {
  if (!partial || typeof partial !== "object" || Array.isArray(partial)) return { ok: false, status: 400, error: "Missing box settings." };
  const params = mergeParams(partial as Partial<Params>);
  const locks = hingeLocks(plan, params);
  if (locks.length) return { ok: false, status: 403, error: `${locks.join(" and ")} ${locks.length > 1 ? "are Pro features" : "is a Pro feature"}. Upgrade to Pro to export it.` };
  const model = computeModel(params);
  if ("error" in model) return { ok: false, status: 422, error: model.error };
  const svg = exportSVG(model, layoutParts(model.parts, params.bedW, params.gap), params);
  return { ok: true, svg: needsWatermark(plan) ? addWatermark(svg) : svg };
}
