import type { BaseField } from "@/components/editor/fields";
import { finSpacingOf, minFeatureOf, tabDepthOf, type ParametricParams } from "@/lib/parametric";

export type ParamSection = "transform" | "formula" | "photo" | "text" | "method" | "material" | "sheet" | "joints" | "quality";

export interface ParamField extends BaseField {
  sec: ParamSection;
  get: (p: ParametricParams) => number;
  /** Write the value into a copy of the params. */
  set: (p: ParametricParams, v: number) => void;
  show?: (p: ParametricParams) => boolean;
}

const formula = (p: ParametricParams) => (p.source.kind === "formula" ? p.source : null);
const image = (p: ParametricParams) => (p.source.kind === "image" ? p.source : null);
const text = (p: ParametricParams) => (p.source.kind === "text" ? p.source : null);
const isHeightfield = (p: ParametricParams) => formula(p)?.type === "heightfield";
const isRadialProfile = (p: ParametricParams) => formula(p)?.type === "radial-profile";
const isParallel = (p: ParametricParams) => p.method === "parallel";
const hasBoard = (p: ParametricParams) => isParallel(p) && p.parallel.backboard !== "none";
const isStacked = (p: ParametricParams) => p.method === "stacked";
const isWaffle = (p: ParametricParams) => p.method === "waffle";
const isRadial = (p: ParametricParams) => p.method === "radial";
const isCurve = (p: ParametricParams) => p.method === "curveNormal";
const curveGuide = (p: ParametricParams) => p.curveNormal.guide;
const curveBoundary = (p: ParametricParams) => p.curveNormal.outerBoundary;

