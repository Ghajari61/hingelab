import { DEFAULTS as HINGE, MATERIALS, clone } from "@/lib/hinge";
import type { FormulaSpec, ParametricParams } from "./types";

export const PARAMETRIC_DEFAULTS: ParametricParams = {
  name: "Untitled sculpture",
  source: { kind: "library", id: "abstract-head-cc0" },
  sourceSettings: {
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], uniformScale: 1 },
    targetSize: null,
  },
  method: "parallel",
  parallel: {
    axis: "X", spacing: null, phase: 0.5, minFinHeight: 3,
    backboard: "plate", backboardMargin: 15, slatWidth: null, slatDepth: 10, fillEmptySlots: true, finDepthBehind: null,
  },
  stacked: { axis: "Y", dowels: true, dowelCount: 2, registrationMarks: true, hollow: false, shell: 8 },
  waffle: { spacingA: 30, spacingB: 30, familyAxes: ["X", "Z"], lapDirection: "A-from-bottom", baseRibs: false },
  material: { id: HINGE.material, T: HINGE.T, K: HINGE.K, sheetW: HINGE.bedW, sheetH: HINGE.bedH, sheetMargin: 5, partGap: 3, grain: "any" },
  joints: { slotClearance: 0.1, tabDepth: null, tabWidth: 10, dowelDia: 6, halfLapClearance: 0.1 },
  quality: { chordTolerance: 0.1, smoothing: 0.25, minFeature: null, minIslandArea: 25 },
  labels: { enabled: true, style: "engrave", position: "auto-hidden-face", prefix: "" },
  layers: clone(HINGE.layers),
};

export const FORMULA_DEFAULTS: Record<FormulaSpec["type"], FormulaSpec> = {
  heightfield: {
    kind: "formula", type: "heightfield", expression: "12*sin(x/18)*cos(y/25)",
    domain: { x: [-100, 100], y: [-75, 75] }, height: 200, variables: {}, resolution: 160, base: 5,
  },
  revolution: {
    kind: "formula", type: "revolution", expression: "45 + 25*sin(h/32) - 12*cos(h/15)",
    domain: { x: [-100, 100], y: [-100, 100] }, height: 240, variables: {}, resolution: 120, base: 0,
  },
};

/** Budgets and limits from the brief. */
export const LIMITS = {
  maxInputTriangles: 2_000_000,
  sliceTriangleBudget: 300_000,
  maxParts: 600,
  maxSheets: 40,
  maxModelExtent: 3000,
  maxFormulaSamples: 5_000_000,
} as const;

export const minFeatureOf = (p: ParametricParams) => p.quality.minFeature ?? Math.max(1.5 * p.material.T, 3);
export const finSpacingOf = (p: ParametricParams) => Math.max(p.parallel.spacing ?? 2.5 * p.material.T, p.material.T + 1);
/** The backboard is cut from the same sheet. */
export const backboardThicknessOf = (p: ParametricParams) => p.material.T;
export const tabDepthOf = (p: ParametricParams) => p.parallel.finDepthBehind ?? p.joints.tabDepth ?? backboardThicknessOf(p);
export const bridgeWidthOf = (p: ParametricParams) => Math.max(minFeatureOf(p), 4);

/** Saved or sent settings over the defaults; nested groups merge key by key. */
export function mergeParametricParams(partial?: Partial<ParametricParams> | null): ParametricParams {
  const base = clone(PARAMETRIC_DEFAULTS);
  if (!partial) return base;
  const out: ParametricParams = { ...base, ...partial } as ParametricParams;
  for (const k of ["sourceSettings", "parallel", "stacked", "waffle", "material", "joints", "quality", "labels"] as const) {
    (out as unknown as Record<string, unknown>)[k] = { ...(base[k] as object), ...((partial[k] as object) ?? {}) };
  }
  out.layers = { ...base.layers, ...(partial.layers ?? {}) };
  out.source = (partial.source as ParametricParams["source"]) ?? base.source;
  if (out.source.kind === "formula") out.source = { ...FORMULA_DEFAULTS[out.source.type], ...out.source };
  return out;
}

export const materialPreset = (id: string) => MATERIALS[id];
