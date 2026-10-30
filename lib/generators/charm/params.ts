/**
 * Name Charms: small personalised pieces cut by the dozen from one list of names: ornaments,
 * keychains, earrings, bag tags, drink markers, place cards and gift tags.
 */
import { DEFAULTS as HINGE, clone } from "@/lib/hinge/defaults";
import { FIT_OFF } from "@/lib/fit/fitToSheets";
import { isMotifKind } from "../motifs";
import { MOTIF_ART, cleanMotifArt, type MotifArt } from "../motifArt";
import { isShapeKind, type ShapeKind } from "../shapes";
import { SECOND_MATERIALS } from "../material2";
import { JOB_EXTRAS, SHEET_DEFAULTS, type GenBase } from "../types";
import { TEXT_FORM, TEXT_STYLE, cleanTextForm, cleanTextStyle, type TextForm, type TextStyle } from "../textStyle";
import { mergeInto } from "../util";
import { isCharacter, type CharacterKind, type HatKind } from "./characters";

export type CharmKind = "ornament" | "keychain" | "earrings" | "bagtag" | "drink" | "placecard" | "gifttag" | "cardholder" | "bookmark" | "magnet";
/**
 * How the name shows: engraved or scored on a blank, cut through it, glued on in a second material,
 * inlaid flush in a second material (cut through the face, the letters pressed into the holes, a
 * backing behind), or the welded name is the charm.
 */
export type CharmStyle = "engrave" | "score" | "cutout" | "layered" | "inlay" | "letters";
/** Charm outlines: the shared shapes, a few charm shapes, or a motif's silhouette. */
export type CharmShape = ShapeKind | "teardrop" | "bauble" | "bone" | "motif" | CharacterKind;
export type HangKind = "hole" | "loop" | "none";
export type HangSide = "top" | "left";
export type AccentPlace = "above" | "left" | "below";

export interface CharmParams extends GenBase {
  kind: { kind: CharmKind };
  names: {
    /** One name per line: one charm (or one pair of earrings) each. */
    list: string;
    fontId: string;
    /** Largest cap height, mm: the name shrinks to fit its charm. */
    size: number;
    spacing: number;
    /** A smaller second line under every name (a year, a date, a phone number). */
    sub: string;
    subFontId: string;
    /** Second line height as a share of the name's, %. */
    subSize: number;
    /** Copies of each name. */
    copies: number;
    /** Turns the words to read along the charm's length, bottom to top (bookmarks, tall tags). */
    along: boolean;
  };
  textStyle: TextStyle;
  textForm: TextForm;
  style: {
    kind: CharmStyle;
    /** Letters style: how much the letters grow so they fuse, mm. */
    weld: number; noWeld: boolean; operation: "cut" | "score";
    /** Letters style: a silhouette backing this much bigger (0 = none), mm. */
    backing: number;
  };
  shape: {
    kind: CharmShape;
    /** Motif whose silhouette is the charm (shape "motif"). */
    motif: string;
    art: MotifArt;
    width: number;
    height: number;
    corner: number;
    /** Keep-out from the edge for the name, mm. */
    margin: number;
    /** Scores a frame line just inside the edge. */
    frame: boolean;
    /** Characters (snowman, cat): the hat. */
    hat: HatKind;
    /** Characters: cut the hat, nose and buttons as separate pieces to paint or cut in another colour. */
    paint: boolean;
  };
  accent: { kind: string; art: MotifArt; place: AccentPlace; size: number };
  hang: {
    kind: HangKind;
    side: HangSide;
    /** Hole diameter, mm: about 2 for jump rings, 3–4 for ribbon, 5 for split rings. */
    hole: number;
    /** Material left round the hole, mm. */
    wall: number;
  };
  /** Drink markers: the clip round the glass stem. */
  clip: { stem: number; opening: number; ring: number };
  /** Place cards: a slotted foot so the card stands. */
  stand: { depth: number; clearance: number };
  /** Bag tags: the strap slot. */
  strap: { length: number; width: number };
  /** Gift card holders: the card's size and how the pocket holds it. */
  card: { width: number; height: number; clearance: number; lip: number };
  /** A small tag hanging under the charm on a jump ring, with its own words (a year). */
  dangle: { on: boolean; shape: string; size: number; text: string; hole: number };
  /** Fridge magnets: round magnets set in pockets cut through a back layer, covered by the face. */
  magnet: { diameter: number; thickness: number; count: number; clearance: number };
  mat: { mat2: string; T2: number };
}

