import { DEFAULTS as HINGE, clone } from "@/lib/hinge/defaults";
import { FIT_OFF } from "@/lib/fit/fitToSheets";
import { isMotifKind } from "../motifs";
import { MOTIF_ART, cleanMotifArt, type MotifArt } from "../motifArt";
import { JOB_EXTRAS, SHEET_DEFAULTS, type GenBase } from "../types";
import { mergeInto } from "../util";
import { FRET_NAMES, type FretKind } from "../fretwork";

export type Design = "box" | "tray" | "drawer" | "hex" | "insert" | "money" | "stack" | "book" | "sign" | "frame" | "stand" | "keys" | "bird";
export type LidKind = "closed" | "open" | "liftoff" | "sliding" | "pin" | "inset";
/** Lids a tray can take (a tray with a lid is a tea, card or jewellery box). */
export type TrayLid = "none" | "liftoff" | "sliding" | "pin" | "inset";
export type JointStyle = "fingers" | "tabs";
/** How tight the joints go together, from looser (hand pressure) to tighter (needs a mallet). */
export type JointFit = "looser" | "loose" | "standard" | "snug" | "tight";
/** Material added to (or taken off) every edge of every part, mm: the fit steps. */
export const FIT_MM: Record<JointFit, number> = { looser: -0.1, loose: -0.05, standard: 0, snug: 0.05, tight: 0.1 };
export const FIT_NAMES: Record<JointFit, string> = { looser: "Looser", loose: "Loose", standard: "Standard", snug: "Snug", tight: "Tighter" };
/** Faces that carry the cut-out pattern. */
export type PierceOn = "both" | "walls" | "lid" | "front" | "front-lid";
/** The window the pattern fills: the whole face, or a shape in its middle. */
export type PierceShape = "full" | "circle" | "heart" | "star" | "hexagon" | "diamond";
export const PIERCE_SHAPES: Record<PierceShape, string> = { full: "Whole face", circle: "Circle", heart: "Heart", star: "Star", hexagon: "Hexagon", diamond: "Diamond" };
/** The pattern cut through, engraved, or scored as outlines. */
export type PierceMark = "cut" | "engrave" | "score";

export const DESIGN_NAMES: Record<Design, string> = {
  box: "Box", tray: "Tray", drawer: "Drawer box", hex: "Hexagon box", insert: "Divider insert", money: "Money box", stack: "Stacking trays", book: "Book box",
  sign: "Desk sign", frame: "Photo frame", stand: "Phone stand", keys: "Key holder", bird: "Bird house",
};

export const LID_NAMES: Record<LidKind, string> = {
  closed: "Closed", open: "Open", liftoff: "Lift-off", sliding: "Sliding", pin: "Pin hinge", inset: "Inset with knob",
};

export interface BoxesParams extends GenBase {
  design: Design;
  joint: {
    /** Finger width, mm. */
    finger: number;
    /** Sizes are outside measurements (otherwise inside). */
    outside: boolean;
    /** Fingers at every edge, or tabs through slots in a bottom (and top) that overhangs the walls. */
    style: JointStyle;
    /** Fit of every joint (on top of the kerf). */
    fit: JointFit;
  };
  box: { width: number; depth: number; height: number; lid: LidKind; clearance: number; notch: boolean; pin: number };
  tray: { width: number; depth: number; height: number; cols: number; rows: number; dividers: number; lid: TrayLid };
  /** Text, a motif and a border engraved or scored on the lid (or the front of a money box). */
  engrave: { text: string; fontId: string; size: number; motif: string; motifSize: number; border: number; art: MotifArt; mark: "engrave" | "score" };
  drawer: { width: number; depth: number; height: number; drawers: number; pull: "hole" | "notch" | "knob"; clearance: number };
  hex: { width: number; height: number; lid: "open" | "liftoff"; clearance: number };
  insert: { width: number; depth: number; height: number; cols: number; rows: number; clearance: number };
  money: { width: number; depth: number; height: number; slot: number; plug: number };
  stack: { width: number; depth: number; height: number; trays: number; lid: boolean; clearance: number };
  sign: { width: number; height: number; corner: number; text: string; fontId: string; size: number; base: number; border: number; borderWidth: number };
  frame: { photoW: number; photoH: number; border: number; overlap: number; corner: number; mount: "hang" | "stand" };
  stand: { width: number; angle: number; slot: number; lip: number; height: number };
  keys: { width: number; height: number; corner: number; hooks: number; reach: number; text: string; fontId: string; size: number };
  bird: { width: number; depth: number; height: number; pitch: number; hole: number; perch: boolean; overhang: number };
  /** A box shaped like a book: one cover piece bends round a living-hinge spine. Sizes are outside. */
  book: { width: number; height: number; thickness: number; over: number };
  /** A decorative pattern cut through the walls and lid (or the book's cover). */
  pierce: { pattern: FretKind; on: PierceOn; cell: number; bar: number; shape: PierceShape; size: number; mark: PierceMark };
}

