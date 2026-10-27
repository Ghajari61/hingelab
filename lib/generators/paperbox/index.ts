/**
 * Wood Packaging (D215): gift, product and shipping boxes in plywood. It used to be Paper Box
 * (folding cartons in card); the owner asked for packaging in wood instead. It keeps the product id
 * `paperbox`, so links, saved designs and the desktop catalogue keep working, and it is built on
 * the Boxes engine: the same finger joints, kerf, fit, lids, engraving and 3D, limited to the
 * packaging designs and with its own presets (the former cartons, each as its wooden equivalent).
 */
import { BOXES } from "../boxes";
import { mergeBoxes, type BoxesParams, type Design } from "../boxes/params";
import type { GeneratorDef, SectionSpec } from "../types";
import { mergeInto } from "../util";
import { clone } from "@/lib/hinge/defaults";
import { PAPERBOX_PRESETS } from "./presets";

/** The Boxes designs that are packaging. */
export const PACKAGING_DESIGNS: Design[] = ["box", "tray", "drawer", "hex", "insert", "stack", "book"];
const PACKAGING_NAMES: Partial<Record<Design, string>> = {
  box: "Box with lid", tray: "Tray or divided box", drawer: "Drawer box", hex: "Hexagon box", insert: "Divider insert", stack: "Stacking trays", book: "Book box",
};

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

const PACKAGING_DEFAULTS: Partial<BoxesParams> = {
  name: "Wooden gift box", design: "box",
  box: { width: 120, depth: 90, height: 60, lid: "liftoff", clearance: 0.3, notch: false, pin: 3 },
};

/** Settings over the packaging defaults (a gift box with a lift-off lid), not the Boxes ones. */
export function mergePackaging(raw: unknown): BoxesParams {
  const base = mergeBoxes(PACKAGING_DEFAULTS);
  const p = mergeBoxes(mergeInto(clone(base), fromPaper(raw)));
  if (!PACKAGING_DESIGNS.includes(p.design)) p.design = "box";
  return p;
}

/** The Boxes panels, with the design choice limited to packaging. */
const sections: SectionSpec<BoxesParams>[] = BOXES.sections.map((s) => s.id !== "design" ? s : {
  ...s,
  help: "What to make: a box with a lift-off, sliding, pin-hinged, inset or closed lid, a tray or divided box, a drawer box, a hexagon box, a divider insert, stacking trays or a book box.",
  fields: s.fields.map((f) => f.key !== "design" || f.kind !== "choice" ? f : {
    ...f,
    options: PACKAGING_DESIGNS.map((v) => ({ v, text: PACKAGING_NAMES[v]! })),
    apply: (p: BoxesParams, v: string) => ({ ...p, design: v as Design }),
  }),
});

export const PAPERBOX: GeneratorDef<BoxesParams> = {
  ...BOXES,
  id: "paperbox",
  name: "Wood Packaging",
  defaults: () => mergePackaging({}),
  merge: mergePackaging,
  // saved paper designs are version 1 of this product and come through `fromPaper`
  migrate: (raw, from) => BOXES.migrate ? BOXES.migrate(fromPaper(raw), from) : fromPaper(raw),
  sections,
  presets: PAPERBOX_PRESETS,
  fileName: (p) => BOXES.fileName({ ...p, name: p.name || "packaging" }),
  help: {
    intro: [
      "Wood Packaging makes gift, product and shipping boxes from plywood that slot together with finger joints: boxes with a lift-off, sliding, pin-hinged or inset lid, trays and divided boxes, drawer boxes, hexagon boxes, divider inserts, stacking trays and book boxes.",
      "Every ready-made design is a familiar carton made in wood: two-piece gift boxes take a lift-off lid, tuck-end product boxes a sliding lid, mailers and clamshells a pin-hinged lid, and drawer boxes a sliding drawer. Enter the inside size of what goes in.",
      "Lids carry engraved text, a motif or your logo, so a box can carry its brand without a printed label.",
      "Joints, kerf and fit work as in the Boxes generator: cut one small box from your stock first and adjust the kerf until the fingers press together by hand.",
    ],
    tips: [
      "3 mm plywood suits most packaging; for boxes under 50 mm use thinner stock or keep the fingers at about two material thicknesses.",
      "A sliding lid needs about 0.4 mm clearance in plywood; a lift-off lid 0.3 mm.",
      "Engrave the brand on the lid before cutting the box free, so the parts do not move.",
      "Dry-fit before gluing, and glue with a thin bead.",
    ],
    keywords: ["packaging", "wooden box", "gift box", "product box", "sliding lid", "lift-off lid", "hinged lid", "drawer box", "jewellery box", "tea box", "wine box", "crate", "hexagon box", "insert", "branding", "plywood"],
  },
};
