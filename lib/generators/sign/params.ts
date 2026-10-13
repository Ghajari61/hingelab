import { DEFAULTS as HINGE, clone } from "@/lib/hinge/defaults";
import { FIT_OFF } from "@/lib/fit/fitToSheets";
import { isMotifId } from "../motifs";
import { isShapeKind, type ShapeKind } from "../shapes";
import { SECOND_MATERIALS } from "../material2";
import { JOB_EXTRAS, SHEET_EXTRAS, type GenBase } from "../types";
import { TEXT_STYLE, cleanTextStyle, type TextStyle } from "../textStyle";
import { mergeInto } from "../util";

export type SignStyle = "engraved" | "layered" | "word" | "inlay" | "neon" | "stencil";
export type SignMark = "engrave" | "score";
export type BorderKind = "none" | "score" | "engrave" | "raised";
export type SignMount = "none" | "holes" | "keyhole" | "hanging" | "standoff" | "stand";
export type MotifSide = "left" | "right" | "both" | "above" | "below" | "behind";

export interface SignParams extends GenBase {
  style: { kind: SignStyle; mark: SignMark; weld: number; border: number; mirror: boolean; join: boolean };
  board: { shape: ShapeKind; auto: boolean; pad: number; width: number; height: number; corner: number };
  text: { text: string; fontId: string; size: number; spacing: number; lead: number; align: "left" | "center" | "right"; offset: number };
  textStyle: TextStyle;
  motif: { kind: string; side: MotifSide; size: number; gap: number };
  border: { kind: BorderKind; width: number; inset: number };
  mount: { kind: SignMount; hole: number; depth: number };
  mat: { mat2: string; T2: number };
}

export const SIGN_DEFAULTS: SignParams = {
  name: "Sign",
  material: "birch3",
  T: HINGE.T,
  K: HINGE.K,
  bedW: 600,
  bedH: 400,
  gap: 4,
  fit: { ...FIT_OFF },
  sheet: { ...SHEET_EXTRAS },
  job: { ...JOB_EXTRAS },
  layers: clone(HINGE.layers),
  style: { kind: "engraved", mark: "engrave", weld: 1, border: 5, mirror: false, join: true },
  board: { shape: "arch", auto: true, pad: 18, width: 300, height: 200, corner: 6 },
  text: { text: "Welcome", fontId: "pacifico", size: 40, spacing: 0, lead: 1.3, align: "center", offset: 0 },
  textStyle: { ...TEXT_STYLE },
  motif: { kind: "flower", side: "above", size: 36, gap: 6 },
  border: { kind: "score", width: 4, inset: 6 },
  mount: { kind: "keyhole", hole: 5, depth: 70 },
  mat: { mat2: "acrylic-gold", T2: 3 },
};

const STYLES: SignStyle[] = ["engraved", "layered", "word", "inlay", "neon", "stencil"];
const MARKS: SignMark[] = ["engrave", "score"];
const BORDERS: BorderKind[] = ["none", "score", "engrave", "raised"];
const MOUNTS: SignMount[] = ["none", "holes", "keyhole", "hanging", "standoff", "stand"];
const SIDES: MotifSide[] = ["left", "right", "both", "above", "below", "behind"];
const ALIGNS = ["left", "center", "right"] as const;

export function mergeSign(raw: unknown): SignParams {
  const d = SIGN_DEFAULTS;
  const p = mergeInto(clone(d), raw);
  if (!STYLES.includes(p.style.kind)) p.style.kind = d.style.kind;
  if (!MARKS.includes(p.style.mark)) p.style.mark = d.style.mark;
  if (!isShapeKind(p.board.shape)) p.board.shape = d.board.shape;
  if (!ALIGNS.includes(p.text.align)) p.text.align = d.text.align;
  p.textStyle = cleanTextStyle(p.textStyle);
  if (p.motif.kind !== "none" && !isMotifId(p.motif.kind)) p.motif.kind = "none";
  if (!SIDES.includes(p.motif.side)) p.motif.side = d.motif.side;
  if (!BORDERS.includes(p.border.kind)) p.border.kind = d.border.kind;
  if (!MOUNTS.includes(p.mount.kind)) p.mount.kind = d.mount.kind;
  if (!(p.mat.mat2 in SECOND_MATERIALS)) p.mat.mat2 = d.mat.mat2;
  return p;
}
