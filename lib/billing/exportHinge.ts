/**
 * Hinge Box export with the plan applied. Free cannot download any file. Pro features are refused
 * for Free. Runs on the server (/api/export) so the plan is checked there.
 */
import { exportSVG, mergeParams, type Params } from "@/lib/hinge";
import { arrangeHinge } from "@/lib/fit/hinge";
import { canExport, EXPORT_DENIED, hingeLocks, type Plan } from "@/lib/plans";
import { hingeRequestError } from "./validate";
import type { BuildContext } from "@/lib/generators/types";

export type HingeExport = { ok: true; svg: string } | { ok: false; status: number; error: string };

/** `ctx` shapes the text under the box (see `hingeTextContext`); without it that text is left out. */
export function exportHingeForPlan(partial: unknown, plan: Plan, ctx?: BuildContext): HingeExport {
  if (!partial || typeof partial !== "object" || Array.isArray(partial)) return { ok: false, status: 400, error: "Missing box settings." };
  const params = mergeParams(partial as Partial<Params>);
  const invalid = hingeRequestError(params);
  if (invalid) return { ok: false, status: 400, error: invalid };
  if (!canExport(plan)) return { ok: false, status: 403, error: EXPORT_DENIED };
  const locks = hingeLocks(plan, params);
  if (locks.length) return { ok: false, status: 403, error: `${locks.join(" and ")} ${locks.length > 1 ? "are Pro features" : "is a Pro feature"}. Upgrade to Pro to export it.` };
  const a = arrangeHinge(params);
  if ("error" in a.result) return { ok: false, status: 422, error: a.result.error };
  if (!a.lay) return { ok: false, status: 422, error: "The parts could not be laid out." };
  return { ok: true, svg: exportSVG(a.result, a.lay, a.params, ctx) };
}
