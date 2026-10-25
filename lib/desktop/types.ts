/**
 * The desktop API's JSON shapes. Types only (no code), so the desktop app can import them without
 * shipping anything from the server.
 */

export type DesktopProductId = "hinge" | "clock" | "puzzle" | "qr" | "boxes" | "topper" | "keyrack" | "sign" | "tablenum" | "trophy" | "shadowbox" | "popup" | "paperbox" | "calibration" | "letters" | "parametric";
/** Everything the workspace opens: the products, and "art", a drawing from the AI designer. */
export type WorkspaceProductId = DesktopProductId | "art";
export type DesktopPlan = "free" | "pro";

/**
 * `default`: the value a new design starts with, which the field's reset restores. `shuffle`: Randomise
 * design may change it (a lock keeps it). `random`: a number with its own dice (a seed). `pictureOptions`:
 * choices that need a picture (a section's `pictures`), listed only by apps that can pick one (1.0.30).
 */
export type DField =
  | { kind: "number"; key: string; label: string; help?: string; default?: number; shuffle?: boolean; random?: boolean; unit: "mm" | "deg" | "" | "%"; min: number; max: number; step: number; int?: boolean; auto?: string }
  | { kind: "choice"; key: string; label: string; help?: string; default?: string; shuffle?: boolean; options: DOption[]; pictureOptions?: DOption[] }
  | { kind: "toggle"; key: string; label: string; help?: string; default?: boolean; shuffle?: boolean }
  | { kind: "text"; key: string; label: string; help?: string; default?: string; placeholder?: string; multiline?: boolean; maxLength: number };

/** One choice of a choice field. */
export interface DOption { v: string; text: string; title?: string; pro?: boolean }

export interface DSection {
  id: string;
  title: string;
  help?: string;
  fields: DField[];
  /** Pictures picked on this computer (apps from 1.0.30); hidden like fields, by `key`. */
  pictures?: DPicture[];
}

/**
 * A picture setting. "grey": a grey JPEG data URL in `key` (engraved as it is). "trace": the server
 * traces it (POST /api/desktop/trace) into outlines kept in `levels`; `key` holds a small grey preview
 * and `name` the file's name. Both keep width / height in `aspectKey`.
 */
export interface DPicture {
  key: string;
  label: string;
  help?: string;
  mode: "grey" | "trace";
  aspectKey: string;
  levels?: string;
  name?: string;
}

/** POST /api/desktop/trace: a picture shrunk on the computer (one grey byte a pixel), or an SVG file. */
export type TraceRequest = { kind: "raster"; width: number; height: number; grey: string } | { kind: "svg"; text: string };
export interface TraceResponse {
  /** Outlines per brightness level, `|` between them. */
  levels: string;
  aspect: number;
}

export interface DPreset {
  id: string;
  name: string;
  note: string;
  pro: boolean;
}

export interface DProduct {
  id: WorkspaceProductId;
  name: string;
  blurb: string;
  icon: "box" | "clock" | "puzzle" | "qr" | "cake" | "key" | "sign" | "hash" | "trophy" | "layers" | "ruler" | "wand" | "type" | "shapes";
  sections: DSection[];
  presets: DPreset[];
  /** The whole design can be scaled (GenerateRequest.scale): the 3D gizmo's fallback. */
  scale?: boolean;
}

export interface DCatalog {
  version: number;
  products: DProduct[];
  /** Letters and Parametric: listed by apps from 1.0.30, which read their `form.values` and `auto` fields. */
  more?: DProduct[];
  /** The AI designer's drawings; not in `products`, so apps that do not know it never list it. */
  art?: DProduct;
}

/** What changes with the settings: hidden fields and sections, and labels that depend on them. */
export interface DForm {
  hidden: string[];
  hiddenSections: string[];
  labels: Record<string, string>;
  /** Values of fields that are not a plain path in the settings (read these before the settings). */
  values?: Record<string, unknown>;
}

export interface DIssue {
  code: string;
  level: "error" | "warn" | "info";
  message: string;
  fixes: { id: string; label: string; safe: boolean }[];
}

export interface GenerateRequest {
  product: WorkspaceProductId;
  /** Current settings (omit to start from the defaults or a preset). */
  params?: unknown;
  /** The project file's version when `params` come from a file: older settings are migrated first. */
  version?: number;
  preset?: string;
  /** One edited setting; choices may change other settings too (applied on the server). */
  change?: { key: string; value: unknown };
  fix?: { code: string; id: string };
  autofix?: boolean;
  /** Scales the whole design by this factor (0.2–5), for products marked `scale`. */
  scale?: number;
  /** Also send the assembled 3D model (the 3D view is open). */
  model?: boolean;
  /** A new random design: every `shuffle` setting not in `locked` (Hinge Box: the pattern and lattice). */
  randomise?: { locked?: string[] };
}

/** A material that keeps its own colour in every look (engraving, mirror acrylic). */
export interface D3Material {
  color: string;
  roughness: number;
  metalness: number;
  /** See-through (a scored item's faint fill). */
  opacity?: number;
}

/**
 * One object of the assembled design (mm, z up). `m` is its column-major 4×4 placement in the
 * model's frame; `ex` is how far it moves there when the view is fully exploded.
 */
export type D3Object = { name: string; m: number[]; ex: [number, number, number] } & (
  /**
   * An outline in its own plane extruded along z from `z` up `depth`. Flat [x, y, x, y, …] lists;
   * `fade` hides it while exploded; `noMeasure` leaves a skin (engraving) out of the dimensions;
   * `more` holds further outlines of the same object (the other letters of a word).
   */
  | { kind: "slab"; outer: number[]; holes: number[][]; more?: { outer: number[]; holes: number[][] }[]; z: number; depth: number; tint?: number; mat?: D3Material; fade?: boolean; noMeasure?: boolean }
  /** A triangle mesh with optional vertex colours (the bent hinge wall). */
  | { kind: "mesh"; pos: number[]; col?: number[]; index: number[]; tint?: number; vertexBase?: string }
  /** Line segments drawn on the model (hinge slits). */
  | { kind: "lines"; pos: number[]; color: string; opacity: number }
);

export interface D3Model {
  objects: D3Object[];
}

export interface GenerateResponse {
  product: WorkspaceProductId;
  params: Record<string, unknown>;
  form: DForm;
  issues: DIssue[];
  stats: { label: string; value: string }[];
  summary: string;
  /** Labels of fixes applied by this request. */
  applied: string[];
  /** The settings' format version, written into project files with them (generators). */
  version?: number;
  /** Present when the design can be exported on the caller's plan. */
  svg?: string;
  fileName?: string;
  /** Sheet size in mm. */
  width?: number;
  height?: number;
  watermark?: boolean;
  /** Set when the design needs Pro (HTTP 403): the reason, shown with an upgrade button. */
  locked?: string;
  /** Set when the design cannot be built (HTTP 422). */
  error?: string;
  /** The assembled design in 3D, when asked for and the SVG is sent too. */
  model?: D3Model;
}

export interface DesktopAccount {
  user: { id: string; email: string | null; name: string | null };
  /** "pro" for every paid tier, so apps that only understand Free and Pro stay unlocked. */
  plan: DesktopPlan;
  /** The real plan. Absent on older responses. */
  tier?: "free" | "pro" | "business" | "lifetime";
  status: string | null;
  periodEnd: string | null;
  entitlements: { cleanExport: boolean; proShapes: boolean; proGenerators: boolean };
  minimumVersion: string;
}

export interface DesktopTokens {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
}
