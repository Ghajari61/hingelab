import type { Params } from "@/lib/hinge";

export type NumericKey =
  | "W" | "D" | "H" | "R" | "sides" | "dia" | "cylFlats"
  | "T" | "K" | "slotW" | "slit" | "bridge" | "pitch" | "overrun" | "stretch"
  | "tabW" | "slotClr" | "lidGap" | "bedW" | "bedH" | "gap";

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
}

export interface FieldDef extends BaseField {
  id: NumericKey;
  sec: "secDims" | "secMat" | "secHinge" | "secJoints" | "secSheet";
  show?: (p: Params) => boolean;
  lab?: (p: Params) => string;
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
  { id: "K", label: "Kerf", sec: "secMat", len: true, step: 0.01, min: 0, mat: true },
  { id: "slotW", label: "Slot width", sec: "secHinge", len: true, step: 0.05, min: 0.2, show: p => p.cutStyle === "slot" },
  { id: "slit", label: "Slit", sec: "secHinge", len: true, step: 0.5, min: 3, show: p => p.pattern !== "serpentine" },
  { id: "bridge", label: "Bridge", sec: "secHinge", len: true, step: 0.25, min: 0.5 },
  { id: "pitch", label: "Spacing", sec: "secHinge", len: true, step: 0.05, min: 0.5 },
  { id: "overrun", label: "Overrun", sec: "secHinge", len: true, step: 0.5, min: 0 },
  { id: "stretch", label: "Stretch %", sec: "secHinge", step: 0.5, min: 0, max: 8, float: true },
  { id: "tabW", label: "Tab width", sec: "secJoints", len: true, step: 0.5, min: 3 },
  { id: "slotClr", label: "Slot play", sec: "secJoints", len: true, step: 0.05, min: -0.5 },
  { id: "lidGap", label: "Lid gap", sec: "secJoints", len: true, step: 0.05, min: 0, show: p => p.lid === "removable" },
  { id: "bedW", label: "Bed W", sec: "secSheet", len: true, step: 10, min: 50 },
  { id: "bedH", label: "Bed H", sec: "secSheet", len: true, step: 10, min: 50 },
  { id: "gap", label: "Spacing", sec: "secSheet", len: true, step: 0.5, min: 0 },
];
