/** "Save as my preset": settings kept on this device, and in the account when signed in (user_presets). */
import type { ProductId } from "@/lib/supabase/types";

export interface MyPreset {
  id: string;
  product: ProductId;
  name: string;
  params: Record<string, unknown>;
  createdAt: string;
  /** Also stored in the account. */
  cloud?: boolean;
}

export const MY_PRESETS_KEY = "hingelab-my-presets";
/** Per product on this device; the account keeps up to 200 in total. */
export const MAX_LOCAL_PER_PRODUCT = 50;
const PRODUCTS: ProductId[] = ["hinge-box", "letters", "parametric"];

const isPreset = (v: unknown): v is MyPreset => {
  const p = v as MyPreset;
  return !!p && typeof p === "object" && typeof p.id === "string" && PRODUCTS.includes(p.product)
    && typeof p.name === "string" && !!p.params && typeof p.params === "object" && !Array.isArray(p.params);
};

export function parseMyPresets(raw: string | null): MyPreset[] {
  try {
    const v = JSON.parse(raw ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter(isPreset) : [];
  } catch {
    return [];
  }
}

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
