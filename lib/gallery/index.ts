/**
 * The community gallery (behind the `gallery` flag): designs users publish with a thumbnail, which
 * anyone can open and remix. Pure checks shared by the server actions and the tests.
 */

export const GALLERY_PAGE = 48;
export const MAX_GALLERY_NAME = 80;
export const MAX_GALLERY_PARAMS = 200 * 1024;
export const MAX_GALLERY_THUMB = 60000;
/** Designs one account may publish in a day. */
export const GALLERY_DAILY = 20;

export interface GalleryEntry { product: string; name: string; params: Record<string, unknown>; thumb: string }

export interface GalleryItem { id: string; product: string; name: string; thumbnail: string; created_at: string; mine?: boolean }

/** A publish request made safe to store, or the reason it cannot be. */
export function cleanEntry(raw: unknown, isProduct: (p: string) => boolean): GalleryEntry | { error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (typeof r.product !== "string" || !isProduct(r.product)) return { error: "Unknown product." };
  const name = typeof r.name === "string" ? r.name.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, MAX_GALLERY_NAME) : "";
  if (!name) return { error: "Give the design a name." };
  if (!r.params || typeof r.params !== "object" || Array.isArray(r.params)) return { error: "That is not a design." };
  if (JSON.stringify(r.params).length > MAX_GALLERY_PARAMS) return { error: "This design is too large for the gallery. Leave the pictures out and try again." };
  const thumb = typeof r.thumb === "string" ? r.thumb : "";
  if (!/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]*>[\s\S]*<\/svg>$/.test(thumb) || thumb.length > MAX_GALLERY_THUMB) return { error: "The design has no preview to show." };
  if (/<\s*(?:[\w.-]+:)?(?:script|foreignObject|image|img|iframe|use)\b|[\s/"']on\w+\s*=|javascript:|href\s*=|<!(?!--)/i.test(thumb)) return { error: "The design has no preview to show." };
  return { product: r.product, name, params: r.params as Record<string, unknown>, thumb };
}
