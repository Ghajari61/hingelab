/**
 * Parametric slicer types. Lengths in mm. 3D is right-handed, Y up, Z toward the viewer; the
 * backboard (wall) is the plane z = 0. 2D part drawings are in part-local mm (SVG, y down).
 */
import type { Layers } from "@/lib/hinge";
import type { Contour, Point, Shape } from "@/lib/letters/types";
import type { ShapeSpec, ShapeTargetId } from "./shapes";

export type { Contour, Point, Shape };
export type Vec3 = [number, number, number];

/** An indexed triangle mesh in mm. */
export interface MeshData {
  positions: Float32Array;
  indices: Uint32Array;
}

export type LibraryId = "sphere" | "torus" | "abstract-head-cc0" | "wave-panel" | "ripple" | "vase"
  | "face-cc0" | "veiled-face-cc0" | "profile-face-cc0" | "terrain" | "sand-dunes" | "ocean-wave" | "diagonal-waves" | "sound-wave"
  | "flow-lines" | "hex-bumps" | "pebbles" | "rose" | "lotus" | "shell-spiral" | "mandala" | "moon" | "heart" | "star"
  | "globe-lamp" | "teardrop-lamp" | "bell-lamp" | "bulb-vase";
export type MeshFormat = "stl" | "obj" | "glb" | "gltf";
export type ModelUnits = "mm" | "cm" | "m" | "in" | "auto";

export interface Transform {
  position: Vec3;
  /** Euler angles in degrees, applied X then Y then Z. */
  rotation: Vec3;
  uniformScale: number;
}

export interface FormulaVariable {
  min: number;
  max: number;
  value: number;
}

export interface FormulaSpec {
  kind: "formula";
  type: "heightfield" | "revolution" | "radial-profile";
  /** heightfield: z = f(x, y); revolution: r = f(h); radial-profile: height = f(theta, s). */
  expression: string;
  /** heightfield domain in mm; radial-profile: x is the radius range [r0, r1] and s = r − r0. */
  domain: { x: [number, number]; y: [number, number] };
  /** revolution height H, mm (h runs 0..H). */
  height: number;
  variables: Record<string, FormulaVariable>;
  /** Grid samples per axis. */
  resolution: number;
  /** heightfield: the surface is lifted so its lowest point is this far off the wall, mm. */
  base: number;
}

export type SourceSpec =
  | { kind: "library"; id: LibraryId; /** Icosphere subdivision for the sphere. */ detail?: number }
  | {
      kind: "mesh";
      fileName: string;
      /** Cloud storage id once saved (P6). */
      fileId?: string;
      units: ModelUnits;
      upAxis: "Y" | "Z";
    }
  | ImageSource
  | TextSource
  | FormulaSpec;

/**
 * Text to solid: shaped in the browser with HarfBuzz and the Letters fonts (Latin and Persian); the
 * outlines go to the worker with the request, and the solid stands on the wall (z = 0).
 */
export interface TextSource {
  kind: "text";
  text: string;
  /** Bundled font id (see `lib/letters/fonts`). */
  font: string;
  /** Cap height, mm. */
  size: number;
  letterSpacing: number;
  /** Height off the wall, mm. */
  depth: number;
  /** Flat: straight sides. Rounded: a pillow that rises to `depth` over `round` mm from the edge. */
  profile: "flat" | "rounded";
  round: number;
}

/** Photo to relief: the depth map comes from Depth-Anything-V2-Small in the browser. */
export interface ImageSource {
  kind: "image";
  fileName: string;
  fileId?: string;
  depthModel: "depth-anything-v2-small";
  invert: boolean;
  /** mm, height of the nearest point above the base. */
  maxReliefDepth: number;
  /** Gaussian sigma, depth-map px. */
  blur: number;
  gamma: number;
  subjectMask: "auto" | "none";
  baseThickness: number;
  /** Grid cells along the long side (max 256). */
  resolution: number;
  /** Relief width, mm. */
  width: number;
}

export interface SourceSettings {
  transform: Transform;
  /** Scale the model so its size along `axis` is `value` mm (null = keep). */
  targetSize: { axis: "width" | "height" | "depth"; value: number } | null;
}

export type MethodId = "parallel" | "stacked" | "waffle" | "radial" | "curveNormal" | "folded";

/** Folded (papercraft): the model's faces unfolded into flat nets of card or paper. */
export interface FoldedParams {
  /** The model is simplified to about this many triangles. */
  faces: number;
  /** A glue tab on one side of every cut edge. */
  tabs: boolean;
  /** Tab height, mm (shorter on short edges). */
  tabWidth: number;
  /** Engrave matching numbers on both sides of every cut edge. */
  numbers: boolean;
}

