/**
 * The ten generators (spec §7) as metadata: what the start screen, the menus and the plan gates
 * need before any generator code is loaded. Each generator's code lives in lib/generators/{id}/.
 */
export type GeneratorCategory = "Boxes" | "Hinges" | "Lettering" | "Sculpture" | "Home" | "Games" | "Tools";

export interface GeneratorMeta {
  id: string;
  name: string;
  category: GeneratorCategory;
  plan: "free" | "pro";
  /** One line for the start screen card. */
  blurb: string;
  /** Free-plan allowance for generators that are free up to a limit. */
  freeLimit?: string;
  /** Number in the spec (§7.n). */
  n: number;
}

export const GENERATORS: GeneratorMeta[] = [
  { id: "hinge-box", n: 1, name: "Hinge Box", category: "Boxes", plan: "pro", blurb: "Living-hinge boxes: rounded, pill, polygon or cylinder, with lids." },
  { id: "hinged-cover", n: 2, name: "Hinged Cover", category: "Hinges", plan: "pro", blurb: "Journal, folder and menu covers with a flexible spine." },
  { id: "letters", n: 3, name: "Letters", category: "Lettering", plan: "pro", blurb: "Letter boxes, solid and stencil letters in any script." },
  { id: "parametric", n: 4, name: "Parametric Slicer", category: "Sculpture", plan: "pro", blurb: "Sliced sculptures from 3D files, photos or formulas." },
  { id: "finger-box", n: 5, name: "Finger-Joint Box", category: "Boxes", plan: "free", blurb: "Classic finger-joint boxes with lids, dividers and feet." },
  { id: "tray", n: 6, name: "Tray & Organizer", category: "Home", plan: "free", blurb: "Drawer trays and organizers with cross-halved dividers." },
  { id: "hinge-fill", n: 7, name: "Hinge Pattern Fill", category: "Hinges", plan: "pro", blurb: "Fill any shape of your own with a living-hinge pattern." },
  { id: "lamp", n: 8, name: "Lamp & Lantern", category: "Home", plan: "pro", blurb: "Lanterns and shades with parametric perforation patterns." },
  { id: "jigsaw", n: 9, name: "Jigsaw Puzzle", category: "Games", plan: "free", freeLimit: "Free up to 50 pieces", blurb: "Puzzles of any shape with shared single-line cuts." },
  { id: "calibration", n: 10, name: "Test & Calibration", category: "Tools", plan: "free", blurb: "Power/speed grids, kerf gauges and hinge test cards." },
];

export const generatorMeta = (id: string) => GENERATORS.find((g) => g.id === id);
