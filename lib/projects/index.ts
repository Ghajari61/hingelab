/**
 * Cloud projects: product ids, default params, project-file parsing. Pure (no Supabase, no DOM).
 */
import { clone, DEFAULTS } from "@/lib/hinge/defaults";
import { LETTER_DEFAULTS } from "@/lib/letters/defaults";
import type { ProductId } from "@/lib/supabase/types";

export type { ProductId };
export * from "./sync";
export * from "./thumbnail";

/** Bumped when a geometry change needs old projects migrated (stored per project). */
export const ENGINE_VERSION = 1;

export const PRODUCTS: ProductId[] = ["hinge-box", "letters", "parametric"];
export const PRODUCT_LABEL: Record<ProductId, string> = { "hinge-box": "Hinge Box", letters: "Letters", parametric: "Parametric" };
export const NEW_LABEL: Record<ProductId, string> = { "hinge-box": "New box", letters: "New letters", parametric: "New sculpture" };

/** Largest params object accepted from a client (a Letters project with long text is a few kB). */
export const MAX_PARAMS_BYTES = 256 * 1024;

export function isProduct(v: unknown): v is ProductId {
  return typeof v === "string" && (PRODUCTS as string[]).includes(v);
}

export function defaultParams(product: ProductId): Record<string, unknown> {
  if (product === "letters") return clone(LETTER_DEFAULTS) as unknown as Record<string, unknown>;
  if (product === "hinge-box") return clone(DEFAULTS) as unknown as Record<string, unknown>;
  return { name: "Untitled sculpture" };
}

export function defaultName(product: ProductId): string {
  return product === "letters" ? LETTER_DEFAULTS.name : product === "hinge-box" ? DEFAULTS.name : "Untitled sculpture";
}

/** Project name from params.name, trimmed to what the database accepts. */
export function projectName(params: unknown, product: ProductId): string {
  const n = params && typeof params === "object" ? (params as { name?: unknown }).name : undefined;
  const s = typeof n === "string" ? n.trim().slice(0, 200) : "";
  return s || defaultName(product);
}

export type ParsedProjectFile = { product: ProductId; params: Record<string, unknown> };

/**
 * Reads a downloaded `.hingelab.json`. Files saved before products existed have no `product`
 * field and are Hinge Box projects.
 */
export function parseProjectFile(text: string): ParsedProjectFile | { error: string } {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    return { error: "That file is not a HingeLab project" };
  }
  if (!j || typeof j !== "object") return { error: "That file is not a HingeLab project" };
  const o = j as { product?: unknown; params?: unknown };
  if (!o.params || typeof o.params !== "object" || Array.isArray(o.params)) return { error: "That file is not a HingeLab project" };
  const product: ProductId = o.product === undefined ? "hinge-box" : isProduct(o.product) ? o.product : "hinge-box";
  if (o.product !== undefined && !isProduct(o.product)) return { error: "That project was made with a newer version of HingeLab" };
  return { product, params: o.params as Record<string, unknown> };
}
