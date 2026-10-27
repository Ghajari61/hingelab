/**
 * The generator contract (spec §7.0). A generator is data plus pure functions: defaults, a schema
 * that drives the shell's panels, built-in presets, a deterministic build and its checks. The shell
 * (components/generators) adds material, sheet, layers, checks, export, undo and autosave.
 */
import type { FitSettings } from "@/lib/fit/fitToSheets";
import type { Layers } from "@/lib/hinge/types";
import type { Paper, PhotoSpec, Subject } from "@/lib/imaging/photoSpec";
import type { Issue } from "@/lib/issues";
import type { Contour } from "@/lib/letters/types";
import type { Step } from "@/lib/editor/workflow";
import type { GeneratorId } from "./ids";

export type { Contour };
export type Pt = [number, number];

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] };

/** A built-in starting point: only what differs from the defaults (merged with `merge`). */
export interface GenPreset<P> {
  id: string;
  name: string;
  note: string;
  params: DeepPartial<P>;
  /** Exporting it needs the Pro plan (shown on its card). */
  pro?: boolean;
}

/** A raster picture on the engrave layer, in the part's frame (mm), clipped to `clip`. */
export interface GenImage {
  href: string;
  x: number;
  y: number;
  w: number;
  h: number;
  clip?: Contour;
  /** Drawn mirrored left to right. */
  flip?: boolean;
  /** Shown on the 3D model only, not in the cut file (a print that goes in by hand). */
  only3d?: boolean;
}

/** Settings every generator has; the shell owns their panels. */
export interface GenBase {
  name: string;
  material: string;
  /** Material thickness, mm. */
  T: number;
  /** Kerf, mm (applied once, by the shell). */
  K: number;
  bedW: number;
  bedH: number;
  gap: number;
  fit: FitSettings;
  /** Sheet extras the shell adds (missing in old saves: all off). */
  sheet?: SheetExtras;
  /** Job options the shell applies to every part (missing in old saves: off). */
  job?: JobExtras;
  layers: Layers;
}

export interface JobExtras {
  /** Mirror every part, for engraving or painting the back of clear acrylic. */
  mirror: boolean;
  /** One set of parts per line, each with the line in the generator's batch text field. */
  names: string;
}

export const JOB_EXTRAS: JobExtras = { mirror: false, names: "" };
/** Most names a batch takes, and the longest list text. */
export const MAX_BATCH = 60;
export const MAX_BATCH_TEXT = 3000;

export interface SheetExtras {
  /** Pack by bounding box (parts upright) or by outline (true shape, quarter turns). */
  nest: "box" | "outline";
  /** A scored 100 mm scale and a 10 mm test square along the bottom of every sheet. */
  calibration: boolean;
  /** Each part's name scored on it. */
  labels: boolean;
  /** Sets of parts to cut (an array of the whole design, packed together). */
  copies: number;
  /** Kerf differs by axis: `K` is across cuts along Y, `kerfY` across cuts along X (missing in old saves: off). */
  kerfXY?: boolean;
  kerfY?: number;
  /** Narrowest bar the material holds, mm; parts with thinner features are flagged (0: no check). */
  minFeature?: number;
  /** Turns outline nesting may make (the material's grain): any, half turns only, or none (missing: any). */
  rotate?: "any" | "half" | "none";
  /** Clean up the cut paths: repeated points, empty shapes and lines repeated within a part (missing: off). */
  repair?: boolean;
}

/** What a save without sheet extras means. */
export const SHEET_EXTRAS: SheetExtras = { nest: "box", calibration: false, labels: false, copies: 1 };
/** A new design's sheet extras: every key, so merging a save keeps the material ones. */
export const SHEET_DEFAULTS: Required<Omit<SheetExtras, "rotate" | "repair">> = { ...SHEET_EXTRAS, kerfXY: false, kerfY: 0.15, minFeature: 0 };
export const MAX_KERF = 2;
/** Only a guard against hand-made requests: no laser cuts anywhere near this thick. */
export const MAX_THICKNESS = 100;
export const MAX_FEATURE = 50;
export const MAX_COPIES = 50;

