/**
 * The desktop API's JSON shapes. Types only (no code), so the desktop app can import them without
 * shipping anything from the server.
 */

export type DesktopProductId = "hinge" | "clock" | "puzzle" | "qr" | "boxes" | "topper" | "keyrack" | "sign" | "tablenum" | "trophy";
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
  id: DesktopProductId;
  name: string;
  blurb: string;
  icon: "box" | "clock" | "puzzle" | "qr" | "cake" | "key" | "sign" | "hash" | "trophy";
  sections: DSection[];
  presets: DPreset[];
}

export interface DCatalog {
  version: number;
  products: DProduct[];
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
  product: DesktopProductId;
  /** Current settings (omit to start from the defaults or a preset). */
  params?: unknown;
  preset?: string;
  /** One edited setting; choices may change other settings too (applied on the server). */
  change?: { key: string; value: unknown };
  fix?: { code: string; id: string };
  autofix?: boolean;
}

export interface GenerateResponse {
  product: DesktopProductId;
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
