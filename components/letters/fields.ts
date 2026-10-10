import type { LetterParams } from "@/lib/letters";
import type { BaseField } from "@/components/editor/fields";

export type LetterNumKey =
  | "size" | "letterSpacing" | "thicken" | "stencilBridge" | "T" | "K" | "bedW" | "bedH" | "gap"
  | "depth" | "minCornerRadius" | "wallMaxLength" | "islandArea" | "facetTol" | "panelMin"
  | "slotW" | "slit" | "bridge" | "pitch" | "overrun" | "stretch" | "tabW" | "slotClr" | "lidGap";

export interface LetterField extends BaseField {
  id: LetterNumKey;
  sec: "text" | "solid" | "box" | "hinge" | "joints" | "mat" | "sheet";
  show?: (p: LetterParams) => boolean;
}

const hinge = (p: LetterParams) => p.wallStyle === "hinge";
const faceted = (p: LetterParams) => p.wallStyle === "faceted";

export const LETTER_FIELDS: LetterField[] = [
  { id: "size", label: "Size", sec: "text", len: true, step: 1, min: 5, max: 2000 },
  { id: "letterSpacing", label: "Spacing", sec: "text", len: true, step: 0.5, min: -50, max: 500 },
  { id: "thicken", label: "Thicken", sec: "text", len: true, step: 0.1, min: 0, max: 20 },
  { id: "stencilBridge", label: "Bridge", sec: "solid", len: true, step: 0.25, min: 0.5, max: 50, show: p => p.weldDots },
  { id: "depth", label: "Depth", sec: "box", len: true, step: 1, min: 10, max: 600 },
  { id: "minCornerRadius", label: "Corner R", sec: "box", len: true, step: 0.5, min: 0, max: 200, show: hinge },
  { id: "facetTol", label: "Tolerance", sec: "box", len: true, step: 0.1, min: 0.1, max: 20, show: faceted },
  { id: "panelMin", label: "Min panel", sec: "box", len: true, step: 1, min: 5, max: 200, show: faceted },
  { id: "wallMaxLength", label: "Max wall", sec: "box", len: true, step: 10, min: 50, max: 5000, show: hinge },
  { id: "islandArea", label: "Island mm²", sec: "box", step: 10, min: 0, max: 100000 },
  { id: "slotW", label: "Slot width", sec: "hinge", len: true, step: 0.05, min: 0.2, show: p => p.cutStyle === "slot" },
  { id: "slit", label: "Slit", sec: "hinge", len: true, step: 0.5, min: 3, show: p => p.pattern !== "serpentine" },
  { id: "bridge", label: "Bridge", sec: "hinge", len: true, step: 0.25, min: 0.5 },
  { id: "pitch", label: "Spacing", sec: "hinge", len: true, step: 0.05, min: 0.5 },
  { id: "overrun", label: "Overrun", sec: "hinge", len: true, step: 0.5, min: 0 },
  { id: "stretch", label: "Stretch %", sec: "hinge", step: 0.5, min: 0, max: 8, float: true },
  { id: "tabW", label: "Tab width", sec: "joints", len: true, step: 0.5, min: 3 },
  { id: "slotClr", label: "Slot play", sec: "joints", len: true, step: 0.05, min: -0.5 },
  { id: "lidGap", label: "Lid gap", sec: "joints", len: true, step: 0.05, min: 0, show: p => p.lid === "removable" },
  { id: "T", label: "Thick", sec: "mat", len: true, step: 0.1, min: 0.5, mat: true },
  { id: "K", label: "Kerf", sec: "mat", len: true, step: 0.01, min: 0, mat: true },
  { id: "bedW", label: "Bed W", sec: "sheet", len: true, step: 10, min: 50 },
  { id: "bedH", label: "Bed H", sec: "sheet", len: true, step: 10, min: 50 },
  { id: "gap", label: "Spacing", sec: "sheet", len: true, step: 0.5, min: 0 },
];