export const BOXES_DEFAULTS: BoxesParams = {
  name: "Finger-joint box",
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
  design: "box",
  joint: { finger: 10, outside: false, style: "fingers", fit: "standard" },
  box: { width: 120, depth: 80, height: 60, lid: "closed", clearance: 0.3, notch: false, pin: 3 },
  tray: { width: 240, depth: 160, height: 50, cols: 3, rows: 2, dividers: 85, lid: "none" },
  engrave: { text: "", fontId: "pacifico", size: 14, motif: "none", motifSize: 30, border: 0, art: { ...MOTIF_ART }, mark: "engrave" },
  drawer: { width: 160, depth: 120, height: 100, drawers: 2, pull: "hole", clearance: 0.5 },
  hex: { width: 100, height: 60, lid: "liftoff", clearance: 0.3 },
  insert: { width: 200, depth: 140, height: 40, cols: 3, rows: 2, clearance: 0.5 },
  money: { width: 110, depth: 80, height: 110, slot: 32, plug: 40 },
  stack: { width: 160, depth: 110, height: 40, trays: 3, lid: true, clearance: 0.4 },
  sign: { width: 200, height: 70, corner: 8, text: "Hello", fontId: "fredoka", size: 30, base: 50, border: 0, borderWidth: 1.5 },
  frame: { photoW: 100, photoH: 150, border: 20, overlap: 4, corner: 6, mount: "stand" },
  stand: { width: 75, angle: 65, slot: 14, lip: 10, height: 95 },
  keys: { width: 220, height: 90, corner: 10, hooks: 4, reach: 35, text: "KEYS", fontId: "fredoka", size: 18 },
  bird: { width: 120, depth: 120, height: 150, pitch: 40, hole: 32, perch: false, overhang: 20 },
  book: { width: 120, height: 160, thickness: 50, over: 3 },
  pierce: { pattern: "none", on: "both", cell: 16, bar: 3, shape: "full", size: 70, mark: "cut" },
};

export function mergeBoxes(raw: unknown): BoxesParams {
  const p = mergeInto(clone(BOXES_DEFAULTS), raw);
  if (!(p.design in DESIGN_NAMES)) p.design = "box";
  if (!(p.box.lid in LID_NAMES)) p.box.lid = "closed";
  if (p.engrave.motif !== "none" && !isMotifKind(p.engrave.motif)) p.engrave.motif = "none";
  p.engrave.art = cleanMotifArt(p.engrave.art);
  if (p.engrave.mark !== "score") p.engrave.mark = "engrave";
  if (!(p.pierce.pattern in FRET_NAMES)) p.pierce.pattern = "none";
  if (!["walls", "lid", "front", "front-lid"].includes(p.pierce.on)) p.pierce.on = "both";
  if (!(p.pierce.shape in PIERCE_SHAPES)) p.pierce.shape = "full";
  if (p.pierce.mark !== "engrave" && p.pierce.mark !== "score") p.pierce.mark = "cut";
  if (!(p.joint.fit in FIT_MM)) p.joint.fit = "standard";
  return p;
}

/** Geometry version: 2 added lids, joint styles, engraving and five designs. */
export const BOXES_VERSION = 2;

/**
 * Saved designs from older versions. Version 1 had finger joints only and no engraving; those are
 * written out so a later change of defaults cannot alter a saved box.
 */
export function migrateBoxes(raw: unknown, from: number): unknown {
  if (!raw || typeof raw !== "object" || from >= BOXES_VERSION) return raw;
  const r = raw as Record<string, unknown>;
  const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
  return {
    ...r,
    joint: { ...obj(r.joint), style: "fingers" },
    box: { ...obj(r.box), notch: false },
    tray: { ...obj(r.tray), lid: "none" },
    engrave: { text: "", motif: "none", border: 0 },
  };
}
