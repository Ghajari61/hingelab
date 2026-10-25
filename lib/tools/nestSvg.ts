/**
 * Free tool: the parts of any laser SVG nested onto sheets to waste less material. A part is a
 * region closed by cut lines (red or green layers in HingeLab files, every stroked layer otherwise)
 * with its holes; engraving and score lines inside a part travel with it. The result is a layered
 * SVG, one sheet under another, with each original layer's colour kept.
 */
import { pointInContour, unionShapes } from "@/lib/letters/polygon";
import type { Contour, Point } from "@/lib/letters/types";
import { nestOutlines, rotatePoint } from "@/lib/nest/outline";
import { cutLoops } from "@/lib/export/stl";
import { readScene } from "@/lib/export/scene";

export interface NestOptions { sheetW: number; sheetH: number; margin: number; gap: number; rotate: boolean }
export interface NestSvgResult { svg: string; parts: number; sheets: number; tooBig: number; used: number }

const SHEET_GAP = 20;

export function nestSvg(svg: string, o: NestOptions): NestSvgResult {
  const scene = readScene(svg);
  const shapes = unionShapes(cutLoops(scene), [], true);
  if (!shapes.length) throw new Error("No closed cut lines were found. Parts need closed outlines on a cut layer.");
  if (shapes.length > 400) throw new Error("The file has more than 400 parts. Split it into smaller files.");
  // Every drawn line goes with the part it sits in (by its first point), layer by layer.
  type Line = { layer: number; pts: Point[]; closed: boolean };
  const lines: Line[][] = shapes.map(() => []);
  scene.layers.forEach((l, li) => {
    for (const it of l.items) for (const p of it.polys) {
      const at = p.pts[0];
      const k = shapes.findIndex((s) => pointInContour(at, s.outer) || s.outer.some((q) => Math.hypot(q[0] - at[0], q[1] - at[1]) < 0.01));
      if (k >= 0) lines[k].push({ layer: li, pts: p.pts as Point[], closed: p.closed });
    }
  });
  const angles = o.rotate ? [0, 90, 180, 270] : [0];
  const res = nestOutlines(shapes.map((s, i) => ({ id: String(i), outline: [s.outer, ...s.holes] as Contour[], angles })), { w: o.sheetW, h: o.sheetH, margin: o.margin, gap: o.gap });
  const byLayer = new Map<number, string[]>();
  let area = 0;
  res.sheets.forEach((sh, si) => {
    const oy = si * (o.sheetH + SHEET_GAP);
    for (const it of sh.items) {
      const k = Number(it.id);
      area += Math.abs(shapes[k].area);
      for (const ln of lines[k]) {
        const d = ln.pts.map((q, j) => { const r = rotatePoint(q, it.angle); return `${j ? "L" : "M"}${(r[0] + it.x).toFixed(3)} ${(r[1] + it.y + oy).toFixed(3)}`; }).join("") + (ln.closed ? "Z" : "");
        (byLayer.get(ln.layer) ?? byLayer.set(ln.layer, []).get(ln.layer)!).push(d);
      }
    }
  });
  const n = Math.max(1, res.sheets.length);
  const H = n * o.sheetH + (n - 1) * SHEET_GAP;
  let body = "";
  res.sheets.forEach((_, si) => { body += `<rect x="0" y="${si * (o.sheetH + SHEET_GAP)}" width="${o.sheetW}" height="${o.sheetH}" fill="none" stroke="#B0B0B0" stroke-width="0.2" stroke-dasharray="4 3"/>`; });
  scene.layers.forEach((l, li) => {
    const ds = byLayer.get(li);
    if (!ds?.length) return;
    const paint = l.fill ? `fill="${l.color}" fill-rule="evenodd" stroke="none"` : `fill="none" stroke="${l.color}" stroke-width="0.1"`;
    body += `<g inkscape:groupmode="layer" inkscape:label="${l.label.replace(/[<>&"]/g, "")}" ${paint}><path d="${ds.join("")}"/></g>`;
  });
  const out = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${o.sheetW}mm" height="${H}mm" viewBox="0 0 ${o.sheetW} ${H}"><!-- Nested by HingeLab: the dashed rectangles are the sheets; delete them before cutting if your software cuts every line. -->${body}</svg>`;
  return { svg: out, parts: shapes.length, sheets: res.sheets.length, tooBig: res.tooBig.length, used: area / (n * o.sheetW * o.sheetH) };
}