export interface ParallelParams {
  /** Direction the slicing planes are stacked along. */
  axis: "X" | "Y";
  /** Centre-to-centre spacing, mm (null = 2.5 T). */
  spacing: number | null;
  /** Offset of the first plane, 0..1 of the spacing. */
  phase: number;
  /** Fins lower than this are left out (reported), mm. */
  minFinHeight: number;
  backboard: "none" | "plate" | "slats";
  /** Border of the backboard around the model, mm. */
  backboardMargin: number;
  /** Visible width of a slat; slats are cut on edge from the sheet, so this is T (kept for the brief's data model). */
  slatWidth: number | null;
  /** How far plain slats stand out of the wall, mm. */
  slatDepth: number;
  /** Planes outside the model continue as plain slats across the whole board. */
  fillEmptySlots: boolean;
  /** Tab depth into the backboard, mm (null = backboard thickness). */
  finDepthBehind: number | null;
}

export interface StackedParams {
  /** Stacking direction: Y = horizontal layers of a standing model, Z = layers parallel to the wall. */
  axis: "Y" | "Z";
  dowels: boolean;
  /** Dowels per chain, 1..12. */
  dowelCount: number;
  /** Engrave the outline of the layer above on each layer. */
  registrationMarks: boolean;
  /** Hollow the inside of each layer, leaving `shell` mm of wall. */
  hollow: boolean;
  shell: number;
}

export interface WaffleParams {
  /** Rib spacing of family A and family B, mm. */
  spacingA: number;
  spacingB: number;
  /** Plane normals of the two rib families. */
  familyAxes: ["X", "Z"] | ["X", "Y"];
  /** Which family gets the slot from the low end of each crossing. */
  lapDirection: "A-from-bottom" | "A-from-top";
  baseRibs: boolean;
}

export interface RadialParams {
  /** The common axis of the fins (Z: a sunburst on the wall; Y: a lamp shade standing up). */
  axis: "X" | "Y" | "Z";
  /** A point on the axis, mm (null = centre of the model's bounding box). */
  axisPoint: Vec3 | null;
  count: number;
  /** Degrees; a full turn spaces the fins evenly, a part turn includes both ends. */
  angleRange: [number, number];
  /** The hub opening, mm: fins start this far from the axis. */
  innerRadius: number;
  /** Hub rings at the low end (1) or both ends (2) of the axis. */
  hubPlates: 0 | 1 | 2;
  /** Radial width of the hub ring, mm. */
  hubWidth: number;
  /** 'formula' takes the fin outlines straight from a radial-profile formula. */
  profileSource: "mesh" | "formula";
}

export type GuideCurve = { kind: "ellipse"; w: number; h: number } | { kind: "circle"; d: number };
export type BoundaryCurve = { kind: "none" } | { kind: "ellipse"; w: number; h: number } | { kind: "formula"; expression: string };

export interface CurveNormalParams {
  /** The curve the fins stand square to, centred on the origin, on the wall. */
  guide: GuideCurve;
  /** null = as many as `spacingAtGuide` allows. */
  count: number | null;
  spacingAtGuide: number;
  /** Formulas: finLength(t), finHeight(t, s, L), twist(t) in degrees; t runs 0..1 round the guide. */
  finLength: string;
  finHeight: string;
  twist: string;
  /** Clips the fins (the leaf outline); the formula gives the radius r(phi). */
  outerBoundary: BoundaryCurve;
  backPlate: boolean;
  /** Border of the back plate around the fins when there is no outer boundary, mm. */
  backMargin: number;
  centerFeature: "none" | "clock-insert" | "mirror" | "opening";
  clockInsertDia: number;
}

export interface MaterialSettings {
  id: string;
  T: number;
  K: number;
  sheetW: number;
  sheetH: number;
  sheetMargin: number;
  partGap: number;
  grain: "any" | "along-x" | "along-y";
  /** Pack parts by their bounding boxes or by their outlines (true shape). */
  nest?: "box" | "outline";
  /** A scored 100 mm scale and a 10 mm test square along the bottom of every sheet. */
  calibration?: boolean;
}

export interface JointSettings {
  slotClearance: number;
  /** null = backboard thickness. */
  tabDepth: number | null;
  tabWidth: number;
  /** Tabs per wall edge (per hub joint for radial fins); null = Auto, one about every `tabPitch` mm. Fewer are used where they do not fit. */
  tabCount: number | null;
  /** Auto spacing of tabs along an edge, mm. */
  tabPitch: number;
  dowelDia: number;
  halfLapClearance: number;
}

export interface QualitySettings {
  chordTolerance: number;
  smoothing: number;
  /** null = max(1.5 T, 3). */
  minFeature: number | null;
  minIslandArea: number;
}

export interface ParametricParams {
  name: string;
  source: SourceSpec;
  sourceSettings: SourceSettings;
  method: MethodId;
  parallel: ParallelParams;
  stacked: StackedParams;
  waffle: WaffleParams;
  radial: RadialParams;
  curveNormal: CurveNormalParams;
  folded: FoldedParams;
  material: MaterialSettings;
  joints: JointSettings;
  quality: QualitySettings;
  labels: { enabled: boolean; style: "engrave" | "score"; position: "auto-hidden-face" | "center"; prefix: string };
  /** Export layer switches (the hinge layer is unused here). */
  layers: Layers;
  /** Shape-button settings behind the formula fields (the formulas themselves are what the engine reads). */
  shapes?: Partial<Record<ShapeTargetId, ShapeSpec>>;
}

