"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
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
    const prev = loadPrefs();
    const next = typeof patch === "function" ? patch(prev) : { ...prev, ...patch };
    if (next.theme !== prev.theme) next.themeChosen = true;
    if (next.accent !== prev.accent) next.accentChosen = true;
    savePrefs(next);
  }, []);
  return [prefs, update, ready];
}

/** Applies theme and accent to <html>; "system" follows the OS setting. The editor has its own theme. */
export function applyTheme(p: Pick<Preferences, "theme" | "editorTheme" | "accent">, editor = false) {
  const root = document.documentElement;
  const dark = typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
  const t = editor ? p.editorTheme : p.theme;
  root.dataset.theme = t === "system" ? (dark ? "dark" : "light") : t;
  root.dataset.accent = p.accent;
}

export function ThemeSync() {
  const [prefs, , ready] = usePrefs();
  const editor = usePathname()?.startsWith("/editor/") ?? false;
  useEffect(() => {
    if (!ready) return;
    applyTheme(prefs, editor);
    if ((editor ? prefs.editorTheme : prefs.theme) !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme(prefs, editor);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [prefs, ready, editor]);
  return null;
}
