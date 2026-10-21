/** Geometry types. All lengths are millimeters. */

export type Point = [number, number];

export type Shape = "rect" | "pill" | "poly" | "cyl";
export type Lid = "open" | "fixed" | "removable";
export type Pattern = "straight" | "wave" | "relief" | "serpentine" | "honeycomb";
export type LidHole = "none" | "finger" | "knob" | "tissue" | "coin" | "rim";
export type CutStyle = "slot" | "line";

export interface LayerFlags {
  vis: boolean;
  exp: boolean;
}

export interface Params {
  name: string;
  shape: Shape;
  lid: Lid;
  pattern: Pattern;
  W: number;
  D: number;
  H: number;
  R: number;
  sides: number;
  dia: number;
  cylFlats: number;
  material: string;
  T: number;
  /** Kerf, mm; with `Ky` it is the kerf across cuts that run along Y (vertical edges). */
  K: number;
  /** Kerf across cuts that run along X, when the machine's axes cut differently (missing: same as K). */
  Ky?: number;
  /** Hinge stiffness of a material that is not built in (the user's own); built-ins use their table value. */
  gamma?: number;
  /** Narrowest bar the material holds, mm (missing: 0.9 mm, the general rule). */
  minFeature?: number;
  cutStyle: CutStyle;
  slotW: number;
  slit: number;
  bridge: number;
  pitch: number;
  overrun: number;
  stretch: number;
  tabW: number;
  slotClr: number;
  lidGap: number;
  /** The lid overhangs the walls by this much, mm (missing: 0). */
  lidOver?: number;
  /** A hole through the middle of a removable lid: to lift it with a finger or to fix a knob (missing: none). */
  lidHole?: LidHole;
  /** That hole's diameter, mm; for a tissue or coin slot, the slot's length. */
  lidHoleD?: number;
  /** Width of a tissue or coin slot, mm (missing: sized to the box). */
  lidHoleW?: number;
  /** A removable lid has a lip under it that drops inside the walls (missing: true). */
  lidLip?: boolean;
  /** Score the lip's outline on the lid, to line the lip up when gluing (missing: off). */
  lidLipScore?: boolean;
  /** A ring glued on the base, inside the wall, so the hinge has a shoulder to sit on (missing: off). */
  baseRing?: boolean;
  /** Width of that ring, mm (missing: 8). */
  baseRingW?: number;
  /** A decorative pattern cut through the lid and the wall's flat stretches (missing: none). */
  fret?: import("@/lib/generators/fretwork").FretKind;
  /** Where the pattern goes (missing: both). */
  fretOn?: "both" | "lid" | "walls";
  /** Pattern repeat, mm (missing: 16). */
  fretCell?: number;
  /** Narrowest wood between holes, mm (missing: 3). */
  fretBar?: number;
  /** The library shape a motif pattern repeats (missing: heart). */
  fretMotif?: string;
  /** Fill each face, or only a shape in its middle (missing: the whole face). */
  fretShape?: import("@/lib/generators/windowShape").PierceShape;
  /** That shape's size, % of the face (missing: 70). */
  fretSize?: number;
  /** Cut the pattern through, engrave it, or score its outlines (missing: cut). */
  fretMark?: "cut" | "engrave" | "score";
  /** Text engraved under the box, one line per line (missing: none). */
  baseText?: string;
  /** Cap height of that text, mm (missing: 5). */
  baseTextSize?: number;
  /** Its font, a Letters font id (missing: Vazirmatn Bold, Persian and Latin). */
  baseTextFont?: string;
  /** Dividers across the width, each running front to back (missing: none). */
  divX?: number;
  /** Dividers across the depth, each running left to right (missing: none). */
  divY?: number;
  /** Divider height, mm (missing or 0: as tall as fits under the lid). */
  divH?: number;
  split: number;
  /** The wall's two ends lock with fingers (missing: they only meet). */
  seamFingers?: boolean;
  bedW: number;
  bedH: number;
  gap: number;
  labels: boolean;
  testStrip: boolean;
  /** Fit to sheet (lib/fit). Missing or "off": parts in rows on one bed. */
  fit?: { mode: "off" | "sheets" | "auto"; sheets: number };
  layers: {
    outline: LayerFlags;
    slots: LayerFlags;
    hinge: LayerFlags;
    labels: LayerFlags;
  };
}

/** One flat side of the corner-radius core polygon. */
export interface Edge {
  c: Point;
  n: Point;
  len: number;
  t: Point;
  p0: Point;
  p1: Point;
  sweep: number;
  seam: boolean;
  tabs: number[];
}

