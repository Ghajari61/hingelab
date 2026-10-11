"use client";

import type { StoreApi } from "zustand";
import { preflightMessage, preflightPaths } from "@/lib/studio/preflight";
import type { EditorState } from "./store";

export type Notify = (message: string, action?: { label: string; run: () => void }) => void;

/** After a path operation: a non-blocking toast when its results have open paths or doubled lines, with a way to select them. */
export function runPreflight(api: StoreApi<EditorState>, notify: Notify, ids: string[], label: string, open = true): void {
  if (!ids.length) return;
  const r = preflightPaths(api.getState().doc, ids, { open });
  const msg = preflightMessage(r, label);
  if (!msg) return;
  const hits = [...new Set([...r.open, ...r.duplicates])];
  notify(msg, { label: "Select them", run: () => api.getState().select(hits) });
}
