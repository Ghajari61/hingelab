import type { Document } from "./types";

const n = (v: unknown) => (typeof v === "number" && isFinite(v) ? +v.toFixed(3) : 0);

/**
 * A small SVG preview of a document: its sheets, plus the editor's rendered art when given.
 * `art` is SVG markup in document millimetres that the caller built from numbers only; every value
 * written here is forced to a number because the result is shown as markup.
 */
export function documentThumbnail(doc: Document, art = ""): string {
  const xs = doc.sheets.flatMap((s) => [n(s.x), n(s.x) + n(s.w)]);
  const ys = doc.sheets.flatMap((s) => [n(s.y), n(s.y) + n(s.h)]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
  const pad = Math.max(x1 - x0, y1 - y0, 1) * 0.04;
  const vb = [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad].map(n).join(" ");
  const sheets = doc.sheets.map((s) => `<rect x="${n(s.x)}" y="${n(s.y)}" width="${n(s.w)}" height="${n(s.h)}" style="fill:var(--surface-sheet,#1F1D1A);stroke:var(--sheet-edge,#4A4440)" stroke-width="${n(pad / 4)}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="xMidYMid meet">${sheets}${art}</svg>`;
}
