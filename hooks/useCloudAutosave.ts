"use client";

import { useEffect, useRef } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { localCopyKey, SaveScheduler, type LocalCopy, type SaveStatus } from "@/lib/projects/sync";
import { saveProject } from "@/lib/projects/repo";
import type { ProductId } from "@/lib/supabase/types";

/** A cloud project opened in an editor. `push` = the local copy was newer and must be uploaded. */
export type CloudDoc = {
  id: string;
  product: ProductId;
  params: Record<string, unknown>;
  updatedAt: string | null;
  push?: boolean;
};

export function readLocalCopy<P>(id: string): LocalCopy<P> | null {
  try {
    const v = JSON.parse(localStorage.getItem(localCopyKey(id)) || "null") as LocalCopy<P> | null;
    return v && typeof v === "object" && v.params ? v : null;
  } catch {
    return null;
  }
}

function writeLocalCopy<P>(id: string, copy: LocalCopy<P>) {
  try { localStorage.setItem(localCopyKey(id), JSON.stringify(copy)); } catch { /* storage full or blocked */ }
}

/**
 * Saves a cloud project: a local copy on every change, the cloud 1.5 s after the last change.
 * Does nothing when `doc` is null (guest editor, which uses useAutosave instead).
 */
export function useCloudAutosave<P>(
  doc: CloudDoc | null,
  params: P,
  thumbnail: () => string | null,
  onStatus: (s: SaveStatus) => void,
) {
  const scheduler = useRef<SaveScheduler<P> | null>(null);
  const latest = useRef(params);
  latest.current = params;
  const thumb = useRef(thumbnail);
  thumb.current = thumbnail;
  // The params last handed to the scheduler; the opening params count as saved unless they must be pushed.
  const lastSeen = useRef<P | undefined>(doc?.push ? undefined : params);
  const id = doc?.id;
  const product = doc?.product;

  useEffect(() => {
    if (!id || !product) return;
    const db = getBrowserClient();
    const s = new SaveScheduler<P>(async (p) => {
      if (!db || (typeof navigator !== "undefined" && navigator.onLine === false)) throw new Error("offline");
      let t: string | null | undefined;
      try { t = thumb.current(); } catch { t = undefined; }
      const at = await saveProject(db, id, product, p, t);
      if (latest.current === p) writeLocalCopy(id, { params: p, editedAt: at, dirty: false });
    }, onStatus);
    scheduler.current = s;
    const online = () => s.online();
    const leave = () => { if (s.hasPending()) void s.flush(); };
    window.addEventListener("online", online);
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("pagehide", leave);
      void s.flush();
      s.dispose();
      scheduler.current = null;
    };
  }, [id, product, onStatus]);

  useEffect(() => {
    if (!id || !scheduler.current || params === lastSeen.current) return;
    lastSeen.current = params;
    writeLocalCopy(id, { params, editedAt: new Date().toISOString(), dirty: true });
    scheduler.current.change(params);
  }, [id, params]);
}
