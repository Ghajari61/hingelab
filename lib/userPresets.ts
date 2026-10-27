/** "Save as my preset": settings kept on this device, and in the account when signed in (user_presets). */
import { GENERATOR_IDS, LEGACY_GENERATOR_IDS, type GeneratorId } from "@/lib/generators/ids";
import type { ProductId } from "@/lib/supabase/types";

/** Generators' presets stay on this device, like their designs. */
export type PresetProduct = ProductId | GeneratorId;

export interface MyPreset {
  id: string;
  product: PresetProduct;
  name: string;
  params: Record<string, unknown>;
  createdAt: string;
  /** Also stored in the account. */
  cloud?: boolean;
}

export const MY_PRESETS_KEY = "hingelab-my-presets";
export const MY_GENERATOR_PRESETS_KEY = "hingelab-my-generator-presets";
/** Per product on this device; the account keeps up to 200 in total. */
export const MAX_LOCAL_PER_PRODUCT = 50;
export const CLOUD_PRESET_PRODUCTS: readonly ProductId[] = ["hinge-box", "letters", "parametric"];

export const isCloudPresetProduct = (p: PresetProduct): p is ProductId => (CLOUD_PRESET_PRODUCTS as readonly string[]).includes(p);

const isPreset = (v: unknown, products: readonly string[]): v is MyPreset => {
  const p = v as MyPreset;
  return !!p && typeof p === "object" && typeof p.id === "string" && products.includes(p.product)
    && typeof p.name === "string" && !!p.params && typeof p.params === "object" && !Array.isArray(p.params);
};

/** Reads a stored list, keeping only well-formed entries for the given products (the account's by default). */
export function parseMyPresets(raw: string | null, products: readonly PresetProduct[] = CLOUD_PRESET_PRODUCTS): MyPreset[] {
  try {
    const v = JSON.parse(raw ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is MyPreset => isPreset(x, products)) : [];
  } catch {
    return [];
  }
}

export const parseGeneratorPresets = (raw: string | null): MyPreset[] => parseMyPresets(raw, [...GENERATOR_IDS, ...LEGACY_GENERATOR_IDS]);

export function cleanPresetName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, 60);
}

/** Newest first; the oldest of that product drop off past the local limit. */
export function addMyPreset(list: MyPreset[], p: MyPreset): MyPreset[] {
  const next = [p, ...list.filter((q) => q.id !== p.id)];
  let n = 0;
  return next.filter((q) => q.product !== p.product || ++n <= MAX_LOCAL_PER_PRODUCT);
}

export function removeMyPreset(list: MyPreset[], id: string): MyPreset[] {
  return list.filter((p) => p.id !== id);
}

/** This device's presets plus the account's, one entry per id, newest first. */
export function mergeCloudPresets(local: MyPreset[], cloud: MyPreset[]): MyPreset[] {
  const byId = new Map<string, MyPreset>();
  for (const p of local) byId.set(p.id, p);
  for (const p of cloud) byId.set(p.id, { ...p, cloud: true });
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