export const CHARM_KINDS: CharmKind[] = ["ornament", "keychain", "earrings", "bagtag", "drink", "placecard", "gifttag", "cardholder", "bookmark", "magnet"];
export const CHARM_STYLES: CharmStyle[] = ["engrave", "score", "cutout", "layered", "inlay", "letters"];
export const CHARM_SHAPE_EXTRA = ["teardrop", "bauble", "bone", "motif"] as const;
const HANGS: HangKind[] = ["hole", "loop", "none"];
const SIDES: HangSide[] = ["top", "left"];
const ACCENT_PLACES: AccentPlace[] = ["above", "left", "below"];

export const CHARM_DEFAULTS: CharmParams = {
  name: "Name charms",
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
  kind: { kind: "ornament" },
  names: { list: "Olivia\nNoah\nAva\nLiam", fontId: "pacifico", size: 14, spacing: 0, sub: "", subFontId: "fredoka", subSize: 45, copies: 1, along: false },
  textStyle: { ...TEXT_STYLE },
  textForm: { ...TEXT_FORM },
  style: { kind: "engrave", weld: 0.8, noWeld: false, operation: "cut", backing: 0 },
  shape: { kind: "circle", motif: "snowflake", art: { ...MOTIF_ART }, width: 70, height: 70, corner: 3, margin: 4, frame: true, hat: "tophat", paint: true },
  accent: { kind: "none", art: { ...MOTIF_ART }, place: "above", size: 14 },
  hang: { kind: "hole", side: "top", hole: 4, wall: 3 },
  clip: { stem: 8, opening: 7.2, ring: 2 },
  stand: { depth: 30, clearance: 0.1 },
  strap: { length: 22, width: 5 },
  card: { width: 85.6, height: 54, clearance: 1, lip: 5 },
  dangle: { on: false, shape: "heart", size: 24, text: "2026", hole: 3 },
  magnet: { diameter: 10, thickness: 2, count: 1, clearance: 0.2 },
  mat: { mat2: "acrylic-gold", T2: 3 },
};

/** What each kind starts from when it is picked (sizes, hanging and shape that suit it). */
export const KIND_START: Record<CharmKind, { shape: Partial<CharmParams["shape"]>; hang: Partial<CharmParams["hang"]>; size: number }> = {
  ornament: { shape: { kind: "circle", width: 70, height: 70, margin: 4 }, hang: { kind: "hole", side: "top", hole: 4, wall: 3 }, size: 14 },
  keychain: { shape: { kind: "pill", width: 60, height: 24, margin: 3 }, hang: { kind: "hole", side: "left", hole: 5, wall: 3 }, size: 10 },
  earrings: { shape: { kind: "teardrop", width: 24, height: 38, margin: 2 }, hang: { kind: "hole", side: "top", hole: 1.8, wall: 1.8 }, size: 5 },
  bagtag: { shape: { kind: "rounded", width: 90, height: 55, margin: 5 }, hang: { kind: "none", side: "top", hole: 4, wall: 3 }, size: 14 },
  drink: { shape: { kind: "circle", width: 28, height: 28, margin: 2.5 }, hang: { kind: "none", side: "top", hole: 3, wall: 2 }, size: 6 },
  placecard: { shape: { kind: "banner", width: 95, height: 40, margin: 5 }, hang: { kind: "none", side: "top", hole: 3, wall: 2 }, size: 14 },
  gifttag: { shape: { kind: "tag", width: 75, height: 40, margin: 4 }, hang: { kind: "hole", side: "left", hole: 4, wall: 3 }, size: 12 },
  cardholder: { shape: { kind: "rounded", width: 106, height: 78, margin: 4 }, hang: { kind: "hole", side: "top", hole: 4, wall: 3 }, size: 16 },
  // a 40 × 150 mm strip (about 1.5 × 6 in), a tassel hole at the top, the name along its length
  bookmark: { shape: { kind: "rounded", width: 40, height: 150, margin: 4 }, hang: { kind: "hole", side: "top", hole: 4, wall: 3 }, size: 14 },
  magnet: { shape: { kind: "rounded", width: 70, height: 50, margin: 4 }, hang: { kind: "none", side: "top", hole: 4, wall: 3 }, size: 12 },
};

