/**
 * Pictures for the generators' picture settings. A photo or drawing is decoded and shrunk here;
 * a picture to engrave stays a grey JPEG in the settings, a picture to trace goes to the server as
 * one grey byte a pixel (or as the SVG file) and comes back as outlines.
 */
import type { DPicture } from "../../lib/desktop/types";
import { ipc, type PickedPicture } from "./ipc";

/** Longest side of a grey picture kept in the settings, px. */
const GREY_SIDE = 700;
/** Grey pictures stay well inside a build request. */
const MAX_GREY_URL = 180 * 1024;
/** Longest side traced (the server's limit), px. */
const TRACE_SIDE = 600;
/** Longest side of a traced picture's preview, px. */
const THUMB_SIDE = 200;

type Source = { draw: (g: CanvasRenderingContext2D, w: number, h: number) => void; width: number; height: number; close: () => void };

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) throw new Error("This computer could not draw the picture.");
  return { c, g };
}

const fit = (s: Source, side: number) => {
  const k = Math.min(1, side / Math.max(s.width, s.height));
  return { w: Math.max(1, Math.round(s.width * k)), h: Math.max(1, Math.round(s.height * k)) };
};

/** Drawn on white (transparent parts are background) and turned grey. */
function grey(s: Source, side: number) {
  const { w, h } = fit(s, side);
  const { c, g } = canvas(w, h);
  g.fillStyle = "#fff";
  g.fillRect(0, 0, w, h);
  g.imageSmoothingQuality = "high";
  s.draw(g, w, h);
  const img = g.getImageData(0, 0, w, h), d = img.data;
  const bytes = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const y = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
    d[i] = d[i + 1] = d[i + 2] = bytes[j] = y;
  }
  g.putImageData(img, 0, 0);
  return { c, w, h, bytes };
}

async function rasterSource(data: string, mime: string): Promise<Source> {
  const raw = atob(data);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(new Blob([bytes], { type: mime }));
  } catch {
    throw new Error("This picture could not be read. Save it as a JPEG or PNG and try again.");
  }
  return { width: bmp.width, height: bmp.height, draw: (g, w, h) => g.drawImage(bmp, 0, 0, w, h), close: () => bmp.close() };
}

/** An SVG drawn as a picture (an image element runs no scripts); its size follows `aspect` when it has none. */
async function svgSource(text: string, aspect?: number): Promise<Source> {
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("This SVG could not be drawn. Save it again from your drawing program and try again.");
  }
  const a = aspect ?? (img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1);
  const width = a >= 1 ? 1000 : Math.round(1000 * a), height = a >= 1 ? Math.round(1000 / a) : 1000;
  return { width, height, draw: (g, w, h) => g.drawImage(img, 0, 0, w, h), close: () => URL.revokeObjectURL(url) };
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** The settings a picked picture sets for `f`: the picture (or its preview), its aspect and, traced, its outlines and name. */
export async function pictureValues(f: DPicture, p: PickedPicture): Promise<Record<string, unknown>> {
  if (f.mode === "grey") {
    const s = p.svg != null ? await svgSource(p.svg) : await rasterSource(p.data ?? "", p.mime ?? "image/png");
    try {
      const { c, w, h } = grey(s, GREY_SIDE);
      let q = 0.85, url = c.toDataURL("image/jpeg", q);
      while (url.length > MAX_GREY_URL && q > 0.35) { q -= 0.1; url = c.toDataURL("image/jpeg", q); }
      if (url.length > MAX_GREY_URL) throw new Error("This picture has too much detail to keep. Try a simpler one.");
      return { [f.key]: url, [f.aspectKey]: w / h };
    } finally {
      s.close();
    }
  }
  let traced: { levels: string; aspect: number };
  let preview = "";
  if (p.svg != null) {
    traced = await ipc.tracePicture({ kind: "svg", text: p.svg });
    try {
      const s = await svgSource(p.svg, traced.aspect);
      try { preview = grey(s, THUMB_SIDE).c.toDataURL("image/jpeg", 0.8); } finally { s.close(); }
    } catch {
      // The outlines are what is cut; a picture the browser cannot draw just has no preview.
    }
  } else {
    const s = await rasterSource(p.data ?? "", p.mime ?? "image/png");
    try {
      const t = grey(s, TRACE_SIDE);
      preview = grey(s, THUMB_SIDE).c.toDataURL("image/jpeg", 0.8);
      traced = await ipc.tracePicture({ kind: "raster", width: t.w, height: t.h, grey: toBase64(t.bytes) });
    } finally {
      s.close();
    }
  }
  return {
    [f.key]: preview,
    [f.aspectKey]: traced.aspect,
    ...(f.levels ? { [f.levels]: traced.levels } : {}),
    ...(f.name ? { [f.name]: p.name.slice(0, 80) } : {}),
  };
}

/** The settings that clear `f`'s picture. */
export const clearedPicture = (f: DPicture): Record<string, unknown> => ({
  [f.key]: "",
  ...(f.levels ? { [f.levels]: "" } : {}),
  ...(f.name ? { [f.name]: "" } : {}),
});
