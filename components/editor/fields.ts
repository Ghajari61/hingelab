import type { Params } from "@/lib/hinge";

export type NumericKey =
  | "W" | "D" | "H" | "R" | "sides" | "dia" | "cylFlats"
  | "T" | "K" | "slotW" | "slit" | "bridge" | "pitch" | "overrun" | "stretch"
  | "tabW" | "slotClr" | "lidGap" | "bedW" | "bedH" | "gap"
  | "Ky" | "minFeature" | "lidOver" | "lidHoleD";

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
}

export interface FieldDef extends BaseField {
  id: NumericKey;
  sec: "secDims" | "secMat" | "secHinge" | "secJoints" | "secLid" | "secSheet";
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
  { id: "cylFlats", label: "Tab flats", sec: "secDims", step: 1, min: 3, max: 16, show: p => p.shape === "cyl" },
  { id: "T", label: "Thick", sec: "secMat", len: true, step: 0.1, min: 0.5, mat: true },
  { id: "K", label: "Kerf", sec: "secMat", len: true, step: 0.01, min: 0, mat: true, lab: p => p.Ky != null ? "Kerf X" : "Kerf" },
  { id: "Ky", label: "Kerf Y", sec: "secMat", len: true, step: 0.01, min: 0, max: 5, mat: true, show: p => p.Ky != null, unset: p => p.K },
  { id: "minFeature", label: "Min feature", sec: "secMat", len: true, step: 0.1, min: 0, max: 50, mat: true, unset: () => 0 },
  { id: "slotW", label: "Slot width", sec: "secHinge", len: true, step: 0.05, min: 0.2, show: p => p.cutStyle === "slot" || p.pattern === "honeycomb", lab: p => p.pattern === "honeycomb" ? "Cell width" : "Slot width" },
  { id: "slit", label: "Slit", sec: "secHinge", len: true, step: 0.5, min: 3, show: p => p.pattern !== "serpentine" && p.pattern !== "honeycomb" },
  { id: "bridge", label: "Bridge", sec: "secHinge", len: true, step: 0.25, min: 0.5, show: p => p.pattern !== "honeycomb" },
  { id: "pitch", label: "Spacing", sec: "secHinge", len: true, step: 0.05, min: 0.5 },
  { id: "overrun", label: "Overrun", sec: "secHinge", len: true, step: 0.5, min: 0 },
  { id: "stretch", label: "Stretch %", sec: "secHinge", step: 0.5, min: 0, max: 8, float: true },
  { id: "tabW", label: "Tab width", sec: "secJoints", len: true, step: 0.5, min: 3 },
  { id: "slotClr", label: "Slot play", sec: "secJoints", len: true, step: 0.05, min: -0.5 },
  { id: "lidGap", label: "Lid gap", sec: "secJoints", len: true, step: 0.05, min: 0, show: p => p.lid === "removable" },
  { id: "lidOver", label: "Overhang", sec: "secLid", len: true, step: 0.5, min: 0, max: 100, unset: () => 0 },
  { id: "lidHoleD", label: "Hole size", sec: "secLid", len: true, step: 0.5, min: 1, max: 500, show: p => p.lidHole === "finger" || p.lidHole === "knob", unset: p => p.lidHole === "knob" ? 5 : 22 },
  { id: "bedW", label: "Bed W", sec: "secSheet", len: true, step: 10, min: 50 },
  { id: "bedH", label: "Bed H", sec: "secSheet", len: true, step: 10, min: 50 },
  { id: "gap", label: "Spacing", sec: "secSheet", len: true, step: 0.5, min: 0 },
];
