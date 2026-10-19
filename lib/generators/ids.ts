/** Generator ids and the little the shell needs before a generator's code loads. */
export const GENERATOR_IDS = ["clock", "puzzle", "qr", "boxes", "topper", "keyrack", "sign", "tablenum", "trophy", "shadowbox", "paperbox"] as const;
export type GeneratorId = (typeof GENERATOR_IDS)[number];

export const isGeneratorId = (v: unknown): v is GeneratorId => typeof v === "string" && (GENERATOR_IDS as readonly string[]).includes(v);

export interface GeneratorInfo {
  name: string;
  blurb: string;
  /** Lucide icon name, resolved by the shell. */
  icon: "clock" | "puzzle" | "qr" | "box" | "cake" | "key" | "sign" | "hash" | "trophy" | "layers";
  /** Autosave key on this device. */
  storageKey: string;
}

export const GENERATOR_INFO: Record<GeneratorId, GeneratorInfo> = {
  clock: { name: "Clock", blurb: "Wall and desk clocks with numerals, hands and a hole for a standard quartz movement.", icon: "clock", storageKey: "hingelab-gen-clock-v1" },
  puzzle: { name: "Puzzle", blurb: "Jigsaw puzzles in any shape with classic or kids tabs, a frame or tray, and a picture engraved on top.", icon: "puzzle", storageKey: "hingelab-gen-puzzle-v1" },
  qr: { name: "QR Code", blurb: "Scannable plates, keychains, coasters, Wi-Fi cards and paint stencils for links, Wi-Fi, contacts and more.", icon: "qr", storageKey: "hingelab-gen-qr-v1" },
  boxes: { name: "Boxes", blurb: "Finger-jointed boxes, trays with dividers, desk signs, photo frames, phone stands, key holders and bird houses.", icon: "box", storageKey: "hingelab-gen-boxes-v1" },
  topper: { name: "Cake Topper", blurb: "Cake toppers and cupcake picks for birthdays, weddings, Eid and more: welded script, mirror layers and a library of motifs.", icon: "cake", storageKey: "hingelab-gen-topper-v1" },
  keyrack: { name: "Key Holder", blurb: "Wall key holders in 18 shapes with slot-in hooks, dowel pegs or cup hooks, names above each hook and an optional shelf.", icon: "key", storageKey: "hingelab-gen-keyrack-v1" },
  sign: { name: "Sign", blurb: "Wall, door, shop and desk signs in wood, acrylic or both: engraved, layered lettering, cut-out words, flush inlays, neon-look acrylic or paint stencils, with frames and stands.", icon: "sign", storageKey: "hingelab-gen-sign-v1" },
  tablenum: { name: "Table Numbers", blurb: "A whole set of table numbers in one file: stands in slotted bases, living-hinge tent cards or plaques, with labels and names.", icon: "hash", storageKey: "hingelab-gen-tablenum-v1" },
  trophy: { name: "Trophy", blurb: "Awards that stand up: a star, cup, shield, medal, flame, laurel or motif with a name plate, slotted into a stepped base in wood, acrylic or both.", icon: "trophy", storageKey: "hingelab-gen-trophy-v1" },
  paperbox: { name: "Paper Box", blurb: "Folding cartons, mailers and gift boxes in card or board for a cutter or a laser: tuck-end cartons, mailers and two-piece boxes with creases, slit locks and bleed.", icon: "box", storageKey: "hingelab-gen-paperbox-v1" },
  shadowbox: { name: "Shadow Box", blurb: "Layered 3D paper-cut art from geometric patterns or your own picture, for a Cricut or a laser, with over a hundred ready-made designs.", icon: "layers", storageKey: "hingelab-gen-shadowbox-v1" },};
