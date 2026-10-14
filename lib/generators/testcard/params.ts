import { DEFAULTS as HINGE, clone } from "@/lib/hinge/defaults";
import { FIT_OFF } from "@/lib/fit/fitToSheets";
import { clamp } from "../common";
import { JOB_EXTRAS, SHEET_DEFAULTS, type GenBase } from "../types";
import { mergeInto } from "../util";

/** A kerf and fit comb, or a card of slots that measures the sheet's real thickness. */
export type CardKind = "kerf" | "thickness";
/** Which kerf the comb measures: across vertical cuts (X), horizontal ones (Y) or both. */
export type CardAxis = "x" | "y" | "both";

export interface TestcardParams extends GenBase {
  card: {
    kind: CardKind;
    axis: CardAxis;
    /** Teeth on the comb. */
    count: number;
    /** Kerf of the first tooth and the step to the next, mm. */
    from: number;
    step: number;
    /** Nominal tooth width, mm. */
    tooth: number;
    /** Slots on the thickness card, centred on the material thickness, `tStep` mm apart in width. */
    slots: number;
    tStep: number;
  };
  /** The pair (or slot) that fitted best, numbered from 1; 0 until the card is cut and tried. */
  pick: { x: number; y: number; t: number };
}

export const TESTCARD_DEFAULTS: TestcardParams = {
  name: "Kerf test card",
  material: "birch3",
  T: HINGE.T,
  K: HINGE.K,
  bedW: 300,
  bedH: 200,
  gap: 4,
  fit: { ...FIT_OFF },
  sheet: { ...SHEET_DEFAULTS },
  job: { ...JOB_EXTRAS },
  layers: clone(HINGE.layers),
  card: { kind: "kerf", axis: "x", count: 8, from: 0.05, step: 0.05, tooth: 8, slots: 11, tStep: 0.1 },
  pick: { x: 0, y: 0, t: 0 },
};

const KINDS: CardKind[] = ["kerf", "thickness"];
const AXES: CardAxis[] = ["x", "y", "both"];
export const MAX_TEETH = 15;

export function mergeTestcard(raw: unknown): TestcardParams {
  const d = TESTCARD_DEFAULTS;
  const p = mergeInto(clone(d), raw);
  if (!KINDS.includes(p.card.kind)) p.card.kind = d.card.kind;
  if (!AXES.includes(p.card.axis)) p.card.axis = d.card.axis;
  p.card.count = clamp(Math.round(p.card.count), 3, MAX_TEETH);
  p.card.slots = clamp(Math.round(p.card.slots), 3, MAX_TEETH);
  for (const k of ["x", "y", "t"] as const) p.pick[k] = clamp(Math.round(p.pick[k]), 0, MAX_TEETH);
  return p;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Kerf of each tooth and its slot, mm. */
export const kerfValues = (p: TestcardParams) => Array.from({ length: p.card.count }, (_, i) => r3(p.card.from + i * p.card.step));

/** Width of each slot on the thickness card, mm (the middle one is the material's nominal thickness). */
export const slotWidths = (p: TestcardParams) => Array.from({ length: p.card.slots }, (_, i) => r3(p.T + (i - (p.card.slots - 1) / 2) * p.card.tStep));
