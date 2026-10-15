/**
 * Share links: a product's settings, compressed into the URL fragment. The fragment never reaches a
 * server, so a link shares nothing with HingeLab; it opens the design read-only with a Remix button.
 * Pictures and uploaded fonts stay out unless the user asks to include pictures.
 */
import { deflateSync, Inflate, strFromU8, strToU8 } from "fflate";
import { GENERATOR_IDS, GENERATOR_INFO, isGeneratorId } from "@/lib/generators/ids";
import { SHARE_KEY } from "./id";

export { SHARE_KEY, SHARED_ID } from "./id";

/** Every product a link or the gallery can carry: the three core editors and the generators. */
export const SHARE_PRODUCTS = ["hinge", "letters", "parametric", ...GENERATOR_IDS] as const;
export const isShareProduct = (p: string) => p === "hinge" || p === "letters" || p === "parametric" || isGeneratorId(p);
export const productName = (p: string) => (p === "hinge" ? "Hinge Box" : p === "letters" ? "Letters" : p === "parametric" ? "Parametric" : isGeneratorId(p) ? GENERATOR_INFO[p].name : p);

/** Links longer than this are cut off by some chat apps and mail programs. */
export const LONG_LINK = 8000;
/** Largest fragment accepted, and the most it may inflate to. */
export const MAX_SHARE_CHARS = 4_000_000;
const MAX_JSON_BYTES = 8 * 1024 * 1024;

export interface SharePayload {
  /** Product id (`hinge`, `letters`, `parametric` or a generator id). */
  p: string;
  params: Record<string, unknown>;
}

function toB64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** Inflates at most `max` bytes; null for damaged data or a bomb. */
function inflateCapped(data: Uint8Array, max: number): Uint8Array | null {
  const parts: Uint8Array[] = [];
  let size = 0, over = false;
  const inf = new Inflate((chunk) => {
    size += chunk.length;
    if (size > max) over = true;
    else parts.push(chunk);
  });
  try {
    for (let i = 0; i < data.length && !over; i += 65536) inf.push(data.subarray(i, i + 65536), i + 65536 >= data.length);
  } catch {
    return null;
  }
  if (over) return null;
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** "1." + base64url(deflate(JSON)). */
export function encodeShare(p: string, params: Record<string, unknown>): string {
  return "1." + toB64url(deflateSync(strToU8(JSON.stringify({ p, params })), { level: 9 }));
}

export function decodeShare(code: string, isProduct: (p: string) => boolean): SharePayload | null {
  if (typeof code !== "string" || code.length > MAX_SHARE_CHARS || !code.startsWith("1.")) return null;
  const bytes = fromB64url(code.slice(2));
  if (!bytes) return null;
  const raw = inflateCapped(bytes, MAX_JSON_BYTES);
  if (!raw) return null;
  try {
    const j = JSON.parse(strFromU8(raw)) as { p?: unknown; params?: unknown };
    if (typeof j.p !== "string" || !isProduct(j.p)) return null;
    if (!j.params || typeof j.params !== "object" || Array.isArray(j.params)) return null;
    return { p: j.p, params: j.params as Record<string, unknown> };
  } catch {
    return null;
  }
}

/** The shared design in a location hash (`#share=…`), if any. */
export function readShareHash(hash: string, isProduct: (p: string) => boolean): SharePayload | null {
  const m = /(?:^#|&)share=([^&]+)/.exec(hash);
  return m ? decodeShare(m[1], isProduct) : null;
}

export function shareURL(origin: string, product: string, params: Record<string, unknown>): string {
  return `${origin}/app/editor/local?p=${encodeURIComponent(product)}#${SHARE_KEY}=${encodeShare(product, params)}`;
}

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const childOf = (v: unknown, k: string | number): unknown => (Array.isArray(v) ? v[k as number] : isPlain(v) ? v[k as string] : undefined);

export interface Stripped { params: Record<string, unknown>; images: number; fonts: number }

/**
 * The settings without what lives only on this device or in pictures: `data:` pictures (unless
 * `keepImages`) and uploaded fonts (`upload:…`), each put back to the default at its place.
 */
export function stripAssets(params: Record<string, unknown>, defaults: unknown, keepImages = false): Stripped {
  let images = 0, fonts = 0;
  const walk = (v: unknown, d: unknown): unknown => {
    if (typeof v === "string") {
      const dv = typeof d === "string" && !d.startsWith("data:") && !d.startsWith("upload:") ? d : "";
      if (v.startsWith("data:") && !keepImages) { images++; return dv; }
      if (v.startsWith("upload:")) { fonts++; return dv; }
      return v;
    }
    if (Array.isArray(v)) return v.map((x, i) => walk(x, childOf(d, i)));
    if (isPlain(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, childOf(d, k))]));
    return v;
  };
  return { params: walk(params, defaults) as Record<string, unknown>, images, fonts };
}

/** Whether the settings hold any picture as a data URL. */
export function hasImages(params: unknown): boolean {
  if (typeof params === "string") return params.startsWith("data:");
  if (Array.isArray(params)) return params.some(hasImages);
  if (isPlain(params)) return Object.values(params).some(hasImages);
  return false;
}