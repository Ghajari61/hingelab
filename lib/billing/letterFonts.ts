/**
 * Server-side fonts for Letters export: HarfBuzz from node_modules, bundled fonts from
 * public/fonts (traced into the export function by next.config.ts), uploads from the request.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fontInfo, loadFont, type HarfBuzz, type LoadedFont } from "@/lib/letters";
import { MAX_UPLOAD_FONT_BYTES } from "./exportLetters";

let hbPromise: Promise<HarfBuzz> | null = null;
const bundled = new Map<string, Promise<LoadedFont>>();

export function serverHarfBuzz(): Promise<HarfBuzz> {
  hbPromise ??= import("harfbuzzjs") as Promise<HarfBuzz>;
  hbPromise.catch(() => { hbPromise = null; });
  return hbPromise;
}

const toArrayBuffer = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

/** A bundled font by id; null for ids that are not bundled. */
export function bundledFont(hb: HarfBuzz, id: string): Promise<LoadedFont> | null {
  const info = fontInfo(id);
  if (!info) return null;
  let p = bundled.get(id);
  if (!p) {
    p = readFile(path.join(process.cwd(), "public", "fonts", info.file)).then(b => loadFont(hb, id, info.name, toArrayBuffer(b)));
    p.catch(() => bundled.delete(id));
    bundled.set(id, p);
  }
  return p;
}

/** An error whose message is written for the user; other errors are logged, not shown. */
export class FontError extends Error {}

/** An uploaded font sent with the request as base64. Throws a readable FontError. */
export function uploadedFont(hb: HarfBuzz, id: string, name: string, base64: string): LoadedFont {
  const b = Buffer.from(base64, "base64");
  if (!b.length) throw new FontError("The uploaded font is empty.");
  if (b.length > MAX_UPLOAD_FONT_BYTES) throw new FontError("Uploaded fonts over 3 MB cannot be exported through the server yet. Use a smaller font file.");
  return loadFont(hb, id, name.slice(0, 120) || "Uploaded font", toArrayBuffer(b));
}
