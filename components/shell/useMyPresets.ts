"use client";

import { useCallback, useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import type { Json, ProductId } from "@/lib/supabase/types";
import {
  MY_PRESETS_KEY, addMyPreset, cleanPresetName, mergeCloudPresets, parseMyPresets, removeMyPreset, type MyPreset,
} from "@/lib/userPresets";

function readLocal(): MyPreset[] {
  try { return parseMyPresets(localStorage.getItem(MY_PRESETS_KEY)); } catch { return []; }
}
function writeLocal(list: MyPreset[]) {
  try { localStorage.setItem(MY_PRESETS_KEY, JSON.stringify(list.map(({ cloud: _c, ...p }) => p))); } catch { /* storage full or blocked */ }
}

async function signedInClient() {
  const db = getBrowserClient();
  if (!db) return null;
  const { data } = await db.auth.getUser().catch(() => ({ data: { user: null } }));
  return data.user ? db : null;
}

/** The user's own presets: this device first, then merged with the account's when signed in. */
export function useMyPresets() {
  const [list, setList] = useState<MyPreset[]>([]);

  useEffect(() => {
    let live = true;
    const local = readLocal();
    setList(local);
    void (async () => {
      const db = await signedInClient();
      if (!db) return;
      const { data, error } = await db.from("user_presets").select("id, product, name, params, created_at").order("created_at", { ascending: false }).limit(200);
      if (error || !data || !live) return;
      const cloud = data.map((r) => ({ id: r.id, product: r.product, name: r.name, params: r.params as Record<string, unknown>, createdAt: r.created_at ?? "" }));
      setList(mergeCloudPresets(local, cloud));
    })();
    return () => { live = false; };
  }, []);

  /** Saves a preset and says where it went. */
  const save = useCallback(async (product: ProductId, name: string, params: object): Promise<string> => {
    const item: MyPreset = { id: crypto.randomUUID(), product, name: cleanPresetName(name) || "My preset", params: JSON.parse(JSON.stringify(params)), createdAt: new Date().toISOString() };
    const local = addMyPreset(readLocal(), item);
    writeLocal(local);
    setList((l) => addMyPreset(l, item));
    const db = await signedInClient();
    if (!db) return `Saved “${item.name}” on this device`;
    const { error } = await db.from("user_presets").insert({ id: item.id, product, name: item.name, params: item.params as Json });
    if (error) return `Saved “${item.name}” on this device; it could not be added to your account`;
    setList((l) => l.map((p) => (p.id === item.id ? { ...p, cloud: true } : p)));
    return `Saved “${item.name}” to your presets`;
  }, []);

  const remove = useCallback(async (id: string) => {
    writeLocal(removeMyPreset(readLocal(), id));
    setList((l) => removeMyPreset(l, id));
    const db = await signedInClient();
    if (db) await db.from("user_presets").delete().eq("id", id);
  }, []);

  return { list, save, remove };
}
