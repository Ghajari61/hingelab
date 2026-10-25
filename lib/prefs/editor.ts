/**
 * Preferences of the classic editors (Hinge Box, Letters, Parametric and the generators), kept in
 * `hingelab-prefs` beside the Studio's. None of them is part of a design: not in undo, autosave
 * or shared links.
 */

export type UiSize = "compact" | "normal" | "large";

export interface EditorPrefs {
  /** Decimals in the 3D view's dimension labels (inches get one more). */
  decimals: 0 | 1 | 2;
  /** The 3D view opens with its overall dimensions shown. */
  dims3d: boolean;
  /** The 3D view opens with four views (or one). */
  quad: boolean;
  shade: "shaded" | "edges";
  /** Guest designs are saved in this browser as you work. */
  autosave: boolean;
  /** Reset all asks first. */
  confirmReset: boolean;
  /** File › New keeps the material and the sheet of the design you had open. */
  keepSetup: boolean;
  uiSize: UiSize;
  /** Panels and menus appear without animation (also on when the system asks for it). */
  reduceMotion: boolean;
  /** Simple hides fine-tuning fields (their values still apply); Advanced shows every field. */
  detail: "simple" | "advanced";
  /** The settings panel's width, px (0: the layout's own). */
  dockW: number;
  /** The settings panel is folded to a strip. */
  dockCollapsed: boolean;
}

/** Narrowest and widest settings panel a drag may give, px. */
export const DOCK_W: [number, number] = [280, 560];

export const DEFAULT_EDITOR_PREFS: EditorPrefs = {
  decimals: 1, dims3d: true, quad: true, shade: "shaded", autosave: true, confirmReset: true, keepSetup: false, uiSize: "normal", reduceMotion: false, detail: "advanced", dockW: 0, dockCollapsed: false,
};

/** The 3D toolbar's own keys from before these preferences, read once when there are none yet. */
const LEGACY_3D = "hl.view3d", LEGACY_DIMS = "hl.dims3d";

function legacy3d(): Partial<EditorPrefs> {
  try {
    if (typeof localStorage === "undefined") return {};
    const p = JSON.parse(localStorage.getItem(LEGACY_3D) ?? "{}") as { quad?: unknown; shade?: unknown };
    return { ...(p.quad === false ? { quad: false } : {}), ...(p.shade === "edges" ? { shade: "edges" as const } : {}), ...(localStorage.getItem(LEGACY_DIMS) === "0" ? { dims3d: false } : {}) };
  } catch { return {}; }
}

/** Accepts anything (old versions, hand-edited storage) and returns valid preferences. */
export function normalizeEditorPrefs(raw: unknown): EditorPrefs {
  const d = DEFAULT_EDITOR_PREFS;
  if (!raw || typeof raw !== "object") return { ...d, ...legacy3d() };
  const r = raw as Record<string, unknown>;
  const bool = (k: keyof EditorPrefs) => (typeof r[k] === "boolean" ? (r[k] as boolean) : (d[k] as boolean));
  return {
    decimals: r.decimals === 0 || r.decimals === 1 || r.decimals === 2 ? r.decimals : d.decimals,
    dims3d: bool("dims3d"),
    quad: bool("quad"),
    shade: r.shade === "edges" ? "edges" : "shaded",
    autosave: bool("autosave"),
    confirmReset: bool("confirmReset"),
    keepSetup: bool("keepSetup"),
    uiSize: r.uiSize === "compact" || r.uiSize === "large" ? r.uiSize : "normal",
    reduceMotion: bool("reduceMotion"),
    detail: r.detail === "simple" ? "simple" : "advanced",
    dockW: typeof r.dockW === "number" && Number.isFinite(r.dockW) && r.dockW > 0 ? Math.round(Math.min(DOCK_W[1], Math.max(DOCK_W[0], r.dockW))) : 0,
    dockCollapsed: bool("dockCollapsed"),
  };
}

/** Settings File › New carries over when `keepSetup` is on: the material and the sheet. */
export const SETUP_KEYS = ["material", "T", "K", "bedW", "bedH", "gap", "sheetW", "sheetH"] as const;

/** `next` with the material and sheet of `prev` (only keys both designs have). */
export function keepSetup<T extends object>(prev: T, next: T): T {
  const out = { ...next } as Record<string, unknown>;
  const p = prev as Record<string, unknown>;
  for (const k of SETUP_KEYS) if (k in out && p[k] !== undefined) out[k] = typeof p[k] === "object" ? JSON.parse(JSON.stringify(p[k])) : p[k];
  return out as T;
}
