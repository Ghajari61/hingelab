/**
 * A LightBurn project (.lbrn2, XML) from a scene: one cut setting per SVG layer, on the LightBurn
 * colour its name or colour matches (00 black, 01 blue, 02 red, 03 green…), in the SVG's cut
 * order, and every outline as a path shape in millimetres with y up. No power or speed is written,
 * so LightBurn uses its own defaults until you set them. Text and pictures are counted as skipped:
 * LightBurn imports them from the SVG.
 */
import { nearestLayer } from "@/lib/studio/cutLayers";
import type { Rect } from "./profiles";
import type { Scene } from "./scene";
import { itemsOn, placePoint, type Place } from "./sheets";

const f = (v: number) => (Math.round(v * 1000) / 1000).toString();
const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

/** LightBurn layer number for an SVG layer: its "NN name" prefix, else the nearest LightBurn colour. */
export function cutIndex(label: string, color: string): number {
  const m = /^(\d{2})\s/.exec(label.trim());
  return m && +m[1] < 30 ? +m[1] : nearestLayer(color);
}

export interface LbrnResult { xml: string; shapes: number; skipped: number }

export function sceneLBRN(scene: Scene, rects: Rect[], pl: Place): LbrnResult {
  const H = pl.rect.h;
  const settings: string[] = [];
  const shapes: string[] = [];
  const used = new Set<number>();
  let skipped = 0, priority = 0;
  for (const { layer, items } of itemsOn(scene, rects, pl.sheet)) {
    if (!items.length) continue;
    const idx = cutIndex(layer.label, layer.color);
    if (!used.has(idx)) {
      used.add(idx);
      settings.push(`    <CutSetting type="${layer.fill ? "Scan" : "Cut"}">\n        <index Value="${idx}"/>\n        <name Value="${esc(layer.label || `C${String(idx).padStart(2, "0")}`)}"/>\n        <priority Value="${priority++}"/>\n    </CutSetting>`);
    }
    for (const { it, dy } of items) {
      skipped += it.texts.length + it.images.length;
      for (const p of it.polys) {
        let pts = p.pts.map(([x, y]) => { const [u, v] = placePoint(pl, x, y + dy); return [u, H - v] as const; });
        let closed = p.closed;
        const a = pts[0], b = pts[pts.length - 1];
        if (pts.length > 2 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) { pts = pts.slice(0, -1); closed = true; }
        if (pts.length < 2) continue;
        const verts = pts.map(([x, y]) => `V${f(x)} ${f(y)}`).join("");
        let prims = "";
        for (let i = 0; i + 1 < pts.length; i++) prims += `L${i} ${i + 1}`;
        if (closed && pts.length > 2) prims += `L${pts.length - 1} 0`;
        shapes.push(`    <Shape Type="Path" CutIndex="${idx}">\n        <XForm>1 0 0 1 0 0</XForm>\n        <VertList>${verts}</VertList>\n        <PrimList>${prims}</PrimList>\n    </Shape>`);
      }
    }
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<LightBurnProject AppVersion="1.0.00" FormatVersion="1" MaterialHeight="0" MirrorX="False" MirrorY="False">\n${settings.join("\n")}\n${shapes.join("\n")}\n</LightBurnProject>\n`;
  return { xml, shapes: shapes.length, skipped };
}
