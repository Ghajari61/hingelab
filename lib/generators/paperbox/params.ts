import { DEFAULTS as HINGE, clone } from "@/lib/hinge/defaults";
import { FIT_OFF } from "@/lib/fit/fitToSheets";
import { cleanParams, getBoxStyle, listBoxStyles, PAPERS, paperById } from "@/lib/paperbox";
import { JOB_EXTRAS, SHEET_DEFAULTS, type GenBase } from "../types";
import { mergeInto } from "../util";
import { cleanPattern, PATTERN_DEFAULTS, type PatternParams } from "../pattern";
import { MOTIF_ART } from "../motifArt";
import { cleanWindow, FACE_TARGETS, WINDOW_DEFAULTS, type WindowParams } from "./decorate";

/** Settings the engine takes from the shell instead (the board's thickness is the material's). */
export const SHELL_KEYS = new Set(["paper", "thickness"]);

export interface PaperBoxParams extends GenBase {
  /** The box style (a registered engine style id). */
  style: string;
  /** Board preset (GSM); picking one sets the material thickness. */
  paper: string;
  /** Perforations are cut as dashes: cut and gap lengths, mm. */
  lines: { perfCut: number; perfGap: number; mountain: "solid" | "dashdot" };
  /** Each style's own settings, kept while you switch between styles. */
  styles: Record<string, Record<string, number | string | boolean>>;
  /** A window cut in the chosen faces. */
  window: WindowParams;
  /** The cut-out pattern, face by face. */
  pattern: PatternParams;
}

/** Every style's defaults, less the settings the shell owns. */
function styleDefaults() {
  const out: PaperBoxParams["styles"] = {};
  for (const s of listBoxStyles()) out[s.id] = Object.fromEntries(Object.entries(s.defaultParams).filter(([k]) => !SHELL_KEYS.has(k)));
  return out;
}

export const PAPERBOX_DEFAULTS: PaperBoxParams = {
  name: "Paper box",
  material: "custom",
  T: paperById("350")!.thickness,
  K: 0,
  bedW: 600,
  bedH: 400,
  gap: 6,
  fit: { ...FIT_OFF },
  sheet: { ...SHEET_DEFAULTS },
  job: { ...JOB_EXTRAS },
  layers: clone(HINGE.layers),
  style: "reverse-tuck",
  paper: "350",
  lines: { perfCut: 2, perfGap: 1, mountain: "solid" },
  styles: styleDefaults(),
  window: { ...WINDOW_DEFAULTS },
  pattern: { ...PATTERN_DEFAULTS, on: "front", art: { ...MOTIF_ART } },
};

export function mergePaperBox(raw: unknown): PaperBoxParams {
  const p = mergeInto(clone(PAPERBOX_DEFAULTS), raw);
  if (!getBoxStyle(p.style)) p.style = PAPERBOX_DEFAULTS.style;
  if (p.paper !== "custom" && !paperById(p.paper)) p.paper = "custom";
  if (p.lines.mountain !== "dashdot") p.lines.mountain = "solid";
  const r = (raw && typeof raw === "object" ? raw : {}) as { window?: unknown; pattern?: unknown };
  p.window = cleanWindow(r.window);
  p.pattern = cleanPattern(r.pattern ?? { on: "front" }, FACE_TARGETS);
  for (const s of listBoxStyles()) {
    const clean = cleanParams(s, { ...p.styles[s.id] });
    p.styles[s.id] = Object.fromEntries(Object.entries(clean).filter(([k]) => !SHELL_KEYS.has(k)));
  }
  return p;
}

export const PAPER_OPTIONS = [...PAPERS.map((x) => ({ v: x.id, text: `${x.name} (${x.thickness} mm)` })), { v: "custom", text: "My own (set Thickness)" }];
export const PAPERBOX_VERSION = 1;
