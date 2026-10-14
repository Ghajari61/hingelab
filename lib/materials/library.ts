/**
 * The user's own materials, kept on this device (localStorage) and moved between devices as a JSON
 * file. Each has its measured thickness and kerf (X and Y), the smallest feature it holds, the
 * built-in material it behaves like (for the hinge bend estimate), and optional laser settings for
 * the LightBurn project. Nothing here is invented: laser settings exist only if the user typed them.
 */
import { MATERIALS } from "@/lib/hinge/defaults";

export type LaserOp = "cut" | "score" | "engrave";
export const LASER_OPS: LaserOp[] = ["cut", "score", "engrave"];

/** Speed mm/s, power % (0–100), passes. */
export interface LaserSetting { speed: number; power: number; passes: number }

export interface UserMaterial {
  /** "my-" and a short random id. */
  id: string;
  name: string;
  /** Thickness, mm. */
  T: number;
  /** Kerf across cuts that run along Y, mm. */
  kx: number;
  /** Kerf across cuts that run along X, mm. */
  ky: number;
  /** Narrowest bar or tab the material holds, mm (0: not set). */
  minFeature: number;
  /** Built-in material it bends like (living hinges), or "custom". */
  like: string;
  laser: Partial<Record<LaserOp, LaserSetting>>;
}

export const MATERIALS_KEY = "hingelab-materials";
export const MATERIALS_EVENT = "hingelab-materials";
export const MAX_MATERIALS = 100;
export const MAX_MATERIAL_NAME = 80;
export const RANGES = {
  T: [0.05, 100], kerf: [0, 5], minFeature: [0, 50], speed: [0.1, 5000], power: [0, 100], passes: [1, 50],
} as const;

const num = (v: unknown, [lo, hi]: readonly [number, number]) =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null;
const isUserId = (id: unknown): id is string => typeof id === "string" && /^my-[a-z0-9-]{1,40}$/.test(id);
export const isUserMaterial = (id: string) => isUserId(id);

export function newMaterialId(): string {
  const r = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `my-${r.replace(/[^a-z0-9]/g, "").slice(0, 12)}`;
}

function cleanLaser(x: unknown): Partial<Record<LaserOp, LaserSetting>> {
  const out: Partial<Record<LaserOp, LaserSetting>> = {};
  if (!x || typeof x !== "object") return out;
  for (const op of LASER_OPS) {
    const s = (x as Record<string, unknown>)[op];
    if (!s || typeof s !== "object") continue;
    const q = s as Record<string, unknown>;
    const speed = num(q.speed, RANGES.speed), power = num(q.power, RANGES.power), passes = num(q.passes, RANGES.passes);
    if (speed != null && power != null) out[op] = { speed, power, passes: passes != null ? Math.round(passes) : 1 };
  }
  return out;
}

/** A stored or imported material with every value checked, or null when it is unusable. */
export function cleanMaterial(x: unknown): UserMaterial | null {
  if (!x || typeof x !== "object") return null;
  const q = x as Record<string, unknown>;
  const name = typeof q.name === "string" ? q.name.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, MAX_MATERIAL_NAME) : "";
  const T = num(q.T, RANGES.T);
  const kx = num(q.kx, RANGES.kerf);
  if (!name || T == null || kx == null) return null;
  const ky = num(q.ky, RANGES.kerf) ?? kx;
  const like = typeof q.like === "string" && q.like in MATERIALS ? q.like : "custom";
  return {
    id: isUserId(q.id) ? q.id : newMaterialId(), name, T, kx, ky,
    minFeature: num(q.minFeature, RANGES.minFeature) ?? 0, like, laser: cleanLaser(q.laser),
  };
}

