/**
 * Keyboard shortcuts as text ("Ctrl+Shift+S", "Alt+0", "Shift+M", "Space"). Written with Windows
 * names; on macOS Ctrl becomes ⌘ and Alt becomes ⌥ (spec §9.5).
 */
export interface KeyCombo { ctrl: boolean; alt: boolean; shift: boolean; key: string }

const ALIASES: Record<string, string> = { plus: "+", minus: "-", esc: "escape", del: "delete", space: " ", "=": "=", tilde: "~" };

export function parseShortcut(s: string): KeyCombo {
  const parts = s.split(/\+(?!$)/);
  const c: KeyCombo = { ctrl: false, alt: false, shift: false, key: "" };
  for (const raw of parts) {
    const p = raw.trim();
    const l = p.toLowerCase();
    if (l === "ctrl" || l === "cmd" || l === "⌘") c.ctrl = true;
    else if (l === "alt" || l === "option" || l === "⌥") c.alt = true;
    else if (l === "shift" || l === "⇧") c.shift = true;
    else c.key = ALIASES[l] ?? l;
  }
  return c;
}

/** Shifted symbols browsers report as `key` (US layout), so "Ctrl+Shift+]" matches key "}". */
const SHIFTED: Record<string, string> = { "}": "]", "{": "[", "+": "=", "_": "-", "~": "`", ":": ";", '"': "'", "<": ",", ">": ".", "?": "/", "|": "\\", "!": "1", "@": "2", "#": "3", "$": "4", "%": "5", "^": "6", "&": "7", "*": "8", "(": "9", ")": "0" };

export interface KeyEventLike { key: string; code?: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }

/** The key of an event, normalised: lower-case letters, digits from the physical key when Alt/Shift change them. */
export function eventKey(e: KeyEventLike): string {
  if (e.code && /^Digit\d$/.test(e.code)) return e.code.slice(5);
  if (e.code && /^Key[A-Z]$/.test(e.code)) return e.code.slice(3).toLowerCase();
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  return SHIFTED[k] ?? k;
}

export function matches(e: KeyEventLike, shortcut: string, mac = false): boolean {
  const c = parseShortcut(shortcut);
  const ctrl = mac ? e.metaKey : e.ctrlKey;
  if (ctrl !== c.ctrl || e.altKey !== c.alt) return false;
  const k = eventKey(e);
  const want = SHIFTED[c.key] ?? c.key;
  // "~" and "+" style shortcuts imply Shift on US keyboards; accept them with or without Shift.
  const impliedShift = c.key !== want;
  if (!impliedShift && e.shiftKey !== c.shift) return false;
  return k === want || (c.key === "=" && k === "+");
}

/** A canonical string for conflict detection ("ctrl+shift+s"). */
export function canonical(shortcut: string): string {
  const c = parseShortcut(shortcut);
  return [c.ctrl && "ctrl", c.alt && "alt", c.shift && "shift", SHIFTED[c.key] ?? c.key].filter(Boolean).join("+");
}

export function formatShortcut(s: string, mac = false): string {
  if (!mac) return s;
  const c = parseShortcut(s);
  const key = c.key === " " ? "Space" : c.key.length === 1 ? c.key.toUpperCase() : c.key[0].toUpperCase() + c.key.slice(1);
  return `${c.ctrl ? "⌘" : ""}${c.alt ? "⌥" : ""}${c.shift ? "⇧" : ""}${key}`;
}

const NAMED: Record<string, string> = {
  " ": "Space", escape: "Escape", enter: "Enter", tab: "Tab", backspace: "Backspace", delete: "Delete", insert: "Insert", home: "Home", end: "End",
  pageup: "PageUp", pagedown: "PageDown", arrowup: "ArrowUp", arrowdown: "ArrowDown", arrowleft: "ArrowLeft", arrowright: "ArrowRight",
};

/** The shortcut a key press means ("Ctrl+Shift+K"), or null for a lone modifier. Used by the shortcut recorder. */
export function shortcutFromEvent(e: KeyEventLike): string | null {
  if (["control", "shift", "alt", "meta", "os", "altgraph"].includes(e.key.toLowerCase())) return null;
  const k = eventKey(e);
  const key = NAMED[k] ?? (/^f\d{1,2}$/.test(k) ? k.toUpperCase() : k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1));
  return [(e.ctrlKey || e.metaKey) && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", key].filter(Boolean).join("+");
}

/** True when a single-key shortcut must not fire: the user is typing in a field. */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!t || typeof (t as HTMLElement).tagName !== "string") return false;
  const el = t as HTMLElement;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}
