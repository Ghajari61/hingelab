"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_PREFS, loadPrefs, savePrefs, type Preferences } from "@/lib/studio/prefs";

/** Preferences shared by every studio page (and kept in step across tabs and components). */
export function usePrefs(): [Preferences, (patch: Partial<Preferences> | ((p: Preferences) => Preferences)) => void, boolean] {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setPrefs(loadPrefs());
    setReady(true);
    const onChange = (e: Event) => setPrefs((e as CustomEvent<Preferences>).detail);
    const onStorage = (e: StorageEvent) => { if (e.key === "hingelab-prefs") setPrefs(loadPrefs()); };
    window.addEventListener("hingelab-prefs", onChange);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener("hingelab-prefs", onChange); window.removeEventListener("storage", onStorage); };
  }, []);
  const update = useCallback((patch: Partial<Preferences> | ((p: Preferences) => Preferences)) => {
    const next = typeof patch === "function" ? patch(loadPrefs()) : { ...loadPrefs(), ...patch };
    savePrefs(next);
  }, []);
  return [prefs, update, ready];
}

/** Applies theme and accent to <html>; "system" follows the OS setting. */
export function applyTheme(p: Pick<Preferences, "theme" | "accent">) {
  const root = document.documentElement;
  const dark = typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = p.theme === "system" ? (dark ? "dark" : "light") : p.theme;
  root.dataset.accent = p.accent;
}

export function ThemeSync() {
  const [prefs] = usePrefs();
  useEffect(() => {
    applyTheme(prefs);
    if (prefs.theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme(prefs);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [prefs]);
  return null;
}
