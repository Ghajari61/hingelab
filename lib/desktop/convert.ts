/**
 * Export as DXF, PDF or LightBurn for the desktop app: the app sends back the SVG this server made
 * for it and gets the same file the website's export dialog writes (all sheets in one file, shared
 * cut lines cut once). The app checks the file again before it writes it.
 */
import { makeExport } from "@/lib/export/bundle";
import { cleanExport, type ExportFormat } from "@/lib/export/profiles";

export const CONVERT_FORMATS = ["dxf", "pdf", "lbrn2"] as const satisfies readonly ExportFormat[];
export type ConvertFormat = (typeof CONVERT_FORMATS)[number];

/** Same limit as the app's (and under the platform's request limit). */
export const MAX_CONVERT_SVG = 4 * 1024 * 1024;

export interface ConvertOut { status: number; body: Record<string, unknown> }

const bad = (message: string, status = 400): ConvertOut => ({ status, body: { error: "invalid", message } });

const baseName = (s: unknown) => {
  const stem = (typeof s === "string" ? s : "").replace(/\.svg$/i, "").replace(/[\\/:*?"<>|\x00-\x1f]+/g, " ").trim().slice(0, 100);
  return stem || "design";
};

export function convertForDesktop(input: unknown): ConvertOut {
  const r = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const format = (CONVERT_FORMATS as readonly unknown[]).includes(r.format) ? (r.format as ConvertFormat) : null;
  if (!format) return bad("Unknown file format.");
  const svg = typeof r.svg === "string" ? r.svg : "";
  if (svg.length > MAX_CONVERT_SVG) return bad("This design is too large to convert. Export the SVG instead.", 413);
  const t = svg.trimStart();
  if (!/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg\b/.test(t) || !t.trimEnd().endsWith("</svg>")) return bad("This is not a HingeLab cut file.", 422);
  const out = makeExport(svg, null, { ...cleanExport(null), format, split: false, mirror: false, hairline: false, inches: false, merge: true }, baseName(r.fileName));
  const data = out.file.data;
  const binary = typeof data !== "string";
  return {
    status: 200,
    body: {
      fileName: out.file.name,
      base64: binary,
      data: binary ? Buffer.from(data).toString("base64") : data,
      notes: out.notes,
    },
  };
}
