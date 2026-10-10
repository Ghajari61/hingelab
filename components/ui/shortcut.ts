import { formatShortcut as fmt } from "@/lib/studio/keys";

export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** A shortcut as the user's platform writes it (⌘⇧S on macOS). */
export function formatShortcut(s: string): string {
  return fmt(s, isMac());
}
