import type { Preset } from "@/lib/presets";
import { FORMULA_DEFAULTS, LEAF_CLOCK, PARAMETRIC_DEFAULTS, TEXT_DEFAULTS } from "./defaults";
import type { ParametricParams } from "./types";

export const PARAMETRIC_PRESETS: Preset<ParametricParams>[] = [
  { id: "head-fins", name: "Head in fins", note: "Abstract head, parallel fins", params: { name: "Head in fins" } },
  { id: "wave-fins", name: "Wave wall panel", note: "Sine relief as parallel fins", params: { name: "Wave wall panel", source: { kind: "library", id: "wave-panel" } } },
  { id: "ripple-fins", name: "Ripple panel", note: "Rings fading from the centre", params: { name: "Ripple panel", source: { kind: "library", id: "ripple" } } },
  { id: "sphere-waffle", name: "Waffle sphere", note: "Two families of slotted ribs", params: { name: "Waffle sphere", source: { kind: "library", id: "sphere" }, method: "waffle" } },
  { id: "vase-stack", name: "Stacked vase", note: "Layers glued on dowels", params: { name: "Stacked vase", source: { kind: "library", id: "vase" }, method: "stacked" } },
  { id: "torus-radial", name: "Radial torus", note: "Fins around a hub", params: { name: "Radial torus", source: { kind: "library", id: "torus" }, method: "radial" } },
  { id: "vase-radial", name: "Radial vase", note: "Profile fins round the axis", params: { name: "Radial vase", source: { kind: "library", id: "vase" }, method: "radial", radial: { ...PARAMETRIC_DEFAULTS.radial, axis: "Y" } } },
  { id: "head-stack", name: "Stacked head", note: "Topographic layers", params: { name: "Stacked head", method: "stacked", stacked: { ...PARAMETRIC_DEFAULTS.stacked, axis: "Z" } } },
  { id: "dunes", name: "Formula dunes", note: "Height field from a formula", params: { name: "Formula dunes", source: FORMULA_DEFAULTS.heightfield } },
  { id: "turned-vase", name: "Formula vase", note: "Turned profile, stacked", params: { name: "Formula vase", source: FORMULA_DEFAULTS.revolution, method: "stacked" } },
  { id: "name-sculpture", name: "Name sculpture", note: "Rounded 3D text, parallel fins", params: { name: "Name sculpture", source: TEXT_DEFAULTS } },
  { id: "leaf-clock", name: "Leaf wall clock", note: "Fins along an oval, clock insert", params: { name: "Leaf wall clock", method: "curveNormal", curveNormal: LEAF_CLOCK } },
];
