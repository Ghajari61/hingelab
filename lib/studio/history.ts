/**
 * Undo/redo for studio documents: every edit is an immer recipe; history keeps its patches and
 * inverse patches (200 steps). Edits that share a merge key within a short time (dragging, arrow
 * nudges, typing in a field) become one step.
 */
import { applyPatches, enablePatches, produceWithPatches, type Patch } from "immer";
import type { Document } from "./types";

enablePatches();

export const HISTORY_LIMIT = 200;
export const MERGE_MS = 1000;

export interface HistoryEntry { label: string; patches: Patch[]; inverse: Patch[]; mergeKey?: string; at: number }
export interface History { past: HistoryEntry[]; future: HistoryEntry[] }

export const emptyHistory = (): History => ({ past: [], future: [] });

export interface CommitOptions {
  mergeKey?: string;
  now?: number;
  /** Follow-up recipes run on the edited document (derived data such as clone caches); part of the same step. */
  after?: (doc: Document) => Generator<(d: Document) => void, void, Document>;
}

export interface CommitResult<T> { doc: Document; history: History; changed: boolean; result: T }

export function commit<T = void>(doc: Document, history: History, label: string, recipe: (d: Document) => T, o: CommitOptions = {}): CommitResult<T> {
  let result: T = undefined as T;
  let [next, patches, inverse] = produceWithPatches(doc, (d: Document) => { result = recipe(d); });
  if (!patches.length) return { doc, history, changed: false, result };
  if (o.after) {
    const it = o.after(next);
    for (let r = it.next(next); !r.done; r = it.next(next)) {
      const [n2, p2, i2] = produceWithPatches(next, r.value);
      next = n2; patches = [...patches, ...p2]; inverse = [...i2, ...inverse];
    }
  }
  const now = o.now ?? Date.now();
  const top = history.past[history.past.length - 1];
  let past: HistoryEntry[];
  if (o.mergeKey && top && top.mergeKey === o.mergeKey && now - top.at <= MERGE_MS) {
    past = [...history.past.slice(0, -1), { ...top, patches: [...top.patches, ...patches], inverse: [...inverse, ...top.inverse], at: now }];
  } else {
    past = [...history.past, { label, patches, inverse, mergeKey: o.mergeKey, at: now }];
    if (past.length > HISTORY_LIMIT) past = past.slice(past.length - HISTORY_LIMIT);
  }
  return { doc: next, history: { past, future: [] }, changed: true, result };
}

export function undo(doc: Document, h: History): { doc: Document; history: History; label?: string } {
  const top = h.past[h.past.length - 1];
  if (!top) return { doc, history: h };
  return { doc: applyPatches(doc, top.inverse), history: { past: h.past.slice(0, -1), future: [top, ...h.future] }, label: top.label };
}

export function redo(doc: Document, h: History): { doc: Document; history: History; label?: string } {
  const top = h.future[0];
  if (!top) return { doc, history: h };
  return { doc: applyPatches(doc, top.patches), history: { past: [...h.past, { ...top, mergeKey: undefined }], future: h.future.slice(1) }, label: top.label };
}

/** Ends merging: the next edit with the same key starts a new step (pointer up, field blur). */
export function seal(h: History): History {
  const top = h.past[h.past.length - 1];
  if (!top?.mergeKey) return h;
  return { ...h, past: [...h.past.slice(0, -1), { ...top, mergeKey: undefined }] };
}

/** Jump to a state in the History panel: index = number of steps kept in the past. */
export function jumpTo(doc: Document, h: History, index: number): { doc: Document; history: History } {
  let cur = { doc, history: h };
  while (cur.history.past.length > index && cur.history.past.length) cur = undo(cur.doc, cur.history);
  while (cur.history.past.length < index && cur.history.future.length) cur = redo(cur.doc, cur.history);
  return cur;
}
