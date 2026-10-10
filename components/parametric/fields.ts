import type { BaseField } from "@/components/editor/fields";
import { finSpacingOf, minFeatureOf, tabDepthOf, type ParametricParams } from "@/lib/parametric";

export type ParamSection = "transform" | "formula" | "method" | "material" | "sheet" | "joints" | "quality";

export interface ParamField extends BaseField {
  sec: ParamSection;
  get: (p: ParametricParams) => number;
  /** Write the value into a copy of the params. */
  set: (p: ParametricParams, v: number) => void;
  show?: (p: ParametricParams) => boolean;
}

const formula = (p: ParametricParams) => (p.source.kind === "formula" ? p.source : null);
const isHeightfield = (p: ParametricParams) => formula(p)?.type === "heightfield";
const hasBoard = (p: ParametricParams) => p.parallel.backboard !== "none";

export const PARAM_FIELDS: ParamField[] = [
  { sec: "transform", id: "uniformScale", label: "Scale", step: 0.05, min: 0.01, max: 100, float: true, get: p => p.sourceSettings.transform.uniformScale, set: (p, v) => { p.sourceSettings.transform.uniformScale = v; }, show: p => !p.sourceSettings.targetSize },
  { sec: "transform", id: "targetSize", label: "Size", len: true, step: 5, min: 10, max: 3000, get: p => p.sourceSettings.targetSize?.value ?? 0, set: (p, v) => { if (p.sourceSettings.targetSize) p.sourceSettings.targetSize.value = v; }, show: p => !!p.sourceSettings.targetSize },
  { sec: "transform", id: "rotX", label: "Turn X°", step: 5, min: -360, max: 360, get: p => p.sourceSettings.transform.rotation[0], set: (p, v) => { p.sourceSettings.transform.rotation[0] = v; } },
  { sec: "transform", id: "rotY", label: "Turn Y°", step: 5, min: -360, max: 360, get: p => p.sourceSettings.transform.rotation[1], set: (p, v) => { p.sourceSettings.transform.rotation[1] = v; } },
  { sec: "transform", id: "rotZ", label: "Turn Z°", step: 5, min: -360, max: 360, get: p => p.sourceSettings.transform.rotation[2], set: (p, v) => { p.sourceSettings.transform.rotation[2] = v; } },

  { sec: "formula", id: "fWidth", label: "Width", len: true, step: 5, min: 10, max: 2000, get: p => { const f = formula(p)!; return f.domain.x[1] - f.domain.x[0]; }, set: (p, v) => { const f = formula(p)!; f.domain.x = [-v / 2, v / 2]; }, show: isHeightfield },
  { sec: "formula", id: "fHeight", label: "Height", len: true, step: 5, min: 10, max: 2000, get: p => { const f = formula(p)!; return f.domain.y[1] - f.domain.y[0]; }, set: (p, v) => { const f = formula(p)!; f.domain.y = [-v / 2, v / 2]; }, show: isHeightfield },
  { sec: "formula", id: "fBase", label: "Base", len: true, step: 1, min: 0.5, max: 200, get: p => formula(p)!.base, set: (p, v) => { formula(p)!.base = v; }, show: isHeightfield },
  { sec: "formula", id: "fLength", label: "Length", len: true, step: 5, min: 10, max: 2000, get: p => formula(p)!.height, set: (p, v) => { formula(p)!.height = v; }, show: p => formula(p)?.type === "revolution" },
  { sec: "formula", id: "fRes", label: "Samples", step: 8, min: 8, max: 512, get: p => formula(p)!.resolution, set: (p, v) => { formula(p)!.resolution = v; }, show: p => !!formula(p) },

  { sec: "method", id: "spacing", label: "Spacing", len: true, step: 0.5, min: 1, max: 500, get: finSpacingOf, set: (p, v) => { p.parallel.spacing = v; } },
  { sec: "method", id: "phase", label: "Phase", step: 0.05, min: 0, max: 1, float: true, get: p => p.parallel.phase, set: (p, v) => { p.parallel.phase = v; } },
  { sec: "method", id: "minFinHeight", label: "Min fin", len: true, step: 1, min: 0, max: 200, get: p => p.parallel.minFinHeight, set: (p, v) => { p.parallel.minFinHeight = v; } },
  { sec: "method", id: "backboardMargin", label: "Margin", len: true, step: 1, min: 0, max: 200, get: p => p.parallel.backboardMargin, set: (p, v) => { p.parallel.backboardMargin = v; }, show: hasBoard },
  { sec: "method", id: "slatDepth", label: "Slat depth", len: true, step: 1, min: 2, max: 200, get: p => p.parallel.slatDepth, set: (p, v) => { p.parallel.slatDepth = v; }, show: p => p.parallel.backboard === "slats" },
  { sec: "method", id: "tabDepth", label: "Tab depth", len: true, step: 0.5, min: 0.5, max: 50, get: tabDepthOf, set: (p, v) => { p.parallel.finDepthBehind = v; }, show: hasBoard },

  { sec: "material", id: "T", label: "Thickness", len: true, step: 0.1, min: 0.5, max: 25, mat: true, get: p => p.material.T, set: (p, v) => { p.material.T = v; } },
  { sec: "material", id: "K", label: "Kerf", len: true, step: 0.01, min: 0, max: 1, mat: true, get: p => p.material.K, set: (p, v) => { p.material.K = v; } },

  { sec: "sheet", id: "sheetW", label: "Sheet W", len: true, step: 10, min: 50, max: 3000, get: p => p.material.sheetW, set: (p, v) => { p.material.sheetW = v; } },
  { sec: "sheet", id: "sheetH", label: "Sheet H", len: true, step: 10, min: 50, max: 3000, get: p => p.material.sheetH, set: (p, v) => { p.material.sheetH = v; } },
  { sec: "sheet", id: "sheetMargin", label: "Margin", len: true, step: 1, min: 0, max: 50, get: p => p.material.sheetMargin, set: (p, v) => { p.material.sheetMargin = v; } },
  { sec: "sheet", id: "partGap", label: "Part gap", len: true, step: 0.5, min: 0, max: 50, get: p => p.material.partGap, set: (p, v) => { p.material.partGap = v; } },

  { sec: "joints", id: "tabWidth", label: "Tab width", len: true, step: 1, min: 3, max: 100, get: p => p.joints.tabWidth, set: (p, v) => { p.joints.tabWidth = v; } },
  { sec: "joints", id: "slotClearance", label: "Slot play", len: true, step: 0.02, min: -0.5, max: 2, get: p => p.joints.slotClearance, set: (p, v) => { p.joints.slotClearance = v; } },

  { sec: "quality", id: "chordTolerance", label: "Tolerance", len: true, step: 0.05, min: 0.01, max: 5, get: p => p.quality.chordTolerance, set: (p, v) => { p.quality.chordTolerance = v; } },
  { sec: "quality", id: "smoothing", label: "Smoothing", step: 0.05, min: 0, max: 1, float: true, get: p => p.quality.smoothing, set: (p, v) => { p.quality.smoothing = v; } },
  { sec: "quality", id: "minFeature", label: "Min detail", len: true, step: 0.5, min: 0, max: 50, get: minFeatureOf, set: (p, v) => { p.quality.minFeature = v; } },
  { sec: "quality", id: "minIslandArea", label: "Island mm²", step: 5, min: 0, max: 10000, get: p => p.quality.minIslandArea, set: (p, v) => { p.quality.minIslandArea = v; } },
];
