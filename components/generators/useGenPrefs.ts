"use client";

import { useCallback, useEffect, useState } from "react";
import { pushRecent, readIds, toggleIn } from "@/lib/generators/randomise";

function useIdList(key: string): [string[], (f: (l: string[]) => string[]) => void] {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => {
    try { setList(readIds(localStorage.getItem(key))); } catch { setList([]); }
  }, [key]);
  const update = useCallback((f: (l: string[]) => string[]) => setList((l) => {
    const next = f(l);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* private mode */ }
    return next;
  }), [key]);
  return [list, update];
}

/** Favourite and recent presets, and the settings Randomise keeps, per product on this device. */
export function useGenPrefs(product: string) {
  const [favs, setFavs] = useIdList(`hingelab-fav-${product}`);
  const [recent, setRecent] = useIdList(`hingelab-recent-${product}`);
  const [locks, setLocks] = useIdList(`hingelab-locks-${product}`);
  return {
    favs, recent, locks,
    toggleFav: useCallback((id: string) => setFavs((l) => toggleIn(l, id)), [setFavs]),
    used: useCallback((id: string) => setRecent((l) => pushRecent(l, id)), [setRecent]),
    toggleLock: useCallback((key: string) => setLocks((l) => toggleIn(l, key)), [setLocks]),
  };
}
