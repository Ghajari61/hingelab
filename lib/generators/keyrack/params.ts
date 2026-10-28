import { cleanNoWeld } from "../textOps";
import { DEFAULTS as HINGE, clone } from "@/lib/hinge/defaults";
import { FIT_OFF } from "@/lib/fit/fitToSheets";
import { clamp } from "../common";
import { isMotifKind } from "../motifs";
import { MOTIF_ART, cleanMotifArt, type MotifArt } from "../motifArt";
import { isShapeKind, type ShapeKind } from "../shapes";
import { SECOND_MATERIALS } from "../material2";
import { JOB_EXTRAS, SHEET_DEFAULTS, type GenBase } from "../types";
import { TEXT_FORM, TEXT_STYLE, cleanTextForm, cleanTextStyle, type TextForm, type TextStyle } from "../textStyle";
import { mergeInto } from "../util";

export type Mark = "engrave" | "score" | "raised" | "none";
export type HookStyle = "hook" | "peg" | "screw";
export type HookProfile = "square" | "round" | "ball";
export type MotifSide = "left" | "right" | "both" | "above";
export type Mount = "keyhole" | "holes" | "none";

export interface KeyrackParams extends GenBase {
  board: { shape: ShapeKind; width: number; height: number; corner: number; frame: boolean };
  text: { text: string; fontId: string; size: number; spacing: number; mark: Mark; y: number; /** Raised letters as separate glyph pieces; scored letters keep each glyph's outline. */ noWeld: boolean };
  textStyle: TextStyle;
  textForm: TextForm;
  motif: { kind: string; side: MotifSide; size: number; gap: number; art: MotifArt };
  hooks: {
    count: number;
    style: HookStyle;
    profile: HookProfile;
    /** How far a hook reaches out from the board, mm. */
    reach: number;
    /** Height of the hook's arm, mm. */
    size: number;
    /** Hook row, % of the board height from the top. */
    y: number;
    /** Margin at each end of the row, mm. */
    margin: number;
    /** Peg (dowel) or screw hole diameter, mm. */
    hole: number;
    labels: string;
    labelFont: string;
    labelSize: number;
  };
  shelf: { on: boolean; depth: number; at: number };
  mount: { kind: Mount; y: number };
  mat: { mat2: string; T2: number };
}

export const KEYRACK_DEFAULTS: KeyrackParams = {
  name: "Key holder",
  material: "birch3",
  T: HINGE.T,
  K: HINGE.K,
  bedW: 600,
  bedH: 400,
  gap: 4,
  fit: { ...FIT_OFF },
  sheet: { ...SHEET_DEFAULTS },
  job: { ...JOB_EXTRAS },
  layers: clone(HINGE.layers),
  board: { shape: "rounded", width: 260, height: 120, corner: 8, frame: false },
  text: { text: "Home Sweet Home", fontId: "pacifico", size: 20, spacing: 0, mark: "engrave", y: 30, noWeld: false },
  textStyle: { ...TEXT_STYLE },
  textForm: { ...TEXT_FORM },
  motif: { kind: "house", side: "left", size: 30, gap: 6, art: { ...MOTIF_ART } },
  hooks: { count: 4, style: "hook", profile: "round", reach: 32, size: 16, y: 72, margin: 30, hole: 8, labels: "", labelFont: "fredoka", labelSize: 6 },
  shelf: { on: false, depth: 70, at: 14 },
  mount: { kind: "keyhole", y: 12 },
  mat: { mat2: "acrylic-gold", T2: 3 },
};

const MARKS: Mark[] = ["engrave", "score", "raised", "none"];
const STYLES: HookStyle[] = ["hook", "peg", "screw"];
const PROFILES: HookProfile[] = ["square", "round", "ball"];
const SIDES: MotifSide[] = ["left", "right", "both", "above"];
const MOUNTS: Mount[] = ["keyhole", "holes", "none"];

export function mergeKeyrack(raw: unknown): KeyrackParams {
  const d = KEYRACK_DEFAULTS;
  const p = mergeInto(clone(d), raw);
  if (!isShapeKind(p.board.shape)) p.board.shape = d.board.shape;
  if (!MARKS.includes(p.text.mark)) p.text.mark = d.text.mark;
  p.text.noWeld = cleanNoWeld(p.text.noWeld);
  p.textStyle = cleanTextStyle(p.textStyle);
  p.textForm = cleanTextForm(p.textForm);
  if (!STYLES.includes(p.hooks.style)) p.hooks.style = d.hooks.style;
  if (!PROFILES.includes(p.hooks.profile)) p.hooks.profile = d.hooks.profile;
  if (!SIDES.includes(p.motif.side)) p.motif.side = d.motif.side;
  if (!MOUNTS.includes(p.mount.kind)) p.mount.kind = d.mount.kind;
  if (p.motif.kind !== "none" && !isMotifKind(p.motif.kind)) p.motif.kind = "none";
  p.motif.art = cleanMotifArt(p.motif.art);
  if (!(p.mat.mat2 in SECOND_MATERIALS)) p.mat.mat2 = d.mat.mat2;
  p.hooks.count = clamp(Math.round(p.hooks.count), 0, 16);
  return p;
}
