import { DEFAULTS as HINGE, clone } from "@/lib/hinge/defaults";
import { FIT_OFF } from "@/lib/fit/fitToSheets";
import { isMotifKind } from "../motifs";
import { MOTIF_ART, cleanMotifArt, type MotifArt } from "../motifArt";
import { JOB_EXTRAS, SHEET_DEFAULTS, type GenBase } from "../types";
import { mergeInto } from "../util";
import { FRET_NAMES, type FretKind } from "../fretwork";
import type { Contour } from "../types";

export type BookClose = "magnet" | "ribbon" | "none";
export type Design = "box" | "tray" | "drawer" | "hex" | "insert" | "money" | "stack" | "book" | "sign" | "frame" | "stand" | "keys" | "bird" | "card" | "coaster" | "napkin" | "tissue";
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
export { PIERCE_SHAPES, type PierceMark, type PierceShape } from "../pattern";
import { PIERCE_SHAPES, cleanRepeat, type PierceMark, type PierceShape } from "../pattern";

export const DESIGN_NAMES: Record<Design, string> = {
  box: "Box", tray: "Tray", drawer: "Drawer box", hex: "Hexagon box", insert: "Divider insert", money: "Money box", stack: "Stacking trays", book: "Book box",
  sign: "Desk sign", frame: "Photo frame", stand: "Phone stand", keys: "Key holder", bird: "Bird house",
  card: "Business card holder", coaster: "Coaster holder", napkin: "Napkin holder", tissue: "Tissue box cover",
};

/** The outline of a napkin holder's two plates along their top edge. */
export type NapkinShape = "rounded" | "arch" | "dip" | "wave";
export const NAPKIN_SHAPES: Record<NapkinShape, string> = { rounded: "Rounded", arch: "Arch", dip: "Grip dip", wave: "Wave" };
/** The opening in the top of a tissue box cover. */
export type TissueOpening = "slot" | "oval" | "round";
export const TISSUE_OPENINGS: Record<TissueOpening, string> = { slot: "Slot", oval: "Oval", round: "Round" };
/**
 * Clear acrylic in a box lid: a window cut in the lid with a pane glued under it, or the whole lid
 * cut from clear acrylic (a second material).
 */
export type Glass = "none" | "window" | "clear";
export const GLASS_NAMES: Record<Glass, string> = { none: "None", window: "Window and pane", clear: "Clear lid" };
/** Lids that take a window with a pane under it, and lids that can be cut whole from acrylic. */
export const WINDOW_LIDS: LidKind[] = ["closed", "liftoff", "pin", "inset"];
export const CLEAR_LIDS: LidKind[] = ["sliding", "liftoff", "inset"];

