/**
 * User preferences (spec §3, §15): theme, accent, units, shortcut set, laser and favourites, start
 * screen and onboarding state. Kept in localStorage; signed-in users sync them to profiles.preferences.
 */
import { DEFAULT_MACHINE, DEFAULT_MATERIAL, MACHINE_PROFILES, MATERIAL_PRESETS, type LaserType } from "./library";
import { isUnits } from "./units";
import type { Units } from "./types";
import { DEFAULT_EDITOR_PREFS, normalizeEditorPrefs, type EditorPrefs } from "@/lib/prefs/editor";

export type Theme = "dark" | "darker" | "light" | "system";
export type Accent = "blue" | "violet" | "teal" | "orange";
export type ShortcutSet = "hingelab" | "corel" | "lightburn" | "inkscape";

export interface Preferences {
  theme: Theme;
  /** Set once the user picks a theme; until then the default (light) applies, even over an old saved "dark". */
  themeChosen: boolean;
  /** Theme of the Studio editor only (dark by default, like Illustrator and CorelDRAW). */
  editorTheme: Theme;
  accent: Accent;
  units: Units;
  shortcutSet: ShortcutSet;
  laser: LaserType;
  machineId: string;
  materialId: string;
  showStartScreen: boolean;
  onboarded: boolean;
  tourDone: boolean;
  dismissed: string[];
  recentGenerators: { id: string; at: string }[];
  /** Path → Inset / Outset step, mm. */
  offsetStep: number;
  /** Angle step (degrees) for every constrained rotation and direction: rotate, shear, line, pen, knife, measure, view rotation. */
  snapAngle: number;
  /** The classic editors' preferences (Settings in their Edit menu). */
  editor: EditorPrefs;
}

export const DEFAULT_PREFS: Preferences = {
  theme: "light", themeChosen: false, editorTheme: "dark", accent: "blue", units: "mm", shortcutSet: "hingelab", laser: "co2",
  machineId: DEFAULT_MACHINE, materialId: DEFAULT_MATERIAL, showStartScreen: true,
  onboarded: false, tourDone: false, dismissed: [], recentGenerators: [], offsetStep: 1, snapAngle: 15, editor: DEFAULT_EDITOR_PREFS,
};

const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list as readonly unknown[]).includes(v) ? (v as T) : d;

/** Accepts anything (old versions, hand-edited storage) and returns valid preferences. */
export function normalizePrefs(raw: unknown): Preferences {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_PREFS;
  return {
    theme: r.themeChosen === true ? pick(r.theme, ["dark", "darker", "light", "system"] as const, d.theme) : d.theme,
    themeChosen: r.themeChosen === true,
    editorTheme: pick(r.editorTheme, ["dark", "darker", "light", "system"] as const, d.editorTheme),
    accent: pick(r.accent, ["blue", "violet", "teal", "orange"] as const, d.accent),
    units: isUnits(r.units) ? r.units : d.units,
    shortcutSet: pick(r.shortcutSet, ["hingelab", "corel", "lightburn", "inkscape"] as const, d.shortcutSet),
    laser: pick(r.laser, ["co2", "diode", "fiber"] as const, d.laser),
    machineId: MACHINE_PROFILES.some((m) => m.id === r.machineId) || (typeof r.machineId === "string" && r.machineId.startsWith("my-")) ? (r.machineId as string) : d.machineId,
    materialId: MATERIAL_PRESETS.some((m) => m.id === r.materialId) || (typeof r.materialId === "string" && r.materialId.startsWith("my-")) ? (r.materialId as string) : d.materialId,
    showStartScreen: typeof r.showStartScreen === "boolean" ? r.showStartScreen : d.showStartScreen,
    onboarded: r.onboarded === true,
    tourDone: r.tourDone === true,
    dismissed: Array.isArray(r.dismissed) ? r.dismissed.filter((x): x is string => typeof x === "string").slice(0, 50) : [],
    recentGenerators: Array.isArray(r.recentGenerators)
      ? r.recentGenerators.filter((x): x is { id: string; at: string } => !!x && typeof x.id === "string" && typeof x.at === "string").slice(0, 10)
      : [],
    offsetStep: typeof r.offsetStep === "number" && Number.isFinite(r.offsetStep) && r.offsetStep > 0 ? Math.min(100, r.offsetStep) : d.offsetStep,
    snapAngle: typeof r.snapAngle === "number" && Number.isFinite(r.snapAngle) ? Math.min(90, Math.max(1, r.snapAngle)) : d.snapAngle,
    editor: normalizeEditorPrefs(r.editor),
  };
}

/** Records that a generator was used, most recent first, one entry per generator. */
export function noteGeneratorUse(p: Preferences, id: string, at = new Date().toISOString()): Preferences {
  return { ...p, recentGenerators: [{ id, at }, ...p.recentGenerators.filter((r) => r.id !== id)].slice(0, 10) };
}

const KEY = "hingelab-prefs";

export function loadPrefs(): Preferences {
  try { return normalizePrefs(JSON.parse(localStorage.getItem(KEY) ?? "{}")); } catch { return { ...DEFAULT_PREFS }; }
}

/** The editor part is written by the Settings dialog (lib/prefs/editorStore), so a stale copy here does not overwrite it. */
export function savePrefs(p: Preferences): void {
  try {
    const stored = (JSON.parse(localStorage.getItem(KEY) ?? "{}") as { editor?: unknown })?.editor;
    localStorage.setItem(KEY, JSON.stringify(stored && typeof stored === "object" ? { ...p, editor: stored } : p));
  } catch { /* private mode */ }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("hingelab-prefs", { detail: p }));
}

/** Onboarding steps (spec §15): laser & machine → units → shortcut set → favourite material. */
export const ONBOARDING_STEPS = ["machine", "units", "shortcuts", "material"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const SHORTCUT_SET_NAMES: Record<ShortcutSet, string> = {
  hingelab: "HingeLab (Illustrator-compatible)", corel: "CorelDRAW", lightburn: "LightBurn", inkscape: "Inkscape-style",
};
