import { DEFAULTS as HINGE, clone } from "@/lib/hinge/defaults";
import { FIT_OFF } from "@/lib/fit/fitToSheets";
import { SHEET_EXTRAS, type GenBase } from "../types";
import { mergeInto } from "../util";

export type Design = "box" | "tray" | "sign" | "frame" | "stand" | "keys" | "bird";
export type LidKind = "closed" | "open" | "liftoff";

export const DESIGN_NAMES: Record<Design, string> = {
  box: "Box", tray: "Tray", sign: "Desk sign", frame: "Photo frame", stand: "Phone stand", keys: "Key holder", bird: "Bird house",
};

export interface BoxesParams extends GenBase {
  design: Design;
  joint: {
    /** Finger width, mm. */
    finger: number;
    /** Sizes are outside measurements (otherwise inside). */
    outside: boolean;
  };
  box: { width: number; depth: number; height: number; lid: LidKind; clearance: number };
  tray: { width: number; depth: number; height: number; cols: number; rows: number; dividers: number };
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
  layers: clone(HINGE.layers),
  design: "box",
  joint: { finger: 10, outside: false },
  box: { width: 120, depth: 80, height: 60, lid: "closed", clearance: 0.3 },
  tray: { width: 240, depth: 160, height: 50, cols: 3, rows: 2, dividers: 85 },
  sign: { width: 200, height: 70, corner: 8, text: "Hello", fontId: "fredoka", size: 30, base: 50, border: 0, borderWidth: 1.5 },
  frame: { photoW: 100, photoH: 150, border: 20, overlap: 4, corner: 6, mount: "stand" },
  stand: { width: 75, angle: 65, slot: 14, lip: 10, height: 95 },
  keys: { width: 220, height: 90, corner: 10, hooks: 4, reach: 35, text: "KEYS", fontId: "fredoka", size: 18 },
  bird: { width: 120, depth: 120, height: 150, pitch: 40, hole: 32, perch: false, overhang: 20 },
};

export function mergeBoxes(raw: unknown): BoxesParams {
  return mergeInto(clone(BOXES_DEFAULTS), raw);
}
