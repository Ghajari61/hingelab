/** Help article slugs for a generator's panels (articles are generated from the definition). */
import type { AnyGenerator } from "./types";

export const SHARED_SECTION_HELP: Record<string, string> = {
  Material: "material-and-kerf",
  Checks: "checks-and-fixes",
  Layers: "layers-and-export",
  Sheet: "sheet-and-fit",
};

export const generatorTipsSlug = (id: string) => `${id}-tips`;

export function generatorHelpMap(def: AnyGenerator) {
  const section: Record<string, string> = { ...SHARED_SECTION_HELP, Presets: def.id };
  const rail: Record<string, string> = { Presets: def.id };
  for (const s of def.sections) {
    section[s.title] = def.id;
    for (const f of s.fields) if (f.kind === "choice" && f.rail) rail[f.label] = def.id;
  }
  return { name: def.name, section, rail, tips: generatorTipsSlug(def.id) };
}
