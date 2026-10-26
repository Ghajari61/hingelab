/**
 * Family Names: many names arranged into one piece: a crossword of interlocking names, a tree
 * built from lines of names, a snowflake with a name on every arm, a ring of names round a word,
 * a split monogram, or letter bunting.
 */
import { DEFAULTS as HINGE, clone } from "@/lib/hinge/defaults";
import { FIT_OFF } from "@/lib/fit/fitToSheets";
import { isMotifKind } from "../motifs";
import { MOTIF_ART, cleanMotifArt, type MotifArt } from "../motifArt";
import { SECOND_MATERIALS } from "../material2";
import { JOB_EXTRAS, SHEET_DEFAULTS, type GenBase } from "../types";
import { mergeInto } from "../util";

export type FamilyLayout = "crossword" | "tree" | "snowflake" | "ring" | "monogram" | "bunting";
export type LetterMark = "engrave" | "score" | "cutout" | "layered";
export type BackKind = "none" | "plate" | "outline";
export type FlagShape = "pennant" | "swallowtail" | "square" | "scalloped";

export interface FamilyParams extends GenBase {
  layout: { kind: FamilyLayout };
  names: {
    /** One name per line (bunting: the words to spell, one flag per letter). */
    list: string;
    fontId: string;
    /** Upper-case the letters (crossword tiles and bunting read best in capitals). */
    caps: boolean;
  };
  mark: { kind: LetterMark };
  crossword: {
    /** Tile size, mm. */
    tile: number;
    /** Letter height as a share of the tile, %. */
    letter: number;
    /** Corner rounding of the tiles, mm. */
    round: number;
    /** A backing behind the grid: none, a plate, or an outline round the tiles. */
    back: BackKind;
    pad: number;
    /** Score the lines between tiles. */
    grid: boolean;
  };
  tree: {
    /** Width of the widest (bottom) line, mm. */
    width: number;
    /** Tallest line, mm (short names are capped at this height). */
    maxLine: number;
    weld: number;
    star: string;
    trunk: boolean;
    /** Words on the trunk (a year). */
    year: string;
  };
  snowflake: {
    diameter: number;
    /** Words in the middle disc (a year). */
    centre: string;
    weld: number;
  };
  monogram: {
    /** Height of the big initial, mm. */
    size: number;
    /** The initial: empty takes the first letter of the first name. */
    letter: string;
    letterFont: string;
    /** Height of the band across it, % of the letter. */
    band: number;
  };
  /** Tree, snowflake and monogram: a silhouette backer behind the welded names, in the main sheet. */
  backer: { on: boolean; offset: number };
  ring: {
    diameter: number;
    /** The big letter (or two) in the middle; empty uses the motif. */
    centre: string;
    centreFont: string;
    motif: string;
    art: MotifArt;
    /** Name height round the ring, mm. */
    nameSize: number;
    separator: string;
    frame: boolean;
  };
  bunting: {
    shape: FlagShape;
    width: number;
    height: number;
    hole: number;
    /** Letter height as a share of the flag width, %. */
    letter: number;
    /** Add a plain flag between words. */
    spacer: boolean;
  };
  hang: { kind: "hole" | "loop" | "none"; hole: number; wall: number };
  mat: { mat2: string; T2: number };
}

