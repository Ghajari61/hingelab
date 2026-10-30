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
  /** A connector: `subpaths` is rerouted between the two objects by links.ts `syncLinks` whenever either moves. */
  connector?: Connector;
}

export type ConnectorMode = "straight" | "orthogonal" | "rounded";
export interface Connector { from: string; to: string; mode: ConnectorMode }

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

/** Solid Shadow: the shape swept `depth` mm towards `angle` (degrees, 0 = right, 90 = down). */
export interface BlockShadowParams { angle: number; depth: number; /** separate: shape + shadow piece; fused: one outline; shadow: the shadow piece alone */ output: "separate" | "fused" | "shadow" }
/** Depth (extrusion): a back face `depth` mm towards `angle`, shrunk to `scale` for perspective, joined by side edges; `hidden` drops lines behind the front. */
export interface DepthParams { angle: number; depth: number; scale: number; hidden: boolean }

/** Symmetry (CorelDRAW's Symmetry drawing): `lines` mirror lines through a centre, the first at `angle` degrees; the artwork repeats in every wedge, mirrored in turn. */
export interface SymmetryParams { lines: number; angle: number; cx: number; cy: number; fuse: boolean }

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

/**
 * An effect that reads another object: `link` is its id; links.ts `syncLinks` keeps `linkCache` (that
 * object's geometry after its own effects, in the space named by effects/meta.ts LINK_SPACE) current.
 * `linkError` says why the link is off ("missing": the object was deleted; "cycle": it depends on this one).
 */
export interface LinkedParams { link?: string; linkCache?: Subpath[]; linkError?: "missing" | "cycle" }

export type PatternMode = "single" | "singleStretched" | "repeated" | "repeatedStretched";
export interface PatternAlongPathParams extends LinkedParams {
  mode: PatternMode;
  /** Gap between copies along the path, mm. */
  spacing: number;
  /** Shifts the pattern across the path (along its normal), mm. */
  normalOffset: number;
  /** Scales the pattern across the path. */
  widthScale: number;
  rotate90: boolean;
}

export interface BendParams {
  /** The guide the artwork follows, in the object's own coordinates. */
  guide: Subpath;
  /** Scales the artwork across the guide. */
  widthScale: number;
  /** The width also scales with the guide's length / the artwork's length (keeps proportions). */
  widthInLength: boolean;
  /** The artwork runs top to bottom: it is bent along its height instead of its width. */
  vertical: boolean;
}

export interface EnvelopeParams {
  mode: "bilinear" | "perspective";
  /** Where the corners of the artwork's box go (object coordinates): top left, top right, bottom right, bottom left. */
  tl: Vec; tr: Vec; br: Vec; bl: Vec;
}

export interface RoughenParams {
  subdivide: "length" | "count";
  /** Longest piece after splitting, mm ("length"). */
  maxSegment: number;
  /** Pieces per segment ("count"). */
  segments: number;
  direction: "xy" | "normal";
  /** Largest displacement along x and y ("xy") or along the normal ("normal"), mm. */
  maxX: number; maxY: number; maxNormal: number;
  smooth: boolean;
  seed: number;
}

export interface InterpolateParams extends LinkedParams {
  /** Shapes between the two ends. */
  steps: number;
  /** "time": equal steps of the blend; "size": steps enclose equal increments of area. */
  spacing: "time" | "size";
}

export interface TaperStrokeParams {
  width: number;
  /** Taper lengths, % of the path length. */
  start: number;
  end: number;
  /** 0: straight taper; 1: rounded (smoothstep) taper ends. */
  smoothing: number;
}

export interface PowerStrokeParams {
  /** Width control points: position 0–1 along the path and width in mm. */
  points: { t: number; w: number }[];
  interpolation: "linear" | "smooth";
}

export interface MeasureSegmentsParams {
  decimals: number;
  prefix: string;
  suffix: string;
  showUnit: boolean;
  /** Distance of the dimension line from the path, mm (negative: other side). */
  offset: number;
  ends: "arrows" | "ticks" | "none";
  /** Label height on the page, mm. */
  fontSize: number;
}

export type LiveBooleanOp = "union" | "difference" | "intersection" | "exclusion" | "division" | "cut";
export interface LiveBooleanParams extends LinkedParams { op: LiveBooleanOp }