export interface BBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Column kinds: `closed` has bridges at both edges, `open` reaches both edges.
 * Serpentine uses `top` (cut from the top edge) and `bottom` (cut from the bottom edge).
 */
export type ColKind = "closed" | "open" | "top" | "bottom";

export interface HingeCol {
  x: number;
  kind: ColKind;
}

export interface WallPart {
  kind: "wall";
  name: string;
  outline: Point[];
  /** Outline indices whose segment to the next vertex is a round notch cap (slot style). */
  caps: number[];
  cols: HingeCol[];
  hBody: number;
  w: number;
  label: { x: number; y: number; vertical?: boolean } | null;
  bbox: BBox;
  /** True for the bend test strip. */
  test?: boolean;
  /** True for an inside divider (a flat strip, no hinge). */
  divider?: boolean;
  /** Decorative holes cut through the strip (already kerf-compensated). */
  holes?: Point[][];
  /** The pattern engraved or scored instead of cut. */
  engrave?: Point[][];
  score?: Point[][];
}

/** Where a divider stands in the box: on the line `axis` = `at`, from `from` to `to`, `h` tall. */
export interface DividerPlace {
  axis: "x" | "y";
  at: number;
  from: number;
  to: number;
  h: number;
  name: string;
}

export interface PlatePart {
  kind: "plate";
  name: string;
  /** Corner radius of the outline; with `ek` it is before kerf. */
  r: number;
  /** Kerf across vertical and horizontal edges when they differ: the outline grows by that ellipse. */
  ek?: [number, number];
  /** Radius of the centred finger or knob hole, when there is one (the label moves below it). */
  hole?: number;
  /** Width of the band left round an open top (the label goes on it), mm. */
  rim?: number;
  /** Corner radius of a scored outline on the plate (the lid lip's place on the lid), before kerf. */
  scoreR?: number;
  edges: Edge[];
  slots: Point[][];
  /** The pattern engraved or scored instead of cut. */
  engrave?: Point[][];
  score?: Point[][];
  bbox: BBox;
}

export type Part = WallPart | PlatePart;

export interface HingeSegments {
  closed: [number, number][];
  open: [number, number][];
  Lp: number;
  n: number;
}

export interface Issue {
  lvl: "warn" | "info";
  msg: string;
}

export interface BendResult {
  rMin: number;
  ratio: number;
  verdict: "ok" | "warn" | "err";
  barLen: number;
  barW: number;
  Lp: number;
  nSeg: number;
}

export interface Analysis extends BendResult {
  columns: number;
}

export interface AutoFitResult {
  ok: boolean;
  q: Params;
  a: BendResult;
}

export interface Model {
  core: { edges: Edge[]; R: number };
  R: number;
  rN: number;
  L: number;
  hBody: number;
  parts: Part[];
  cols: HingeCol[];
  hs: HingeSegments;
  issues: Issue[];
  /** Length of the longest merged hinge zone along the strip. */
  zoneLen: number;
  analysis: Analysis;
  /** Inside dividers, when there are any. */
  dividers?: DividerPlace[];
}

export interface ModelError {
  error: string;
}

export type ComputeResult = Model | ModelError;

export interface LayoutItem<T = Part> {
  pt: T;
  i: number;
  w: number;
  h: number;
  ox: number;
  oy: number;
}

export interface Layout<T = Part> {
  items: LayoutItem<T>[];
  width: number;
  height: number;
}

/** Export-layer switches shared by every product. */
export type LayerKey = "outline" | "slots" | "hinge" | "labels";
export type Layers = Record<LayerKey, LayerFlags>;

export interface LabelMark {
  x: number;
  y: number;
  text: string;
  size: number;
  /** Rotation in degrees around (x, y); -90 for vertical labels. */
  rot?: number;
}

export interface LayerContent {
  outline: string[];
  slots: string[];
  hinge: string[];
  labels: LabelMark[];
  fills: string[];
  /** Scored lines (missing when a design has none, so its file has no score layer). */
  score?: string[];
  /** Filled engraving (text under the box), even-odd paths; missing when there is none. */
  engrave?: string[];
}

export interface ExportLayer {
  key: LayerKey;
  name: string;
  code: string;
  color: string;
  ui: string;
}

export type Seg =
  | { kind: "edge"; i: number; from: number; to: number; x0: number }
  | { kind: "arc"; i: number; x0: number; len: number };
