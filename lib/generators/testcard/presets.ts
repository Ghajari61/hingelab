import type { GenPreset } from "../types";
import type { TestcardParams } from "./params";

export const TESTCARD_PRESETS: GenPreset<TestcardParams>[] = [
  { id: "kerf-x", name: "Kerf comb", note: "Eight teeth from 0.05 to 0.40 mm of kerf", params: { name: "Kerf test card" } },
  {
    id: "kerf-xy", name: "Kerf X and Y", note: "Two combs, for machines that cut wider one way",
    params: { name: "Kerf X and Y test card", card: { axis: "both" } },
  },
  {
    id: "kerf-fine", name: "Fine kerf", note: "Ten teeth 0.02 mm apart, to home in on a value",
    params: { name: "Fine kerf test card", card: { count: 10, from: 0.08, step: 0.02 } },
  },
  {
    id: "kerf-acrylic", name: "Acrylic kerf", note: "3 mm acrylic: smaller kerf values, wider teeth",
    params: { name: "Acrylic kerf test card", material: "acr3", T: 3, K: 0.1, card: { count: 8, from: 0.04, step: 0.03, tooth: 10 } },
  },
  {
    id: "kerf-6mm", name: "6 mm plywood kerf", note: "Wide teeth for thick sheets",
    params: { name: "6 mm kerf test card", material: "birch6", T: 6, K: 0.2, card: { count: 8, from: 0.1, step: 0.05, tooth: 14 } },
  },
  {
    id: "thickness-3", name: "Thickness card", note: "Eleven slots from 2.5 to 3.5 mm",
    params: { name: "Thickness test card", card: { kind: "thickness" } },
  },
  {
    id: "thickness-6", name: "6 mm thickness card", note: "Slots from 5.5 to 6.5 mm for 6 mm sheets",
    params: { name: "6 mm thickness card", material: "birch6", T: 6, K: 0.2, card: { kind: "thickness" } },
  },
  {
    id: "thickness-fine", name: "Fine thickness card", note: "Slots 0.05 mm apart around 3 mm",
    params: { name: "Fine thickness card", card: { kind: "thickness", slots: 13, tStep: 0.05 } },
  },
];
