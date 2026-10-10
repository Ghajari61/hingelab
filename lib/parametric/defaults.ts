import { DEFAULTS as HINGE, MATERIALS, clone } from "@/lib/hinge";
import type { ParametricParams } from "./types";

export const PARAMETRIC_DEFAULTS: ParametricParams = {
  name: "Untitled sculpture",
  source: { kind: "library", id: "abstract-head-cc0" },
  sourceSettings: {
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], uniformScale: 1 },
    targetSize: null,
  },
  method: "parallel",
  parallel: { axis: "X", spacing: null, phase: 0.5, minFinHeight: 3 },
  material: { id: HINGE.material, T: HINGE.T, K: HINGE.K, sheetW: HINGE.bedW, sheetH: HINGE.bedH, sheetMargin: 5, partGap: 3, grain: "any" },
  joints: { slotClearance: 0.1, tabDepth: null, tabWidth: 10, dowelDia: 6, halfLapClearance: 0.1 },
  quality: { chordTolerance: 0.1, smoothing: 0.25, minFeature: null, minIslandArea: 25 },
  labels: { enabled: true, style: "engrave", position: "auto-hidden-face", prefix: "" },
};

/** Budgets and limits from the brief. */
export const LIMITS = {
  maxInputTriangles: 2_000_000,
  sliceTriangleBudget: 300_000,
  maxParts: 600,
  maxSheets: 40,
  maxModelExtent: 3000,
} as const;

export const minFeatureOf = (p: ParametricParams) => p.quality.minFeature ?? Math.max(1.5 * p.material.T, 3);
export const finSpacingOf = (p: ParametricParams) => Math.max(p.parallel.spacing ?? 2.5 * p.material.T, p.material.T + 1);

/** Saved or sent settings over the defaults; nested groups merge key by key. */
export function mergeParametricParams(partial?: Partial<ParametricParams> | null): ParametricParams {
  const base = clone(PARAMETRIC_DEFAULTS);
  if (!partial) return base;
  const out: ParametricParams = { ...base, ...partial } as ParametricParams;
  for (const k of ["sourceSettings", "parallel", "material", "joints", "quality", "labels"] as const) {
    (out as unknown as Record<string, unknown>)[k] = { ...(base[k] as object), ...((partial[k] as object) ?? {}) };
  }
  out.source = (partial.source as ParametricParams["source"]) ?? base.source;
  return out;
}

export const materialPreset = (id: string) => MATERIALS[id];
