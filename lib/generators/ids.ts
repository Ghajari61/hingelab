/** Generator ids and the little the shell needs before a generator's code loads. */
export const GENERATOR_IDS = ["clock", "puzzle", "qr", "boxes"] as const;
export type GeneratorId = (typeof GENERATOR_IDS)[number];

export const isGeneratorId = (v: unknown): v is GeneratorId => typeof v === "string" && (GENERATOR_IDS as readonly string[]).includes(v);

export interface GeneratorInfo {
  name: string;
  blurb: string;
  /** Lucide icon name, resolved by the shell. */
  icon: "clock" | "puzzle" | "qr" | "box" | "cake" | "key" | "sign" | "hash" | "trophy";
  /** Autosave key on this device. */
  storageKey: string;
}

export const GENERATOR_INFO: Record<GeneratorId, GeneratorInfo> = {
  clock: { name: "Clock", blurb: "Wall and desk clocks with numerals, hands and a hole for a standard quartz movement.", icon: "clock", storageKey: "hingelab-gen-clock-v1" },
  puzzle: { name: "Puzzle", blurb: "Jigsaw puzzles in any shape with classic or kids tabs, a frame or tray, and a picture engraved on top.", icon: "puzzle", storageKey: "hingelab-gen-puzzle-v1" },
  qr: { name: "QR Code", blurb: "Scannable plates, keychains, coasters, Wi-Fi cards and paint stencils for links, Wi-Fi, contacts and more.", icon: "qr", storageKey: "hingelab-gen-qr-v1" },
  boxes: { name: "Boxes", blurb: "Finger-jointed boxes, trays with dividers, desk signs, photo frames, phone stands, key holders and bird houses.", icon: "box", storageKey: "hingelab-gen-boxes-v1" },
};
