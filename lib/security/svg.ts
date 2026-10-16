/**
 * Safe building blocks for the SVG files and markup HingeLab writes. Exported SVGs are opened in
 * browsers, LightBurn and Inkscape, and the server sends them from our own origin, so no value a
 * user controls may close a comment, leave an attribute or add an element.
 */

/** Text, or an attribute value in double or single quotes. */
export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Text inside `<!-- … -->`: every "--" is split, so no run of dashes (not even "--->") can end the
 * comment early, and control characters XML forbids are dropped.
 */
export function xmlCommentText(s: string): string {
  return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/-(?=-)/g, "- ");
}

/** The only pictures a design may carry: a base64 PNG, JPEG or WebP data URL. */
const IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

export function isImageDataURL(s: unknown): s is string {
  return typeof s === "string" && IMAGE_DATA_URL.test(s);
}

/** Anything that can run script or load a resource inside inline SVG. */
const ACTIVE = /<\s*\/?\s*(?:script|foreignobject|iframe|object|embed|image|use|a|animate\w*|set|style|link|meta|base|feimage)\b|\son[a-z]+\s*=|javascript:|(?:xlink:)?href\s*=|url\s*\(\s*['"]?\s*(?!#)/i;

/**
 * Markup HingeLab built from numbers (project thumbnails) right before it goes into innerHTML.
 * Returns undefined when it holds anything active, so a tampered value shows no preview instead
 * of running.
 */
export function inertSvgMarkup(s: string | null | undefined): string | undefined {
  if (!s || typeof s !== "string" || !/^\s*<svg[\s>]/i.test(s) || ACTIVE.test(s)) return undefined;
  return s;
}

const MM = /(?:^|[\s])(width|height)\s*=\s*["']([\d.]+)\s*mm["']/gi;

/** Width and height written in millimetres. Missing or non-mm sizes are rejected. */
export function svgSizeMm(svg: string): { w: number; h: number } | undefined {
  const found: Partial<Record<"width" | "height", number>> = {};
  for (const match of svg.matchAll(MM)) {
    const key = match[1].toLowerCase() as "width" | "height";
    const n = Number(match[2]);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    found[key] = n;
  }
  return found.width && found.height ? { w: found.width, h: found.height } : undefined;
}

/**
 * SVG a model returned, kept only when it is inert and its millimetre size fits the bed
 * (either orientation).
 */
export function laserSheetSvg(svg: string, bedW: number, bedH: number): { ok: true; svg: string; w: number; h: number } | { ok: false; error: string } {
  const clean = inertSvgMarkup(svg.trim());
  if (!clean) return { ok: false, error: "The SVG was rejected." };
  const size = svgSizeMm(clean);
  if (!size) return { ok: false, error: "The SVG needs a width and height in millimetres." };
  const fits = (size.w <= bedW && size.h <= bedH) || (size.w <= bedH && size.h <= bedW);
  if (!fits) return { ok: false, error: `The SVG is ${size.w}×${size.h} mm, larger than the ${bedW}×${bedH} mm bed.` };
  return { ok: true, svg: clean, w: size.w, h: size.h };
}