/** One flat part, in its own frame: mm, y down. Geometry is nominal; the shell applies the kerf. */
export interface GenPart {
  id: string;
  name: string;
  /** Outer outline (closed). */
  outer: Contour;
  /** Closed through-cuts inside the part. */
  holes: Contour[];
  /** Open cut lines inside the part (never kerf-compensated). */
  cuts?: Contour[];
  /** Scored lines (open). */
  score?: Contour[];
  /** Keep automatic part names clear of scored assembly marks. */
  labelAvoidScore?: boolean;
  /** Engraved regions, filled (even-odd). */
  engrave?: Contour[];
  /** Engraved pictures. */
  images?: GenImage[];
  /** The pieces the cuts make (puzzles): drawn separately in 3D. */
  pieces?: Contour[];
  /** Keep the part upright when nesting by outline (its X and Y are what it measures). */
  upright?: boolean;
  /**
   * Where the part sits when assembled (3D): its frame is moved by (x, y), lifted to z, turned rot° in
   * its plane. Upright parts stand on edge: their frame's y points down from height -y, they sit at
   * depth z and their thickness runs toward +y on plan. `tilt` leans an upright part (deg from
   * horizontal, 90 = upright); `yaw` turns it about the vertical (deg; 90 runs its x along +y on plan
   * with its thickness toward -x).
   */
  place?: {
    x: number; y: number; z: number; rot?: number; upright?: boolean; tilt?: number; yaw?: number;
    /**
     * Any placement, for faces folded off other faces (a paper box): a row-major 3 × 4 matrix from
     * the part's (u, v, through-thickness) to the plan (x, y toward the viewer, z up). When set, the
     * other fields are ignored.
     */
    m?: number[];
  };
  /** Exploded-view displacement in plan axes (x, y toward viewer, z up), mm. */
  apart?: [number, number, number];
  /**
   * A part that bends (a book cover round its spine) is drawn in 3D as these flat pieces instead,
   * each in its own frame and place; the cut file keeps the one part.
   */
  /** `soft`: a piece of a curved surface, drawn without an outline of its own. */
  views3d?: {
    /** Assembly identifier displayed when the individual piece is selected. */
    name?: string;
    outer: Contour; holes: Contour[]; engrave?: Contour[]; place: NonNullable<GenPart["place"]>; soft?: boolean;
    /** Its placement matrix from flat (first) to folded (last), evenly spaced, for the fold slider. */
    frames?: number[][];
    /** How far it moves when the view is fully exploded, mm (x, y toward the viewer, z up). */
    apart?: [number, number, number];
    /** Creases on it, in its outline's frame; mountain folds drawn apart from valleys. */
    creases?: { pts: Contour; mountain: boolean }[];
  }[];
  /** Thickness when it differs from the material (for example acrylic hands). */
  t?: number;
  /** Shade in 3D (1 = the material; lower is darker), for a contrasting layer. */
  tone?: number;
  /** Cut from the design's second material (packed on its own sheets). */
  material?: "main" | "second";
  /**
   * The stock it is cut from when parts of one material still need separate sheets: a colour of
   * card for a blade cutter. Parts of different stocks never share a sheet.
   */
  stock?: string;
  /** Preview colour (thumbnails and 3D), e.g. gold mirror acrylic. */
  color?: string;
  /** The preview colour is paper or card, without a shine. */
  matte?: boolean;
}

export interface GenStat {
  label: string;
  value: string;
}

/**
 * Bought parts shown in the assembled 3D view only (never cut): cords threaded through holes with
 * their knots, a hanging ring, a lamp socket and bulb, a tealight. Points are on plan (x right, y
 * toward the viewer, z up), in mm, in the same frame as the parts' placements.
 */
export type Hardware3D =
  | { kind: "cord"; pts: [number, number, number][]; d: number }
  | { kind: "knot"; at: [number, number, number]; d: number }
  | { kind: "ring"; at: [number, number, number]; r: number; d: number }
  | { kind: "cylinder"; at: [number, number, number]; r: number; h: number; color: string; metal?: boolean; glass?: boolean }
  | { kind: "bulb"; at: [number, number, number]; r: number };

export interface GenOutput {
  parts: GenPart[];
  /** Hardware drawn in the assembled 3D view (cords, knots, sockets); hidden while folding or exploded. */
  hardware?: Hardware3D[];
  stats: GenStat[];
  /** Assembly steps, in order. */
  assembly?: string[];
  /** The build could not run (bad settings). */
  error?: string;
  /** Neutral state, such as a font still loading. */
  notice?: string;
  /** Characters the chosen font has no glyph for. */
  missing?: string[];
  /** Names of the sheets' materials when some parts use the second material; `secondK` is its kerf. */
  materials?: { main: string; second: string; secondK?: number };
  /** The parts are flat layers stacked face to face (thumbnails draw only what shows from the front). */
  stacked?: boolean;
  /** The cut-out pattern's result: shapes made, and on how many parts (for the checks). */
  pattern?: { shapes: number; parts: number; windowed: boolean };
}

/** Glyph outlines for a string, centred on (0, 0), y down; `height` is the cap height in mm. */
export interface TextShape {
  contours: Contour[];
  width: number;
  height: number;
  missing: string[];
  /** Each glyph's own outlines, in the same frame and drawing order (for scoring where letters overlap). */
  glyphs?: Contour[][];
}

export interface BuildContext {
  /** Shape text with a Letters font, or null while the font loads; `spacing` is extra mm between letters. */
  text?: (s: string, fontId: string, height: number, spacing?: number) => TextShape | null;
}

interface FieldCommon<P> {
  /** Dot path into the params, e.g. "face.diameter". */
  key: string;
  /** Fine-tuning: Simple hides it (missing: by its name, lib/editor/workflow.ts). */
  advanced?: boolean;
  label: string;
  /** One sentence (ends with a period); it is the field's entry in the help centre. */
  help: string;
  show?: (p: P) => boolean;
}

