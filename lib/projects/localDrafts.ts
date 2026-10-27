import { GENERATOR_IDS, LEGACY_GENERATOR_IDS, GENERATOR_INFO } from "@/lib/generators/ids";

/** Existing per-generator autosaves, not additional named or cloud projects. */
export function localGeneratorDrafts(read: (key: string) => string | null) {
  return [...GENERATOR_IDS, ...LEGACY_GENERATOR_IDS].flatMap((product) => {
    try {
      const value = JSON.parse(read(GENERATOR_INFO[product].storageKey) ?? "null");
      if (!value?.params || typeof value.params !== "object" || Array.isArray(value.params)) return [];
      return [{ product, name: `${GENERATOR_INFO[product].name} draft`, href: `/app/editor/local?p=${product}` }];
    } catch { return []; }
  });
}
