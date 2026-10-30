import { cleanMark, cleanNoWeld } from "../textOps";
import { DEFAULTS as HINGE, clone } from "@/lib/hinge/defaults";
import { FIT_OFF } from "@/lib/fit/fitToSheets";
import { JOB_EXTRAS, SHEET_DEFAULTS, type GenBase } from "../types";
import { isImageDataURL } from "@/lib/security/svg";
import { mergeInto } from "../util";

export type PuzzleShape = "rect" | "circle" | "oval" | "heart" | "hexagon" | "cloud" | "house" | "arch" | "shield" | "custom";
/** Outlines drawn by the shared plate shapes; `corner` rounds the straight-sided ones. */
export const PLATE_PUZZLES = ["oval", "hexagon", "cloud", "house", "arch", "shield"] as const;
export const CORNERED_PUZZLES: PuzzleShape[] = ["rect", "hexagon", "house", "arch", "shield"];
export type TabStyle = "classic" | "kids" | "wavy" | "dovetail" | "straight";
export const TAB_STYLES: TabStyle[] = ["classic", "kids", "wavy", "dovetail", "straight"];
export type WhimsyShape = "heart" | "star" | "circle" | "flower" | "house";
export const WHIMSY_SHAPES: WhimsyShape[] = ["heart", "star", "circle", "flower", "house"];
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
    /** Score the piece outlines on the tray's base, so small children can match each piece to its place. */
    guide: boolean;
    /** Two holes through the top of the frame (and base) to hang the finished puzzle on the wall. */
    hang: boolean;
  };
  /** Whimsy pieces: little figures cut inside some of the pieces, each a piece of its own. */
  whimsy: {
    count: number;
    shape: WhimsyShape;
    /** Size, % of the piece. */
    size: number;
  };
  /** Grip knobs: a disc (or two stacked) glued on every piece, for small hands. */
  knobs: {
    on: boolean;
    diameter: number;
    stack: number;
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
    /** Text and numbers: engraved (filled) or scored (outlines). */
    mark: "engrave" | "score";
    /** Scored text keeps each glyph's own outline. */
    noWeld: boolean;
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
  sheet: { ...SHEET_DEFAULTS },
  job: { ...JOB_EXTRAS },
  layers: clone(HINGE.layers),
  shape: { kind: "rect", width: 300, height: 200, corner: 0, path: "" },
  pieces: { auto: true, count: 48, cols: 8, rows: 6 },
  tabs: { style: "classic", size: 20, jitter: 4, seed: 1 },
  frame: { kind: "none", border: 15, clearance: 0.4, corner: 6, guide: false, hang: false },
  whimsy: { count: 0, shape: "heart", size: 50 },
  knobs: { on: false, diameter: 14, stack: 1 },
  engrave: { kind: "none", image: "", aspect: 1.5, zoom: 100, text: "", fontId: "fredoka", size: 30, numberSize: 5, mark: "engrave", noWeld: false },
};

export function mergePuzzle(raw: unknown): PuzzleParams {
  const p = mergeInto(clone(PUZZLE_DEFAULTS), raw);
  if (p.engrave.image && !isImageDataURL(p.engrave.image)) p.engrave = { ...p.engrave, image: "" };
  p.engrave.mark = cleanMark(p.engrave.mark, ["engrave", "score"] as const, "engrave");
  p.engrave.noWeld = cleanNoWeld(p.engrave.noWeld);
  if (!TAB_STYLES.includes(p.tabs.style)) p.tabs.style = "classic";
  if (!WHIMSY_SHAPES.includes(p.whimsy.shape)) p.whimsy.shape = "heart";
  p.whimsy.count = Math.max(0, Math.min(20, Math.round(p.whimsy.count) || 0));
  p.whimsy.size = Math.max(25, Math.min(70, p.whimsy.size || 50));
  p.knobs.stack = p.knobs.stack >= 2 ? 2 : 1;
  p.knobs.diameter = Math.max(6, Math.min(40, p.knobs.diameter || 14));
  return p;
}
