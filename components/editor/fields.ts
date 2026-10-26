import type { Params } from "@/lib/hinge";
import { defaultRimWidth, isLidSlot, lidSlotSize } from "@/lib/hinge/lidSlot";
import { defaultCapH, LID_STEP_IN, roundHoleD } from "@/lib/hinge/model";
import { flipBandAuto, flipFixedAuto } from "@/lib/hinge/flip";

/** Lids that can carry stacked steps. */
const steppable = (p: Params) => p.lid === "fixed" || p.lid === "removable" || p.lid === "cap";

export type NumericKey =
  | "W" | "D" | "H" | "R" | "sides" | "dia" | "cylFlats"
  | "T" | "K" | "slotW" | "slit" | "bridge" | "pitch" | "overrun" | "stretch"
  | "tabW" | "slotClr" | "lidGap" | "bedW" | "bedH" | "gap"
  | "Ky" | "minFeature" | "lidOver" | "lidHoleD" | "lidHoleW" | "baseRingW" | "divX" | "divY" | "divH" | "fretCell" | "fretBar" | "fretSize"
  | "flipBand" | "flipFixed" | "capH" | "lidSteps" | "lidStepIn" | "baseHoleD" | "baseHoleW" | "drawers";

/** What NumberField needs to know about a field; shared by every product. */
export interface BaseField {
  id: string;
  label: string;
  len?: boolean;
  step: number;
  min?: number;
  max?: number;
  /** Unitless field that keeps decimals (otherwise unitless fields are whole numbers). */
  float?: boolean;
  /** Editing this field switches the material preset to Custom. */
  mat?: boolean;
  /** One-sentence explanation, shown in the label's tooltip. */
  help?: string;
  /** Fine-tuning: Simple hides it (its value still applies). */
  advanced?: boolean;
}

export interface FieldDef extends BaseField {
  id: NumericKey;
  sec: "secDims" | "secMat" | "secHinge" | "secJoints" | "secLid" | "secBase" | "secDrawers" | "secDiv" | "secFret" | "secText" | "secSheet";
  show?: (p: Params) => boolean;
  lab?: (p: Params) => string;
  /** The value an optional setting has while the design leaves it out. */
  unset?: (p: Params) => number;
}

