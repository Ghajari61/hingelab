/**
 * The window's preferences and lists kept on this computer (localStorage). Only harmless data:
 * settings, starred designs and the last account summary. No tokens, no plan decisions, no files.
 * The shared editors keep their own autosaves, as on the website.
 */
import { useCallback, useEffect, useState } from "react";
import type { DesktopAccount } from "./ipc";

export type Theme = "system" | "light" | "dark";

export interface LocalPrefs {
  theme: Theme;
  autoCheckUpdates: boolean;
  sidebarCollapsed: boolean;
  /** Interface zoom, percent. */
  uiZoom: UiZoom;
  /** Menus and panels appear without animation. */
  reduceMotion: boolean;
  /** At start, open the project file used last. */
  openLast: boolean;
}

export const UI_ZOOMS = [90, 100, 110, 125] as const;
export type UiZoom = (typeof UI_ZOOMS)[number];

/** A design or preset starred in versions before 1.1 (still listed and opened in Project files). */
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

const KEYS = { prefs: "hl-prefs-v1", favorites: "hl-favorites-v1", account: "hl-account-v1" };
export const DEFAULT_PREFS: LocalPrefs = { theme: "system", autoCheckUpdates: true, sidebarCollapsed: false, uiZoom: 100, reduceMotion: false, openLast: false };

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
  const prefs = { ...DEFAULT_PREFS, ...p };
  if (!UI_ZOOMS.includes(prefs.uiZoom)) prefs.uiZoom = 100;
  return [prefs, set] as const;
};
export const useFavorites = () => useStored<Favorite[]>(KEYS.favorites, EMPTY);

/** The last account, so the window opens instantly and offline. The server re-checks everything. */
export const cachedAccount = () => read<DesktopAccount | null>(KEYS.account, null);
export const cacheAccount = (a: DesktopAccount | null) => (a ? write(KEYS.account, a) : localStorage.removeItem(KEYS.account));