export const isCharmShape = (v: unknown): v is CharmShape => isShapeKind(v) || isCharacter(v) || (CHARM_SHAPE_EXTRA as readonly string[]).includes(v as string);
const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);

export function mergeCharm(raw: unknown): CharmParams {
  const d = CHARM_DEFAULTS;
  const p = mergeInto(clone(d), raw);
  if (!CHARM_KINDS.includes(p.kind.kind)) p.kind.kind = d.kind.kind;
  if (!CHARM_STYLES.includes(p.style.kind)) p.style.kind = d.style.kind;
  if (!isCharmShape(p.shape.kind)) p.shape.kind = d.shape.kind;
  if (!isMotifKind(p.shape.motif)) p.shape.motif = d.shape.motif;
  if (p.accent.kind !== "none" && !isMotifKind(p.accent.kind)) p.accent.kind = "none";
  p.shape.art = cleanMotifArt(p.shape.art);
  p.accent.art = cleanMotifArt(p.accent.art);
  if (!HANGS.includes(p.hang.kind)) p.hang.kind = d.hang.kind;
  if (!["none", "tophat", "santa", "beanie"].includes(p.shape.hat)) p.shape.hat = d.shape.hat;
  if (!SIDES.includes(p.hang.side)) p.hang.side = d.hang.side;
  if (!ACCENT_PLACES.includes(p.accent.place)) p.accent.place = d.accent.place;
  if (!(p.mat.mat2 in SECOND_MATERIALS)) p.mat.mat2 = d.mat.mat2;
  p.textStyle = cleanTextStyle(p.textStyle);
  p.textForm = cleanTextForm(p.textForm);
  p.names.copies = clamp(Math.round(p.names.copies), 1, 50);
  p.names.size = clamp(p.names.size, 2, 80);
  p.names.subSize = clamp(p.names.subSize, 20, 100);
  p.shape.width = clamp(p.shape.width, 8, 300);
  p.shape.height = clamp(p.shape.height, 8, 300);
  p.shape.margin = clamp(p.shape.margin, 0.5, 30);
  p.hang.hole = clamp(p.hang.hole, 0.8, 15);
  p.hang.wall = clamp(p.hang.wall, 0.8, 10);
  p.clip.stem = clamp(p.clip.stem, 3, 30);
  p.clip.opening = clamp(p.clip.opening, 1, p.clip.stem);
  p.clip.ring = clamp(p.clip.ring, 1.5, 8);
  p.stand.depth = clamp(p.stand.depth, 12, 80);
  p.stand.clearance = clamp(p.stand.clearance, -0.3, 1);
  p.strap.length = clamp(p.strap.length, 8, 60);
  p.strap.width = clamp(p.strap.width, 2, 15);
  p.card.width = clamp(p.card.width, 30, 200); p.card.height = clamp(p.card.height, 20, 150);
  p.card.clearance = clamp(p.card.clearance, 0, 5); p.card.lip = clamp(p.card.lip, 1.5, 20);
  if (!isCharmShape(p.dangle.shape) || p.dangle.shape === "motif") p.dangle.shape = d.dangle.shape;
  p.dangle.size = clamp(p.dangle.size, 10, 80); p.dangle.hole = clamp(p.dangle.hole, 1.5, 8); p.dangle.text = p.dangle.text.slice(0, 12);
  p.magnet.diameter = clamp(p.magnet.diameter, 3, 40); p.magnet.thickness = clamp(p.magnet.thickness, 0.5, 10);
  p.magnet.count = clamp(Math.round(p.magnet.count), 1, 4); p.magnet.clearance = clamp(p.magnet.clearance, 0, 1);
  p.names.along = p.names.along === true;
  p.style.noWeld = p.style.noWeld === true;
  p.style.operation = p.style.operation === "score" ? "score" : "cut";
  return p;
}

/** The names on the list, each repeated `copies` times (earrings come in pairs on top). */
export function charmNames(p: CharmParams): string[] {
  const names = p.names.list.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const list = names.length ? names : p.style.kind === "letters" ? [] : [""];
  return list.flatMap((n) => Array.from({ length: p.names.copies }, () => n));
}
