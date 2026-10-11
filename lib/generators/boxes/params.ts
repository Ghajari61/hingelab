import { DEFAULTS as HINGE, clone } from "@/lib/hinge/defaults";
import { FIT_OFF } from "@/lib/fit/fitToSheets";
import { JOB_EXTRAS, SHEET_EXTRAS, type GenBase } from "../types";
import { mergeInto } from "../util";

export type Design = "box" | "tray" | "drawer" | "hex" | "insert" | "money" | "stack" | "sign" | "frame" | "stand" | "keys" | "bird";
export type LidKind = "closed" | "open" | "liftoff" | "sliding" | "pin" | "inset";
/** Lids a tray can take (a tray with a lid is a tea, card or jewellery box). */
export type TrayLid = "none" | "liftoff" | "sliding" | "pin" | "inset";
export type JointStyle = "fingers" | "tabs";

export const DESIGN_NAMES: Record<Design, string> = {
  box: "Box", tray: "Tray", drawer: "Drawer box", hex: "Hexagon box", insert: "Divider insert", money: "Money box", stack: "Stacking trays",
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
  };
  box: { width: number; depth: number; height: number; lid: LidKind; clearance: number; notch: boolean; pin: number };
  tray: { width: number; depth: number; height: number; cols: number; rows: number; dividers: number; lid: TrayLid };
  /** Text, a motif and a border engraved on the lid (or the front of a money box). */
  engrave: { text: string; fontId: string; size: number; motif: string; motifSize: number; border: number };
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
  sheet: { ...SHEET_EXTRAS },
  job: { ...JOB_EXTRAS },
  layers: clone(HINGE.layers),
  design: "box",
  joint: { finger: 10, outside: false, style: "fingers" },
  box: { width: 120, depth: 80, height: 60, lid: "closed", clearance: 0.3, notch: false, pin: 3 },
  tray: { width: 240, depth: 160, height: 50, cols: 3, rows: 2, dividers: 85, lid: "none" },
  engrave: { text: "", fontId: "pacifico", size: 14, motif: "none", motifSize: 30, border: 0 },
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
};

export function mergeBoxes(raw: unknown): BoxesParams {
  const p = mergeInto(clone(BOXES_DEFAULTS), raw);
  if (!(p.design in DESIGN_NAMES)) p.design = "box";
  if (!(p.box.lid in LID_NAMES)) p.box.lid = "closed";
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