export const PARAM_FIELDS: ParamField[] = [
  { sec: "transform", id: "uniformScale", label: "Scale", step: 0.05, min: 0.01, max: 100, float: true, get: p => p.sourceSettings.transform.uniformScale, set: (p, v) => { p.sourceSettings.transform.uniformScale = v; }, show: p => !p.sourceSettings.targetSize },
  { sec: "transform", id: "targetSize", label: "Size", len: true, step: 5, min: 10, max: 3000, get: p => p.sourceSettings.targetSize?.value ?? 0, set: (p, v) => { if (p.sourceSettings.targetSize) p.sourceSettings.targetSize.value = v; }, show: p => !!p.sourceSettings.targetSize },
  { sec: "transform", id: "rotX", label: "Turn X°", step: 5, min: -360, max: 360, get: p => p.sourceSettings.transform.rotation[0], set: (p, v) => { p.sourceSettings.transform.rotation[0] = v; } },
  { sec: "transform", id: "rotY", label: "Turn Y°", step: 5, min: -360, max: 360, get: p => p.sourceSettings.transform.rotation[1], set: (p, v) => { p.sourceSettings.transform.rotation[1] = v; } },
  { sec: "transform", id: "rotZ", label: "Turn Z°", step: 5, min: -360, max: 360, get: p => p.sourceSettings.transform.rotation[2], set: (p, v) => { p.sourceSettings.transform.rotation[2] = v; } },

  { sec: "formula", id: "fWidth", label: "Width", len: true, step: 5, min: 10, max: 2000, get: p => { const f = formula(p)!; return f.domain.x[1] - f.domain.x[0]; }, set: (p, v) => { const f = formula(p)!; f.domain.x = [-v / 2, v / 2]; }, show: isHeightfield },
  { sec: "formula", id: "fHeight", label: "Height", len: true, step: 5, min: 10, max: 2000, get: p => { const f = formula(p)!; return f.domain.y[1] - f.domain.y[0]; }, set: (p, v) => { const f = formula(p)!; f.domain.y = [-v / 2, v / 2]; }, show: isHeightfield },
  { sec: "formula", id: "fR0", label: "Inner r", len: true, step: 1, min: 1, max: 1500, get: p => formula(p)!.domain.x[0], set: (p, v) => { const f = formula(p)!; f.domain.x = [v, Math.max(f.domain.x[1], v + 2)]; }, show: isRadialProfile },
  { sec: "formula", id: "fR1", label: "Outer r", len: true, step: 5, min: 3, max: 1500, get: p => formula(p)!.domain.x[1], set: (p, v) => { const f = formula(p)!; f.domain.x = [Math.min(f.domain.x[0], v - 2), v]; }, show: isRadialProfile },
  { sec: "formula", id: "fBase", label: "Base", len: true, step: 1, min: 0.5, max: 200, get: p => formula(p)!.base, set: (p, v) => { formula(p)!.base = v; }, show: p => isHeightfield(p) || isRadialProfile(p) },
  { sec: "formula", id: "fLength", label: "Length", len: true, step: 5, min: 10, max: 2000, get: p => formula(p)!.height, set: (p, v) => { formula(p)!.height = v; }, show: p => formula(p)?.type === "revolution" },
  { sec: "formula", id: "fRes", label: "Samples", step: 8, min: 8, max: 512, get: p => formula(p)!.resolution, set: (p, v) => { formula(p)!.resolution = v; }, show: p => !!formula(p) },

  { sec: "photo", id: "iWidth", label: "Width", len: true, step: 5, min: 20, max: 2000, get: p => image(p)!.width, set: (p, v) => { image(p)!.width = v; } },
  { sec: "photo", id: "iDepth", label: "Max depth", len: true, step: 1, min: 1, max: 500, get: p => image(p)!.maxReliefDepth, set: (p, v) => { image(p)!.maxReliefDepth = v; } },
  { sec: "photo", id: "iBase", label: "Base", len: true, step: 1, min: 0, max: 100, get: p => image(p)!.baseThickness, set: (p, v) => { image(p)!.baseThickness = v; } },
  { sec: "photo", id: "iBlur", label: "Smoothing", step: 0.5, min: 0, max: 20, float: true, get: p => image(p)!.blur, set: (p, v) => { image(p)!.blur = v; } },
  { sec: "photo", id: "iGamma", label: "Contrast", step: 0.1, min: 0.2, max: 3, float: true, get: p => image(p)!.gamma, set: (p, v) => { image(p)!.gamma = v; } },
  { sec: "photo", id: "iRes", label: "Detail", step: 8, min: 8, max: 256, get: p => image(p)!.resolution, set: (p, v) => { image(p)!.resolution = v; } },

  { sec: "text", id: "tSize", label: "Height", len: true, step: 5, min: 10, max: 2000, get: p => text(p)!.size, set: (p, v) => { text(p)!.size = v; } },
  { sec: "text", id: "tSpacing", label: "Spacing", len: true, step: 1, min: -50, max: 500, get: p => text(p)!.letterSpacing, set: (p, v) => { text(p)!.letterSpacing = v; } },
  { sec: "text", id: "tDepth", label: "Depth", len: true, step: 1, min: 2, max: 500, get: p => text(p)!.depth, set: (p, v) => { text(p)!.depth = v; } },
  { sec: "text", id: "tRound", label: "Rounding", len: true, step: 1, min: 1, max: 300, get: p => text(p)!.round, set: (p, v) => { text(p)!.round = v; }, show: p => text(p)?.profile === "rounded" },

  { sec: "method", id: "spacing", label: "Spacing", len: true, step: 0.5, min: 1, max: 500, get: finSpacingOf, set: (p, v) => { p.parallel.spacing = v; }, show: isParallel },
  { sec: "method", id: "phase", label: "Phase", step: 0.05, min: 0, max: 1, float: true, get: p => p.parallel.phase, set: (p, v) => { p.parallel.phase = v; }, show: isParallel },
  { sec: "method", id: "minFinHeight", label: "Min fin", len: true, step: 1, min: 0, max: 200, get: p => p.parallel.minFinHeight, set: (p, v) => { p.parallel.minFinHeight = v; }, show: isParallel },
  { sec: "method", id: "backboardMargin", label: "Margin", len: true, step: 1, min: 0, max: 200, get: p => p.parallel.backboardMargin, set: (p, v) => { p.parallel.backboardMargin = v; }, show: hasBoard },
  { sec: "method", id: "slatDepth", label: "Slat depth", len: true, step: 1, min: 2, max: 200, get: p => p.parallel.slatDepth, set: (p, v) => { p.parallel.slatDepth = v; }, show: p => isParallel(p) && p.parallel.backboard === "slats" },
  { sec: "method", id: "tabDepth", label: "Tab depth", len: true, step: 0.5, min: 0.5, max: 50, get: tabDepthOf, set: (p, v) => { p.parallel.finDepthBehind = v; }, show: hasBoard },
  { sec: "method", id: "dowelCount", label: "Dowels", step: 1, min: 1, max: 4, get: p => p.stacked.dowelCount, set: (p, v) => { p.stacked.dowelCount = v; }, show: p => isStacked(p) && p.stacked.dowels },
  { sec: "method", id: "shell", label: "Wall", len: true, step: 1, min: 2, max: 100, get: p => p.stacked.shell, set: (p, v) => { p.stacked.shell = v; }, show: p => isStacked(p) && p.stacked.hollow },
  { sec: "method", id: "spacingA", label: "Spacing A", len: true, step: 1, min: 3, max: 500, get: p => p.waffle.spacingA, set: (p, v) => { p.waffle.spacingA = v; }, show: isWaffle },
  { sec: "method", id: "spacingB", label: "Spacing B", len: true, step: 1, min: 3, max: 500, get: p => p.waffle.spacingB, set: (p, v) => { p.waffle.spacingB = v; }, show: isWaffle },
  { sec: "method", id: "radialCount", label: "Fins", step: 1, min: 2, max: 360, get: p => p.radial.count, set: (p, v) => { p.radial.count = Math.round(v); }, show: isRadial },
  { sec: "method", id: "innerRadius", label: "Hub radius", len: true, step: 1, min: 1, max: 1000, get: p => p.radial.innerRadius, set: (p, v) => { p.radial.innerRadius = v; }, show: isRadial },
  { sec: "method", id: "angleStart", label: "From °", step: 5, min: -360, max: 360, get: p => p.radial.angleRange[0], set: (p, v) => { p.radial.angleRange = [v, p.radial.angleRange[1]]; }, show: isRadial },
  { sec: "method", id: "angleEnd", label: "To °", step: 5, min: -360, max: 720, get: p => p.radial.angleRange[1], set: (p, v) => { p.radial.angleRange = [p.radial.angleRange[0], v]; }, show: isRadial },
  { sec: "method", id: "hubWidth", label: "Hub width", len: true, step: 1, min: 3, max: 200, get: p => p.radial.hubWidth, set: (p, v) => { p.radial.hubWidth = v; }, show: p => isRadial(p) && p.radial.hubPlates > 0 },
  { sec: "method", id: "guideW", label: "Guide W", len: true, step: 5, min: 10, max: 2000, get: p => { const g = curveGuide(p); return g.kind === "ellipse" ? g.w : g.d; }, set: (p, v) => { const g = curveGuide(p); if (g.kind === "ellipse") g.w = v; else g.d = v; }, show: isCurve },
  { sec: "method", id: "guideH", label: "Guide H", len: true, step: 5, min: 10, max: 2000, get: p => { const g = curveGuide(p); return g.kind === "ellipse" ? g.h : g.d; }, set: (p, v) => { const g = curveGuide(p); if (g.kind === "ellipse") g.h = v; }, show: p => isCurve(p) && curveGuide(p).kind === "ellipse" },
  { sec: "method", id: "curveCount", label: "Fins", step: 1, min: 3, max: 600, get: p => p.curveNormal.count ?? 0, set: (p, v) => { p.curveNormal.count = Math.round(v); }, show: p => isCurve(p) && p.curveNormal.count !== null },
  { sec: "method", id: "spacingAtGuide", label: "Spacing", len: true, step: 0.5, min: 1, max: 200, get: p => p.curveNormal.spacingAtGuide, set: (p, v) => { p.curveNormal.spacingAtGuide = v; }, show: p => isCurve(p) && p.curveNormal.count === null },
  { sec: "method", id: "boundW", label: "Outline W", len: true, step: 5, min: 10, max: 3000, get: p => { const b = curveBoundary(p); return b.kind === "ellipse" ? b.w : 0; }, set: (p, v) => { const b = curveBoundary(p); if (b.kind === "ellipse") b.w = v; }, show: p => isCurve(p) && curveBoundary(p).kind === "ellipse" },
  { sec: "method", id: "boundH", label: "Outline H", len: true, step: 5, min: 10, max: 3000, get: p => { const b = curveBoundary(p); return b.kind === "ellipse" ? b.h : 0; }, set: (p, v) => { const b = curveBoundary(p); if (b.kind === "ellipse") b.h = v; }, show: p => isCurve(p) && curveBoundary(p).kind === "ellipse" },
  { sec: "method", id: "backMargin", label: "Plate border", len: true, step: 1, min: 0, max: 200, get: p => p.curveNormal.backMargin, set: (p, v) => { p.curveNormal.backMargin = v; }, show: p => isCurve(p) && p.curveNormal.backPlate && curveBoundary(p).kind === "none" },

  { sec: "material", id: "T", label: "Thickness", len: true, step: 0.1, min: 0.5, max: 25, mat: true, get: p => p.material.T, set: (p, v) => { p.material.T = v; } },
  { sec: "material", id: "K", label: "Kerf", len: true, step: 0.01, min: 0, max: 1, mat: true, get: p => p.material.K, set: (p, v) => { p.material.K = v; } },

  { sec: "sheet", id: "sheetW", label: "Sheet W", len: true, step: 10, min: 50, max: 3000, get: p => p.material.sheetW, set: (p, v) => { p.material.sheetW = v; } },
  { sec: "sheet", id: "sheetH", label: "Sheet H", len: true, step: 10, min: 50, max: 3000, get: p => p.material.sheetH, set: (p, v) => { p.material.sheetH = v; } },
  { sec: "sheet", id: "sheetMargin", label: "Margin", len: true, step: 1, min: 0, max: 50, get: p => p.material.sheetMargin, set: (p, v) => { p.material.sheetMargin = v; } },
  { sec: "sheet", id: "partGap", label: "Part gap", len: true, step: 0.5, min: 0, max: 50, get: p => p.material.partGap, set: (p, v) => { p.material.partGap = v; } },

  { sec: "joints", id: "tabWidth", label: "Tab width", len: true, step: 1, min: 3, max: 100, get: p => p.joints.tabWidth, set: (p, v) => { p.joints.tabWidth = v; }, show: hasBoard },
  { sec: "joints", id: "slotClearance", label: "Slot play", len: true, step: 0.02, min: -0.5, max: 2, get: p => p.joints.slotClearance, set: (p, v) => { p.joints.slotClearance = v; }, show: p => !isWaffle(p) },
  { sec: "joints", id: "dowelDia", label: "Dowel Ø", len: true, step: 0.5, min: 1, max: 30, get: p => p.joints.dowelDia, set: (p, v) => { p.joints.dowelDia = v; }, show: p => isStacked(p) && p.stacked.dowels },
  { sec: "joints", id: "halfLapClearance", label: "Lap play", len: true, step: 0.02, min: -0.5, max: 2, get: p => p.joints.halfLapClearance, set: (p, v) => { p.joints.halfLapClearance = v; }, show: isWaffle },

  { sec: "quality", id: "chordTolerance", label: "Tolerance", len: true, step: 0.05, min: 0.01, max: 5, get: p => p.quality.chordTolerance, set: (p, v) => { p.quality.chordTolerance = v; } },
  { sec: "quality", id: "smoothing", label: "Smoothing", step: 0.05, min: 0, max: 1, float: true, get: p => p.quality.smoothing, set: (p, v) => { p.quality.smoothing = v; } },
  { sec: "quality", id: "minFeature", label: "Min detail", len: true, step: 0.5, min: 0, max: 50, get: minFeatureOf, set: (p, v) => { p.quality.minFeature = v; } },
  { sec: "quality", id: "minIslandArea", label: "Island mm²", step: 5, min: 0, max: 10000, get: p => p.quality.minIslandArea, set: (p, v) => { p.quality.minIslandArea = v; } },
];