export interface DistortParams {
  mode: "pushPull" | "zipper" | "twister";
  /** Push & Pull, −100…100 %: positive pushes the nodes out (pointed), negative pulls them in (petals). */
  amount: number;
  /** Zipper: height of each zigzag, mm. */
  amplitude: number;
  /** Zipper: zigzags per segment. */
  frequency: number;
  /** Zipper: rounded waves instead of sharp teeth. */
  smooth: boolean;
  /** Zipper: seeded random heights. */
  random: boolean;
  seed: number;
  /** Twister: turn at the farthest point from the centre, degrees (negative: anticlockwise). */
  angle: number;
  /** Centre for Push & Pull and Twister (object coordinates). */
  cx: number; cy: number;
}

export interface EffectParamsMap {
  corners: CornersParams;
  offset: OffsetParams;
  hatches: HatchParams;
  rotateCopies: RotateCopiesParams;
  mirror: MirrorParams;
  symmetry: SymmetryParams;
  blockShadow: BlockShadowParams;
  depth: DepthParams;
  livingHinge: LivingHingeParams;
  patternAlongPath: PatternAlongPathParams;
  bend: BendParams;
  envelope: EnvelopeParams;
  roughen: RoughenParams;
  interpolate: InterpolateParams;
  taperStroke: TaperStrokeParams;
  powerStroke: PowerStrokeParams;
  measureSegments: MeasureSegmentsParams;
  liveBoolean: LiveBooleanParams;
  distort: DistortParams;
}

export type EffectKind = keyof EffectParamsMap;

/** One entry of an object's Live Effects stack; evaluated in order in the object's own coordinates. */
export type LiveEffect = { [K in EffectKind]: { id: string; kind: K; enabled: boolean; params: EffectParamsMap[K] } }[EffectKind];

export type CornerType = "round" | "chamfer" | "inverted";

export type ShapeParams =
  | { kind: "rect"; w: number; h: number; r: [number, number, number, number]; corner: CornerType }
  | { kind: "ellipse"; rx: number; ry: number }
  | { kind: "polygon"; sides: number; r: number; round: number }
  | { kind: "star"; points: number; r: number; inner: number; round: number; /** Crossed star: join every `skip` points (2 or more); 0 for a plain star. */ skip?: number }
  | { kind: "arc"; r: number; start: number; sweep: number; pie: boolean }
  | { kind: "slot"; w: number; h: number }
  | { kind: "gear"; teeth: number; module: number; pressure: number; bore: number }
  | { kind: "arrow"; w: number; h: number; head: number; shaft: number }
  | { kind: "bubble"; w: number; h: number; r: number; tail: number }
  | { kind: "heart"; w: number; h: number }
  | { kind: "grid"; w: number; h: number; cols: number; rows: number }
  | { kind: "spiral"; turns: number; r: number; inner: number }
  /** A ready shape from the Shape Library (shapeLibrary.ts), drawn into its box. */
  | { kind: "library"; id: string; w: number; h: number }
  /** Burst Lines: rays between an inner and outer radius; `width` 0–1 of each ray's slot; `jitter` 0–1. */
  | { kind: "burst"; rays: number; r: number; inner: number; width: number; jitter: number; seed: number };

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
  /** Text on a path: id of the object whose (first) outline the baseline follows. */
  onPath?: string;
  /** Text on a path: where the text is anchored, % of the path length (0 when absent). */
  pathStart?: number;
  /** Text on a path: "right" puts the text on the other side (the path is read backwards). */
  pathSide?: "left" | "right";
  /** Flowed text: id of the closed shape whose inside the lines fill. */
  flowInto?: string;
  /**
   * The `onPath` / `flowInto` object's geometry in this text's own coordinates, kept by links.ts
   * `syncLinks`. Kept as it was when that object is deleted, so the text keeps its shape.
   */
  frame?: Subpath[];
  /** Vertical writing: characters top to bottom, lines (columns) right to left. */
  vertical?: boolean;
  /** Manual kerning: extra space before the character at this index of `text` (1/1000 em). */
  kerns?: Record<number, number>;
  /** Baseline shift of the character at this index (1/1000 em; up, or right in vertical text). */
  shifts?: Record<number, number>;
  /** Turn of the glyph that starts at this character index (degrees, clockwise). */
  rotations?: Record<number, number>;
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

export type DimensionKind = "linear" | "horizontal" | "vertical" | "angular" | "radius" | "diameter" | "callout";

