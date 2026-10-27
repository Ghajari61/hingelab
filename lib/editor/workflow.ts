/**
 * One workflow for every editor: Design, Dimensions, Material, Construction, Layout, Validation,
 * Export. Each panel section belongs to one step (the stepper above the panels jumps to it), and
 * fine-tuning fields are marked advanced (Simple hides them; nothing about the design changes).
 */
export const STEPS = ["design", "dimensions", "material", "construction", "layout", "validation", "export"] as const;
export type Step = (typeof STEPS)[number];

export const STEP_NAMES: Record<Step, string> = {
  design: "Design", dimensions: "Dimensions", material: "Material", construction: "Construction", layout: "Layout", validation: "Validation", export: "Export",
};

/** Generator sections by id that are not part of the design itself (everything else is). */
const GEN_STEPS: Record<string, Record<string, Step>> = {
  clock: { face: "dimensions", movement: "construction", hanging: "construction" },
  puzzle: { tabs: "construction", frame: "construction" },
  qr: { output: "construction", plate: "dimensions", keyring: "construction" },
  boxes: {
    joint: "construction", box: "dimensions", tray: "dimensions", drawer: "dimensions", hex: "dimensions", insert: "dimensions", money: "dimensions",
    stack: "dimensions", book: "dimensions", sign: "dimensions", frame: "dimensions", stand: "dimensions", keys: "dimensions", bird: "dimensions",
  },
  topper: { plate: "dimensions", sticks: "construction", cupcake: "dimensions", mat: "material" },
  keyrack: { board: "dimensions", hooks: "construction", shelf: "construction", mount: "construction", mat: "material" },
  sign: { board: "dimensions", mount: "construction", mat: "material" },
  tablenum: { build: "construction", plate: "dimensions", base: "construction", hinge: "construction", plaque: "dimensions", mat: "material" },
  trophy: { base: "construction", mat: "material" },
  shadowbox: { depth: "dimensions", frame: "dimensions", build: "construction", lightbox: "construction", box: "construction" },
};

/** The step of a generator's section (Wood Packaging uses the Boxes panels and their steps). */
export function genSectionStep(gen: string, id: string, own?: Step): Step {
  if (own) return own;
  const s = GEN_STEPS[gen === "paperbox" ? "boxes" : gen]?.[id];
  if (s) return s;
  return "design";
}

/**
 * Field names (the last part of a key) that only fine-tune a design: clearances and fits, print
 * bleed, flap curves, perforation lengths, a movement's shaft details, QR error correction and the
 * like. Simple hides them; their values still apply.
 */
export const ADVANCED_NAMES = new Set([
  "clearance", "fit", "bleed", "glueTaper", "dustR", "tuckR", "perfCut", "perfGap", "tol", "jitter", "quiet", "ecc",
  "minuteH", "minuteW", "hourHole", "shaft", "maxDial", "web", "diffT", "screw", "head", "dpi", "lead",
]);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const isAdvancedKey = (gen: string, key: string, own?: boolean) => own ?? ADVANCED_NAMES.has(key.split(".").pop() ?? "");

export type Detail = "simple" | "advanced";

export function clampDockWidth(width: number): number {
  return Number.isFinite(width) ? Math.round(Math.max(280, Math.min(560, width))) : 340;
}
