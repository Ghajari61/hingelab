/**
 * Hidden compatibility adapter for former Wood Packaging / Paper Box projects.
 * Public menus offer Boxes & Packaging once. Old links and autosaves retain their dimensions
 * and defaults, while using the same complete controls and library as the merged product.
 */
import { BOXES } from "../boxes";
import { type BoxesParams, type Design } from "../boxes/params";
import type { GeneratorDef } from "../types";
import { packagingDefaults } from "./defaults";

/** The Boxes designs that are packaging. */
export const PACKAGING_DESIGNS: Design[] = ["box", "tray", "drawer", "hex", "insert", "stack", "book"];

/** Styles of the former Paper Box and the wooden box each one became (for saved designs). */
const LEGACY: Record<string, { design: Design; lid?: BoxesParams["box"]["lid"] }> = {
  "two-piece": { design: "box", lid: "liftoff" }, cube: { design: "box", lid: "liftoff" }, bakery: { design: "box", lid: "liftoff" }, pie: { design: "box", lid: "liftoff" },
  shipping: { design: "box", lid: "liftoff" }, carry: { design: "box", lid: "liftoff" }, gable: { design: "box", lid: "liftoff" }, takeout: { design: "box", lid: "open" },
  "reverse-tuck": { design: "box", lid: "sliding" }, "straight-tuck": { design: "box", lid: "sliding" }, "snap-lock": { design: "box", lid: "sliding" },
  "auto-bottom": { design: "box", lid: "sliding" }, "seal-end": { design: "box", lid: "sliding" }, hanging: { design: "box", lid: "sliding" },
  "cd-sleeve": { design: "box", lid: "sliding" }, pillow: { design: "box", lid: "sliding" }, bag: { design: "box", lid: "open" }, cone: { design: "box", lid: "open" },
  pyramid: { design: "box", lid: "liftoff" }, prism: { design: "box", lid: "sliding" },
  mailer: { design: "box", lid: "pin" }, clamshell: { design: "box", lid: "pin" }, "hinged-lid": { design: "box", lid: "pin" },
  drawer: { design: "drawer" }, sleeve: { design: "drawer" }, tray: { design: "tray" }, display: { design: "tray" }, wine: { design: "tray" },
  hexagon: { design: "hex" }, "cell-insert": { design: "insert" },
};

/**
 * A design saved by the paper version (`style` and `styles.<style>.L/W/H`) as the matching wooden
 * box, at the same inside size; anything else passes through.
 */
export function fromPaper(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const r = raw as Record<string, unknown>;
  if (typeof r.style !== "string" || "design" in r) return raw;
  const map = LEGACY[r.style] ?? { design: "box" as Design, lid: "liftoff" as const };
  const own = ((r.styles as Record<string, Record<string, unknown>> | undefined)?.[r.style] ?? {}) as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : d);
  const L = num(own.L, 120), W = num(own.W, 80), H = num(own.H, 60);
  const name = typeof r.name === "string" ? r.name : "Wooden box";
  switch (map.design) {
    case "drawer": return { name, design: "drawer", drawer: { width: Math.max(60, L), depth: Math.max(50, W), height: Math.max(30, H), drawers: 1, pull: "notch" } };
    case "tray": return { name, design: "tray", tray: { width: Math.max(40, L), depth: Math.max(40, W), height: Math.max(15, H) } };
    case "hex": return { name, design: "hex", hex: { width: Math.max(40, Math.round(L * Math.sqrt(3))), height: Math.max(15, H), lid: "liftoff" } };
    case "insert": return { name, design: "insert", insert: { width: L, depth: W, height: H, cols: num(own.cols, 2), rows: num(own.rows, 2) } };
    default: return { name, design: "box", box: { width: Math.max(20, L), depth: Math.max(20, W), height: Math.max(15, H), lid: map.lid ?? "liftoff" } };
  }
}

/** Compatibility adapter for old links, project files and their separate autosave. */
export function mergePackaging(raw: unknown): BoxesParams {
  return packagingDefaults(fromPaper(raw));
}

export const PAPERBOX: GeneratorDef<BoxesParams> = {
  ...BOXES,
  id: "paperbox",
  defaults: () => mergePackaging({}),
  merge: mergePackaging,
  // saved paper designs are version 1 of this product and come through `fromPaper`
  migrate: (raw, from) => BOXES.migrate ? BOXES.migrate(fromPaper(raw), from) : fromPaper(raw),
  fileName: (p) => BOXES.fileName({ ...p, name: p.name || "packaging" }),
};
