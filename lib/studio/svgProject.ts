import { createDocument, newId } from "./doc";
import { translate } from "./geom";
import { importSvg, SvgImportError, type SvgImportOptions } from "./svgImport";
import type { Document, GroupNode, Sheet } from "./types";

export interface SvgSource {
  src: string;
  /** Name of the sheet and its group; the file's <title> otherwise. */
  name?: string;
  layerMap?: SvgImportOptions["layerMap"];
  dpi?: number;
}

export interface SvgDocumentOptions {
  id: string;
  name: string;
  materialId?: string;
  machineId?: string;
  origin?: Document["origin"];
  /** Space around the drawing on its sheet, mm. */
  margin?: number;
  /** Space between sheets, mm. */
  gap?: number;
  now?: string;
  idFactory?: () => string;
}

export interface SvgDocument { doc: Document; warnings: string[]; objects: number }

/**
 * A document from SVG drawings: each drawing on its own sheet, sized to the SVG page (or to the art
 * when it spills over the page) plus a margin, sheets side by side.
 */
export function svgDocument(sources: SvgSource[], o: SvgDocumentOptions): SvgDocument {
  const margin = o.margin ?? 5, gap = o.gap ?? 20;
  const id = o.idFactory ?? newId;
  const doc = createDocument({ id: o.id, name: o.name, materialId: o.materialId, machineId: o.machineId, origin: o.origin, now: o.now });
  const base = doc.sheets[0];
  const sheets: Sheet[] = [];
  const groups: GroupNode[] = [];
  const warnings: string[] = [];
  let x = 0, objects = 0;
  for (const s of sources) {
    const r = importSvg(s.src, { layerMap: s.layerMap, dpi: s.dpi, name: s.name, id });
    const label = s.name ?? r.title;
    const prefix = sources.length > 1 ? `${label}: ` : "";
    warnings.push(...r.warnings.map((w) => prefix + w));
    if (!r.group) { warnings.push(`${prefix}nothing to cut was found.`); continue; }
    const b = r.box;
    const fits = b.minX >= -1 && b.minY >= -1 && b.maxX <= r.page.w + 1 && b.maxY <= r.page.h + 1;
    const region = fits ? { minX: 0, minY: 0, maxX: r.page.w, maxY: r.page.h } : b;
    const w = Math.ceil(region.maxX - region.minX + 2 * margin), h = Math.ceil(region.maxY - region.minY + 2 * margin);
    sheets.push({ ...base, id: `sheet-${sheets.length + 1}`, name: label, x, y: 0, w, h });
    r.group.name = label;
    r.group.transform = translate(x + margin - region.minX, margin - region.minY);
    groups.push(r.group);
    objects += r.objects;
    x += w + gap;
  }
  if (!groups.length) throw new SvgImportError("The SVG has no paths to cut. Convert text to paths and try again.");
  doc.sheets = sheets;
  doc.root.children.push(...groups);
  return { doc, warnings, objects };
}
