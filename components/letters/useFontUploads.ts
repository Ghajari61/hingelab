"use client";

import { useEffect, useState } from "react";
import { deleteStoredFont, getStoredFont, listStoredFonts, type StoredFontMeta } from "./fontStore";
import { addFontFile, forgetFont, isUploadId } from "./runtime";

/** Largest uploaded font a server export request carries (base64 keeps the body under 4.5 MB). */
const MAX_EXPORT_FONT_BYTES = 3 * 1024 * 1024;

/** Fonts uploaded on this device, with adding and removing them. Messages go to `toast`. */
export function useFontUploads(toast: (msg: string) => void) {
  const [uploads, setUploads] = useState<StoredFontMeta[]>([]);
  useEffect(() => { listStoredFonts().then(setUploads, () => {}); }, []);

  /** The new font's id, or null when the file could not be added. */
  async function add(file: File): Promise<string | null> {
    try {
      const { id, name } = await addFontFile(file);
      setUploads(await listStoredFonts());
      toast(`Added ${name} on this device`);
      return id;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not read that font");
      return null;
    }
  }

  /** True when the font was removed (after the user confirmed). */
  async function remove(id: string): Promise<boolean> {
    const meta = uploads.find((u) => u.id === id);
    if (!window.confirm(`Remove ${meta?.name ?? "this font"} from this device?`)) return false;
    await deleteStoredFont(id).catch(() => {});
    forgetFont(id);
    setUploads(await listStoredFonts().catch(() => []));
    return true;
  }

  return { uploads, add, remove };
}

/** The uploaded fonts among `ids`, as base64 for a server export, or a message when one cannot go. */
export async function fontsForExport(ids: string[]): Promise<{ id: string; name: string; data: string }[] | { error: string }> {
  const out: { id: string; name: string; data: string }[] = [];
  for (const id of new Set(ids.filter(isUploadId))) {
    const f = await getStoredFont(id);
    if (!f) return { error: "An uploaded font is not on this device. Upload it again, then export." };
    if (f.bytes.byteLength > MAX_EXPORT_FONT_BYTES) return { error: "Fonts over 3 MB cannot be exported through the server yet. Use a smaller font file." };
    const bytes = new Uint8Array(f.bytes);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    out.push({ id, name: f.name, data: btoa(bin) });
  }
  return out.length > 2 ? { error: "A design exported through the server can use at most two uploaded fonts." } : out;
}
