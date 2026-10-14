export { MATERIALS, DEFAULTS, clone } from "./defaults";
export { migrate } from "./migrate";
export { mergeParams } from "./merge";
export { buildCore, roundedPath, plateExtent } from "./core";
export { simplify, offsetRect, polyD, bboxOf } from "./polygon";
export {
  hingeSegments, makeCols, colSegments, waveParams, reliefRadius, slitPaths,
  cutWidth, mergesEdgeCuts, stadiumD, hingeCutPaths, honeyLattice, barWidth,
} from "./hinge";
export { tabCount, wallOutline, outlinePath, P_slotW, buildWalls, buildTestStrip } from "./wall";
export { bendAnalysis, autoFit, withFittedLattice } from "./analysis";
export { computeModel } from "./model";
export { layoutParts } from "./layout";
export { EXPORT_LAYERS, layerContent, exportSVG, layeredSVG } from "./export";
export { inspectorSVG } from "./inspector";
export { r3, clamp, TAU } from "./util";
export type {
  Params, Point, Edge, Part, WallPart, PlatePart, Model, ModelError, ComputeResult,
  Layout, LayoutItem, Analysis, BendResult, AutoFitResult, Issue, BBox, HingeCol, ColKind,
  Pattern, CutStyle, ExportLayer, LayerContent, LabelMark, LayerKey, Layers, LayerFlags, Lid,
} from "./types";
