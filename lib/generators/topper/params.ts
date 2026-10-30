import { DEFAULTS as HINGE, clone } from "@/lib/hinge/defaults";
import { FIT_OFF } from "@/lib/fit/fitToSheets";
import { isMotifKind } from "../motifs";
import { MOTIF_ART, cleanMotifArt, type MotifArt } from "../motifArt";
import { isShapeKind, type ShapeKind } from "../shapes";
import { SECOND_MATERIALS } from "../material2";
import { JOB_EXTRAS, SHEET_DEFAULTS, type GenBase } from "../types";
import { TEXT_FORM, TEXT_STYLE, cleanTextForm, cleanTextStyle, type TextForm, type TextStyle } from "../textStyle";
import { mergeInto } from "../util";

export type KitKind = "topper" | "cupcake" | "set";
export type TopperStyle = "letters" | "outline" | "layered" | "plate" | "hoop" | "shaker";
export type MotifPlace = "above" | "below" | "left" | "right" | "both" | "behind";
export type TextMark = "engrave" | "score" | "none";
export type CupShape = ShapeKind | "motif";

export interface TopperParams extends GenBase {
  kit: { kind: KitKind };
  text: {
    text: string;
    fontId: string;
    /** Cap height, mm. */
    size: number;
    /** Extra space between letters, mm (negative joins script letters). */
    spacing: number;
    /** Line pitch, × cap height. */
    lead: number;
  };
  style: {
    kind: TopperStyle;
    /** Letters style: how much the letters grow so they fuse, mm. */
    weld: number; noWeld: boolean; operation: "cut" | "score";
    /** Outline, layered and plate styles: the border around the letters, mm. */
    border: number;
    /** How the text shows on a silhouette or plate. */
    mark: TextMark;
  };
  textStyle: TextStyle;
  textForm: TextForm;
  motif: { kind: string; place: MotifPlace; size: number; gap: number; art: MotifArt };
  plate: { shape: ShapeKind; auto: boolean; pad: number; width: number; height: number; corner: number; frame: boolean };
  sticks: { count: number; length: number; width: number; tip: number; spread: number };
  /** Hoop: width of the ring the letters cross; shaker: width of the spacer walls and how many spacer layers hold the sprinkles. */
  frame: { band: number; spacers: number };
  cupcake: {
    count: number;
    shape: CupShape;
    /** Width of each pick, mm. */
    size: number;
    motif: string;
    /** The user's own picture or text, for the "picture" and "text" motifs. */
    art: MotifArt;
    /** One name per line; picks cycle through them. */
    text: string;
    fontId: string;
    textSize: number;
    stick: number;
    /** The motif and name as a second-material layer instead of engraving. */
    layered: boolean;
  };
  mat: { mat2: string; T2: number };
}

export const TOPPER_DEFAULTS: TopperParams = {
  name: "Cake topper",
  material: "acr3",
  T: 3,
  K: 0.1,
  bedW: 600,
  bedH: 400,
  gap: 4,
  fit: { ...FIT_OFF },
  sheet: { ...SHEET_DEFAULTS },
  job: { ...JOB_EXTRAS },
  layers: clone(HINGE.layers),
  kit: { kind: "topper" },
  text: { text: "Happy\nBirthday", fontId: "pacifico", size: 34, spacing: -0.5, lead: 1.25 },
  style: { kind: "letters", weld: 1, noWeld: false, operation: "cut", border: 4, mark: "engrave" },
  textStyle: { ...TEXT_STYLE },
  textForm: { ...TEXT_FORM },
  motif: { kind: "none", place: "above", size: 40, gap: 0, art: { ...MOTIF_ART } },
  plate: { shape: "arch", auto: true, pad: 10, width: 180, height: 120, corner: 4, frame: true },
  sticks: { count: 2, length: 90, width: 7, tip: 14, spread: 45 },
  frame: { band: 5, spacers: 2 },
  cupcake: { count: 12, shape: "circle", size: 55, motif: "heart", art: { ...MOTIF_ART }, text: "", fontId: "pacifico", textSize: 9, stick: 70, layered: false },
  mat: { mat2: "acrylic-gold", T2: 3 },
};

const KITS: KitKind[] = ["topper", "cupcake", "set"];
const STYLES: TopperStyle[] = ["letters", "outline", "layered", "plate", "hoop", "shaker"];
const PLACES: MotifPlace[] = ["above", "below", "left", "right", "both", "behind"];
const MARKS: TextMark[] = ["engrave", "score", "none"];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function mergeTopper(raw: unknown): TopperParams {
  const d = TOPPER_DEFAULTS;
  const p = mergeInto(clone(d), raw);
  if (!KITS.includes(p.kit.kind)) p.kit.kind = d.kit.kind;
  p.textStyle = cleanTextStyle(p.textStyle);
  p.textForm = cleanTextForm(p.textForm);
  if (!STYLES.includes(p.style.kind)) p.style.kind = d.style.kind;
  if (!MARKS.includes(p.style.mark)) p.style.mark = d.style.mark;
  if (!PLACES.includes(p.motif.place)) p.motif.place = d.motif.place;
  if (p.motif.kind !== "none" && !isMotifKind(p.motif.kind)) p.motif.kind = "none";
  p.motif.art = cleanMotifArt(p.motif.art);
  p.cupcake.art = cleanMotifArt(p.cupcake.art);
  if (!isShapeKind(p.plate.shape)) p.plate.shape = d.plate.shape;
  if (p.cupcake.shape !== "motif" && !isShapeKind(p.cupcake.shape)) p.cupcake.shape = d.cupcake.shape;
  if (p.cupcake.motif !== "none" && !isMotifKind(p.cupcake.motif)) p.cupcake.motif = "none";
  if (!(p.mat.mat2 in SECOND_MATERIALS)) p.mat.mat2 = d.mat.mat2;
  p.sticks.count = clamp(Math.round(p.sticks.count), 0, 3);
  p.frame.spacers = clamp(Math.round(p.frame.spacers), 1, 4);
  p.cupcake.count = clamp(Math.round(p.cupcake.count), 1, 60);
  p.style.noWeld = p.style.noWeld === true;
  p.style.operation = p.style.operation === "score" ? "score" : "cut";
  return p;
}
