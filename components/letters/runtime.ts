/**
 * Browser-side loading for Letters: the HarfBuzz WASM module, parsed fonts, and CSS font faces
 * for the picker previews.
 */
import { fontInfo, loadFont, type HarfBuzz, type LoadedFont } from "@/lib/letters";
import { getStoredFont } from "./fontStore";

export const UPLOAD_PREFIX = "upload:";
export const isUploadId = (id: string) => id.startsWith(UPLOAD_PREFIX);

let hbPromise: Promise<HarfBuzz> | null = null;

/** HarfBuzz is copied to /hb by scripts/copy-wasm.js and loaded as a native ES module. */
export function loadHarfBuzz(): Promise<HarfBuzz> {
  const url = "/hb/index.mjs";
  hbPromise ??= import(/* webpackIgnore: true */ url) as Promise<HarfBuzz>;
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
