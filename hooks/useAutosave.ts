"use client";

import { useEffect, useRef } from "react";
import type { Units } from "@/components/editor/format";

/** localStorage key of the Hinge Box editor. Each product keeps its own key. */
export const HINGE_KEY = "hingelab-v1";
/** Units preference of cloud projects (guest projects keep units in their own autosave). */
export const UNITS_KEY = "hingelab-units";

/** Debounced localStorage save of the guest editor. Cloud projects use useCloudAutosave instead. */
export function useAutosave<T>(params: T, units: Units, onStatus: (status: string) => void, key = HINGE_KEY, enabled = true) {
  const latest = useRef({ params, units, key, enabled });
  latest.current = { params, units, key, enabled };

  useEffect(() => {
    if (!enabled) return;
    const saveT = window.setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify({ params, units }));
        onStatus("Autosaved locally");
      } catch {
        onStatus("Local autosave unavailable");
      }
    }, 300);
    return () => window.clearTimeout(saveT);
  }, [params, units, onStatus, key, enabled]);

  // Flush on unmount (switching products) so the last edit is not lost to the debounce.
  useEffect(() => () => {
    const l = latest.current;
    if (!l.enabled) return;
    try { localStorage.setItem(l.key, JSON.stringify({ params: l.params, units: l.units })); } catch { /* storage full or blocked */ }
  }, []);

  // Cloud projects remember only the units choice on this device.
  useEffect(() => {
    if (enabled) return;
    try { localStorage.setItem(UNITS_KEY, units); } catch { /* private mode */ }
  }, [enabled, units]);
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

export function readUnits(): Units {
  try { return localStorage.getItem(UNITS_KEY) === "in" ? "in" : "mm"; } catch { return "mm"; }
}
