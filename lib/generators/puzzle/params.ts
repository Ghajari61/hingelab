import { DEFAULTS as HINGE, clone } from "@/lib/hinge/defaults";
import { FIT_OFF } from "@/lib/fit/fitToSheets";
import { SHEET_EXTRAS, type GenBase } from "../types";
import { mergeInto } from "../util";

export type PuzzleShape = "rect" | "circle" | "heart" | "custom";
export type TabStyle = "classic" | "kids" | "wavy" | "straight";
export type FrameKind = "none" | "frame" | "tray";
export type EngraveKind = "none" | "image" | "text" | "numbers";

/** Free accounts export puzzles up to this many pieces. */
export const FREE_PIECES = 50;
/** Interior cuts run this far past the outline (plus half the kerf), so no piece stays attached. */
export const OVERSHOOT = 0.5;

export interface PuzzleParams extends GenBase {
  shape: {
    kind: PuzzleShape;
    /** Overall size, mm (a circle uses the width). */
    width: number;
    height: number;
    corner: number;
    path: string;
  };
  pieces: {
    /** Pick the grid from a piece count, or set columns and rows. */
    auto: boolean;
    count: number;
    cols: number;
    rows: number;
  };
  tabs: {
    style: TabStyle;
    /** Tab size, % of the piece. */
    size: number;
    /** Randomness of the grid and the tabs, %. */
    jitter: number;
    seed: number;
  };
  frame: {
    kind: FrameKind;
    border: number;
    /** Gap between the puzzle and the frame, mm. */
    clearance: number;
    corner: number;
  };
  engrave: {
    kind: EngraveKind;
    /** Grey JPEG data URL. */
    image: string;
    /** Width / height of the picture. */
    aspect: number;
    zoom: number;
    text: string;
    fontId: string;
    size: number;
    numberSize: number;
  };
}

export const PUZZLE_DEFAULTS: PuzzleParams = {
  name: "Jigsaw puzzle",
  material: "birch3",
  T: HINGE.T,
  K: HINGE.K,
  bedW: 600,
  bedH: 400,
  gap: 4,
  fit: { ...FIT_OFF },
  sheet: { ...SHEET_EXTRAS },
  layers: clone(HINGE.layers),
  shape: { kind: "rect", width: 300, height: 200, corner: 0, path: "" },
  pieces: { auto: true, count: 48, cols: 8, rows: 6 },
  tabs: { style: "classic", size: 20, jitter: 4, seed: 1 },
  frame: { kind: "none", border: 15, clearance: 0.4, corner: 6 },
  engrave: { kind: "none", image: "", aspect: 1.5, zoom: 100, text: "", fontId: "fredoka", size: 30, numberSize: 5 },
};

export function mergePuzzle(raw: unknown): PuzzleParams {
  return mergeInto(clone(PUZZLE_DEFAULTS), raw);
}
