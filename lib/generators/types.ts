/**
 * The generator contract (spec §7.0). A generator is data plus pure functions: defaults, a schema
 * that drives the shell's panels, built-in presets, a deterministic build and its checks. The shell
 * (components/generators) adds material, sheet, layers, checks, export, undo and autosave.
 */
import type { FitSettings } from "@/lib/fit/fitToSheets";
import type { Layers } from "@/lib/hinge/types";
import type { Issue } from "@/lib/issues";
import type { Contour } from "@/lib/letters/types";
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
}

export const SHEET_EXTRAS: SheetExtras = { nest: "box", calibration: false, labels: false, copies: 1 };
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
  /** Engraved regions, filled (even-odd). */
  engrave?: Contour[];
  /** Engraved pictures. */
  images?: GenImage[];
  /** The pieces the cuts make (puzzles): drawn separately in 3D. */
  pieces?: Contour[];
  /**
   * Where the part sits when assembled (3D): its frame is moved by (x, y), lifted to z, turned rot° in
   * its plane. Upright parts stand on edge: their frame's y points down from height -y, they sit at
   * depth z and their thickness runs toward +y on plan. `tilt` leans an upright part (deg from
   * horizontal, 90 = upright); `yaw` turns it about the vertical (deg; 90 runs its x along +y on plan
   * with its thickness toward -x).
   */
  place?: { x: number; y: number; z: number; rot?: number; upright?: boolean; tilt?: number; yaw?: number };
  /** Thickness when it differs from the material (for example acrylic hands). */
  t?: number;
  /** Shade in 3D (1 = the material; lower is darker), for a contrasting layer. */
  tone?: number;
  /** Cut from the design's second material (packed on its own sheets). */
  material?: "main" | "second";
  /** Preview colour (thumbnails and 3D), e.g. gold mirror acrylic. */
  color?: string;
  /** The preview colour is paper or card, without a shine. */
  matte?: boolean;
}

export interface GenStat {
  label: string;
  value: string;
}

export interface GenOutput {
  parts: GenPart[];
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
}

/** Glyph outlines for a string, centred on (0, 0), y down; `height` is the cap height in mm. */
export interface TextShape {
  contours: Contour[];
  width: number;
  height: number;
  missing: string[];
}

export interface BuildContext {
  /** Shape text with a Letters font, or null while the font loads; `spacing` is extra mm between letters. */
  text?: (s: string, fontId: string, height: number, spacing?: number) => TextShape | null;
}

interface FieldCommon<P> {
  /** Dot path into the params, e.g. "face.diameter". */
  key: string;
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
}

export interface ChoiceSpec<P> extends FieldCommon<P> {
  kind: "choice";
  options: { v: string; text: string; title?: string; pro?: boolean }[];
  /** Shown as picture cards in the left rail instead of the panel. */
  rail?: boolean;
  /** Picking writes more than the key (for example a movement's sizes). */
  apply?: (p: P, v: string) => P;
}

export interface ToggleSpec<P> extends FieldCommon<P> {
  kind: "toggle";
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
}

/** A picture the user picks; stored as a JPEG data URL, its width / height in `aspectKey`. */
export interface ImageSpec<P> extends FieldCommon<P> {
  kind: "image";
  aspectKey: string;
  /** Kept in colour (a photo to print) instead of turned grey (a picture to engrave). */
  color?: boolean;
}

export type FieldSpec<P> = NumberSpec<P> | ChoiceSpec<P> | ToggleSpec<P> | TextSpec<P> | FontSpec<P> | ImageSpec<P>;

export interface SectionSpec<P> {
  id: string;
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
