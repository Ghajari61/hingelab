/**
 * The `.oclc` project file, one extension for every section. A design from Hinge Box, Letters,
 * Parametric or a generator is JSON (`app`, `product`, `version`, `params`, optional fonts); a Studio
 * project is a ZIP (lib/studio/file.ts). Files are told apart by what is inside them, so older
 * `.hingelab.json` and `.hingelab` files open as well. Pure: no DOM.
 */
import { isGeneratorId, type GeneratorId } from "@/lib/generators/ids";

export { OCLC_EXT, OPEN_ACCEPT, oclcName } from "./ext";
export const OPEN_TYPES = [{ description: "HingeLab project", accept: { "application/octet-stream": [".oclc", ".hingelab", ".json"] } }];
export const SAVE_TYPES = [{ description: "HingeLab project", accept: { "application/octet-stream": [".oclc"] } }];
/** Larger files are refused before they are read. */
export const MAX_PROJECT_BYTES = 200 * 1024 * 1024;

/** Every section a project file can belong to (the editor's `?p=` value, or Studio). */
export type Section = "hinge" | "letters" | "parametric" | GeneratorId | "studio";
export type ClassicSection = Exclude<Section, "studio">;

export const SECTION_NAME: Record<"hinge" | "letters" | "parametric" | "studio", string> = {
  hinge: "Hinge Box", letters: "Letters", parametric: "Parametric", studio: "Studio",
};

export type DetectedProject =
  | { section: "studio" }
  | { section: ClassicSection; params: Record<string, unknown>; version: number; file: Record<string, unknown> }
  | { error: string };

const NOT_A_PROJECT = "That file is not a HingeLab project.";

/** The section a `product` field names; files saved before products existed are Hinge Box projects. */
export function sectionOfProduct(product: unknown): ClassicSection | "removed" | null {
  if (product === undefined || product === "hinge-box" || product === "hinge") return "hinge";
  if (product === "letters" || product === "parametric") return product;
  if (isGeneratorId(product)) return product;
  if (product === "testcard") return "removed";
  return null;
}

/** Reads a project file's bytes: which section made it, and its settings. */
export function detectProject(bytes: Uint8Array): DetectedProject {
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) return { section: "studio" };
  let j: unknown;
  try {
    j = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, ""));
  } catch {
    return { error: NOT_A_PROJECT };
  }
  if (!j || typeof j !== "object" || Array.isArray(j)) return { error: NOT_A_PROJECT };
  const o = j as Record<string, unknown>;
  if (!o.params || typeof o.params !== "object" || Array.isArray(o.params)) return { error: NOT_A_PROJECT };
  const section = sectionOfProduct(o.product);
  if (section === "removed") return { error: "That file is a Test Cards design. Test Cards was removed from HingeLab, so it can't be opened." };
  if (!section) return { error: "That project was made with a newer version of HingeLab. Update the app to open it." };
  const version = typeof o.version === "number" && Number.isFinite(o.version) ? o.version : 1;
  return { section, params: o.params as Record<string, unknown>, version, file: o };
}

/** The `product` a section writes into its files. */
export const productOfSection = (s: ClassicSection): string => (s === "hinge" ? "hinge-box" : s);

/** The section's display name. */
export function sectionName(s: Section, generatorName?: string): string {
  return s in SECTION_NAME ? SECTION_NAME[s as keyof typeof SECTION_NAME] : generatorName ?? s;
}