export const FIELDS: FieldDef[] = [
  { id: "W", label: "Width", sec: "secDims", len: true, step: 1, min: 10, show: p => p.shape !== "cyl", lab: p => p.shape === "poly" ? "Across" : "Width" },
  { id: "D", label: "Depth", sec: "secDims", len: true, step: 1, min: 10, show: p => p.shape === "rect" || p.shape === "pill" },
  { id: "dia", label: "Diameter", sec: "secDims", len: true, step: 1, min: 20, show: p => p.shape === "cyl" },
  { id: "H", label: "Height", sec: "secDims", len: true, step: 1, min: 10 },
  { id: "R", label: "Radius", sec: "secDims", len: true, step: 0.5, min: 1, show: p => p.shape === "rect" || p.shape === "poly" },
  { id: "sides", label: "Sides", sec: "secDims", step: 1, min: 3, max: 12, show: p => p.shape === "poly" },
  { id: "cylFlats", label: "Tab flats", sec: "secDims", advanced: true, step: 1, min: 3, max: 16, show: p => p.shape === "cyl" },
  { id: "T", label: "Thick", sec: "secMat", len: true, step: 0.1, min: 0.5, mat: true },
  { id: "K", label: "Kerf", sec: "secMat", len: true, step: 0.01, min: 0, mat: true, lab: p => p.Ky != null ? "Kerf X" : "Kerf" },
  { id: "Ky", label: "Kerf Y", sec: "secMat", advanced: true, len: true, step: 0.01, min: 0, max: 5, mat: true, show: p => p.Ky != null, unset: p => p.K },
  { id: "minFeature", label: "Min feature", sec: "secMat", advanced: true, len: true, step: 0.1, min: 0, max: 50, mat: true, unset: () => 0 },
  { id: "slotW", label: "Slot width", sec: "secHinge", advanced: true, len: true, step: 0.05, min: 0.2, show: p => p.cutStyle === "slot" || p.pattern === "honeycomb", lab: p => p.pattern === "honeycomb" ? "Cell width" : "Slot width" },
  { id: "slit", label: "Slit", sec: "secHinge", len: true, step: 0.5, min: 3, show: p => p.pattern !== "serpentine" && p.pattern !== "honeycomb" },
  { id: "bridge", label: "Bridge", sec: "secHinge", len: true, step: 0.25, min: 0.5, show: p => p.pattern !== "honeycomb" },
  { id: "pitch", label: "Spacing", sec: "secHinge", len: true, step: 0.05, min: 0.5 },
  { id: "overrun", label: "Overrun", sec: "secHinge", advanced: true, len: true, step: 0.5, min: 0 },
  { id: "stretch", label: "Stretch %", sec: "secHinge", advanced: true, step: 0.5, min: 0, max: 8, float: true },
  { id: "tabW", label: "Tab width", sec: "secJoints", len: true, step: 0.5, min: 3 },
  { id: "slotClr", label: "Slot play", sec: "secJoints", advanced: true, len: true, step: 0.05, min: -0.5 },
  { id: "lidGap", label: "Lid gap", sec: "secJoints", advanced: true, len: true, step: 0.05, min: 0, show: p => p.lid === "removable" || p.lid === "cap" },
  { id: "baseRingW", label: "Ring width", sec: "secJoints", advanced: true, len: true, step: 0.5, min: 3, max: 40, show: p => p.baseRing === true, unset: () => 8 },
  { id: "lidOver", label: "Overhang", sec: "secLid", len: true, step: 0.5, min: 0, max: 100, show: p => p.lid !== "open" && p.lid !== "cap", unset: () => 0 },
  { id: "flipBand", label: "Hinge band", sec: "secLid", len: true, step: 0.5, min: 4, max: 300, show: p => p.lid === "flip", unset: p => flipBandAuto(p), help: "How wide the lid's living-hinge band is. Wider opens further; the automatic width targets an estimated 105°. Verify on a material test strip." },
  { id: "flipFixed", label: "Fixed strip", sec: "secLid", advanced: true, len: true, step: 0.5, min: 3, max: 200, show: p => p.lid === "flip", unset: p => flipFixedAuto(p), help: "The strip behind the band that the wall's tabs hold." },
  { id: "capH", label: "Cap height", sec: "secLid", len: true, step: 1, min: 12, max: 3000, show: p => p.lid === "cap", unset: p => defaultCapH(p), help: "How far the cap comes down over the box, top included." },
  { id: "lidSteps", label: "Steps", sec: "secLid", step: 1, min: 0, max: 3, show: steppable, unset: () => 0, help: "Smaller plates stacked on the lid, for a stepped top." },
  { id: "lidStepIn", label: "Step size", sec: "secLid", len: true, step: 0.5, min: 1, max: 60, show: p => steppable(p) && (p.lidSteps ?? 0) > 0, unset: () => LID_STEP_IN, help: "How much smaller each step is all round." },
  { id: "lidHoleD", label: "Hole size", sec: "secLid", len: true, step: 0.5, min: 1, max: 500, show: p => p.lid !== "open" && !p.drawers && !!p.lidHole && p.lidHole !== "none" && p.lidHole !== "rim", lab: p => isLidSlot(p.lidHole) ? "Slot length" : "Hole size", unset: p => isLidSlot(p.lidHole) ? lidSlotSize(p).len : roundHoleD(p.lidHole) ?? 22 },
  { id: "lidHoleW", label: "Slot width", sec: "secLid", len: true, step: 0.5, min: 1, max: 200, show: p => p.lid !== "open" && !p.drawers && (isLidSlot(p.lidHole) || p.lidHole === "rim"), lab: p => p.lidHole === "rim" ? "Top rim width" : "Slot width", unset: p => p.lidHole === "rim" ? defaultRimWidth(p.T) : lidSlotSize(p).w },
  { id: "baseHoleD", label: "Hole size", sec: "secBase", len: true, step: 0.5, min: 2, max: 500, show: p => p.baseHole === "hole", unset: () => roundHoleD("hole") ?? 10, help: "The hole's diameter: about 10 mm for a lamp cord or a drain." },
  { id: "baseHoleW", label: "Bottom rim", sec: "secBase", len: true, step: 0.5, min: 1, max: 200, show: p => p.baseHole === "rim", unset: p => defaultRimWidth(p.T), help: "How wide the band left round an open bottom is." },
  { id: "drawers", label: "Drawers", sec: "secDrawers", step: 1, min: 0, max: 4, unset: () => 0, help: "Turns the box into a chest of drawers: the case stands on its side, open at the front." },
  { id: "divX", label: "Across width", sec: "secDiv", step: 1, min: 0, max: 8, unset: () => 0 },
  { id: "divY", label: "Across depth", sec: "secDiv", step: 1, min: 0, max: 8, unset: () => 0 },
  { id: "divH", label: "Height", sec: "secDiv", len: true, step: 1, min: 0, max: 3000, show: p => (p.divX ?? 0) + (p.divY ?? 0) > 0, lab: () => "Height (0 = full)", unset: () => 0 },
  { id: "fretCell", label: "Pattern size", sec: "secFret", len: true, step: 0.5, min: 6, max: 80, show: p => !!p.fret && p.fret !== "none", unset: () => 16 },
  { id: "fretBar", label: "Bar width", sec: "secFret", len: true, step: 0.25, min: 1, max: 15, show: p => !!p.fret && p.fret !== "none", unset: () => 3 },
  { id: "fretSize", label: "Shape size (%)", sec: "secFret", step: 1, min: 20, max: 100, show: p => !!p.fret && p.fret !== "none" && !!p.fretShape && p.fretShape !== "full", unset: () => 70, help: "The shape's size as a share of the face." },
  { id: "bedW", label: "Bed W", sec: "secSheet", len: true, step: 10, min: 50 },
  { id: "bedH", label: "Bed H", sec: "secSheet", len: true, step: 10, min: 50 },
  { id: "gap", label: "Spacing", sec: "secSheet", len: true, step: 0.5, min: 0 },
];
