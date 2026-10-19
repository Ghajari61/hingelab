/**
 * The order of a generator's sections in the editor's right-hand panel: what to make and its size
 * first, then its shape, text and engraving, and how it is put together last. Only products whose
 * own order breaks that rule are listed; the others show their sections as defined. Field
 * definitions don't change, only the order they are shown in.
 */
import type { GeneratorId } from "./ids";

export const SECTION_ORDER: Partial<Record<GeneratorId, string[]>> = {
  // Joints came before the box's size; they are a construction detail.
  boxes: ["design", "box", "tray", "drawer", "hex", "insert", "money", "stack", "book", "sign", "frame", "stand", "keys", "bird", "pierce", "engrave", "joint"],
};

/** `sections` in the panel order for `id` (unlisted sections keep their place after the listed ones). */
export function orderSections<S extends { id: string }>(id: string, sections: readonly S[]): S[] {
  const order = SECTION_ORDER[id as GeneratorId];
  if (!order) return [...sections];
  const rank = (s: S) => { const i = order.indexOf(s.id); return i < 0 ? order.length : i; };
  return sections.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i).map((x) => x.s);
}