export interface NumberSpec<P> extends FieldCommon<P> {
  kind: "number";
  /** "mm" fields follow the mm/inch switch. */
  unit: "mm" | "deg" | "" | "%";
  min: number;
  max: number;
  step: number;
  /** Whole numbers only (counts). */
  int?: boolean;
  /** Offer a Randomise button (seeds). */
  random?: boolean;
  /** Randomise design picks a new value: anywhere in min…max, or in the given narrower span. */
  shuffle?: true | [number, number];
}

export interface ChoiceSpec<P> extends FieldCommon<P> {
  kind: "choice";
  /** `input`: the option needs the user's own picture or text (not offered where pictures can't be picked). */
  options: { v: string; text: string; title?: string; pro?: boolean; input?: "picture" | "text" }[];
  /** Shown as picture cards in the left rail instead of the panel. */
  rail?: boolean;
  /** Picking writes more than the key (for example a movement's sizes). */
  apply?: (p: P, v: string) => P;
  /** Randomise design picks one of the (non-Pro) options. */
  shuffle?: true;
}

export interface ToggleSpec<P> extends FieldCommon<P> {
  kind: "toggle";
  /** Randomise design turns it on or off. */
  shuffle?: true;
}

export interface TextSpec<P> extends FieldCommon<P> {
  kind: "text";
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
}

export interface FontSpec<P> extends FieldCommon<P> {
  kind: "font";
  /** The text the font must cover, for the picker's warning. */
  sample?: (p: P) => string;
  /** Randomise design picks a bundled font that covers the sample's script. */
  shuffle?: true;
}

/** A picture the user picks; stored as a JPEG data URL, its width / height in `aspectKey`. */
export interface ImageSpec<P> extends FieldCommon<P> {
  kind: "image";
  aspectKey: string;
  /** Kept in colour (a photo to print) instead of turned grey (a picture to engrave). */
  color?: boolean;
  /**
   * Traced on the device instead of kept: the key gets a small grey preview, `levels` the traced
   * outlines (shadowbox/picPath.ts) and `name` the file's name. SVG files are accepted too.
   */
  trace?: { levels: string; name: string };
  /**
   * Made from an original kept on this device (never in the settings): `spec` says how (colour or
   * grey, tones, engraving dots, background) and at what size; changing a `keys` setting makes it
   * again. `src`, `name` and `px` hold the original's id on the device, its file name and the made
   * image's long side, px.
   */
  look?: {
    keys: string[];
    src: string;
    name: string;
    px: string;
    spec: (p: P) => PhotoSpec;
    /** Zoom and move the photo so a subject (its centre and height, shares of the photo) sits in the window. */
    centre?: (p: P, s: Subject) => P;
    /** Offers a print of the part that shows, as a PDF on this paper. */
    paper?: (p: P) => Paper;
  };
}

export type FieldSpec<P> = NumberSpec<P> | ChoiceSpec<P> | ToggleSpec<P> | TextSpec<P> | FontSpec<P> | ImageSpec<P>;

export interface SectionSpec<P> {
  id: string;
  /** Its workflow step (missing: lib/editor/workflow.ts decides). */
  step?: Step;
  title: string;
  /** What the section is for: the first paragraph of its help. */
  help: string;
  fields: FieldSpec<P>[];
  open?: boolean;
  show?: (p: P) => boolean;
}

export interface GeneratorHelp {
  /** Opening paragraphs of the generator's help article. */
  intro: string[];
  tips: string[];
  keywords?: string[];
}

export interface GeneratorDef<P extends GenBase> {
  id: GeneratorId;
  name: string;
  /** Geometry version, stored with saved designs for migrations. */
  version: number;
  defaults(): P;
  /** Defaults filled in under a stored or partial value (old saves, presets). */
  merge(raw: unknown): P;
  /** The text field a names batch fills (a dot path), or null when this design has none. */
  batch?(p: P): string | null;
  /** Brings params saved at an older `version` up to date (before `merge`). */
  migrate?(raw: unknown, from: number): unknown;
  sections: SectionSpec<P>[];
  presets: GenPreset<P>[];
  build(p: P, ctx: BuildContext): GenOutput;
  /** Checks with fixes; the shell adds the sheet checks. */
  check(p: P, out: GenOutput): Issue<P>[];
  /** Why exporting this design needs Pro, or null (checked again by the server). */
  pro?(p: P, out: GenOutput): string | null;
  /** Fonts the build will ask for. */
  fonts?(p: P): string[];
  /** Scale the design (Fit to sheets); omit when the design must keep its size. */
  scale?(p: P, s: number): P;
  /** Rail card picture for a choice value: SVG paths in a 64 × 44 box (filled ones first). */
  art?(key: string, value: string): { d: string; fill?: boolean }[];
  /** The params a rail card renders for a choice key (simpler than the defaults, so the cards differ clearly). */
  railPreview?(key: string, p: P, value: string): P;
  /** File name without extension. */
  fileName(p: P): string;
  /** One line under the title, e.g. "Clock · 300 mm · Roman". */
  summary(p: P): string;
  help: GeneratorHelp;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGenerator = GeneratorDef<any>;
export type GenIssue<P> = Issue<P>;
