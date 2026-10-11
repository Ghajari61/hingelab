/**
 * Document Setup (document properties): page size presets, display units, the screen-only sheet
 * background, guides and the grid, read from and written back to a document in one undoable step.
 * Geometry is always stored in millimetres; display units only change how lengths are shown and typed.
 */
import { MACHINE_PROFILES, SHEET_PRESETS } from "./library";
import type { Document, GridSpec, Guide, SheetBackground, Units } from "./types";

export interface PagePreset { id: string; name: string; w: number; h: number; group: string }

/** Sheet sizes: the library's presets plus every machine bed that isn't already one of them. */
export function pagePresets(): PagePreset[] {
  const out: PagePreset[] = SHEET_PRESETS.map((s) => ({ ...s }));
  for (const m of MACHINE_PROFILES) {
    if (out.some((p) => Math.abs(p.w - m.bedW) < 0.05 && Math.abs(p.h - m.bedH) < 0.05)) continue;
    out.push({ id: `machine-${m.id}`, name: `${m.name} bed`, w: m.bedW, h: m.bedH, group: "Machine bed" });
  }
  return out;
}

export const presetFor = (w: number, h: number) => pagePresets().find((p) => Math.abs(p.w - w) < 0.05 && Math.abs(p.h - h) < 0.05);

export const BACKGROUNDS: { value: SheetBackground; label: string }[] = [
  { value: "none", label: "None" }, { value: "wood", label: "Wood" }, { value: "acrylic", label: "Acrylic" },
  { value: "cardboard", label: "Cardboard" }, { value: "mdf", label: "MDF" },
];

export interface DocumentSetup {
  units: Units;
  sheetW: number;
  sheetH: number;
  background: SheetBackground;
  guides: Guide[];
  grid: GridSpec;
  snapGrid: boolean;
}

export function readSetup(d: Document): DocumentSetup {
  return {
    units: d.units, sheetW: d.sheets[0].w, sheetH: d.sheets[0].h, background: d.background ?? "none",
    guides: d.guides.map((g) => ({ ...g })), grid: { ...d.grid }, snapGrid: d.snapping.grid,
  };
}

const GRID_KEYS: (keyof GridSpec)[] = ["kind", "originX", "originY", "angleX", "angleZ", "moduleW", "moduleH", "gutterX", "gutterY", "divisions"];

/** Writes the setup into a draft document. Optional grid fields that aren't set are left out entirely. */
export function applyDocumentSetup(d: Document, s: DocumentSetup): void {
  d.units = s.units;
  const sheet = d.sheets[0];
  if (Math.abs(sheet.w - s.sheetW) > 1e-9 || Math.abs(sheet.h - s.sheetH) > 1e-9) {
    sheet.w = s.sheetW; sheet.h = s.sheetH;
    sheet.name = presetFor(s.sheetW, s.sheetH)?.name ?? "Custom size";
  }
  if (s.background === "none") delete d.background; else d.background = s.background;
  d.guides = s.guides.filter((g) => Number.isFinite(g.at)).map((g) => ({ axis: g.axis, at: g.at }));
  const grid: GridSpec = { size: s.grid.size, subdivisions: Math.max(1, Math.round(s.grid.subdivisions)), show: s.grid.show };
  if (s.grid.kind && s.grid.kind !== "rectangular") {
    for (const k of GRID_KEYS) {
      const v = s.grid[k];
      if (v !== undefined && (typeof v !== "number" || Number.isFinite(v))) (grid as unknown as Record<string, unknown>)[k] = v;
    }
  }
  d.grid = grid;
  d.snapping.grid = s.snapGrid;
}
