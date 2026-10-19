/**
 * Browser-side loading for Letters: the HarfBuzz WASM module, parsed fonts, and CSS font faces
 * for the picker previews.
 */
import { fontFamilyName, fontInfo, loadFont, type HarfBuzz, type LoadedFont } from "@/lib/letters";
import { getStoredFont, putStoredFont } from "./fontStore";

export const UPLOAD_PREFIX = "upload:";
export const isUploadId = (id: string) => id.startsWith(UPLOAD_PREFIX);

/** Largest font file accepted for upload. */
export const MAX_FONT_BYTES = 20 * 1024 * 1024;
export const FONT_FILE = /\.(ttf|otf|woff|woff2)$/i;

/**
 * A font file added on this device: checked, a WOFF unpacked to its TTF or OTF, and stored in this
 * browser. Returns its id and name, or throws a readable error.
 */
export async function addFontFile(file: File): Promise<{ id: string; name: string }> {
  if (!FONT_FILE.test(file.name)) throw new Error("Use a .ttf, .otf or .woff font file");
  if (file.size > MAX_FONT_BYTES) throw new Error("That font file is larger than 20 MB");
  const hb = await loadHarfBuzz();
  let bytes = await file.arrayBuffer();
  const sig = bytes.byteLength >= 4 ? new DataView(bytes).getUint32(0) : 0;
  if (sig === 0x774f4646 || sig === 0x774f4632) bytes = (await import("@/lib/letters/woff")).woffToSfnt(bytes);
  const id = UPLOAD_PREFIX + crypto.randomUUID();
  const probe = loadFont(hb, id, file.name, bytes.slice(0));
  const name = fontFamilyName(probe) || file.name.replace(FONT_FILE, "");
  await putStoredFont({ id, name, fileName: file.name, added: Date.now(), bytes });
  return { id, name };
}

let hbPromise: Promise<HarfBuzz> | null = null;

/** HarfBuzz is copied to /hb by scripts/copy-wasm.js and loaded as a native ES module. */
export function loadHarfBuzz(): Promise<HarfBuzz> {
  const url = "/hb/index.mjs";
  hbPromise ??= import(/* webpackIgnore: true */ /* @vite-ignore */ url) as Promise<HarfBuzz>;
  hbPromise.catch(() => { hbPromise = null; });
  return hbPromise;
}

const fonts = new Map<string, Promise<LoadedFont>>();

async function fontBytes(id: string): Promise<{ name: string; bytes: ArrayBuffer }> {
  if (isUploadId(id)) {
    const f = await getStoredFont(id);
    if (!f) throw new Error("This project uses an uploaded font that is not on this device. Pick another font or upload it again.");
    return { name: f.name, bytes: f.bytes };
  }
  const info = fontInfo(id);
  if (!info) throw new Error(`Unknown font “${id}”. Pick another font.`);
  const res = await fetch(`/fonts/${info.file}`);
  if (!res.ok) throw new Error(`Could not load ${info.name} (${res.status}).`);
  return { name: info.name, bytes: await res.arrayBuffer() };
}

/** Parsed font by id (bundled or uploaded), cached for the session. */
export function getLoadedFont(hb: HarfBuzz, id: string): Promise<LoadedFont> {
  let p = fonts.get(id);
  if (!p) {
    p = fontBytes(id).then(({ name, bytes }) => loadFont(hb, id, name, bytes));
    p.catch(() => fonts.delete(id));
    fonts.set(id, p);
  }
  return p;
}

export const forgetFont = (id: string) => fonts.delete(id);

/** CSS family name used to preview a font in the picker. */
export const previewFamily = (id: string) => `hl-${id.replace(/[^a-z0-9-]/gi, "-")}`;

const faces = new Map<string, Promise<void>>();

/** Register a font for CSS previews (once per id). */
export function ensurePreviewFace(id: string): Promise<void> {
  let p = faces.get(id);
  if (!p) {
    p = (async () => {
      const src = isUploadId(id) ? (await fontBytes(id)).bytes : `url(/fonts/${fontInfo(id)?.file})`;
      const face = new FontFace(previewFamily(id), src);
      await face.load();
      document.fonts.add(face);
    })();
    p.catch(() => faces.delete(id));
    faces.set(id, p);
  }
  return p;
}
