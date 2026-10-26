/** Geometry types. All lengths are millimeters. */

export type Point = [number, number];

export type Shape = "rect" | "pill" | "poly" | "cyl";
/**
 * open: no lid. fixed: glued on the wall's top tabs. removable: lifts off, with a lip.
 * flip: one plate with a living-hinge band across it, the strip behind the band fixed to the walls
 * (a flip-top box, or a cabinet door when the box stands up). cap: a shallow second box that slips
 * over the top (a shoebox or hat-box lid).
 */
export type Lid = "open" | "fixed" | "removable" | "flip" | "cap";
/** The side a flip lid's hinge band runs along, seen from above (back is the top of the drawing). */
export type FlipSide = "back" | "left" | "right" | "front";
export type Pattern = "straight" | "wave" | "relief" | "serpentine" | "honeycomb";
export type LidHole = "none" | "finger" | "knob" | "tissue" | "coin" | "rim" | "lamp";
/** An opening through the base: a round hole (drain, cord) or an open bottom with a rim. */
export type BaseHole = "none" | "hole" | "rim";
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
  /** Flip lid: the side its hinge band runs along (missing: back). */
  flipSide?: FlipSide;
  /** Flip lid: width of the living-hinge band, mm (missing: wide enough to open about 105°). */
  flipBand?: number;
  /** Flip lid: width of the strip behind the band that is fixed to the walls, mm (missing: auto). */
  flipFixed?: number;
  /** Cap lid: its outside height, how far it comes down over the box, mm (missing: auto). */
  capH?: number;
  /** Extra plates stacked on a fixed, removable or cap lid, each smaller: a stepped top (missing: 0). */
  lidSteps?: number;
  /** How much smaller each step is all round, mm (missing: 6). */
  lidStepIn?: number;
  /** A clear plate under an open-top (rim) lid: a display window (missing: off). */
  lidWindow?: boolean;
  /** An opening through the base (missing: none). */
  baseHole?: BaseHole;
  /** The base hole's diameter, mm (missing: 10). */
  baseHoleD?: number;
  /** The open bottom's rim width, mm (missing: as a lid's rim). */
  baseHoleW?: number;
  /** Two keyhole slots near the top of the base, to hang the box on screws (missing: off). */
  hangHoles?: boolean;
  /** Show the box stood up on a wall, base at the back and lid at the front: a cabinet (missing: off). */
  upright?: boolean;
  /** Drawers in an upright, open-fronted case: 0 to 4 (missing: 0). */
  drawers?: number;
  /** What each drawer front has to pull it by (missing: knob). */
  drawerPull?: "knob" | "finger" | "none";
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
  /** The strip's own slit intervals, when it is not as tall as the box's wall (a cap or drawer wall). */
  hs?: HingeSegments;
  /** Its own lattice, when it was fitted to its shorter wall. */
  lattice?: Partial<Pick<Params, "pitch" | "bridge" | "slit" | "slotW">>;
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
  /** The outline as points, already kerf-compensated, when it is not the rounded core (a clipped window). */
  pts?: Point[];
  /** Living-hinge cuts in the plate (a flip lid's band): closed slots, and single-line cuts. */
  hinge?: Point[][];
  hingeLines?: Point[][];
  /** Cut from clear acrylic, not the box's material. */
  clear?: boolean;
  /** Leave the text under the box off this plate (it has an opening in the middle). */
  noText?: boolean;
  /** Where the part's name goes, when not in the middle (a flip lid's flap). */
  labelAt?: Point;
  bbox: BBox;
}

export type Part = WallPart | PlatePart;

/** A flip lid's hinge: band from `from` to `to` along the unit vector `a` (towards the hinge side). */
export interface FlipInfo {
  a: Point;
  from: number;
  to: number;
  /** About how far the lid opens before the band is bent to its limit, degrees. */
  angle: number;
}

/** A cap lid's body, for the 3D view: its core, corner radius, wall height and outside height. */
export interface CapInfo {
  edges: Edge[];
  R: number;
  hBody: number;
  H: number;
}

/** A drawer, for the 3D view: centred at y = `cy` in the case, `w` wide, `h` tall and `d` deep; its front `fw` × `fh`. */
export interface DrawerPlace {
  name: string;
  cy: number;
  w: number;
  h: number;
  d: number;
  r: number;
  fw: number;
  fh: number;
}

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
  /** A flip lid's hinge band. */
  flip?: FlipInfo;
  /** A cap lid's body. */
  cap?: CapInfo;
  /** Drawers, when the box is a chest of drawers. */
  drawerPlaces?: DrawerPlace[];
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
