/**
 * Parametric slicer types. Lengths in mm. 3D is right-handed, Y up, Z toward the viewer; the
 * backboard (wall) is the plane z = 0. 2D part drawings are in part-local mm (SVG, y down).
 */
import type { Contour, Point, Shape } from "@/lib/letters/types";

export type { Contour, Point, Shape };
export type Vec3 = [number, number, number];

/** An indexed triangle mesh in mm. */
export interface MeshData {
  positions: Float32Array;
  indices: Uint32Array;
}

export type LibraryId = "sphere" | "torus" | "abstract-head-cc0" | "wave-panel" | "ripple" | "vase";
export type MeshFormat = "stl" | "obj" | "glb" | "gltf";
export type ModelUnits = "mm" | "cm" | "m" | "in" | "auto";

export interface Transform {
  position: Vec3;
  /** Euler angles in degrees, applied X then Y then Z. */
  rotation: Vec3;
  uniformScale: number;
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
    };

export interface SourceSettings {
  transform: Transform;
  /** Scale the model so its size along `axis` is `value` mm (null = keep). */
  targetSize: { axis: "width" | "height" | "depth"; value: number } | null;
}

export type MethodId = "parallel" | "stacked" | "waffle" | "radial" | "curveNormal";

export interface ParallelParams {
  /** Direction the slicing planes are stacked along. */
  axis: "X" | "Y";
  /** Centre-to-centre spacing, mm (null = 2.5 T). */
  spacing: number | null;
  /** Offset of the first plane, 0..1 of the spacing. */
  phase: number;
  /** Fins lower than this are left out (reported), mm. */
  minFinHeight: number;
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
}

export interface JointSettings {
  slotClearance: number;
  /** null = backboard thickness. */
  tabDepth: number | null;
  tabWidth: number;
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
  material: MaterialSettings;
  joints: JointSettings;
  quality: QualitySettings;
  labels: { enabled: boolean; style: "engrave" | "score"; position: "auto-hidden-face" | "center"; prefix: string };
}

/** A slicing plane n·p = offset with an in-plane frame: part-local x along u, y along w. */
export interface Plane {
  normal: Vec3;
  offset: number;
  u: Vec3;
  w: Vec3;
}

export type PartKind = "fin" | "layer" | "rib-x" | "rib-y" | "radial-fin" | "backboard" | "hub" | "spine" | "slat" | "spacer";

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
}

export type WarningCode =
  | "NON_MANIFOLD" | "NON_MANIFOLD_SECTION" | "MIN_FEATURE_REMOVED" | "ISLAND_DROPPED" | "BRIDGE_ADDED" | "SHORT_FIN_DROPPED"
  | "DOWEL_CHAIN_SPLIT" | "CROSSING_TOO_SHORT" | "FINS_COLLIDE_AT_HUB" | "FINS_COLLIDE" | "PART_TOO_BIG" | "TOO_MANY_PARTS"
  | "SIMPLIFIED" | "METHOD_NOT_READY" | "FLOATING_PIECE";

export interface Warning {
  code: WarningCode;
  message: string;
  partIds?: string[];
}

export interface Stats {
  partCount: number;
  planeCount: number;
  /** Total cut length of all part outlines and inner cuts, mm. */
  cutLength: number;
  /** Area of all parts, mm². */
  partArea: number;
}

export interface SliceResult {
  planes: Plane[];
  /** Cleaned section per plane (before splitting into parts), part-local mm. For the debug view. */
  sections: Shape[][];
  parts: Part[];
  warnings: Warning[];
  stats: Stats;
  /** Model bounds after normalising, mm. */
  bounds: { min: Vec3; max: Vec3 };
  /** Which section algorithm ran. */
  engine: "manifold" | "fallback";
}

export interface SliceError {
  error: string;
}
