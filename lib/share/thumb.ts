/**
 * A small preview of any design for the gallery: its cut and score lines read from the exported SVG,
 * scaled into a fixed box. Shown through <img src="data:…">, so it can never run script in the page.
 */
import { layerOp } from "@/lib/export/lbrn2";
import { readScene } from "@/lib/export/scene";

export const THUMB_BOX = 320;
export const MAX_THUMB_CHARS = 60000;

export function designThumb(svg: string): string | null {
  const scene = readScene(svg);
  const cut: [number, number][][] = [], score: [number, number][][] = [];
  const closedCut: boolean[] = [], closedScore: boolean[] = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const layer of scene.layers) {
    if (layer.fill) continue;
    const op = layerOp(layer.label, layer.fill);
    for (const item of layer.items) for (const p of item.polys) {
      if (p.pts.length < 2) continue;
      (op === "cut" ? cut : score).push(p.pts);
      (op === "cut" ? closedCut : closedScore).push(p.closed);
      for (const [x, y] of p.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    }
  }
  if (!cut.length || !(x1 > x0) || !(y1 > y0)) return null;
  const w = x1 - x0, h = y1 - y0, k = (THUMB_BOX - 16) / Math.max(w, h);
  const W = Math.round(w * k) + 16, H = Math.round(h * k) + 16;
  const d = (polys: [number, number][][], closed: boolean[], digits: number) => {
    const f = 10 ** digits;
    const r = (v: number) => Math.round(v * f) / f;
    return polys.map((pts, i) => `M${pts.map(([x, y]) => `${r((x - x0) * k + 8)} ${r((y - y0) * k + 8)}`).join("L")}${closed[i] ? "Z" : ""}`).join("");
  };
  for (const digits of [1, 0]) {
    const body = `<path d="${d(cut, closedCut, digits)}" fill="#C9A36A" fill-opacity="0.22" fill-rule="evenodd" stroke="#8A6A3A" stroke-width="1"/>`
      + (score.length && score.length < 600 ? `<path d="${d(score, closedScore, digits)}" fill="none" stroke="#3B6FD8" stroke-width="0.8"/>` : "");
    const svgOut = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
    if (svgOut.length <= MAX_THUMB_CHARS) return svgOut;
  }
  return null;
}
