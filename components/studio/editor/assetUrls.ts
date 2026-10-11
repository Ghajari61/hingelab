"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getLocalAsset } from "@/lib/studio/localStore";
import type { Document, GroupNode } from "@/lib/studio/types";

function imageAssets(root: GroupNode): string[] {
  const out = new Set<string>();
  const rec = (g: GroupNode) => { for (const n of g.children) { if (n.type === "image") out.add(n.assetId); else if (n.type === "group") rec(n); } };
  rec(root);
  return [...out].sort();
}

/**
 * Object URLs for the project's images, read from this device's asset store: one URL per asset,
 * created when an image node first uses it and revoked when no node does (or the editor closes).
 * Assets that aren't stored locally (cloud-only) have no URL and draw as a placeholder.
 */
export function useImageUrls(doc: Document): Record<string, string> {
  const key = imageAssets(doc.root).join("|");
  const wanted = useMemo(() => (key ? key.split("|") : []), [key]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const live = useRef(new Map<string, string>());
  const docId = doc.id;
  const mimes = useRef<Record<string, string>>({});
  mimes.current = Object.fromEntries(doc.assets.map((a) => [a.id, a.mime]));
  useEffect(() => {
    let alive = true;
    const have = live.current;
    for (const [id, url] of [...have]) if (!wanted.includes(id)) { URL.revokeObjectURL(url); have.delete(id); }
    const missing = wanted.filter((id) => !have.has(id));
    if (!missing.length) { setUrls(Object.fromEntries(have)); return; }
    void Promise.all(missing.map(async (id) => {
      const bytes = await getLocalAsset(docId, id).catch(() => null);
      if (!bytes || !alive || have.has(id)) return;
      have.set(id, URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimes.current[id] || "image/png" })));
    })).then(() => { if (alive) setUrls(Object.fromEntries(have)); });
    return () => { alive = false; };
  }, [wanted, docId]);
  useEffect(() => () => { for (const url of live.current.values()) URL.revokeObjectURL(url); live.current.clear(); }, []);
  return urls;
}
