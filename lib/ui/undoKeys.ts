/**
 * Ctrl+Z / Ctrl+Y everywhere: the design's undo runs unless a text field has text typed into it
 * since it got focus (then the field undoes its own typing first, as in any app).
 *
 * Before, any focused INPUT, TEXTAREA or SELECT swallowed the shortcut, so after using a number
 * box, a checkbox, a drop-down or a text field (even without typing) Undo silently did nothing.
 */
const TEXT_TYPES = /^(text|search|email|url|tel|password)$/i;
const atFocus = new WeakMap<Element, string>();
let tracking = false;

// number boxes (inputmode decimal or numeric) are settings, not text: Undo always undoes the design
const isText = (el: Element): el is HTMLInputElement | HTMLTextAreaElement | HTMLElement =>
  el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && TEXT_TYPES.test(el.type) && !/^(decimal|numeric)$/.test(el.inputMode)) || (el as HTMLElement).isContentEditable === true;
const textOf = (el: Element) => (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : el.textContent ?? "");

/** Remembers what each text field held when it got focus (once per page). */
export function trackFieldFocus() {
  if (tracking || typeof document === "undefined") return;
  tracking = true;
  const mark = (e: Event) => { const t = e.target; if (t instanceof Element && isText(t)) atFocus.set(t, textOf(t)); };
  document.addEventListener("focusin", mark, true);
  // Enter (a change event) commits a field's entry: Undo then undoes the design again
  document.addEventListener("change", mark, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) mark(e); }, true);
}

/** True when Ctrl+Z/Y belongs to the focused text field: something was typed in it since it got focus. */
export function fieldUndoes(target: EventTarget | null): boolean {
  if (!(target instanceof Element) || !isText(target)) return false;
  const was = atFocus.get(target);
  return was !== undefined && was !== textOf(target);
}

/**
 * Lets go of the focused field before the design's undo, so a number or text box shows the undone
 * value instead of keeping (and later re-applying) what it showed.
 */
export function releaseField() {
  const a = typeof document !== "undefined" ? document.activeElement : null;
  if (a instanceof HTMLElement && a !== document.body && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) a.blur();
}

/** The design's undo or redo for a Ctrl/Cmd key event, or null when it is not one (or the field takes it). */
export function undoKey(e: KeyboardEvent): "undo" | "redo" | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const k = e.key.toLowerCase();
  const which = k === "z" ? (e.shiftKey ? "redo" : "undo") : k === "y" && !e.shiftKey ? "redo" : null;
  if (!which || fieldUndoes(e.target)) return null;
  return which;
}

if (typeof document !== "undefined") trackFieldFocus();
