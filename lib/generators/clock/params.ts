import { DEFAULTS as HINGE, clone } from "@/lib/hinge/defaults";
import { FIT_OFF } from "@/lib/fit/fitToSheets";
import { JOB_EXTRAS, SHEET_DEFAULTS, type GenBase } from "../types";
import { isObj, mergeInto } from "../util";

export type FaceShape = "round" | "square" | "polygon" | "sunburst" | "gear" | "scallop" | "flower" | "heart" | "cloud" | "custom";
export type FaceLayers = "single" | "ring" | "stack";
export type MarkerStyle = "ticks" | "dots" | "numerals" | "mixed" | "none";
export type NumeralSet = "arabic" | "roman" | "roman-iv";
export type HandStyle = "baton" | "classic" | "spade" | "leaf" | "arrow" | "none";
export type Hanger = "none" | "keyhole" | "hole";
export type MovementId = "m8-5" | "m8-8" | "m8-13" | "custom";

export interface Movement {
  id: MovementId;
  name: string;
  /** Hole in the face for the threaded shaft, mm. */
  shaft: number;
  /** Hour hand: round hole, mm. */
  hourHole: number;
  /** Minute hand: double-flat hole, width across the round sides × across the flats, mm. */
  minuteW: number;
  minuteH: number;
  /** Thickest face the shaft's thread can clamp, mm. */
  maxDial: number;
}

/**
 * Typical sizes of the standard quartz movements sold with clock kits (M8 thread, 56 × 56 mm box).
 * Hand bushings vary between makers, so every size can be changed under Movement → Custom.
 */
export const MOVEMENTS: Movement[] = [
  { id: "m8-5", name: "Standard, short shaft (face up to 5 mm)", shaft: 8.4, hourHole: 5.2, minuteW: 3.6, minuteH: 2.4, maxDial: 5 },
  { id: "m8-8", name: "Standard, medium shaft (face up to 8 mm)", shaft: 8.4, hourHole: 5.2, minuteW: 3.6, minuteH: 2.4, maxDial: 8 },
  { id: "m8-13", name: "Standard, long shaft (face up to 13 mm)", shaft: 8.4, hourHole: 5.2, minuteW: 3.6, minuteH: 2.4, maxDial: 13 },
];

/** The movement's plastic box, mm (it sits behind the face, centred on the shaft). */
export const MOVEMENT_BOX = 56;
/** Minute hands longer than this need a high-torque movement. */
export const MAX_STANDARD_HAND = 160;

export interface ClockParams extends GenBase {
  face: {
    shape: FaceShape;
    /** Overall width, mm (across the corners or points). */
    size: number;
    sides: number;
    corner: number;
    rays: number;
    depth: number;
    path: string;
    layers: FaceLayers;
    ring: number;
    centre: number;
  };
  markers: {
    style: MarkerStyle;
    numerals: NumeralSet;
    quarters: boolean;
    fontId: string;
    size: number;
    inset: number;
    minutes: boolean;
    tickLength: number;
    tickWidth: number;
    dot: number;
    cut: boolean;
    /** Numerals turn to follow the dial (their tops point outward) instead of standing upright. */
    follow: boolean;
  };
  /** A line of text bent along the dial, inside the markers. */
  inscription: {
    text: string;
    at: "top" | "bottom";
    fontId: string;
    size: number;
    /** Gap between the markers and the text, mm. */
    gap: number;
  };
  hands: {
    style: HandStyle;
    hour: number;
    minute: number;
    width: number;
    tail: number;
  };
  movement: Movement;
  hanger: Hanger;
  stand: boolean;
}

export const CLOCK_DEFAULTS: ClockParams = {
  name: "Wall clock",
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
  face: { shape: "round", size: 300, sides: 6, corner: 6, rays: 24, depth: 22, path: "", layers: "ring", ring: 40, centre: 60 },
  markers: { style: "numerals", numerals: "roman", quarters: false, fontId: "archivo-black", size: 20, inset: 8, minutes: true, tickLength: 10, tickWidth: 3, dot: 8, cut: false, follow: false },
  inscription: { text: "", at: "top", fontId: "archivo-black", size: 10, gap: 6 },
  hands: { style: "spade", hour: 70, minute: 100, width: 10, tail: 20 },
  movement: { ...MOVEMENTS[0] },
  hanger: "keyhole",
  stand: false,
};

export function mergeClock(raw: unknown): ClockParams {
  const p = mergeInto(clone(CLOCK_DEFAULTS), raw);
  const m = MOVEMENTS.find((q) => q.id === p.movement.id);
  if (m && isObj(raw) && isObj(raw.movement) && !("shaft" in raw.movement)) p.movement = { ...m };
  // Numeral sets that were removed (Persian, Eastern Arabic) become Western digits.
  if (!(["arabic", "roman", "roman-iv"] as string[]).includes(p.markers.numerals)) p.markers.numerals = "arabic";
  return p;
}
