/**
 * Calibration: coupons to cut on a new sheet or machine before a real job. Kerf strips give the true
 * kerf, a slot ladder the fit clearance and a hinge strip the tightest bend; the results go into the
 * material (My materials › Record coupon results), which is then marked tested on this machine.
 */
import type { GeneratorDef, SectionSpec } from "../types";
import { namedFile } from "../util";
import { buildCalibration } from "./build";
import { CALIBRATION_DEFAULTS, CALIBRATION_VERSION, ladderSteps, mergeCalibration, type CalibrationParams } from "./params";
import { CALIBRATION_PRESETS } from "./presets";

const sections: SectionSpec<CalibrationParams>[] = [
  {
    id: "kerf", title: "Kerf strips", open: true,
    help: "Strips cut with the design's kerf compensation. Side by side they measure their design width when the kerf is right; the difference gives the true kerf.",
    fields: [
      { kind: "toggle", key: "kerf.on", label: "Kerf strips", help: "Cut the kerf strips." },
      { kind: "number", key: "kerf.strips", label: "Strips", unit: "", int: true, min: 2, max: 10, step: 1, show: (p) => p.kerf.on, help: "How many strips in each set; more strips average out the measurement." },
      { kind: "number", key: "kerf.width", label: "Strip width", unit: "mm", min: 3, max: 30, step: 0.5, show: (p) => p.kerf.on, help: "Each strip's design width, across the cuts you measure." },
      { kind: "number", key: "kerf.length", label: "Strip length", unit: "mm", min: 10, max: 120, step: 1, show: (p) => p.kerf.on, help: "Each strip's length, long enough to hold." },
      { kind: "toggle", key: "kerf.both", label: "Both directions", show: (p) => p.kerf.on, help: "A second set turned a quarter, for machines whose kerf differs across X and across Y." },
    ],
  },
  {
    id: "ladder", title: "Fit ladder", open: true,
    help: "A plate of slots, each the sheet's thickness plus a clearance, to find how loose a tab must be to go in by hand.",
    fields: [
      { kind: "toggle", key: "ladder.on", label: "Fit ladder", help: "Cut the slot plate." },
      { kind: "number", key: "ladder.from", label: "From", unit: "mm", min: -1, max: 1, step: 0.01, show: (p) => p.ladder.on, help: "Clearance of the tightest slot (negative: narrower than the sheet)." },
      { kind: "number", key: "ladder.to", label: "To", unit: "mm", min: -1, max: 2, step: 0.01, show: (p) => p.ladder.on, help: "Clearance of the loosest slot." },
      { kind: "number", key: "ladder.step", label: "Step", unit: "mm", min: 0.01, max: 0.5, step: 0.01, show: (p) => p.ladder.on, help: "Clearance added from one slot to the next (at most 13 slots)." },
      { kind: "number", key: "ladder.depth", label: "Slot length", unit: "mm", min: 5, max: 40, step: 1, show: (p) => p.ladder.on, help: "Length of each slot." },
    ],
  },
  {
    id: "hinge", title: "Hinge strip", open: false,
    help: "A living-hinge strip in zones of growing slit spacing, to find the tightest bend this sheet takes.",
    fields: [
      { kind: "toggle", key: "hinge.on", label: "Hinge strip", help: "Cut the hinge strip." },
      { kind: "number", key: "hinge.zones", label: "Zones", unit: "", int: true, min: 1, max: 8, step: 1, show: (p) => p.hinge.on, help: "How many spacings to try." },
      { kind: "number", key: "hinge.pitchFrom", label: "Spacing from", unit: "mm", min: 0.5, max: 20, step: 0.1, show: (p) => p.hinge.on, help: "Slit spacing of the first zone (the most flexible)." },
      { kind: "number", key: "hinge.pitchTo", label: "Spacing to", unit: "mm", min: 0.5, max: 20, step: 0.1, show: (p) => p.hinge.on, help: "Slit spacing of the last zone (the stiffest)." },
      { kind: "number", key: "hinge.slit", label: "Slit length", unit: "mm", min: 3, max: 120, step: 0.5, show: (p) => p.hinge.on, help: "Length of each slit." },
      { kind: "number", key: "hinge.bridge", label: "Bridge", unit: "mm", min: 1, max: 20, step: 0.5, show: (p) => p.hinge.on, help: "Uncut material between slits." },
      { kind: "number", key: "hinge.width", label: "Strip width", unit: "mm", min: 15, max: 120, step: 1, show: (p) => p.hinge.on, help: "Width of the strip across the slits." },
      { kind: "number", key: "hinge.zone", label: "Zone length", unit: "mm", min: 10, max: 80, step: 1, show: (p) => p.hinge.on, help: "Length of each zone along the strip." },
    ],
  },
];

const on = (p: CalibrationParams) => [p.kerf.on && "kerf strips", p.ladder.on && `${ladderSteps(p.ladder).length}-slot fit ladder`, p.hinge.on && "hinge strip"].filter(Boolean).join(", ");

export const CALIBRATION: GeneratorDef<CalibrationParams> = {
  id: "calibration",
  name: "Calibration",
  version: CALIBRATION_VERSION,
  defaults: () => mergeCalibration({}),
  merge: mergeCalibration,
  sections,
  presets: CALIBRATION_PRESETS,
  build: (p) => buildCalibration(p),
  check: () => [],
  fileName: (p) => namedFile("calibration", p.name, `${String(p.T).replace(".", "-")}mm`),
  summary: (p) => `${p.T} mm sheet · ${on(p) || "nothing on"}`,
  help: {
    intro: [
      "Calibration cuts small test coupons from a new sheet or on a new machine, so a real job fits the first time: kerf strips for the true kerf (across X and across Y), a ladder of slots for the fit clearance of tabs, and a living-hinge strip for the tightest bend the sheet takes.",
      "Cut the coupons with the kerf you would use, measure them, and enter the results in My materials › Record coupon results. The material's kerf and clearance are updated and it is marked tested on your machine with the date; until then every material's values are estimates.",
    ],
    tips: [
      "Measure the strips with calipers, pushed together on a flat surface, not one at a time.",
      "Cut coupons from the same sheet as the job: plywood thickness varies from sheet to sheet.",
      "The hinge zones' radii are estimates from the Hinge Box's bend model; your bend test is the real answer.",
    ],
    keywords: ["calibration", "kerf test", "kerf comb", "fit test", "tab and slot", "clearance", "test cut", "living hinge test"],
  },
};

export { CALIBRATION_DEFAULTS };
