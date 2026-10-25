/**
 * Free tool: a laser file made for one material thickness, scaled for another. Slots and tabs sized
 * for 3 mm stock fit 4 mm stock when the whole drawing grows by 4 / 3, so the file is scaled evenly
 * by new ÷ old. Only the <svg> tag's size changes; every path stays as it was.
 */

const UNIT_MM: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, "": 25.4 / 96 };

/** A length attribute in millimetres, or null. Unitless numbers are CSS pixels (96 per inch). */
export function lengthMM(v: string | undefined): number | null {
  const m = /^\s*([\d.]+(?:e[-+]?\d+)?)\s*(mm|cm|in|pt|pc|px)?\s*$/i.exec(v ?? "");
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n * UNIT_MM[(m[2] ?? "").toLowerCase()] : null;
}

export interface ResizeResult { svg: string; before: { w: number; h: number }; after: { w: number; h: number }; factor: number }

/** The SVG scaled by `to / from` (thicknesses in mm). Throws a readable error for an unusable file. */
export function resizeForThickness(svg: string, from: number, to: number): ResizeResult {
  if (!(from > 0) || !(to > 0)) throw new Error("Enter both thicknesses in millimetres.");
  const head = /<svg\b[^>]*>/i.exec(svg);
  if (!head) throw new Error("This file is not an SVG.");
  const tag = head[0];
  const attr = (name: string) => new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag)?.[1] ?? new RegExp(`\\s${name}\\s*=\\s*'([^']*)'`, "i").exec(tag)?.[1];
  const vb = (attr("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  const hasVB = vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0;
  // Without a size on the tag, a viewBox unit is taken as 1 mm, as laser software does.
  const w = lengthMM(attr("width")) ?? (hasVB ? vb[2] : null);
  const h = lengthMM(attr("height")) ?? (hasVB ? vb[3] : null);
  if (!w || !h) throw new Error("The SVG has no size (no width, height or viewBox), so it cannot be scaled.");
  const k = to / from;
  const W = w * k, H = h * k;
  const fmt = (x: number) => `${Math.round(x * 1000) / 1000}mm`;
  let out = tag.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*')/gi, "");
  if (!hasVB) out = out.replace(/<svg\b/i, `<svg viewBox="0 0 ${w / UNIT_MM.px} ${h / UNIT_MM.px}"`);
  out = out.replace(/<svg\b/i, `<svg width="${fmt(W)}" height="${fmt(H)}"`);
  return { svg: svg.slice(0, head.index) + out + svg.slice(head.index + tag.length), before: { w, h }, after: { w: W, h: H }, factor: k };
}