/** The side profile of a card holder, front to back. */
export type CardProfile = "slant" | "wave" | "arch" | "scoop" | "step";
export const CARD_PROFILES: Record<CardProfile, string> = { slant: "Slant", wave: "Wave", arch: "Arch", scoop: "Scoop", step: "Step" };
/** The top edge of the card holder's front. */
export type CardLip = "straight" | "notch" | "scallop" | "wave";
export const CARD_LIPS: Record<CardLip, string> = { straight: "Straight", notch: "Thumb notch", scallop: "Scallop", wave: "Wave" };
/** The top edge of the card holder's back, above the sides. */
export type CardCrest = "flat" | "arch" | "peak" | "wave";
export const CARD_CRESTS: Record<CardCrest, string> = { flat: "Flat", arch: "Arch", peak: "Peak", wave: "Wave" };
export type CoasterStyle = "caddy" | "posts" | "layers";
export const COASTER_STYLES: Record<CoasterStyle, string> = { caddy: "Caddy", posts: "Posts", layers: "Stacked rings" };
export type CoasterDeco = "none" | "rings" | "sunburst" | "dots";
export const COASTER_DECOS: Record<CoasterDeco, string> = { none: "None", rings: "Rings", sunburst: "Sunburst", dots: "Dots" };

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
  box: {
    width: number; depth: number; height: number; lid: LidKind; clearance: number; notch: boolean; pin: number;
    /** Hand holes in the two side walls (not with a pin hinge, whose fittings sit there). */
    handles: boolean;
    /** Clear acrylic in the lid, the window's size (% of the lid face) and the pane's thickness, mm. */
    glass: Glass; window: number; paneT: number;
  };
  tray: { width: number; depth: number; height: number; cols: number; rows: number; dividers: number; lid: TrayLid; handles: boolean };
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
  /**
   * A desk holder for business cards: two side profiles with a front, a floor and a back (and a
   * second, raised row when tiered) tabbed through them. Card sizes are the card's own.
   */
  card: {
    cardW: number; cardH: number; portrait: boolean; bays: number; tiered: boolean;
    depth: number; front: number; back: number; profile: CardProfile; lip: CardLip; crest: CardCrest; corner: number;
  };
  /** A holder for a stack of square or round coasters, optionally with the coasters themselves. */
  coaster: {
    shape: "round" | "square"; size: number; corner: number; count: number; style: CoasterStyle;
    posts: number; postWidth: number; open: boolean; handle: boolean; push: boolean; wall: number;
    extra: number; clearance: number; set: boolean; thick: number; deco: CoasterDeco;
  };
  /**
   * A napkin holder: two upright plates with tabs through slots in a base. `width` and `height` are
   * the plates', `gap` the room between them for the napkins and `margin` how far the base reaches
   * past the plates.
   */
  napkin: { width: number; height: number; gap: number; shape: NapkinShape; corner: number; margin: number };
  /**
   * A cover that drops over a tissue box: four finger-jointed walls and a top with an opening, open
   * underneath. Sizes are the tissue box's (inside sizes of the cover) unless Outside sizes is on.
   */
  tissue: { width: number; depth: number; height: number; opening: TissueOpening; openL: number; openW: number };
  /** A box shaped like a book: one cover piece bends round a living-hinge spine. Sizes are outside. */
  book: {
    width: number; height: number; thickness: number; over: number;
    /**
     * What keeps the front cover shut (a living-hinge spine springs it open a little): magnets in
     * towers inside the fore edge with a pocket patch under the cover, a ribbon tie, or nothing.
     */
    close: BookClose;
    /** Disc magnet diameter and thickness, mm, and how many pairs (1 or 2). */
    magnetD: number; magnetT: number; magnets: number;
    /** Ribbon width, mm. */
    ribbon: number;
  };
  /** A decorative pattern cut through the walls and lid (or the book's cover). */
  pierce: {
    pattern: FretKind; on: PierceOn; cell: number; bar: number; shape: PierceShape; size: number; mark: PierceMark;
    /** The tile for a motif pattern: a library motif, "picture" or "text", and the user's own art. */
    motif: string; art: MotifArt;
    /** The motif tile as built (set for the build, never saved). */
    unit?: Contour[];
    /** Your own tile for `pattern: "tile"`, set for the build. */
    tile?: import("../fretwork").FretTile;
    grid: import("../fretwork").FretGrid;
    turn: number;
  };
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
  box: { width: 120, depth: 80, height: 60, lid: "closed", clearance: 0.3, notch: false, pin: 3, handles: false, glass: "none", window: 70, paneT: 2 },
  tray: { width: 240, depth: 160, height: 50, cols: 3, rows: 2, dividers: 85, lid: "none", handles: false },
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
  book: { width: 120, height: 160, thickness: 50, over: 3, close: "magnet", magnetD: 6, magnetT: 2, magnets: 1, ribbon: 10 },
  napkin: { width: 190, height: 110, gap: 40, shape: "dip", corner: 10, margin: 12 },
  tissue: { width: 250, depth: 130, height: 95, opening: "slot", openL: 140, openW: 36 },
  card: { cardW: 85, cardH: 55, portrait: false, bays: 1, tiered: false, depth: 30, front: 18, back: 40, profile: "wave", lip: "notch", crest: "flat", corner: 4 },
  coaster: { shape: "round", size: 100, corner: 12, count: 6, style: "posts", posts: 4, postWidth: 24, open: true, handle: true, push: true, wall: 8, extra: 8, clearance: 1.5, set: true, thick: 4, deco: "rings" },
  pierce: { pattern: "none", on: "both", cell: 16, bar: 3, shape: "full", size: 70, mark: "cut", motif: "heart", art: { ...MOTIF_ART }, grid: "auto", turn: 0 },
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
  if (!isMotifKind(p.pierce.motif)) p.pierce.motif = "heart";
  p.pierce.art = cleanMotifArt(p.pierce.art);
  delete p.pierce.unit;
  delete p.pierce.tile;
  Object.assign(p.pierce, cleanRepeat(p.pierce));
  if (p.pierce.mark !== "engrave" && p.pierce.mark !== "score") p.pierce.mark = "cut";
  if (!(p.joint.fit in FIT_MM)) p.joint.fit = "standard";
  if (!(p.card.profile in CARD_PROFILES)) p.card.profile = "wave";
  if (!(p.card.lip in CARD_LIPS)) p.card.lip = "notch";
  if (!(p.card.crest in CARD_CRESTS)) p.card.crest = "flat";
  if (p.coaster.shape !== "square") p.coaster.shape = "round";
  if (!(p.coaster.style in COASTER_STYLES)) p.coaster.style = "posts";
  if (!(p.coaster.deco in COASTER_DECOS)) p.coaster.deco = "none";
  const fin = (v: unknown, d: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const D = BOXES_DEFAULTS;
  p.box.handles = p.box.handles === true;
  p.tray.handles = p.tray.handles === true;
  if (!(p.box.glass in GLASS_NAMES)) p.box.glass = "none";
  p.box.window = fin(p.box.window, D.box.window, 20, 95);
  p.box.paneT = fin(p.box.paneT, D.box.paneT, 0.5, 6);
  if (!["magnet", "ribbon", "none"].includes(p.book.close)) p.book.close = D.book.close;
  p.book.magnetD = fin(p.book.magnetD, D.book.magnetD, 3, 20);
  p.book.magnetT = fin(p.book.magnetT, D.book.magnetT, 0.5, 10);
  p.book.magnets = Math.round(fin(p.book.magnets, D.book.magnets, 1, 2));
  p.book.ribbon = fin(p.book.ribbon, D.book.ribbon, 3, 40);
  if (!(p.napkin.shape in NAPKIN_SHAPES)) p.napkin.shape = D.napkin.shape;
  p.napkin.width = fin(p.napkin.width, D.napkin.width, 60, 400);
  p.napkin.height = fin(p.napkin.height, D.napkin.height, 40, 300);
  p.napkin.gap = fin(p.napkin.gap, D.napkin.gap, 5, 150);
  p.napkin.corner = fin(p.napkin.corner, D.napkin.corner, 0, 60);
  p.napkin.margin = fin(p.napkin.margin, D.napkin.margin, 4, 80);
  if (!(p.tissue.opening in TISSUE_OPENINGS)) p.tissue.opening = D.tissue.opening;
  p.tissue.width = fin(p.tissue.width, D.tissue.width, 60, 500);
  p.tissue.depth = fin(p.tissue.depth, D.tissue.depth, 60, 500);
  p.tissue.height = fin(p.tissue.height, D.tissue.height, 30, 400);
  p.tissue.openL = fin(p.tissue.openL, D.tissue.openL, 15, 400);
  p.tissue.openW = fin(p.tissue.openW, D.tissue.openW, 10, 300);
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