export interface DimensionNode extends NodeBase {
  type: "dimension";
  /** linear (parallel to the points), horizontal, vertical: two points; angular: vertex and two arm points; radius, diameter: centre and rim. */
  kind: DimensionKind;
  points: Vec[];
  /** Distance of the dimension line from the measured points, mm (angular: the arc's radius, 0 = automatic). */
  offset: number;
  /** A label of its own instead of the measured value. */
  text?: string;
}

/**
 * A live copy of another object (`source`, any node id). `cache` is the source's geometry after its
 * Live Effects, in the source's parent space (the source's own transform applied), kept up to date by
 * links.ts `syncLinks`; the clone's transform is applied on top, so an identity clone beside its
 * source sits exactly on it.
 */
export interface CloneNode extends NodeBase {
  type: "clone";
  source: string;
  cache?: Subpath[];
  effects?: LiveEffect[];
}

export type SceneNode = GroupNode | PathNode | ShapeNode | TextNode | ImageNode | GeneratorNode | DimensionNode | CloneNode;

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

export type GridKind = "rectangular" | "axonometric" | "modular" | "polar";

/**
 * The document grid. `size` is the major spacing and `subdivisions` the minor lines per major one
 * (rings for polar). Every other field is optional (older documents have none): a missing `kind` is
 * the rectangular grid, which always starts at 0,0.
 */
export interface GridSpec {
  size: number;
  subdivisions: number;
  show: boolean;
  kind?: GridKind;
  /** Axonometric, modular and polar grids start here (polar: the centre), mm. */
  originX?: number;
  originY?: number;
  /** Axonometric: angles of the two slanted line families from the horizontal, degrees (30/30 = isometric). */
  angleX?: number;
  angleZ?: number;
  /** Modular: module size and the gutter between modules, mm. */
  moduleW?: number;
  moduleH?: number;
  gutterX?: number;
  gutterY?: number;
  /** Polar: spokes per full turn. */
  divisions?: number;
}

/**
 * Snapping bar toggles. All optional (older documents have none); an absent toggle means its default
 * (snap.ts SNAP_DEFAULTS), which is exactly how snapping worked before the bar.
 */
export interface SnapToggles {
  /** Master switch: off disables every snap target, grid included. */
  enabled?: boolean;
  mode?: "simple" | "advanced";
  bboxEdges?: boolean;
  bboxCorners?: boolean;
  bboxMidpoints?: boolean;
  bboxCentres?: boolean;
  nodesCusp?: boolean;
  nodesSmooth?: boolean;
  pathOutline?: boolean;
  pathIntersections?: boolean;
  /** Object centres and the moved rotation centre. */
  centres?: boolean;
  textBaseline?: boolean;
  pageEdges?: boolean;
  pageCentre?: boolean;
}

/** How the sheet looks on screen only (material preview); never exported. */
export type SheetBackground = "none" | "wood" | "acrylic" | "cardboard" | "mdf";

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
  grid: GridSpec;
  /** Screen-only material preview behind the sheets; none when absent. */
  background?: SheetBackground;
  snapping: { grid: boolean; points: boolean; guides: boolean; smart: boolean } & SnapToggles;
  view: { zoom: number; x: number; y: number };
  /** Set when the project was created from a template or a generator (Reset ▸ Project to Template). */
  origin?: { kind: "blank" | "generator" | "template"; id?: string };
  /** The 3D assembly view's settings and the hand adjustments made there (lib/studio/assembly). */
  assembly?: AssemblySettings;
}

/** A part moved or turned by hand in the 3D assembly view, on top of where the solver put it. */
export interface PartAdjust {
  /** mm along the 3D axes (x right, y back, z up). */
  move?: [number, number, number];
  /** Degrees about the part's own centre, applied x, then y, then z. */
  turn?: [number, number, number];
  /** Laid flat beside the assembly instead of joined. */
  flat?: boolean;
  hidden?: boolean;
}

export interface AssemblySettings {
  /** Parts that join nothing: beside the assembly as they lie on the sheet, or stacked as layers. */
  loose?: "beside" | "stack";
  /** Apply the safe fixes when the 3D view opens (on unless false). */
  autoFix?: boolean;
  /** Adjustments by part key ("nodeId:subpath"). */
  parts?: Record<string, PartAdjust>;
}
