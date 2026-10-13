/**
 * The desktop API's JSON shapes. Types only (no code), so the desktop app can import them without
 * shipping anything from the server.
 */

export type DesktopProductId = "hinge" | "clock" | "puzzle" | "qr" | "boxes" | "topper" | "keyrack" | "sign" | "tablenum" | "trophy";
/** Everything the workspace opens: the products, and "art", a drawing from the AI designer. */
export type WorkspaceProductId = DesktopProductId | "art";
export type DesktopPlan = "free" | "pro";

export type DField =
  | { kind: "number"; key: string; label: string; help?: string; unit: "mm" | "deg" | "" | "%"; min: number; max: number; step: number; int?: boolean }
  | { kind: "choice"; key: string; label: string; help?: string; options: { v: string; text: string; title?: string; pro?: boolean }[] }
  | { kind: "toggle"; key: string; label: string; help?: string }
  | { kind: "text"; key: string; label: string; help?: string; placeholder?: string; multiline?: boolean; maxLength: number };

export interface DSection {
  id: string;
  title: string;
  help?: string;
  fields: DField[];
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
  icon: "box" | "clock" | "puzzle" | "qr" | "cake" | "key" | "sign" | "hash" | "trophy" | "wand";
  sections: DSection[];
  presets: DPreset[];
}

export interface DCatalog {
  version: number;
  products: DProduct[];
  /** The AI designer's drawings; not in `products`, so apps that do not know it never list it. */
  art?: DProduct;
}

/** What changes with the settings: hidden fields and sections, and labels that depend on them. */
export interface DForm {
  hidden: string[];
  hiddenSections: string[];
  labels: Record<string, string>;
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
  preset?: string;
  /** One edited setting; choices may change other settings too (applied on the server). */
  change?: { key: string; value: unknown };
  fix?: { code: string; id: string };
  autofix?: boolean;
  /** Also send the assembled 3D model (the 3D view is open). */
  model?: boolean;
}

/** A material that keeps its own colour in every look (engraving, mirror acrylic). */
export interface D3Material {
  color: string;
  roughness: number;
  metalness: number;
}

/**
 * One object of the assembled design (mm, z up). `m` is its column-major 4×4 placement in the
 * model's frame; `ex` is how far it moves there when the view is fully exploded.
 */
export type D3Object = { name: string; m: number[]; ex: [number, number, number] } & (
  /**
   * An outline in its own plane extruded along z from `z` up `depth`. Flat [x, y, x, y, …] lists;
   * `fade` hides it while exploded; `noMeasure` leaves a skin (engraving) out of the dimensions.
   */
  | { kind: "slab"; outer: number[]; holes: number[][]; z: number; depth: number; tint?: number; mat?: D3Material; fade?: boolean; noMeasure?: boolean }
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
  plan: DesktopPlan;
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