/** A slicing plane n·p = offset with an in-plane frame: part-local x along u, y along w. */
export interface Plane {
  normal: Vec3;
  offset: number;
  u: Vec3;
  w: Vec3;
}

export type PartKind = "fin" | "layer" | "rib-x" | "rib-y" | "radial-fin" | "backboard" | "hub" | "spine" | "slat" | "spacer" | "net";

export interface Part {
  id: string;
  kind: PartKind;
  /** Filled region in part-local mm: one outer with its holes (our Clipper orientation). */
  shape: Shape;
  /** Paths cut before the outline (slots, dowel holes). */
  innerCuts: Contour[];
  /** Engrave paths (labels, marks). */
  engrave: Contour[];
  /** Column-major 4×4 matrix from part-local (x, y, z) to model space; z is the thickness, centred on the plane. */
  placement: number[];
  /** Index of the plane the part was cut from (-1 for plates). */
  plane: number;
  neighbors: string[];
  /** Tabs along the wall edge: part-local x ranges; they reach from y = 0 down to y = -tabDepth. */
  tabs?: [number, number][];
  tabDepth?: number;
  /** Kerf-compensated cut paths in part-local mm: outline contours (outer + holes) and inner cuts. */
  cut?: { outline: Contour[]; inner: Contour[] };
  /** Scored lines (open), such as fold lines. */
  score?: Contour[];
  /** Folded nets: the model-space triangles the net folds into (9 numbers per face); `placement` is unused. */
  faces3d?: number[];
}

export interface SheetItem {
  partId: string;
  /** Sheet point = rotate(angle) · part-local point + (x, y). Degrees. */
  angle: number;
  x: number;
  y: number;
}

export interface Sheet {
  index: number;
  width: number;
  height: number;
  items: SheetItem[];
  /** Part area / sheet area. */
  usage: number;
  /** A part larger than the sheet, placed alone on an oversized sheet. */
  oversize?: boolean;
  /** Top-left corner and room (width) of the calibration bar, sheet mm. */
  calibration?: { x: number; y: number; w: number };
}

/** A waffle half-lap: ribs `a` and `b` cross on the line x = xa (in a) / x = xb (in b); they overlap over [t0, t1] along it and meet at m. */
export interface Crossing {
  a: string;
  b: string;
  xa: number;
  xb: number;
  t0: number;
  t1: number;
  m: number;
}

export type WarningCode =
  | "NON_MANIFOLD" | "NON_MANIFOLD_SECTION" | "MIN_FEATURE_REMOVED" | "ISLAND_DROPPED" | "BRIDGE_ADDED" | "SHORT_FIN_DROPPED"
  | "DOWEL_CHAIN_SPLIT" | "CROSSING_TOO_SHORT" | "FINS_COLLIDE_AT_HUB" | "FINS_COLLIDE" | "PART_TOO_BIG" | "TOO_MANY_PARTS"
  | "SIMPLIFIED" | "METHOD_NOT_READY" | "FLOATING_PIECE" | "LABEL_SKIPPED" | "TOO_MANY_SHEETS" | "NO_TAB"
  | "NO_DOWEL" | "NO_JOINT";

export interface Warning {
  code: WarningCode;
  message: string;
  partIds?: string[];
  /** Numbers behind the message (e.g. maxCount and minRadius for FINS_COLLIDE_AT_HUB). */
  data?: Record<string, number>;
}

export interface Stats {
  partCount: number;
  planeCount: number;
  sheetCount: number;
  /** Total cut length of all kerf-compensated outlines and inner cuts, mm. */
  cutLength: number;
  engraveLength: number;
  /** Area of all parts, mm². */
  partArea: number;
  /** Part area over the area of the sheets used, 0..1. */
  materialUsage: number;
  /** Minutes on the laser, from the material's speed preset (cutTime.ts). */
  estimatedCutTime: number;
  /** Distance from points on the model's surface to the nearest assembled part, mm. */
  maxDeviation?: number;
  meanDeviation?: number;
  /** clamp(1 − mean / (2 · spacing), 0, 1). */
  fidelity?: number;
}

/** The deviation samples behind the stats, for the heat map. */
export interface Deviation {
  /** xyz per sample, model mm. */
  points: Float32Array;
  values: Float32Array;
  /** The method's spacing used for the fidelity score, mm. */
  spacing: number;
}

export interface SliceResult {
  method: MethodId;
  planes: Plane[];
  /** Cleaned section per plane (before splitting into parts), part-local mm. For the debug view. */
  sections: Shape[][];
  parts: Part[];
  sheets: Sheet[];
  warnings: Warning[];
  stats: Stats;
  /** Assembly steps written by the method, for the guide. */
  guide: string[];
  /** Waffle joints. */
  crossings?: Crossing[];
  /** Model bounds after normalising, mm (the generated parts' bounds when no model is sliced). */
  bounds: { min: Vec3; max: Vec3 };
  /** Which section algorithm ran. */
  engine: "manifold" | "fallback";
  /** False when the parts come straight from formulas and the source model is not used. */
  usesModel: boolean;
  deviation?: Deviation;
}

export interface SliceError {
  error: string;
}
