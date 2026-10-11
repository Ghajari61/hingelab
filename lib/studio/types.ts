/**
 * HingeLab Studio document model (spec §12). The JSON document is the source of truth; the editor
 * view renders it and every edit is a pure function from one document to the next.
 * All lengths are millimetres in document space, angles are degrees unless a name says otherwise.
 */

export type Units = "mm" | "cm" | "in" | "pt";

export interface Vec { x: number; y: number }

/** SVG-style affine matrix [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Mat = [number, number, number, number, number, number];

/** "auto": handles follow the neighbouring nodes (recomputed whenever the path is edited). */
export type NodeKind = "corner" | "smooth" | "symmetric" | "auto";

/** One anchor of a cubic Bézier path. `i` and `o` are absolute control points; absent = straight. */
export interface Anchor {
  x: number;
  y: number;
  i?: Vec;
  o?: Vec;
  k?: NodeKind;
}

export interface Subpath {
  closed: boolean;
  nodes: Anchor[];
}

interface NodeBase {
  id: string;
  name?: string;
  /** Local transform relative to the parent. */
  transform: Mat;
  /** Cut layer index 0–29 (C00–C29). */
  layer: number;
  hidden?: boolean;
  locked?: boolean;
}

export interface GroupNode extends NodeBase {
  type: "group";
  children: SceneNode[];
  /** "clip": the first child clips the rest; "compound": children form one compound path. */
  role?: "clip" | "compound";
}

export interface PathNode extends NodeBase {
  type: "path";
  subpaths: Subpath[];
}

export type CornerType = "round" | "chamfer" | "inverted";

export type ShapeParams =
  | { kind: "rect"; w: number; h: number; r: [number, number, number, number]; corner: CornerType }
  | { kind: "ellipse"; rx: number; ry: number }
  | { kind: "polygon"; sides: number; r: number; round: number }
  | { kind: "star"; points: number; r: number; inner: number; round: number }
  | { kind: "arc"; r: number; start: number; sweep: number; pie: boolean }
  | { kind: "slot"; w: number; h: number }
  | { kind: "gear"; teeth: number; module: number; pressure: number; bore: number }
  | { kind: "arrow"; w: number; h: number; head: number; shaft: number }
  | { kind: "bubble"; w: number; h: number; r: number; tail: number }
  | { kind: "heart"; w: number; h: number }
  | { kind: "grid"; w: number; h: number; cols: number; rows: number }
  | { kind: "spiral"; turns: number; r: number; inner: number };

export type ShapeKind = ShapeParams["kind"];

/** A live shape keeps its parameters until it is expanded into a path. Centred on its origin. */
export interface ShapeNode extends NodeBase {
  type: "shape";
  shape: ShapeParams;
}

export interface TextNode extends NodeBase {
  type: "text";
  text: string;
  font: string;
  size: number;
  tracking: number;
  lineHeight: number;
  align: "start" | "center" | "end";
  direction: "ltr" | "rtl" | "auto";
  /** Area text wraps at this width (mm); point text when absent. */
  width?: number;
  /** Text on a path: id of a path node in the same document. */
  onPath?: string;
  /** Outlines cached at the last layout, so documents render without the font (mm, local space). */
  outline?: Subpath[];
}

export type DitherMode = "threshold" | "floyd" | "jarvis" | "stucki" | "halftone";

export interface ImageNode extends NodeBase {
  type: "image";
  assetId: string;
  w: number;
  h: number;
  dither?: { mode: DitherMode; threshold: number; dpi: number; invert: boolean };
}

export interface GeneratorNode extends NodeBase {
  type: "generator";
  generatorId: string;
  version: number;
  params: unknown;
  cachedOutputHash?: string;
}

export interface DimensionNode extends NodeBase {
  type: "dimension";
  kind: "linear" | "angular" | "radius";
  points: Vec[];
  offset: number;
}

export type SceneNode = GroupNode | PathNode | ShapeNode | TextNode | ImageNode | GeneratorNode | DimensionNode;

export type CutMode = "cut" | "score" | "fill" | "image";

export interface CutLayer {
  index: number;
  name: string;
  color: string;
  mode: CutMode;
  /** mm/s */
  speed: number;
  /** percent 0–100 */
  power: number;
  passes: number;
  /** Fill line interval, mm. */
  interval: number;
  air: boolean;
  /** Lower runs first. */
  priority: number;
  output: boolean;
  show: boolean;
  /** Kerf compensation for this layer, mm (0 = off). */
  kerf: number;
}

export interface Sheet {
  id: string;
  name: string;
  /** Position on the pasteboard, mm. */
  x: number;
  y: number;
  w: number;
  h: number;
  materialId: string;
  machineId: string;
}

export interface AssetRef {
  id: string;
  kind: "image" | "font" | "mesh";
  name: string;
  mime: string;
  bytes: number;
  /** Cloud path in Supabase Storage, when uploaded. */
  path?: string;
  hash?: string;
}

export interface Guide { axis: "x" | "y"; at: number }

export interface Document {
  id: string;
  name: string;
  schemaVersion: number;
  units: Units;
  createdAt: string;
  updatedAt: string;
  sheets: Sheet[];
  cutLayers: CutLayer[];
  root: GroupNode;
  assets: AssetRef[];
  guides: Guide[];
  grid: { size: number; subdivisions: number; show: boolean };
  snapping: { grid: boolean; points: boolean; guides: boolean; smart: boolean };
  view: { zoom: number; x: number; y: number };
  /** Set when the project was created from a template or a generator (Reset ▸ Project to Template). */
  origin?: { kind: "blank" | "generator" | "template"; id?: string };
}
