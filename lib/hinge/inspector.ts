/* Close-up of the hinge at true proportions: cuts are drawn as wide as the kerf, so the wood left
   between them is the real torsion bar. */
import type { Model, Params, WallPart } from "./types";
import { barWidth, colSegments, hingeCutPaths, honeyLattice, slotLike } from "./hinge";
import { outlinePath } from "./wall";
import { r3 } from "./util";

/** SVG markup for the hinge close-up and its width in mm, or null when no wall has at least two columns. */
export function inspectorSVG(model: Model | null, input: Params): { svg: string; width: number } | null {
  const p = honeyLattice(input), honey = p.pattern === "honeycomb";
  const wall = model && model.parts.find((pt): pt is WallPart => pt.kind === "wall" && pt.cols.length >= 2 && !pt.test);
  if (!model || !wall) return null;
  const s = p.pitch, h = wall.hBody;
  const c0 = wall.cols[0];
  const ncShow = Math.min(wall.cols.length, 7);
  const wx0 = c0.x - 4.5 * s - 3, ww = Math.max(22, (ncShow + 3) * s + 8);
  const wy0 = -4.2, wh = Math.min(h + 5.5, ww * 0.82);
  const fs = ww / 26;
  let g = `<rect x="${r3(wx0)}" y="${r3(wy0)}" width="${r3(ww)}" height="${r3(wh)}" fill="#EFE6D6"/>`;
  const lw = r3(Math.max(p.K, 0.1) * 0.6);
  g += `<path d="${outlinePath(wall, 0, 0)}" fill="#D9B98A" stroke="#D0342C" stroke-width="${lw}"/>`;
  const paths: string[] = [];
  for (const c of wall.cols) { if (c.x < wx0 - s || c.x > wx0 + ww + s) continue; paths.push(...hingeCutPaths(c.x, colSegments(c.kind, model.hs, h, p.bridge), h, p, 0, 0)); }
  g += slotLike(p)
    ? `<path d="${paths.join(" ")}" fill="#EFE6D6" stroke="#1F3F8F" stroke-width="${lw}"/>`
    : `<path d="${paths.join(" ")}" fill="none" stroke="#1F3F8F" stroke-width="${r3(Math.max(p.K, 0.12))}" stroke-linecap="round"/>`;
  // annotations
  const ink = "#5B4630";
  const dim = (x1: number, y1: number, x2: number, y2: number) => `<path d="M${r3(x1)},${r3(y1)}L${r3(x2)},${r3(y2)}" stroke="${ink}" stroke-width="${r3(fs * 0.06)}" marker-start="url(#ar)" marker-end="url(#ar)"/>`;
  const txt = (x: number, y: number, t: string, anchor = "middle") => `<text x="${r3(x)}" y="${r3(y)}" font-size="${r3(fs * 0.62)}" font-family="Source Code Pro, monospace" fill="${ink}" text-anchor="${anchor}">${t}</text>`;
  const c1 = wall.cols[1];
  g += dim(c0.x, -1.6, c1.x, -1.6) + txt((c0.x + c1.x) / 2, -2.4, `spacing ${r3(s)}`);
  // bridge on the first closed (or top-cut) column, slit length beside it
  const bx = c0.x - s * 0.5 - 0.6;
  if (p.pattern !== "serpentine") {
    g += dim(bx, 0, bx, p.bridge) + txt(bx - 0.5, p.bridge * 0.5 + fs * 0.2, `${honey ? "gap" : "bridge"} ${r3(p.bridge)}`, "end");
    const ly = Math.min(p.bridge + model.hs.Lp, wy0 + wh - 1);
    g += dim(bx, p.bridge, bx, ly) + txt(bx - 0.5, (p.bridge + ly) / 2 + fs * 0.2, `${honey ? "cell" : "slit"} ${r3(model.hs.Lp)}`, "end");
  } else {
    const ly = Math.min(h - p.bridge, wy0 + wh - 1);
    g += dim(bx, 0, bx, ly) + txt(bx - 0.5, ly / 2, `cut ${r3(h - p.bridge)}`, "end");
  }
  g += `<text x="${r3(wx0 + ww - 0.6)}" y="${r3(wy0 + 1.6)}" font-size="${r3(fs * 0.62)}" font-family="Source Code Pro, monospace" fill="${ink}" text-anchor="end">${honey ? "wall" : "bar"} ${r3(barWidth(p))} × ${r3(p.T)}${honey ? ` · cell ${r3(p.slotW)}` : p.cutStyle === "slot" ? ` · slot ${r3(p.slotW)}` : ""}</text>`;
  const defs = `<defs><marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="${r3(fs * 0.5)}" markerHeight="${r3(fs * 0.5)}" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0,1L10,5L0,9z" fill="${ink}"/></marker></defs>`;
  return { svg: `<svg viewBox="${r3(wx0)} ${r3(wy0)} ${r3(ww)} ${r3(wh)}" xmlns="http://www.w3.org/2000/svg">${defs}${g}</svg>`, width: ww };
}
