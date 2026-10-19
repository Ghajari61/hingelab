"use client";

import { useEffect } from "react";

/** True while the user is typing (a field, a text area or editable text), so single keys stay theirs. */
export function typingIn(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

/** "?" (Shift + /) opens the keyboard shortcuts, except while typing. */
export function useShortcutKey(open: () => void) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey || typingIn(e.target)) return;
      e.preventDefault();
      open();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);
}
