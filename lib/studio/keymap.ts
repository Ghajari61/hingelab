/**
 * Custom shortcuts (Edit → Keyboard Shortcuts): per-command overrides on top of a shortcut set,
 * reassigning with conflict removal, and JSON export/import. Stored in localStorage; signed-in users
 * sync them with their profile (S4).
 */
import { bindingsFor, COMMAND_BY_ID } from "./commands";
import { canonical, parseShortcut } from "./keys";
import type { ShortcutSet } from "./prefs";

export type Keymap = Record<string, string[]>;
const KEY = "hingelab-keymap";
const SETS: ShortcutSet[] = ["hingelab", "corel", "lightburn", "inkscape"];

export function loadKeymap(): Keymap {
  try { return cleanKeymap(JSON.parse(localStorage.getItem(KEY) ?? "{}")); } catch { return {}; }
}

export function saveKeymap(k: Keymap): void {
  try { localStorage.setItem(KEY, JSON.stringify(k)); } catch { /* private mode */ }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("hingelab-keymap", { detail: k }));
}

const validKey = (s: unknown): s is string => typeof s === "string" && s.length > 0 && s.length < 40 && parseShortcut(s).key !== "";

/** Drops unknown commands and malformed shortcuts. */
export function cleanKeymap(raw: unknown): Keymap {
  const out: Keymap = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, keys] of Object.entries(raw as Record<string, unknown>)) {
    if (!COMMAND_BY_ID.has(id) || !Array.isArray(keys)) continue;
    out[id] = keys.filter(validKey).slice(0, 4);
  }
  return out;
}

/** Commands that currently use `key` in this set (with the custom overrides). */
export function usersOf(set: ShortcutSet, custom: Keymap, key: string): string[] {
  const ck = canonical(key);
  return [...bindingsFor(set, custom)].filter(([, keys]) => keys.some((k) => canonical(k) === ck)).map(([id]) => id);
}

/** Gives `key` to command `id` (replacing its shortcuts) and takes it away from any other command. */
export function reassign(set: ShortcutSet, custom: Keymap, id: string, key: string): Keymap {
  const ck = canonical(key);
  const next: Keymap = { ...custom };
  for (const other of usersOf(set, custom, key)) {
    if (other === id) continue;
    next[other] = (bindingsFor(set, custom).get(other) ?? []).filter((k) => canonical(k) !== ck);
  }
  next[id] = [key];
  return next;
}

/** Removes every shortcut of a command (an empty override). */
export function clearShortcut(custom: Keymap, id: string): Keymap {
  return { ...custom, [id]: [] };
}

export function exportKeymap(set: ShortcutSet, custom: Keymap): string {
  return JSON.stringify({ format: "hingelab-shortcuts", version: 1, set, bindings: custom }, null, 2);
}

export function parseKeymap(text: string): { set: ShortcutSet; bindings: Keymap } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("This file is not valid JSON."); }
  const r = raw as { format?: unknown; set?: unknown; bindings?: unknown };
  if (!r || r.format !== "hingelab-shortcuts") throw new Error("This is not a HingeLab shortcuts file.");
  const set = SETS.includes(r.set as ShortcutSet) ? (r.set as ShortcutSet) : "hingelab";
  return { set, bindings: cleanKeymap(r.bindings) };
}
