import { DEFAULTS as HINGE, clone } from "@/lib/hinge/defaults";
import { FIT_OFF } from "@/lib/fit/fitToSheets";
import { isMotifId } from "../motifs";
import { SECOND_MATERIALS } from "../material2";
import { JOB_EXTRAS, SHEET_DEFAULTS, type GenBase } from "../types";
import { mergeInto } from "../util";

export const EMBLEMS = ["star", "cup", "shield", "medal", "flame", "laurel", "motif", "custom"] as const;
export type Emblem = (typeof EMBLEMS)[number];
export type TrophyBuild = "single" | "mixed" | "layered";
export type BaseShape = "rounded" | "circle" | "hexagon" | "octagon";

export interface TrophyParams extends GenBase {
  build: { kind: TrophyBuild };
  emblem: {
    kind: Emblem;
    /** Motif id when `kind` is motif. */
    motif: string;
    /** SVG path data when `kind` is custom. */
    path: string;
    width: number;
    height: number;
    /** Points on a star. */
    points: number;
    text: string;
    fontId: string;
    size: number;
    /** Engrave a laurel wreath around the emblem's text. */
    laurel: boolean;
  };
  plate: {
    on: boolean;
    name: string;
    title: string;
    year: string;
    fontId: string;
    titleFont: string;
    nameSize: number;
    titleSize: number;
    width: number;
    pad: number;
    corner: number;
  };
  /** Stem between the emblem and the plate or base, mm. */
  stem: { width: number; height: number };
  base: { tiers: number; shape: BaseShape; width: number; depth: number; step: number; corner: number; fit: number; text: string };
  mark: { kind: "engrave" | "score" };
  mat: { mat2: string; T2: number };
}

export const TROPHY_DEFAULTS: TrophyParams = {
  name: "Trophy",
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
  build: { kind: "single" },
  emblem: { kind: "star", motif: "crown", path: "", width: 110, height: 105, points: 5, text: "1", fontId: "archivo-black", size: 30, laurel: false },
  plate: { on: true, name: "Alex Morgan", title: "Player of the Year", year: "2026", fontId: "archivo-black", titleFont: "pacifico", nameSize: 9, titleSize: 8, width: 90, pad: 6, corner: 4 },
  stem: { width: 24, height: 12 },
  base: { tiers: 2, shape: "rounded", width: 120, depth: 60, step: 6, corner: 6, fit: 0.1, text: "" },
  mark: { kind: "engrave" },
  mat: { mat2: "acrylic-gold", T2: 3 },
};

const BUILDS: TrophyBuild[] = ["single", "mixed", "layered"];
const BASES: BaseShape[] = ["rounded", "circle", "hexagon", "octagon"];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function mergeTrophy(raw: unknown): TrophyParams {
  const d = TROPHY_DEFAULTS;
  const p = mergeInto(clone(d), raw);
  if (!BUILDS.includes(p.build.kind)) p.build.kind = d.build.kind;
  if (!(EMBLEMS as readonly string[]).includes(p.emblem.kind)) p.emblem.kind = d.emblem.kind;
  if (!isMotifId(p.emblem.motif)) p.emblem.motif = d.emblem.motif;
  if (!BASES.includes(p.base.shape)) p.base.shape = d.base.shape;
  if (p.mark.kind !== "engrave" && p.mark.kind !== "score") p.mark.kind = d.mark.kind;
  if (!(p.mat.mat2 in SECOND_MATERIALS)) p.mat.mat2 = d.mat.mat2;
  p.base.tiers = clamp(Math.round(p.base.tiers), 1, 3);
  p.emblem.points = clamp(Math.round(p.emblem.points), 4, 12);
  return p;
}
