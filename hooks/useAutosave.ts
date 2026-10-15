"use client";

import { useEffect, useRef } from "react";
import type { Units } from "@/components/editor/format";
import { useEditorPrefs } from "@/lib/prefs/editorStore";

/** localStorage key of the Hinge Box editor. Each product keeps its own key. */
export const HINGE_KEY = "hingelab-v1";
/** Units preference of cloud projects (guest projects keep units in their own autosave). */
export const UNITS_KEY = "hingelab-units";

/**
 * Debounced localStorage save of the guest editor. Cloud projects use useCloudAutosave instead.
 * Settings > Autosave off stops it (the status bar says so).
 */
export function useAutosave<T>(params: T, units: Units, onStatus: (status: string) => void, key = HINGE_KEY, enabled = true, version?: number) {
  const allowed = useEditorPrefs().autosave;
  const on = enabled && allowed;
  const latest = useRef({ params, units, key, enabled: on, version });
  latest.current = { params, units, key, enabled: on, version };

  useEffect(() => {
    if (enabled && !allowed) onStatus("Autosave is off");
  }, [enabled, allowed, onStatus]);

  useEffect(() => {
    if (!on) return;
    const saveT = window.setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify({ params, units, ...(version ? { v: version } : {}) }));
        onStatus("Autosaved locally");
      } catch {
        onStatus("Local autosave unavailable");
      }
    }, 300);
    return () => window.clearTimeout(saveT);
  }, [params, units, onStatus, key, on, version]);

  // Flush on unmount (switching products) so the last edit is not lost to the debounce.
  useEffect(() => () => {
    const l = latest.current;
    if (!l.enabled) return;
    try { localStorage.setItem(l.key, JSON.stringify({ params: l.params, units: l.units, ...(l.version ? { v: l.version } : {}) })); } catch { /* storage full or blocked */ }
  }, []);

  // The units choice is also this device's default (Settings › Units, and cloud projects).
  useEffect(() => {
    try { localStorage.setItem(UNITS_KEY, units); } catch { /* private mode */ }
  }, [units]);
}

export function readStored<T>(key = HINGE_KEY): { params?: Partial<T>; units?: string; v?: number } | null {
  try {
    const s = JSON.parse(localStorage.getItem(key) || "null") as { params?: Partial<T>; units?: string; v?: number } | null;
    if (!s || typeof s !== "object") return null;
    return s;
  } catch {
    return null;
  }
}

export function readUnits(): Units {
  try {
    const u = localStorage.getItem(UNITS_KEY) ?? (JSON.parse(localStorage.getItem("hingelab-prefs") ?? "{}") as { units?: unknown })?.units;
    return u === "in" ? "in" : "mm";
  } catch { return "mm"; }
}
