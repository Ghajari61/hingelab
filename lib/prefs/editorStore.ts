"use client";

import { useEffect, useState } from "react";
import { DEFAULT_EDITOR_PREFS, normalizeEditorPrefs, type EditorPrefs } from "./editor";

/**
 * The classic editors' preferences in the browser. Reads and writes only the `editor` part of
 * `hingelab-prefs`, so the editors do not load the Studio's preference code.
 */
const KEY = "hingelab-prefs";
export const EDITOR_PREFS_EVENT = "hingelab-editor-prefs";

let cached: EditorPrefs | null = null;

function raw(): Record<string, unknown> {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? "{}") as unknown;
    return r && typeof r === "object" && !Array.isArray(r) ? (r as Record<string, unknown>) : {};
  } catch { return {}; }
}

/** The current preferences (cached; cheap enough to call while drawing). */
export function editorPrefs(): EditorPrefs {
  if (typeof window === "undefined") return DEFAULT_EDITOR_PREFS;
  return (cached ??= normalizeEditorPrefs(raw().editor));
}

/** The interface size and reduced motion on <html> (the theme script sets them before the first paint). */
export function applyEditorPrefs(p: EditorPrefs) {
  const root = document.documentElement;
  if (p.uiSize === "normal") delete root.dataset.uiSize;
  else root.dataset.uiSize = p.uiSize;
  if (p.reduceMotion) root.dataset.reduceMotion = "";
  else delete root.dataset.reduceMotion;
  if (p.dockW) { root.dataset.dockW = ""; root.style.setProperty("--dock-w", `${p.dockW}px`); }
  else { delete root.dataset.dockW; root.style.removeProperty("--dock-w"); }
  if (p.dockCollapsed) root.dataset.dockCollapsed = "";
  else delete root.dataset.dockCollapsed;
}

export function saveEditorPrefs(patch: Partial<EditorPrefs>): EditorPrefs {
  const all = raw();
  const next = normalizeEditorPrefs({ ...editorPrefs(), ...patch });
  try { localStorage.setItem(KEY, JSON.stringify({ ...all, editor: next })); } catch { /* private mode */ }
  cached = next;
  applyEditorPrefs(next);
  window.dispatchEvent(new CustomEvent(EDITOR_PREFS_EVENT, { detail: next }));
  return next;
}

if (typeof window !== "undefined") {
  window.addEventListener("hingelab-prefs", () => { cached = null; });
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    cached = null;
    const p = editorPrefs();
    applyEditorPrefs(p);
    window.dispatchEvent(new CustomEvent(EDITOR_PREFS_EVENT, { detail: p }));
  });
}

/** The preferences, kept in step with the Settings dialog and other tabs. */
export function useEditorPrefs(): EditorPrefs {
  const [p, setP] = useState<EditorPrefs>(DEFAULT_EDITOR_PREFS);
  useEffect(() => {
    const initial = editorPrefs();
    applyEditorPrefs(initial);
    setP(initial);
    const on = (e: Event) => setP((e as CustomEvent<EditorPrefs>).detail);
    window.addEventListener(EDITOR_PREFS_EVENT, on);
    return () => window.removeEventListener(EDITOR_PREFS_EVENT, on);
  }, []);
  return p;
}
