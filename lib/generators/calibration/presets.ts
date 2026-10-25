import type { GenPreset } from "../types";
import type { CalibrationParams } from "./params";

export const CALIBRATION_PRESETS: GenPreset<CalibrationParams>[] = [
  { id: "plywood-3", name: "3 mm plywood", note: "Kerf strips, fit ladder and hinge strip", params: { name: "3 mm plywood coupons", material: "birch3", T: 3 } },
  { id: "acrylic-3", name: "3 mm acrylic", note: "Kerf and fit only (acrylic does not bend)", params: { name: "3 mm acrylic coupons", material: "acr3", T: 3, K: 0.1, hinge: { on: false } } },
  { id: "kerf-only", name: "Kerf only", note: "Ten narrow strips, quick to cut", params: { name: "Kerf strips", kerf: { strips: 10, width: 5, length: 30, both: true }, ladder: { on: false }, hinge: { on: false } } },
  { id: "mdf-3", name: "3 mm MDF", note: "MDF bends less: wider hinge spacing", params: { name: "3 mm MDF coupons", material: "mdf3", T: 3, K: 0.18, hinge: { pitchFrom: 2, pitchTo: 3.5 } } },
  { id: "chipboard-2", name: "2 mm chipboard", note: "Card and chipboard: fine steps", params: { name: "2 mm chipboard coupons", material: "card2", T: 2, K: 0.2, ladder: { from: -0.1, to: 0.2, step: 0.05 }, hinge: { pitchFrom: 1, pitchTo: 2.5 } } },
  { id: "plywood-6", name: "6 mm plywood", note: "Thicker sheet, wider hinge spacing", params: { name: "6 mm plywood coupons", material: "birch14", T: 6.35, K: 0.2, hinge: { pitchFrom: 3, pitchTo: 6, slit: 24, bridge: 4, width: 36 } } },
];
