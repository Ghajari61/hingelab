/**
 * Preferences and lists kept on this computer (localStorage). Only harmless data: settings,
 * design parameters, small preview pictures and the last catalog. No tokens, no plan decisions, no SVG.
 */
import { useCallback, useEffect, useState } from "react";
import type { DCatalog, DesktopAccount } from "./ipc";

export type Theme = "system" | "light" | "dark";
export type Units = "mm" | "in";
export type SheetTone = "plywood" | "grey" | "white" | "dark";

export interface LocalPrefs {
  theme: Theme;
  units: Units;
  autoCheckUpdates: boolean;
  /** Open new designs with the last settings used for that product instead of its defaults. */
  reuseLastSettings: boolean;
  defaultProduct: string;
  sidebarCollapsed: boolean;
  /** Colour of the sheet behind the preview (display only; the saved file is unchanged). */
  sheetTone: SheetTone;
  /** 10 mm grid drawn on the sheet. */
  sheetGrid: boolean;
}

export interface SavedDesign {
  id: string;
  product: string;
  name: string;
  params: Record<string, unknown>;
  summary: string;
  /** A small WebP data URL of the last preview. */
  thumb?: string;
  at: number;
}

export interface Favorite {
  id: string;
  product: string;
  /** A preset id, or saved settings. */
  preset?: string;
  params?: Record<string, unknown>;
  name: string;
  note: string;
  at: number;
}

const KEYS = { prefs: "hl-prefs-v1", recent: "hl-recent-v1", favorites: "hl-favorites-v1", last: "hl-last-v1", catalog: "hl-catalog-v1", account: "hl-account-v1" };
export const DEFAULT_PREFS: LocalPrefs = { theme: "system", units: "mm", autoCheckUpdates: true, reuseLastSettings: true, defaultProduct: "hinge", sidebarCollapsed: false, sheetTone: "plywood", sheetGrid: true };
const MAX_RECENT = 24;
const MAX_ITEM = 300_000;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    const s = JSON.stringify(value);
    if (s.length < 4_000_000) localStorage.setItem(key, s);
  } catch {
    // Storage full or unavailable: these lists are a convenience.
  }
}

/** A value in localStorage with a setter, shared across components through a storage event. */
function useStored<T>(key: string, fallback: T): [T, (v: T | ((old: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => read(key, fallback));
  useEffect(() => {
    const on = (e: Event) => {
      if ((e as CustomEvent<string>).detail === key) setValue(read(key, fallback));
    };
    window.addEventListener("hl-local", on);
    return () => window.removeEventListener("hl-local", on);
  }, [key, fallback]);
  const set = useCallback((v: T | ((old: T) => T)) => {
    const next = typeof v === "function" ? (v as (old: T) => T)(read(key, fallback)) : v;
    write(key, next);
    setValue(next);
    window.dispatchEvent(new CustomEvent("hl-local", { detail: key }));
  }, [key, fallback]);
  return [value, set];
}

const EMPTY: never[] = [];

export const usePrefs = () => {
  const [p, set] = useStored<LocalPrefs>(KEYS.prefs, DEFAULT_PREFS);
  return [{ ...DEFAULT_PREFS, ...p }, set] as const;
};
export const useRecent = () => useStored<SavedDesign[]>(KEYS.recent, EMPTY);
export const useFavorites = () => useStored<Favorite[]>(KEYS.favorites, EMPTY);

export function addRecent(list: SavedDesign[], d: Omit<SavedDesign, "id" | "at">): SavedDesign[] {
  if (JSON.stringify(d.params).length > MAX_ITEM) return list;
  const same = (x: SavedDesign) => x.product === d.product && x.name === d.name;
  const prev = list.find(same);
  return [{ thumb: prev?.thumb, ...d, id: prev?.id ?? crypto.randomUUID(), at: Date.now() }, ...list.filter((x) => !same(x))].slice(0, MAX_RECENT);
}

export function setRecentThumb(list: SavedDesign[], product: string, name: string, thumb: string): SavedDesign[] {
  return list.map((x) => (x.product === product && x.name === name ? { ...x, thumb } : x));
}

/** Last settings per product. */
export const lastParams = (product: string) => read<Record<string, Record<string, unknown>>>(KEYS.last, {})[product] ?? null;
export function rememberParams(product: string, params: Record<string, unknown>) {
  if (JSON.stringify(params).length > MAX_ITEM) return;
  write(KEYS.last, { ...read<Record<string, unknown>>(KEYS.last, {}), [product]: params });
}

/** The last catalog and account, so the app opens instantly and offline. The server re-checks everything. */
export const cachedCatalog = () => read<DCatalog | null>(KEYS.catalog, null);
export const cacheCatalog = (c: DCatalog) => write(KEYS.catalog, c);
export const cachedAccount = () => read<DesktopAccount | null>(KEYS.account, null);
export const cacheAccount = (a: DesktopAccount | null) => (a ? write(KEYS.account, a) : localStorage.removeItem(KEYS.account));

export function clearLocalAccountData() {
  localStorage.removeItem(KEYS.account);
}
