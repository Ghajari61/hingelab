import type { Params } from "./types";

/** Material presets. `custom` leaves thickness and kerf alone. */
export const MATERIALS: Record<string, { name: string; T: number | null; K: number | null; gamma: number }> = {
  birch3:  { name: "Baltic birch plywood 3 mm", T: 3,     K: 0.15, gamma: 0.020 },
  birch18: { name: "Baltic birch plywood 1/8\"", T: 3.175, K: 0.15, gamma: 0.020 },
  poplar3: { name: "Poplar plywood 3 mm",        T: 3,     K: 0.16, gamma: 0.022 },
  mdf3:    { name: "MDF 3 mm",                   T: 3,     K: 0.18, gamma: 0.012 },
  card2:   { name: "Chipboard / cardboard 2 mm", T: 2,     K: 0.20, gamma: 0.030 },
  acr3:    { name: "Acrylic 3 mm (brittle)",     T: 3,     K: 0.10, gamma: 0.008 },
  bass3:   { name: "Basswood plywood 3 mm",      T: 3,     K: 0.14, gamma: 0.022 },
  walnut3: { name: "Walnut plywood 3 mm",        T: 3,     K: 0.16, gamma: 0.018 },
  birch6:  { name: "Baltic birch plywood 6 mm", T: 6,     K: 0.20, gamma: 0.018 },
  mdf6:    { name: "MDF 6 mm",                   T: 6,     K: 0.22, gamma: 0.010 },
  acr2:    { name: "Acrylic 2 mm (brittle)",     T: 2,     K: 0.10, gamma: 0.008 },
  acr5:    { name: "Acrylic 5 mm (brittle)",     T: 5,     K: 0.12, gamma: 0.006 },
  mirror3: { name: "Mirror acrylic 3 mm",        T: 3,     K: 0.10, gamma: 0.006 },
  leather2:{ name: "Veg-tan leather 2 mm",       T: 2,     K: 0.20, gamma: 0.050 },
  felt3:   { name: "Wool felt 3 mm",             T: 3,     K: 0.25, gamma: 0.060 },
  cork3:   { name: "Cork sheet 3 mm",            T: 3,     K: 0.20, gamma: 0.040 },
  custom:  { name: "Custom material",            T: null,  K: null, gamma: 0.018 },
};

export const DEFAULTS: Params = {
  name: "Untitled box",
  shape: "rect", lid: "removable", pattern: "straight",
  W: 140, D: 90, H: 70, R: 24, sides: 6, dia: 90, cylFlats: 6,
  material: "birch3", T: 3, K: 0.15,
  cutStyle: "slot", slotW: 0.8,
  slit: 28, bridge: 3, pitch: 2.5, overrun: 3, stretch: 0,
  tabW: 10, slotClr: 0.1, lidGap: 0.3, split: 1,
  bedW: 600, bedH: 400, gap: 5, labels: true, testStrip: false,
  fit: { mode: "off", sheets: 1 },
  layers: { outline: { vis: true, exp: true }, slots: { vis: true, exp: true }, hinge: { vis: true, exp: true }, labels: { vis: true, exp: true } },
};

export function clone<T>(o: T): T {
  return JSON.parse(JSON.stringify(o)) as T;
}
