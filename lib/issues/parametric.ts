/** Parametric checks: the slicer's warnings, one issue per kind, with fixes from their numbers. */
import { LIMITS, finSpacingOf } from "@/lib/parametric/defaults";
import { arcTable } from "@/lib/parametric/methods/curveNormal";
import type { ParametricParams, SliceResult, WarningCode } from "@/lib/parametric/types";
import type { Fix, Issue, IssueLevel } from "./index";

type PIssue = Issue<ParametricParams>;

export const WARNING_TITLES: Partial<Record<WarningCode, string>> = {
  PART_TOO_BIG: "Larger than the sheet",
  TOO_MANY_SHEETS: "Too many sheets",
  TOO_MANY_PARTS: "Too many parts",
  NON_MANIFOLD: "Open mesh",
  NON_MANIFOLD_SECTION: "Open sections",
  MIN_FEATURE_REMOVED: "Thin detail removed",
  ISLAND_DROPPED: "Tiny pieces left out",
  SHORT_FIN_DROPPED: "Short fins left out",
  BRIDGE_ADDED: "Bridges added",
  FLOATING_PIECE: "Floating pieces",
  NO_TAB: "Pieces without a tab",
  LABEL_SKIPPED: "Labels skipped",
  SIMPLIFIED: "Model simplified",
  METHOD_NOT_READY: "Method not ready",
  DOWEL_CHAIN_SPLIT: "Dowels split into groups",
  NO_DOWEL: "Layers without dowels",
  CROSSING_TOO_SHORT: "Crossings too short",
  NO_JOINT: "Ribs without a joint",
  FINS_COLLIDE_AT_HUB: "Fins crowd the hub",
  FINS_COLLIDE: "Fins touch",
};

export const SERIOUS: WarningCode[] = ["PART_TOO_BIG", "TOO_MANY_SHEETS", "TOO_MANY_PARTS", "NON_MANIFOLD", "FLOATING_PIECE", "METHOD_NOT_READY", "FINS_COLLIDE_AT_HUB", "FINS_COLLIDE"];

const pct = (f: number) => `${Math.round(f * 100)} %`;

/** Scale the model (or its target size) by f. */
function scaled(p: ParametricParams, f: number): ParametricParams {
  const q = structuredClone(p);
  const s = q.sourceSettings;
  if (s.targetSize && s.targetSize.value > 0) s.targetSize = { ...s.targetSize, value: Math.round(s.targetSize.value * f * 10) / 10 };
  else s.transform.uniformScale = Math.round((s.transform.uniformScale || 1) * f * 1000) / 1000;
  return q;
}

/** Largest scale at which every listed part fits the usable sheet (turned if the grain allows). */
function fitScale(p: ParametricParams, r: SliceResult, ids: string[], turn: boolean): number {
  const uw = p.material.sheetW - 2 * p.material.sheetMargin, uh = p.material.sheetH - 2 * p.material.sheetMargin;
  // Margins, tabs and slots keep their size while the model scales.
  const fixed = 2 * (p.parallel.backboardMargin + 2 * p.material.T);
  const k = (u: number, d: number) => (u <= fixed || d <= fixed ? u / d : (u - fixed) / (d - fixed));
  let f = Infinity;
  for (const id of ids) {
    const part = r.parts.find((q) => q.id === id);
    if (!part) continue;
    const w = part.shape.bbox.x1 - part.shape.bbox.x0, h = part.shape.bbox.y1 - part.shape.bbox.y0;
    const straight = Math.min(k(uw, w), k(uh, h)), turned = Math.min(k(uw, h), k(uh, w));
    f = Math.min(f, turn ? Math.max(straight, turned) : straight);
  }
  return f;
}

function fixesFor(code: WarningCode, p: ParametricParams, r: SliceResult, ids: string[], data?: Record<string, number>): Fix<ParametricParams>[] {
  const fixes: Fix<ParametricParams>[] = [];
  if (code === "FINS_COLLIDE_AT_HUB" && data) {
    fixes.push({ id: "count", label: `${data.maxCount} fins`, safe: true, apply: (q) => { const x = structuredClone(q); x.radial.count = data.maxCount; return x; } });
    fixes.push({ id: "hub", label: `A ${Math.ceil(data.minRadius)} mm hub`, safe: false, apply: (q) => { const x = structuredClone(q); x.radial.innerRadius = Math.ceil(data.minRadius); return x; } });
  }
  if (code === "FINS_COLLIDE" && p.method === "curveNormal") {
    const cn = p.curveNormal;
    const most = Math.max(1, Math.floor(arcTable(cn.guide).perimeter / (p.material.T + 2)));
    const now = cn.count ?? r.parts.filter((q) => q.kind === "fin").length;
    const count = Math.max(1, Math.min(most, Math.floor(now * 0.8)));
    fixes.push({ id: "count", label: `${count} fins`, safe: true, apply: (q) => { const x = structuredClone(q); x.curveNormal.count = count; return x; } });
  }
  if (code === "PART_TOO_BIG" && p.method !== "curveNormal") {
    if (p.material.grain !== "any" && fitScale(p, r, ids, true) >= 1 && fitScale(p, r, ids, false) < 1) {
      fixes.push({ id: "rotate", label: "Let parts turn on the sheet", safe: true, apply: (q) => { const x = structuredClone(q); x.material.grain = "any"; return x; } });
    }
    const f = fitScale(p, r, ids, p.material.grain === "any") * 0.97;
    if (f < 1 && f > 0.01) fixes.push({ id: "scale", label: `Scale the model to ${pct(f)}`, safe: true, apply: (q) => scaled(q, f) });
  }
  if (code === "TOO_MANY_SHEETS" && p.method !== "curveNormal") {
    const f = Math.sqrt(LIMITS.maxSheets / Math.max(1, r.stats.sheetCount)) * 0.9;
    fixes.push({ id: "scale", label: `Scale the model to ${pct(f)}`, safe: true, apply: (q) => scaled(q, f) });
  }
  if (code === "TOO_MANY_PARTS" && p.method === "parallel") {
    const spacing = Math.ceil(finSpacingOf(p) * (r.stats.partCount / LIMITS.maxParts) * 1.15 * 2) / 2;
    fixes.push({ id: "spacing", label: `Fins every ${spacing} mm`, safe: true, apply: (q) => { const x = structuredClone(q); x.parallel.spacing = spacing; return x; } });
  }
  return fixes;
}

export function parametricIssues(p: ParametricParams, r: SliceResult | null, error?: string | null): PIssue[] {
  if (error) return [{ code: "BUILD", level: "error", message: error, fixes: [] }];
  if (!r) return [];
  const groups = new Map<WarningCode, { messages: string[]; ids: string[]; data?: Record<string, number> }>();
  for (const w of r.warnings) {
    const g = groups.get(w.code) ?? { messages: [], ids: [] };
    g.messages.push(w.message);
    g.ids.push(...(w.partIds ?? []));
    g.data ??= w.data;
    groups.set(w.code, g);
  }
  return [...groups].map(([code, g]) => {
    const level: IssueLevel = SERIOUS.includes(code) ? "warn" : "info";
    const ids = [...new Set(g.ids)];
    const title = WARNING_TITLES[code];
    return {
      code, level,
      message: `${title ? `${title}: ` : ""}${g.messages.join(" ")}`,
      fixes: fixesFor(code, p, r, ids, g.data),
      partIds: ids.length ? ids : undefined,
    };
  });
}
