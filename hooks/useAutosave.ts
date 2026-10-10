"use client";

import { useEffect, useRef } from "react";
import type { Units } from "@/components/editor/format";

/** localStorage key of the Hinge Box editor. Each product keeps its own key. */
export const HINGE_KEY = "hingelab-v1";

/** Debounced localStorage save. Cloud sync (1.5 s) arrives in a later phase. */
export function useAutosave<T>(params: T, units: Units, onStatus: (status: string) => void, key = HINGE_KEY) {
  const latest = useRef({ params, units, key });
  latest.current = { params, units, key };

  useEffect(() => {
    const saveT = window.setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify({ params, units }));
        onStatus("Autosaved locally");
      } catch {
        onStatus("Local autosave unavailable");
      }
    }, 300);
    return () => window.clearTimeout(saveT);
  }, [params, units, onStatus, key]);

  // Flush on unmount (switching products) so the last edit is not lost to the debounce.
  useEffect(() => () => {
    const l = latest.current;
    try { localStorage.setItem(l.key, JSON.stringify({ params: l.params, units: l.units })); } catch { /* storage full or blocked */ }
  }, []);
}

export function readStored<T>(key = HINGE_KEY): { params?: Partial<T>; units?: string } | null {
  try {
    const s = JSON.parse(localStorage.getItem(key) || "null") as { params?: Partial<T>; units?: string } | null;
    if (!s || typeof s !== "object") return null;
    return s;
  } catch {
    return null;
  }
}
