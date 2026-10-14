/**
 * Making a Shadow Box photo from its original: decode and scale it, apply the look, and encode it
 * (JPEG for colour and grey, a small grey PNG for flat tones and engraving dots); find its subject;
 * and make the print PDF. Runs in the photo worker, or on the page where workers cannot draw.
 */
import type { Img } from "@/lib/imaging/image";
import { photoPdf, printPage } from "@/lib/imaging/pdf";
import { applyLook, subjectOf, type LookResult } from "@/lib/imaging/photoLook";
import type { Paper, PhotoSpec, Subject } from "@/lib/imaging/photoSpec";
import { base64, encodeGreyPng, type Deflate } from "@/lib/imaging/png";
import type { Contour } from "@/lib/letters/types";

/** Longest stored photo, characters (see MAX_PHOTO_CHARS). */
const MAX_CHARS = 1_150_000;
/** Print resolution, dots per inch. */
const PRINT_DPI = 300;

type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function surface(w: number, h: number): { g: Ctx; encode: (type: string, q?: number) => Promise<Blob> } {
  if (typeof OffscreenCanvas !== "undefined") {
    const c = new OffscreenCanvas(w, h);
    return { g: c.getContext("2d", { willReadFrequently: true })!, encode: (type, q) => c.convertToBlob({ type, quality: q }) };
  }
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return { g: c.getContext("2d", { willReadFrequently: true })!, encode: (type, q) => new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("Could not encode the photo."))), type, q)) };
}

/** The part (sx, sy, sw, sh of the original, px) scaled to dw × dh, as RGBA. */
function draw(bmp: ImageBitmap, sx: number, sy: number, sw: number, sh: number, dw: number, dh: number): Img {
  const { g } = surface(dw, dh);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.fillStyle = "#fff";
  g.fillRect(0, 0, dw, dh);
  g.drawImage(bmp, sx, sy, sw, sh, 0, 0, dw, dh);
  const d = g.getImageData(0, 0, dw, dh);
  return { width: dw, height: dh, data: d.data };
}

const deflate: Deflate | null = typeof CompressionStream !== "undefined"
  ? async (raw) => new Uint8Array(await new Response(new Blob([raw as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer())
  : null;

async function jpegOf(img: Img, q: number): Promise<Blob> {
  const s = surface(img.width, img.height);
  s.g.putImageData(new ImageData(img.data as Uint8ClampedArray<ArrayBuffer>, img.width, img.height), 0, 0);
  return s.encode("image/jpeg", q);
}

const greyImg = (grey: Uint8Array, width: number, height: number): Img => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < grey.length; i++) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = grey[i]; data[i * 4 + 3] = 255; }
  return { width, height, data };
};

async function encode(r: LookResult, flat: boolean): Promise<string> {
  if (r.kind === "bits" || (r.kind === "grey" && flat)) {
    const [px, w, h, bits] = r.kind === "bits" ? [r.bitmap.bits, r.bitmap.width, r.bitmap.height, 1 as const] : [r.grey, r.width, r.height, 8 as const];
    if (deflate) return "data:image/png;base64," + base64(await encodeGreyPng(px, w, h, bits, deflate));
    const img = r.kind === "bits" ? greyImg(r.bitmap.bits.map((b) => (b ? 0 : 255)), w, h) : greyImg(r.grey, w, h);
    const s = surface(w, h);
    s.g.putImageData(new ImageData(img.data as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
    return "data:image/png;base64," + base64(new Uint8Array(await (await s.encode("image/png")).arrayBuffer()));
  }
  const img = r.kind === "rgba" ? r.img : greyImg(r.grey, r.width, r.height);
  let url = "";
  for (const q of [0.88, 0.8, 0.7, 0.6, 0.5]) {
    url = "data:image/jpeg;base64," + base64(new Uint8Array(await (await jpegOf(img, q)).arrayBuffer()));
    if (url.length <= MAX_CHARS) break;
  }
  return url;
}

export interface Made { url: string; width: number; height: number }

/** The stored photo: the original scaled to the spec's long side (never enlarged) in its look. */
export async function makePhoto(blob: Blob, spec: PhotoSpec): Promise<Made> {
  const bmp = await createImageBitmap(blob);
  try {
    let k = Math.min(1, spec.side / Math.max(bmp.width, bmp.height));
    for (let tries = 0; ; tries++) {
      const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
      const url = await encode(applyLook(draw(bmp, 0, 0, bmp.width, bmp.height, w, h), spec), spec.look === "poster");
      if (url.length <= MAX_CHARS || tries >= 4) return { url, width: w, height: h };
      k *= 0.85;
    }
  } finally {
    bmp.close();
  }
}

/** The subject of a photo on a plain background (see subjectOf). */
export async function photoSubject(blob: Blob, tol: number): Promise<Subject | null> {
  const bmp = await createImageBitmap(blob);
  try {
    const k = Math.min(1, 400 / Math.max(bmp.width, bmp.height));
    return subjectOf(draw(bmp, 0, 0, bmp.width, bmp.height, Math.max(1, Math.round(bmp.width * k)), Math.max(1, Math.round(bmp.height * k))), tol);
  } finally {
    bmp.close();
  }
}

export interface PrintRequest {
  /** The whole photo's place, mm, and the outline the print is cut along (mm, same frame). */
  place: { x: number; y: number; w: number; h: number };
  clip: Contour;
  spec: PhotoSpec;
  paper: Paper;
  caption: string;
}

export interface Printed { pdf: Uint8Array; dpi: number; custom: boolean; w: number; h: number }

/** A PDF of the part of the photo that shows (with its bleed), at up to 300 dpi from the original. */
export async function printPhoto(blob: Blob, r: PrintRequest): Promise<Printed> {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of r.clip) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const rw = x1 - x0, rh = y1 - y0;
  const bmp = await createImageBitmap(blob);
  try {
    const pxmm = bmp.width / r.place.w;
    const sx = Math.max(0, (x0 - r.place.x) * pxmm), sy = Math.max(0, (y0 - r.place.y) * pxmm);
    const sw = Math.min(bmp.width - sx, rw * pxmm), sh = Math.min(bmp.height - sy, rh * pxmm);
    const dpi = Math.min(PRINT_DPI, (sw / rw) * 25.4);
    const dw = Math.max(1, Math.round((rw / 25.4) * dpi)), dh = Math.max(1, Math.round((rh / 25.4) * dpi));
    const look = applyLook(draw(bmp, sx, sy, sw, sh, dw, dh), { ...r.spec, look: r.spec.look === "engrave" ? "grey" : r.spec.look });
    const img = look.kind === "rgba" ? look.img : look.kind === "grey" ? greyImg(look.grey, look.width, look.height) : greyImg(new Uint8Array(0), 0, 0);
    const jpeg = new Uint8Array(await (await jpegOf(img, 0.92)).arrayBuffer());
    const page = printPage(r.paper, rw, rh);
    const pdf = photoPdf({ pageW: page.pageW, pageH: page.pageH, jpeg, x: page.x, y: page.y, w: rw, h: rh, clip: r.clip.map(([x, y]) => [x - x0, y - y0]), caption: r.caption });
    return { pdf, dpi: Math.round(dpi), custom: page.custom, w: rw, h: rh };
  } finally {
    bmp.close();
  }
}
