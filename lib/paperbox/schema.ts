/** Settings most styles share, as schema groups and defaults. */
import { PAPERS, paperById } from "./paper";
import type { BoxParams, ParamField } from "./types";

export const BASE_DEFAULTS = { dims: "inner", paper: "350", thickness: 0.45, bleed: 0 } as const;

export const sizeGroup = (h = "Height"): { id: string; title: string; fields: ParamField[] } => ({
  id: "size", title: "Size", fields: [
    { key: "L", label: "Length", kind: "length", min: 10, max: 1000, step: 0.5, help: "Front to back along the front panel." },
    { key: "W", label: "Width", kind: "length", min: 10, max: 1000, step: 0.5, help: "Across the side panel." },
    { key: "H", label: h, kind: "length", min: 5, max: 1000, step: 0.5 },
    { key: "dims", label: "Sizes are", kind: "select", options: [{ v: "inner", text: "Inside" }, { v: "outer", text: "Outside" }], help: "Inside sizes fit what goes in; outside sizes fit a space." },
  ],
});

export const boardGroup: { id: string; title: string; fields: ParamField[] } = {
  id: "board", title: "Board", fields: [
    { key: "paper", label: "Board", kind: "select", options: [...PAPERS.map((p) => ({ v: p.id, text: `${p.name} (${p.thickness} mm)` })), { v: "custom", text: "Custom thickness" }], help: "The board sets its thickness, which every fold allows for." },
    { key: "thickness", label: "Thickness", kind: "length", min: 0.1, max: 6, step: 0.05, help: "Used when Board is Custom thickness." },
    { key: "bleed", label: "Bleed", kind: "length", min: 0, max: 10, step: 0.5, help: "Extra print past the cut line; 0 leaves the bleed line off." },
  ],
};

/** The board's thickness: the preset's, or the custom one. */
export const thick = (p: BoxParams) => (p.paper !== "custom" && paperById(String(p.paper))?.thickness) || Math.max(0.1, p.thickness);

/** A number setting, with a fallback when it is missing. */
export const num = (p: BoxParams, k: string, d: number) => (typeof p[k] === "number" && Number.isFinite(p[k] as number) ? (p[k] as number) : d);