/** A whole list, cleaned: bad entries dropped, repeated ids kept once, at most MAX_MATERIALS. */
export function cleanLibrary(x: unknown): UserMaterial[] {
  if (!Array.isArray(x)) return [];
  const seen = new Set<string>(), out: UserMaterial[] = [];
  for (const m of x) {
    const c = cleanMaterial(m);
    if (!c || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
    if (out.length >= MAX_MATERIALS) break;
  }
  return out;
}

export function loadMaterials(): UserMaterial[] {
  try {
    if (typeof localStorage === "undefined") return [];
    return cleanLibrary(JSON.parse(localStorage.getItem(MATERIALS_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export function saveMaterials(list: UserMaterial[]): void {
  try {
    localStorage.setItem(MATERIALS_KEY, JSON.stringify(cleanLibrary(list)));
    window.dispatchEvent(new Event(MATERIALS_EVENT));
  } catch {
    /* storage full or blocked: the list stays as it was */
  }
}

/** A copy of a built-in material to measure and adjust. */
export function fromBuiltIn(id: string, T?: number, K?: number): UserMaterial {
  const m = MATERIALS[id] && id !== "custom" ? MATERIALS[id] : null;
  const t = m?.T ?? T ?? 3, k = m?.K ?? K ?? 0.15;
  return { id: newMaterialId(), name: m ? `My ${m.name}` : "My material", T: t, kx: k, ky: k, minFeature: 0, like: m ? id : "custom", laser: {} };
}

export interface MaterialFile { app: "hingelab"; kind: "materials"; version: 1; materials: UserMaterial[] }

export function materialsFile(list: UserMaterial[]): string {
  const f: MaterialFile = { app: "hingelab", kind: "materials", version: 1, materials: cleanLibrary(list) };
  return JSON.stringify(f, null, 2);
}

/** Reads a materials file (or a bare list) into the library: same ids replace, new ones are added. */
export function importMaterials(text: string, existing: UserMaterial[]): { list: UserMaterial[]; added: number; replaced: number; skipped: number } | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "This file is not a HingeLab materials file (it is not JSON)." };
  }
  const items = Array.isArray(raw) ? raw : raw && typeof raw === "object" && (raw as MaterialFile).kind === "materials" ? (raw as MaterialFile).materials : null;
  if (!Array.isArray(items)) return { error: "This file is not a HingeLab materials file." };
  const list = [...existing];
  let added = 0, replaced = 0, skipped = 0;
  for (const it of items) {
    const m = cleanMaterial(it);
    if (!m) { skipped++; continue; }
    const i = list.findIndex((x) => x.id === m.id);
    if (i >= 0) { list[i] = m; replaced++; }
    else if (list.length < MAX_MATERIALS) { list.push(m); added++; }
    else skipped++;
  }
  return { list, added, replaced, skipped };
}

/** What a design needs from its material, whichever kind it is. */
export interface MaterialInfo {
  name: string;
  T: number | null;
  kx: number | null;
  ky: number | null;
  minFeature: number;
  /** Hinge stiffness of the material it behaves like. */
  gamma: number;
  laser: Partial<Record<LaserOp, LaserSetting>>;
  user: boolean;
}

export function materialInfo(id: string, list: UserMaterial[]): MaterialInfo | null {
  const u = list.find((m) => m.id === id);
  if (u) return { name: u.name, T: u.T, kx: u.kx, ky: u.ky, minFeature: u.minFeature, gamma: (MATERIALS[u.like] ?? MATERIALS.custom).gamma, laser: u.laser, user: true };
  const b = MATERIALS[id];
  if (!b) return null;
  return { name: b.name, T: b.T, kx: b.K, ky: b.K, minFeature: 0, gamma: b.gamma, laser: {}, user: false };
}

/** Measured values from a test card. */
export interface Measured { T?: number; kx?: number; ky?: number }

/**
 * Writes measured values into the design's material: the user's own one is updated; a built-in
 * one is copied first (built-ins never change). Returns the list and the material's id.
 */
export function saveMeasured(list: UserMaterial[], materialId: string, T: number, K: number, v: Measured): { list: UserMaterial[]; id: string; created: boolean } {
  const i = list.findIndex((m) => m.id === materialId);
  const base = i >= 0 ? list[i] : fromBuiltIn(materialId, T, K);
  // One axis measured on a material that had one kerf: it stays one kerf.
  const same = base.kx === base.ky;
  const kx = v.kx ?? (same && v.ky != null ? v.ky : undefined), ky = v.ky ?? (same && v.kx != null ? v.kx : undefined);
  const next = cleanMaterial({ ...base, ...(v.T != null ? { T: v.T } : {}), ...(kx != null ? { kx } : {}), ...(ky != null ? { ky } : {}) }) ?? base;
  if (i >= 0) return { list: list.map((m, j) => (j === i ? next : m)), id: next.id, created: false };
  return { list: [...list, next].slice(-MAX_MATERIALS), id: next.id, created: true };
}
