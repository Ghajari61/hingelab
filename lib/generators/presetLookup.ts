import type { GenBase, GeneratorDef } from "./types";

/** Old packaging links keep their meaning, even where the two libraries used the same id. */
export function findGeneratorPreset<P extends GenBase>(def: Pick<GeneratorDef<P>, "id" | "presets">, id: string) {
  if (def.id === "paperbox") {
    const legacy = def.presets.find(p => p.id === `packaging-${id}`);
    if (legacy) return legacy;
  }
  return def.presets.find(p => p.id === id);
}
