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
  effects?: LiveEffect[];
}

// ---------- Live Effects ----------

/** Corner treatment of Corners: "inverse" variants mirror the fillet / chamfer about its chord (a notch). */
export type CornerMode = "fillet" | "inverseFillet" | "chamfer" | "inverseChamfer";

export interface CornersParams {
  mode: CornerMode;
  /** Fillet radius, mm; chamfers cut where the fillet would touch the edges. */
  radius: number;
  /** Node indices per subpath of the effect's input; absent = every sharp corner. */
  nodes?: number[][];
}

export interface OffsetParams { distance: number; join: "round" | "miter" | "bevel"; miterLimit: number }

export interface HatchParams {
  /** Line direction, degrees. */
  angle: number;
  spacing: number;
  /** Shifts the lines across their direction, mm. */
  phase: number;
  /** Adds a second set of lines at 90°. */
  cross: boolean;
  /** Lines stop this far inside the outline, mm. */
  inset: number;
  keepOutline: boolean;
}

export interface RotateCopiesParams { count: number; start: number; cx: number; cy: number; fuse: boolean }

export interface MirrorParams {
  axis: "vertical" | "horizontal" | "line";
  /** Vertical axis at x, horizontal axis at y (local mm). */
  x: number;
  y: number;
  /** Free axis through (x1, y1) and (x2, y2). */
  x1: number; y1: number; x2: number; y2: number;
  keepOriginal: boolean;
  fuse: boolean;
}

/** lib/hinge parameters of the Living Hinge effect (names as in lib/hinge Params). */
export interface LivingHingeParams {
  pattern: "straight" | "wave" | "relief" | "serpentine";
  cutStyle: "slot" | "line";
  slit: number;
  bridge: number;
  pitch: number;
  slotW: number;
  kerf: number;
  material: string;
  thickness: number;
  /** 0: cuts run top to bottom (bends around a vertical axis); 90: left to right. */
  angle: 0 | 90;
  margin: number;
  keepOutline: boolean;
}

export interface EffectParamsMap {
  corners: CornersParams;
  offset: OffsetParams;
  hatches: HatchParams;
  rotateCopies: RotateCopiesParams;
  mirror: MirrorParams;
  livingHinge: LivingHingeParams;
}

export type EffectKind = keyof EffectParamsMap;

/** One entry of an object's Live Effects stack; evaluated in order in the object's own coordinates. */
export type LiveEffect = { [K in EffectKind]: { id: string; kind: K; enabled: boolean; params: EffectParamsMap[K] } }[EffectKind];

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
  effects?: LiveEffect[];
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
  effects?: LiveEffect[];
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
