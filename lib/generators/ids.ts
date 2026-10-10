/** Generator ids and the little the shell needs before a generator's code loads. */
export const GENERATOR_IDS = ["clock"] as const;
export type GeneratorId = (typeof GENERATOR_IDS)[number];

export const isGeneratorId = (v: unknown): v is GeneratorId => typeof v === "string" && (GENERATOR_IDS as readonly string[]).includes(v);

export interface GeneratorInfo {
  name: string;
  blurb: string;
  /** Lucide icon name, resolved by the shell. */
  icon: "clock" | "puzzle" | "qr" | "box";
  /** Autosave key on this device. */
  storageKey: string;
}

export const GENERATOR_INFO: Record<GeneratorId, GeneratorInfo> = {
  clock: { name: "Clock", blurb: "Wall and desk clocks with numerals, hands and a hole for a standard quartz movement.", icon: "clock", storageKey: "hingelab-gen-clock-v1" },
};
