/**
 * A dieline as a layered SVG: one Inkscape layer per line type, each in its own colour, creases and
 * perforations dashed, sized in real millimetres or inches. Parts sit side by side, `gap` apart.
 */
import type { Dieline, DielinePart, LineType, Pt } from "./types";
import { LINE_TYPES } from "./types";

export interface LineStyle { color: string; dash?: string; name: string; code: string }

/** Colours and dashes the laser and cutter programs read: cut red, crease (score) blue. */
export const LINE_STYLES: Record<LineType, LineStyle> = {
  cut: { color: "#FF0000", name: "Cut", code: "02" },
  crease: { color: "#0000FF", dash: "3 1.5", name: "Crease (score)", code: "01" },
  perforation: { color: "#00A000", dash: "1 1", name: "Perforation", code: "03" },
  halfCut: { color: "#FF00FF", dash: "4 1 1 1", name: "Half cut", code: "04" },
  engrave: { color: "#000000", name: "Engrave", code: "00" },
  bleed: { color: "#00AEEF", dash: "0.5 0.5", name: "Bleed", code: "06" },
};

export interface SvgOptions {
  unit?: "mm" | "in";
  gap?: number;
  /** Line types to write (missing: all). */
  layers?: Partial<Record<LineType, boolean>>;
  styles?: Partial<Record<LineType, Partial<LineStyle>>>;
  /** Draw creases solid (some cutters read dashes as separate cuts). */
  solidCreases?: boolean;
}

const f = (v: number) => (Math.round(v * 1000) / 1000).toString();

export function partBox(part: DielinePart) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of part.paths) for (const [x, y] of p.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}

/** Where each part goes: left to right, tops aligned, `gap` apart, starting `gap` in. */
export function layoutParts(d: Dieline, gap = 10) {
  let x = gap, H = 0;
  const at = d.parts.map((part) => {
    const b = partBox(part), dx = x - b.x0, dy = gap - b.y0;
    x += b.x1 - b.x0 + gap;
    H = Math.max(H, b.y1 - b.y0 + 2 * gap);
    return { part, dx, dy };
  });
  return { at, width: x, height: H };
}

const pathD = (pts: Pt[], closed: boolean, dx: number, dy: number) => "M" + pts.map(([x, y]) => `${f(x + dx)},${f(y + dy)}`).join("L") + (closed ? "Z" : "");

export function dielineSVG(d: Dieline, o: SvgOptions = {}): string {
  const { at, width, height } = layoutParts(d, o.gap ?? 10);
  const k = o.unit === "in" ? 1 / 25.4 : 1, u = o.unit === "in" ? "in" : "mm";
  let s = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${f(width * k)}${u}" height="${f(height * k)}${u}" viewBox="0 0 ${f(width)} ${f(height)}">\n`;
  s += `<!-- HingeLab paper box: ${d.style}. Outside ${d.outer.map((v) => f(v)).join(" × ")} mm, inside ${d.inner.map((v) => f(v)).join(" × ")} mm. -->\n`;
  for (const type of LINE_TYPES) {
    if (o.layers && o.layers[type] === false) continue;
    const st = { ...LINE_STYLES[type], ...(o.styles?.[type] ?? {}) };
    const ds = at.flatMap(({ part, dx, dy }) => part.paths.filter((p) => p.type === type).map((p) => pathD(p.pts, p.closed, dx, dy)));
    if (!ds.length) continue;
    const dash = st.dash && !(type === "crease" && o.solidCreases) ? ` stroke-dasharray="${st.dash}"` : "";
    s += `<g id="${type}" inkscape:groupmode="layer" inkscape:label="${st.code} ${st.name}" fill="none" stroke="${st.color}" stroke-width="0.2"${dash}>\n`;
    for (const dd of ds) s += `  <path d="${dd}"/>\n`;
    s += `</g>\n`;
  }
  return s + `</svg>\n`;
}
