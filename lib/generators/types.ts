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
  layers: Layers;
}

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
  /** Where the part sits when assembled (3D): its frame is moved by (x, y), lifted to z, turned rot°. */
  place?: { x: number; y: number; z: number; rot?: number; upright?: boolean };
  /** Thickness when it differs from the material (for example acrylic hands). */
  t?: number;
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
}

/** Glyph outlines for a string, centred on (0, 0), y down; `height` is the cap height in mm. */
export interface TextShape {
  contours: Contour[];
  width: number;
  height: number;
  missing: string[];
}

export interface BuildContext {
  /** Shape text with a Letters font, or null while the font loads. */
  text?: (s: string, fontId: string, height: number) => TextShape | null;
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

/** A picture the user picks; stored as a grey JPEG data URL, its width / height in `aspectKey`. */
export interface ImageSpec<P> extends FieldCommon<P> {
  kind: "image";
  aspectKey: string;
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
  /** File name without extension. */
  fileName(p: P): string;
  /** One line under the title, e.g. "Clock · 300 mm · Roman". */
  summary(p: P): string;
  help: GeneratorHelp;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGenerator = GeneratorDef<any>;
export type GenIssue<P> = Issue<P>;
