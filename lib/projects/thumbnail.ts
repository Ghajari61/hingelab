/**
 * Small preview for the project list: the cut outlines of the laid-out sheet, scaled into a fixed
 * box. Shown through <img src="data:…"> so a stored SVG can never run script in the page.
 */
import type { LayerContent } from "@/lib/hinge";

export const THUMB_W = 240;
export const THUMB_H = 160;
const MAX_CHARS = 60000;

/** Rounds every number in a path to `digits` decimals to keep the thumbnail small. */
function roundPath(d: string, digits: number) {
  const f = 10 ** digits;
  return d.replace(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi, (m) => String(Math.round(parseFloat(m) * f) / f));
}

export function thumbnailSVG(content: Pick<LayerContent, "outline" | "slots">, width: number, height: number): string | null {
  if (!content.outline.length || !(width > 0) || !(height > 0)) return null;
  const pad = Math.max(width, height) * 0.03;
  const vb = `${-pad} ${-pad} ${width + 2 * pad} ${height + 2 * pad}`;
  const stroke = Math.max(width, height) / 300;
  let digits = 1;
  let body = "";
  for (;;) {
    const outline = content.outline.map((d) => roundPath(d, digits)).join("");
    const slots = content.slots.length < 400 ? content.slots.map((d) => roundPath(d, digits)).join("") : "";
    body = `<path d="${outline}" fill="#C9A36A" fill-opacity="0.18" fill-rule="evenodd" stroke="#C9A36A" stroke-width="${stroke.toFixed(2)}"/>`
      + (slots ? `<path d="${slots}" fill="none" stroke="#3DDC6E" stroke-width="${stroke.toFixed(2)}"/>` : "");
    if (body.length <= MAX_CHARS || digits === 0) break;
    digits = 0;
  }
  if (body.length > MAX_CHARS) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${THUMB_W}" height="${THUMB_H}" viewBox="${vb}" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
}

/** data: URL for an <img>. */
export function thumbnailURL(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
