/**
 * A template as a new Studio document: Studio templates are built from live shapes and effects,
 * bundled SVG templates go through SVG import (one sheet per file).
 */
import { createDocument, newId } from "@/lib/studio/doc";
import { svgDocument } from "@/lib/studio/svgProject";
import type { Document } from "@/lib/studio/types";
import { templateFile } from "./catalog";
import { buildStudioTemplate } from "./studio";
import type { Template } from "./types";

export interface OpenTemplateOptions {
  id: string;
  materialId?: string;
  machineId?: string;
  /** Reads a bundled file (fetch in the browser, the file system in tests). */
  fetchText: (url: string) => Promise<string>;
  idFactory?: () => string;
}

export async function templateDocument(t: Template, o: OpenTemplateOptions): Promise<Document> {
  const origin = { kind: "template" as const, id: t.id };
  const makeId = o.idFactory ?? newId;
  if (t.source === "studio") {
    const built = buildStudioTemplate(t.id, makeId);
    if (!built) throw new Error(`The template "${t.title}" is missing.`);
    const doc = createDocument({ id: o.id, name: t.title, sheet: built.sheet, materialId: o.materialId, machineId: o.machineId, origin });
    doc.root.children = built.nodes;
    return doc;
  }
  const files = t.files ?? [];
  if (!files.length) throw new Error(`The template "${t.title}" has no files.`);
  const sources = await Promise.all(files.map(async (f) => ({ src: await o.fetchText(templateFile(t.id, f)), name: fileLabel(f) })));
  return svgDocument(sources, { id: o.id, name: t.title, materialId: o.materialId, machineId: o.machineId, origin, margin: 0, idFactory: makeId }).doc;
}

/** "tracks.svg" → "Tracks", "sheet-2.svg" → "Sheet 2". */
export function fileLabel(file: string): string {
  const s = file.replace(/\.svg$/i, "").replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
