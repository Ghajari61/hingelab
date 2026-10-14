"use client";

import { useEffect, useState } from "react";
import { loadMaterials, MATERIALS_EVENT, MATERIALS_KEY, type UserMaterial } from "@/lib/materials/library";

/** The user's own materials, kept current when this tab or another one changes them. */
export function useMaterials(): UserMaterial[] {
  const [list, setList] = useState<UserMaterial[]>([]);
  useEffect(() => {
    const read = () => setList(loadMaterials());
    const other = (e: StorageEvent) => { if (e.key === MATERIALS_KEY) read(); };
    read();
    window.addEventListener(MATERIALS_EVENT, read);
    window.addEventListener("storage", other);
    return () => {
      window.removeEventListener(MATERIALS_EVENT, read);
      window.removeEventListener("storage", other);
    };
  }, []);
  return list;
}
