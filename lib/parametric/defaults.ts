import { DEFAULTS as HINGE, MATERIALS, clone } from "@/lib/hinge";
import type { FormulaSpec, ImageSource, ParametricParams, TextSource } from "./types";

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
  radial: { axis: "Z", axisPoint: null, count: 24, angleRange: [0, 360], innerRadius: 20, hubPlates: 1, hubWidth: 20, profileSource: "mesh" },
  curveNormal: {
    guide: { kind: "ellipse", w: 120, h: 70 }, count: null, spacingAtGuide: 8,
    finLength: "60", finHeight: "5 + 15*sin(pi*s/L)", twist: "0",
    outerBoundary: { kind: "none" }, backPlate: true, backMargin: 8, centerFeature: "clock-insert", clockInsertDia: 60,
  },
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
  "radial-profile": {
    kind: "formula", type: "radial-profile", expression: "8 + 22*exp(-((s - 40)/22)^2)*(0.75 + 0.25*cos(3*theta))",
    domain: { x: [20, 120], y: [0, 0] }, height: 0, variables: {}, resolution: 96, base: 3,
  },
};

/** Photo to relief settings for a newly loaded photo. */
export const IMAGE_DEFAULTS: Omit<ImageSource, "fileName"> = {
  kind: "image", depthModel: "depth-anything-v2-small", invert: false, maxReliefDepth: 60, blur: 2, gamma: 1,
  subjectMask: "auto", baseThickness: 0, resolution: 192, width: 200,
};

/** Text settings for a newly chosen Text source. */
export const TEXT_DEFAULTS: TextSource = {
  kind: "text", text: "Sam", font: "fredoka", size: 150, letterSpacing: 0, depth: 40, profile: "rounded", round: 20,
};

/** Standard clock insert diameters, mm. */
export const CLOCK_INSERTS = [30, 37, 50, 60] as const;

/** The leaf-shaped wall clock: fins fanning round an oval, clipped by a leaf outline, all from formulas. */
export const LEAF_CLOCK: ParametricParams["curveNormal"] = {
  guide: { kind: "ellipse", w: 120, h: 76 }, count: 56, spacingAtGuide: 6,
  finLength: "200", finHeight: "4 + (14 + 10*cos(2*pi*t)^2)*abs(sin(pi*s/L))^0.7", twist: "12*sin(2*pi*t)",
  outerBoundary: { kind: "formula", expression: "1/((abs(cos(phi))/165)^1.25 + (abs(sin(phi))/100)^1.25)^0.8" },
  backPlate: true, backMargin: 8, centerFeature: "clock-insert", clockInsertDia: 60,
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
  for (const k of ["sourceSettings", "parallel", "stacked", "waffle", "radial", "curveNormal", "material", "joints", "quality", "labels"] as const) {
    (out as unknown as Record<string, unknown>)[k] = { ...(base[k] as object), ...((partial[k] as object) ?? {}) };
  }
  out.layers = { ...base.layers, ...(partial.layers ?? {}) };
  out.source = (partial.source as ParametricParams["source"]) ?? base.source;
  if (out.source.kind === "formula") out.source = { ...FORMULA_DEFAULTS[out.source.type], ...out.source };
  if (out.source.kind === "image") out.source = { ...IMAGE_DEFAULTS, ...out.source };
  if (out.source.kind === "text") out.source = { ...TEXT_DEFAULTS, ...out.source };
  return out;
}

export const materialPreset = (id: string) => MATERIALS[id];
