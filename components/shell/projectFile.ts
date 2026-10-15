/**
 * Project files (`.hingelab.json`): the settings with their pictures inside (as data URLs), plus the
 * uploaded fonts the design uses, so a file moved to another device opens the same. Fonts in a file
 * are added to the device when it is opened, under the id the design refers to.
 */
import { FONTS_EVENT, getStoredFont, putStoredFont } from "@/components/letters/fontStore";

const MAX_FILE_FONTS = 8;
const MAX_FONT_BYTES = 20 * 1024 * 1024;

export interface ProjectFont { id: string; name: string; fileName: string; data: string }

function uploadedFonts(v: unknown, out = new Set<string>()): Set<string> {
  if (typeof v === "string") { if (v.startsWith("upload:")) out.add(v); }
  else if (Array.isArray(v)) v.forEach((x) => uploadedFonts(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => uploadedFonts(x, out));
  return out;
}

function toB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** The project file's text: `head` (app, product, version), the settings and the fonts they use. */
export async function projectText(head: Record<string, unknown>, params: unknown): Promise<string> {
  const fonts: ProjectFont[] = [];
  for (const id of [...uploadedFonts(params)].slice(0, MAX_FILE_FONTS)) {
    const f = await getStoredFont(id).catch(() => undefined);
    if (f && f.bytes.byteLength <= MAX_FONT_BYTES) fonts.push({ id, name: f.name, fileName: f.fileName, data: toB64(new Uint8Array(f.bytes)) });
  }
  return JSON.stringify({ ...head, params, ...(fonts.length ? { assets: { fonts } } : {}) }, null, 2);
}

const SFNT = new Set([0x00010000, 0x4f54544f /* OTTO */, 0x74727565 /* true */]);

/** Adds the fonts a project file carries that this device lacks; returns how many were added. */
export async function restoreProjectAssets(file: unknown): Promise<number> {
  const fonts = (file as { assets?: { fonts?: unknown } } | null)?.assets?.fonts;
  if (!Array.isArray(fonts)) return 0;
  let added = 0;
  for (const raw of fonts.slice(0, MAX_FILE_FONTS)) {
    const f = raw as Partial<ProjectFont>;
    if (typeof f.id !== "string" || !/^upload:[\w-]{1,80}$/.test(f.id) || typeof f.data !== "string" || f.data.length > (MAX_FONT_BYTES * 4) / 3 + 8) continue;
    if (await getStoredFont(f.id).catch(() => undefined)) continue;
    let bytes: Uint8Array;
    try {
      const bin = atob(f.data);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } catch { continue; }
    if (bytes.length < 12 || !SFNT.has(new DataView(bytes.buffer).getUint32(0))) continue;
    const name = typeof f.name === "string" && f.name.trim() ? f.name.trim().slice(0, 120) : "Font from a project";
    const fileName = typeof f.fileName === "string" ? f.fileName.slice(0, 200) : `${name}.ttf`;
    await putStoredFont({ id: f.id, name, fileName, added: Date.now(), bytes: bytes.buffer as ArrayBuffer }).then(() => { added++; }, () => {});
  }
  if (added) window.dispatchEvent(new Event(FONTS_EVENT));
  return added;
}
