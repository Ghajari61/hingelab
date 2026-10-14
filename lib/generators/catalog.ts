/**
 * The generators (spec §7, and the Shadow Box after it) as metadata: what the start screen, the menus and the plan gates
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
  /**
   * Where the card leads: the product's own editor, the template library, or a new Studio project
   * with a starting design (`buildGeneratorStarter` in lib/templates/studio.ts).
   */
  opens: { editor: string } | { templates: string } | "studio";
}

export const GENERATORS: GeneratorMeta[] = [
  { id: "hinge-box", n: 1, name: "Hinge Box", category: "Boxes", plan: "pro", opens: { editor: "/app/editor/local?p=hinge" }, blurb: "Living-hinge boxes: rounded, pill, polygon or cylinder, with lids." },
  { id: "hinged-cover", n: 2, name: "Hinged Cover", category: "Hinges", plan: "pro", opens: { templates: "/templates?c=Living+hinges" }, blurb: "Journal, folder and menu covers with a flexible spine." },
  { id: "letters", n: 3, name: "Letters", category: "Lettering", plan: "pro", opens: { editor: "/app/editor/local?p=letters" }, blurb: "Letter boxes, solid and stencil letters in any script." },
  { id: "parametric", n: 4, name: "Parametric Slicer", category: "Sculpture", plan: "pro", opens: { editor: "/app/editor/local?p=parametric" }, blurb: "Sliced sculptures from 3D files, photos or formulas." },
  { id: "finger-box", n: 5, name: "Finger-Joint Box", category: "Boxes", plan: "free", opens: { editor: "/app/editor/local?p=boxes&preset=small-box" }, blurb: "Classic finger-joint boxes with lids, dividers and feet." },
  { id: "tray", n: 6, name: "Tray & Organizer", category: "Home", plan: "free", opens: { editor: "/app/editor/local?p=boxes&preset=organiser" }, blurb: "Drawer trays and organizers with cross-halved dividers." },
  { id: "hinge-fill", n: 7, name: "Hinge Pattern Fill", category: "Hinges", plan: "pro", opens: "studio", blurb: "Fill any shape of your own with a living-hinge pattern." },
  { id: "lamp", n: 8, name: "Lamp & Lantern", category: "Home", plan: "pro", opens: { templates: "/templates?c=Lamps+%26+light" }, blurb: "Lanterns and shades with parametric perforation patterns." },
  { id: "jigsaw", n: 9, name: "Jigsaw Puzzle", category: "Games", plan: "free", freeLimit: "Free up to 50 pieces", opens: { editor: "/app/editor/local?p=puzzle" }, blurb: "Puzzles of any shape with shared single-line cuts." },
  { id: "calibration", n: 10, name: "Test & Calibration", category: "Tools", plan: "free", opens: "studio", blurb: "Kerf gauge, slot-fit comb and living-hinge test strip for your material." },
  { id: "shadow-box", n: 11, name: "3D Shadow Box", category: "Home", plan: "free", opens: { editor: "/app/editor/local?p=shadowbox" }, blurb: "Layered paper-cut panels from geometric patterns or your own picture, for a laser or a Cricut: 132 designs." },
];

export const generatorMeta = (id: string) => GENERATORS.find((g) => g.id === id);

/** The page a card leads to; the Studio ones go through the start screen's new-project dialog. */
export const generatorHref = (g: GeneratorMeta) => (g.opens === "studio" ? `/home?generator=${g.id}` : "editor" in g.opens ? g.opens.editor : g.opens.templates);
