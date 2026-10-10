/**
 * Letters types. All lengths are millimeters, y points down (SVG), like lib/hinge.
 *
 * Orientation convention: outer contours run clockwise on screen (positive Clipper area),
 * holes run counter-clockwise on screen (negative area).
 */
import type { BBox, CutStyle, HingeCol, LabelMark, Layers, Lid, Pattern, Point } from "@/lib/hinge";

export type { Point };

/** A closed polygon without a repeated last point. */
export type Contour = Point[];

export type LetterMode = "box" | "solid" | "stencil";
export type Direction = "auto" | "ltr" | "rtl";
/** Letter Box walls: one living-hinge strip per outline, or flat panels joined at the corners. */
export type WallStyle = "hinge" | "faceted";

export interface LetterParams {
  name: string;
  text: string;
  fontId: string;
  direction: Direction;
  sizeMode: "capHeight" | "totalHeight";
  size: number;
  letterSpacing: number;
  weld: "word" | "letters";
  mode: LetterMode;

  thicken: number;
  /** null = automatic: 2*T + 6 in box mode, 2 mm otherwise. */
  minFeature: number | null;

  depth: number;
  lid: Lid;
  wallStyle: WallStyle;
  /** Faceted walls: the outline is approximated by flat panels at most this far from it, mm. */
  facetTol: number;
  /** Faceted walls: shortest panel, mm. */
  panelMin: number;
  minCornerRadius: "auto" | number;
  smallIslands: "flat" | "drop";
  islandArea: number;
  marquee: { enabled: boolean; holeDia: number; spacing: number; margin: number };
  /** null = bed width - 20. */
  wallMaxLength: number | null;

  /** null = max(2, T). */
  stencilBridge: number | null;
  bridgesPerIsland: 1 | 2;
  weldDots: boolean;
  sheetMargin: number;

  material: string;
  T: number;
  K: number;
  cutStyle: CutStyle;
  slotW: number;
  pattern: Pattern;
  slit: number;
  bridge: number;
  pitch: number;
  overrun: number;
  stretch: number;
  tabW: number;
  slotClr: number;
  lidGap: number;
  bedW: number;
  bedH: number;
  gap: number;
  labels: boolean;
  layers: Layers;
}

/** One filled region: an outer contour plus its holes. */
export interface Shape {
  outer: Contour;
  holes: Contour[];
  /** Filled area in mm² (outer minus holes). */
  area: number;
  bbox: BBox;
  /** Index of the weld group (word or cluster) the shape came from. */
  group: number;
}

export interface ShapedGlyph {
  gid: number;
  /** Index of the first UTF-16 code unit of the cluster in the text. */
  cluster: number;
  /** Pen position of the glyph origin in mm (baseline at y = 0). */
  x: number;
  y: number;
  notdef: boolean;
}

export interface ShapedText {
  glyphs: ShapedGlyph[];
  direction: "ltr" | "rtl";
  /** Millimeters per font unit after sizing. */
  scale: number;
  /** Characters the font does not contain. */
  missing: string[];
}

/** A weld group: one word (weld = word) or one glyph cluster (weld = letters). */
export interface Group {
  text: string;
  contours: Contour[];
}

export interface Bridge {
  /** The connecting segment between two pieces. */
  a: Point;
  b: Point;
  poly: Contour;
}

export interface SolidPart {
  kind: "solid";
  name: string;
  outer: Contour;
  holes: Contour[];
  bbox: BBox;
  /** Engraving position (inside the material) and text size. */
  label: { x: number; y: number; size: number };
}

/** A text mark engraved on a part (seam marks, panel numbers), part coordinates. */
export type PartMark = LabelMark;

/** One unrolled living-hinge wall strip. x runs along the wall, y from the lid side (0) to the base side. */
export interface StripPart {
  kind: "strip";
  name: string;
  outline: Point[];
  /** Outline indices whose segment is a round notch cap (slot cut style). */
  caps: number[];
  cols: HingeCol[];
  hBody: number;
  w: number;
  /** Tab centres along the strip. */
  tabs: number[];
  label: { x: number; y: number } | null;
  marks: PartMark[];
  bbox: BBox;
}

/** One flat wall panel of a faceted letter box. */
export interface PanelPart {
  kind: "panel";
  name: string;
  outline: Point[];
  hBody: number;
  w: number;
  tabs: number[];
  label: { x: number; y: number } | null;
  bbox: BBox;
}

/** Base, lid or lid lip of a letter box: the letter shape with tab slots. */
export interface PlatePart {
  kind: "plate";
  name: string;
  outer: Contour;
  holes: Contour[];
  slots: Contour[];
  marks: PartMark[];
  label: { x: number; y: number; size: number };
  bbox: BBox;
}

export type LetterPart = SolidPart | StripPart | PanelPart | PlatePart;

/** A stretch of a wall centerline, by arc length from the wall's start (its first seam). */
export interface Zone {
  s0: number;
  s1: number;
  kind: "flat" | "curve";
  /** Curve zones: tightest centerline radius. */
  rTight: number;
  verdict: "ok" | "tight" | "crack" | null;
  /** A 10 mm flat placed inside a curve so a seam can go there (glue a backing strip). */
  splice: boolean;
}

/** A joint between two panels of a faceted wall. */
export interface Joint {
  /** Arc length of the corner on the faceted centerline. */
  s: number;
  /** Signed turn in degrees. */
  turn: number;
  kind: "finger" | "butt";
}

/** One closed wall around one contour (an outer outline or a counter). */
export interface Wall {
  /** Letter or letter group the wall belongs to. */
  letter: string;
  contour: string;
  style: WallStyle;
  /** The wall centerline, starting at its first seam (faceted: the panel corners). */
  centerline: Contour;
  length: number;
  zones: Zone[];
  seams: number[];
  /** Tab centres by arc length along the centerline. */
  tabs: number[];
  joints: Joint[];
  /** Slot rectangles for the plates, one per tab. */
  slots: Contour[];
  /** Strip or panel lengths, in order. */
  pieceLengths: number[];
}

/** Per-letter summary for the Analysis panel. */
export interface BoxLetterStat {
  letter: string;
  perimeter: number;
  pieces: number;
  zones: number;
  rTight: number;
  verdict: "ok" | "tight" | "crack" | null;
}

export interface BoxInfo {
  style: WallStyle;
  hBody: number;
  /** Corner radius used for rounding the letters, mm. */
  rCorner: number;
  /** Smallest bend radius of the hinge lattice (bend estimate), mm. */
  rMin: number;
  /** Letter shapes after corner rounding (faceted: the flat-panel outline). */
  filleted: Shape[];
  walls: Wall[];
  letters: BoxLetterStat[];
}

export interface LetterIssue {
  lvl: "warn" | "info";
  msg: string;
}

export interface LetterModel {
  mode: LetterMode;
  shaped: ShapedText;
  groups: Group[];
  /** Unioned (and thickened) shapes before welding, for the debug view. */
  shapes: Shape[];
  /** Shapes smaller than islandArea (dots, accents). */
  islands: Shape[];
  bridges: Bridge[];
  /** Material an opening of width minFeature removes (strokes thinner than minFeature). */
  thin: Shape[];
  parts: LetterPart[];
  issues: LetterIssue[];
  /** Ink bounding box of the text before layout. */
  bbox: BBox;
  /** Letter Box mode only. */
  box: BoxInfo | null;
}

export interface LetterError {
  error: string;
}

export type LetterResult = LetterModel | LetterError;
