/**
 * Parametric export with the plan applied: the server slices the design again and builds the
 * file, so the Free rules (library shapes, parallel fins, ≤ 30 parts, the HingeLab mark) cannot
 * be skipped. Imported 3D files and photos never leave the device, so the server cannot rebuild
 * them; those sources are Pro-only and Pro exports them in the browser. Pure: manifold-3d is
 * passed in, so the route and the tests decide where it comes from.
 */
import type { ManifoldToplevel } from "manifold-3d";
import {
  allSheetsSVG, assemblyGuideSVG, computeParametric, exportZip, loadSource, mergeParametricParams, sheetFileName, sheetSVG, slugName,
  type ParametricParams,
} from "@/lib/parametric";
import { needsWatermark, parametricLock, type Plan } from "@/lib/plans";

export type ParametricWhat = { kind: "zip" } | { kind: "all" } | { kind: "sheet"; index: number } | { kind: "guide" };

export type ParametricExport =
  | { ok: true; body: string | Uint8Array; type: string; fileName: string }
  | { ok: false; status: number; error: string };

/** Formula grids the server builds per request (the editor allows up to 512). */
const MAX_SERVER_RESOLUTION = 512;

export function parseParametricRequest(partial: unknown, what: unknown): { p: ParametricParams; what: ParametricWhat } | { error: string } {
  if (!partial || typeof partial !== "object" || Array.isArray(partial)) return { error: "Missing sculpture settings." };
  let p: ParametricParams;
  try {
    p = mergeParametricParams(partial as Partial<ParametricParams>);
  } catch {
    return { error: "Invalid sculpture settings." };
  }
  if (!p.source || typeof p.source !== "object" || typeof p.method !== "string") return { error: "Invalid sculpture settings." };
  if (p.source.kind === "formula" && !(p.source.resolution > 0 && p.source.resolution <= MAX_SERVER_RESOLUTION)) return { error: "Invalid formula resolution." };
  const w = (what ?? { kind: "zip" }) as Partial<ParametricWhat>;
  if (w.kind === "zip" || w.kind === "all" || w.kind === "guide") return { p, what: { kind: w.kind } };
  if (w.kind === "sheet" && Number.isInteger((w as { index?: unknown }).index) && (w as { index: number }).index >= 0) return { p, what: { kind: "sheet", index: (w as { index: number }).index } };
  return { error: "Unknown export." };
}

export async function exportParametricForPlan(p: ParametricParams, what: ParametricWhat, plan: Plan, wasm: ManifoldToplevel): Promise<ParametricExport> {
  const early = parametricLock(plan, p);
  if (early) return { ok: false, status: 403, error: early };
  if (p.method !== "curveNormal" && (p.source.kind === "mesh" || p.source.kind === "image")) {
    return { ok: false, status: 422, error: "Imported models and photos stay on your device, so they are exported in the browser." };
  }
  if (p.method !== "curveNormal" && p.source.kind === "text") {
    return { ok: false, status: 422, error: "Text is shaped on your device, so it is exported in the browser." };
  }
  let result;
  try {
    result = computeParametric(p, await loadSource(p), wasm);
  } catch (e) {
    return { ok: false, status: 422, error: e instanceof Error && e.message ? e.message : "The sculpture could not be built." };
  }
  const late = parametricLock(plan, p, result.stats.partCount);
  if (late) return { ok: false, status: 403, error: late };
  if (!result.sheets.length) return { ok: false, status: 422, error: "There are no parts to export." };
  const watermark = needsWatermark(plan);
  const base = slugName(p.name);
  if (what.kind === "zip") return { ok: true, body: exportZip(result, p, { watermark }), type: "application/zip", fileName: `${base}.zip` };
  if (what.kind === "all") return { ok: true, body: allSheetsSVG(result, p, { watermark }), type: "image/svg+xml; charset=utf-8", fileName: `${base}.svg` };
  if (what.kind === "guide") return { ok: true, body: assemblyGuideSVG(result, p), type: "image/svg+xml; charset=utf-8", fileName: `${base}-assembly-guide.svg` };
  if (what.index >= result.sheets.length) return { ok: false, status: 400, error: "That sheet does not exist." };
  return { ok: true, body: sheetSVG(result, what.index, p, { watermark }), type: "image/svg+xml; charset=utf-8", fileName: `${base}-${sheetFileName(what.index, result.sheets.length)}` };
}