export const FAMILY_DEFAULTS: FamilyParams = {
  name: "Family names",
  material: "birch3",
  T: 3,
  K: 0.15,
  bedW: 600,
  bedH: 400,
  gap: 4,
  fit: { ...FIT_OFF },
  sheet: { ...SHEET_DEFAULTS },
  job: { ...JOB_EXTRAS },
  layers: clone(HINGE.layers),
  layout: { kind: "crossword" },
  names: { list: "Olivia\nNoah\nAva\nLiam\nMum\nDad", fontId: "archivo-black", caps: true },
  mark: { kind: "engrave" },
  crossword: { tile: 14, letter: 62, round: 1.5, back: "outline", pad: 3, grid: true },
  tree: { width: 100, maxLine: 16, weld: 0.7, star: "star", trunk: true, year: "2026" },
  snowflake: { diameter: 110, centre: "2026", weld: 1.2 },
  monogram: { size: 90, letter: "", letterFont: "playfair-display", band: 26 },
  backer: { on: false, offset: 3 },
  ring: { diameter: 90, centre: "S", centreFont: "playfair-display", motif: "heart", art: { ...MOTIF_ART }, nameSize: 7, separator: "•", frame: true },
  bunting: { shape: "pennant", width: 70, height: 90, hole: 4, letter: 62, spacer: true },
  hang: { kind: "hole", hole: 4, wall: 3 },
  mat: { mat2: "acrylic-gold", T2: 3 },
};

const LAYOUTS: FamilyLayout[] = ["crossword", "tree", "snowflake", "ring", "monogram", "bunting"];
const MARKS: LetterMark[] = ["engrave", "score", "cutout", "layered"];
const BACKS: BackKind[] = ["none", "plate", "outline"];
const FLAGS: FlagShape[] = ["pennant", "swallowtail", "square", "scalloped"];
const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);

export function mergeFamily(raw: unknown): FamilyParams {
  const d = FAMILY_DEFAULTS;
  const p = mergeInto(clone(d), raw);
  if (!LAYOUTS.includes(p.layout.kind)) p.layout.kind = d.layout.kind;
  if (!MARKS.includes(p.mark.kind)) p.mark.kind = d.mark.kind;
  if (!BACKS.includes(p.crossword.back)) p.crossword.back = d.crossword.back;
  if (!FLAGS.includes(p.bunting.shape)) p.bunting.shape = d.bunting.shape;
  if (!["hole", "loop", "none"].includes(p.hang.kind)) p.hang.kind = d.hang.kind;
  if (p.tree.star !== "none" && !isMotifKind(p.tree.star)) p.tree.star = d.tree.star;
  if (p.ring.motif !== "none" && !isMotifKind(p.ring.motif)) p.ring.motif = d.ring.motif;
  p.ring.art = cleanMotifArt(p.ring.art);
  if (!(p.mat.mat2 in SECOND_MATERIALS)) p.mat.mat2 = d.mat.mat2;
  const c = p.crossword;
  c.tile = clamp(c.tile, 6, 60); c.letter = clamp(c.letter, 30, 90); c.round = clamp(c.round, 0, c.tile / 3); c.pad = clamp(c.pad, 1, 30);
  const t = p.tree;
  t.width = clamp(t.width, 40, 400); t.maxLine = clamp(t.maxLine, 5, 80); t.weld = clamp(t.weld, 0.2, 4);
  const sf = p.snowflake;
  sf.diameter = clamp(sf.diameter, 50, 400); sf.weld = clamp(sf.weld, 0.2, 4); sf.centre = sf.centre.slice(0, 8);
  const mo = p.monogram;
  mo.size = clamp(mo.size, 30, 400); mo.band = clamp(mo.band, 14, 45); mo.letter = mo.letter.slice(0, 1);
  p.backer.offset = clamp(p.backer.offset, 1, 15);
  p.tree.year = p.tree.year.slice(0, 12);
  const r = p.ring;
  r.diameter = clamp(r.diameter, 40, 400); r.nameSize = clamp(r.nameSize, 3, 40); r.centre = r.centre.slice(0, 6); r.separator = r.separator.slice(0, 3);
  const b = p.bunting;
  b.width = clamp(b.width, 30, 300); b.height = clamp(b.height, 30, 400); b.hole = clamp(b.hole, 2, 10); b.letter = clamp(b.letter, 30, 90);
  p.hang.hole = clamp(p.hang.hole, 1, 12); p.hang.wall = clamp(p.hang.wall, 1, 10);
  return p;
}

export const familyNames = (p: FamilyParams) => p.names.list.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
