/**
 * Export settings for the export dialog: the machine (one of the built-in profiles or a bed size of
 * your own), the file format and the options. They are a preference of this device, not part of a
 * design, so they are not in undo or in shared links.
 */
import { MACHINE_PROFILES, machineById } from "@/lib/studio/library";

export const EXPORT_FORMATS = ["svg", "dxf", "pdf", "lbrn2"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** `order`: what the format can make the laser software do about the cut order. */
export const FORMAT_INFO: Record<ExportFormat, { name: string; ext: string; mime: string; about: string; order: string }> = {
  svg: { name: "SVG", ext: "svg", mime: "image/svg+xml", about: "Layered by colour for LightBurn, xTool Creative Space, Glowforge and Inkscape.", order: "The layers are written engrave, score, inner cuts, outline, but an SVG cannot make the software keep that order: check that inner cuts run before outlines." },
  dxf: { name: "DXF", ext: "dxf", mime: "application/dxf", about: "R12 for CAD programs and older laser software. Pictures cannot go in a DXF.", order: "A DXF keeps each cut type on its own layer and colour but has no cut order: set inner cuts before outlines in your laser software." },
  pdf: { name: "PDF", ext: "pdf", mime: "application/pdf", about: "Vector lines at actual size, one page per sheet, for printing or for software that imports PDF.", order: "A PDF has no cut order: set inner cuts before outlines in your laser software." },
  lbrn2: { name: "LightBurn", ext: "lbrn2", mime: "application/xml", about: "A LightBurn project with one layer per cut type. Text and pictures are left out: import the SVG for those.", order: "LightBurn follows the order in the file: engrave, score, inner cuts, then outlines (layer priority)." },
};

export const CUSTOM_MACHINE = "custom";

export interface ExportSettings {
  machine: string;
  /** Bed of the custom machine, mm. */
  bedW: number;
  bedH: number;
  format: ExportFormat;
  /** One file per sheet (in a ZIP) instead of every sheet in one file. */
  split: boolean;
  /** Mirrored left to right, for engraving the back of clear acrylic. */
  mirror: boolean;
  /** 0.001 in lines, which Epilog, Trotec and Universal drivers read as vector cuts. */
  hairline: boolean;
  /** DXF numbers in inches. */
  inches: boolean;
  /** Cut once where parts share a cut line (on unless turned off). */
  merge?: boolean;
}

export const HAIRLINE_MM = 0.0254;

export function defaultExport(machine?: string): ExportSettings {
  const m = machine && machineById(machine) ? machineById(machine)! : MACHINE_PROFILES[0];
  return { machine: m.id, bedW: m.bedW, bedH: m.bedH, format: m.exportFormat, split: false, mirror: false, hairline: false, inches: false, merge: true };
}

const len = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(3000, Math.max(20, v)) : d);

/** Accepts anything (old versions, hand-edited storage) and returns valid settings. */
export function cleanExport(x: unknown, machine?: string): ExportSettings {
  const d = defaultExport(machine);
  const r = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const id = typeof r.machine === "string" && (r.machine === CUSTOM_MACHINE || machineById(r.machine)) ? r.machine : d.machine;
  return {
    machine: id,
    bedW: len(r.bedW, d.bedW),
    bedH: len(r.bedH, d.bedH),
    format: (EXPORT_FORMATS as readonly unknown[]).includes(r.format) ? (r.format as ExportFormat) : d.format,
    split: r.split === true,
    mirror: r.mirror === true,
    hairline: r.hairline === true,
    inches: r.inches === true,
    merge: r.merge !== false,
  };
}

/** The bed the sheets are checked against. */
export function bedOf(s: ExportSettings): { w: number; h: number; name: string } {
  const m = s.machine === CUSTOM_MACHINE ? null : machineById(s.machine);
  return m ? { w: m.bedW, h: m.bedH, name: m.name } : { w: s.bedW, h: s.bedH, name: "Your machine" };
}

export interface Rect { x: number; y: number; w: number; h: number }

/** Sheets (0-based) larger than the bed whichever way round they go in. */
export function overBed(sheets: Rect[], bed: { w: number; h: number }): number[] {
  const fits = (r: Rect) => (r.w <= bed.w + 1e-6 && r.h <= bed.h + 1e-6) || (r.w <= bed.h + 1e-6 && r.h <= bed.w + 1e-6);
  return sheets.flatMap((r, i) => (fits(r) ? [] : [i]));
}

const KEY = "hingelab-export";

export function loadExport(machine?: string): ExportSettings {
  try { return cleanExport(JSON.parse(localStorage.getItem(KEY) ?? "null"), machine); } catch { return defaultExport(machine); }
}

export function saveExport(s: ExportSettings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
}
