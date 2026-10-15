"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

const QUERY = "(max-width: 600px)";
const FULL_KEY = "hingelab-full-editor";

const subscribe = (cb: () => void) => {
  const m = window.matchMedia(QUERY);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

/**
 * Phone-sized screens get the simple flow (preset, text and photo, export) unless the user asked
 * for the full editor in this tab.
 */
export function usePhoneFlow(): { phone: boolean; narrow: boolean; full: () => void; simple: () => void } {
  const narrow = useNarrow();
  const [wantFull, setWantFull] = useState(() => typeof sessionStorage !== "undefined" && sessionStorage.getItem(FULL_KEY) === "1");
  const full = useCallback(() => { try { sessionStorage.setItem(FULL_KEY, "1"); } catch { /* private mode */ } setWantFull(true); }, []);
  const simple = useCallback(() => { try { sessionStorage.removeItem(FULL_KEY); } catch { /* private mode */ } setWantFull(false); }, []);
  return { phone: narrow && !wantFull, narrow, full, simple };
}

/** True on a phone-sized screen, whatever the editor shows. */
export function useNarrow(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
