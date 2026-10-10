import type { ExportLayer, LayerContent, Layers, Layout, Model, Params } from "./types";
import { roundedPath } from "./core";
import { polyD } from "./polygon";
import { colSegments, hingeCutPaths } from "./hinge";
import { outlinePath } from "./wall";
import { clamp, r3 } from "./util";

export const EXPORT_LAYERS: ExportLayer[] = [
  { key: "outline", name: "Outline cut", code: "02", color: "#FF0000", ui: "var(--l-outline)" },
  { key: "slots",   name: "Inner cuts (slots)", code: "03", color: "#00E000", ui: "var(--l-slots)" },
  { key: "hinge",   name: "Hinge slits", code: "01", color: "#0000FF", ui: "var(--l-hinge)" },
  { key: "labels",  name: "Part labels (engrave)", code: "00", color: "#000000", ui: "var(--l-labels)" },
];

/** Path and label data in sheet coordinates, shared by the canvas and the SVG exporter. */
export function layerContent(model: Model, lay: Layout, p: Params): LayerContent {
  const L: LayerContent = { outline: [], slots: [], hinge: [], labels: [], fills: [] };
  for (const it of lay.items) {
    const pt = it.pt, ox = it.ox, oy = it.oy;
    if (pt.kind === "wall") {
      const d = outlinePath(pt, ox, oy);
      L.outline.push(d); L.fills.push(d);
      for (const c of pt.cols) L.hinge.push(...hingeCutPaths(c.x, colSegments(c.kind, model.hs, pt.hBody, p.bridge), pt.hBody, p, ox, oy));
      if (pt.label) L.labels.push({ x: pt.label.x + ox, y: pt.label.y + oy, text: pt.name, size: pt.label.vertical ? clamp(pt.hBody / 11, 2.5, 5) : clamp(pt.hBody / 7, 3, 7), rot: pt.label.vertical ? -90 : 0 });
    } else {
      const d = roundedPath(pt.edges, pt.r, ox, oy);
      L.outline.push(d); L.fills.push(d);
      for (const s of pt.slots) L.slots.push(polyD(s, ox, oy));
      const w = pt.bbox.x1 - pt.bbox.x0, h = pt.bbox.y1 - pt.bbox.y0;
      L.labels.push({ x: ox, y: oy, text: pt.name, size: clamp(Math.min(w, h) / 9, 3, 8) });
    }
  }
  return L;
}

/** Layered SVG for LightBurn / Inkscape. Stroke width is 0.1 mm; document size is in mm. */
export function exportSVG(model: Model, lay: Layout, p: Params) {
  const LC = layerContent(model, lay, p);
  const m = p.shape === "cyl" ? `cylinder Ø${r3(p.dia)}` : `${r3(p.W)}x${p.shape === "poly" ? p.sides + "-gon" : r3(p.D)}`;
  const comment = `HingeLab living-hinge box: ${m} x ${r3(p.H)} mm, ${p.lid} lid, ${p.pattern} pattern. Material ${p.T} mm, kerf ${p.K} mm (compensated). Cut order: slots, hinge, outline.`;
  return layeredSVG(lay.width, lay.height, comment, LC, p.layers, p.labels);
}

const escapeXml = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** The layered SVG document shared by every product. Layers are written in cut order. */
export function layeredSVG(width: number, height: number, comment: string, LC: LayerContent, layers: Layers, labels: boolean) {
  const W = r3(width), H = r3(height);
  let s = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">\n`;
  s += `<!-- ${comment.replace(/--/g, "- -")} -->\n`;
  const order = ["labels", "slots", "hinge", "outline"] as const;
  for (const key of order) {
    const def = EXPORT_LAYERS.find(l => l.key === key)!;
    if (!layers[key].exp || (key === "labels" && !labels)) continue;
    s += `<g id="${key}" inkscape:groupmode="layer" inkscape:label="${def.code} ${def.name}" fill="none" stroke="${def.color}" stroke-width="0.1">\n`;
    if (key === "labels") for (const lb of LC.labels) s += `  <text x="${r3(lb.x)}" y="${r3(lb.y)}" font-family="Arial, Helvetica, sans-serif" font-size="${r3(lb.size)}" fill="${def.color}" stroke="none" text-anchor="middle" dominant-baseline="middle"${lb.rot ? ` transform="rotate(${lb.rot} ${r3(lb.x)} ${r3(lb.y)})"` : ""}>${escapeXml(lb.text)}</text>\n`;
    else for (const d of LC[key]) s += `  <path d="${d}"/>\n`;
    s += `</g>\n`;
  }
  return s + `</svg>\n`;
}
