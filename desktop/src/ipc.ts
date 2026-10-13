/**
 * The app's only way out: typed calls to the Rust commands. JavaScript has no network, file or
 * token access of its own; the Rust side talks to the server and keeps the session.
 */
import { invoke } from "@tauri-apps/api/core";
import type { DCatalog, DesktopAccount, GenerateRequest, GenerateResponse } from "../../lib/desktop/types";
import type { AIDesign, AIDesignRequest } from "../../lib/ai/types";

export type { DCatalog, DesktopAccount, GenerateRequest, GenerateResponse };

export interface AppError {
  kind: "unauthorized" | "update_required" | "rate_limited" | "network" | "server" | "invalid" | "forbidden" | "cancelled" | "timeout" | "storage" | "io" | "not_found";
  message: string;
  status?: number;
  retryAfter?: number;
  minimumVersion?: string;
}

export interface AppInfo {
  version: string;
  server: string;
  signedIn: boolean;
}

export interface Prefs {
  exportDir: string | null;
  lastDir: string | null;
  openAfterExport: boolean;
}

export type Generated = { status: number; body: GenerateResponse & { designId?: number } };

export type WebPage = "upgrade" | "manage" | "account" | "help" | "signup" | "home" | "privacy" | "terms";

export function asAppError(e: unknown): AppError {
  if (e && typeof e === "object" && "kind" in e && "message" in e) return e as AppError;
  return { kind: "server", message: typeof e === "string" ? e : "Something went wrong." };
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw asAppError(e);
  }
}

export const ipc = {
  appInfo: () => call<AppInfo>("app_info"),
  signIn: () => call<DesktopAccount>("sign_in"),
  cancelSignIn: () => call<void>("cancel_sign_in"),
  signOut: () => call<void>("sign_out"),
  me: () => call<DesktopAccount>("me"),
  catalog: () => call<DCatalog>("catalog"),
  generate: (request: GenerateRequest) => call<Generated>("generate", { request }),
  aiDesign: (request: AIDesignRequest) => call<AIDesign>("ai_design", { request }),
  saveDesign: (designId: number) => call<{ path: string | null }>("save_design", { designId }),
  exportDesign: (designId: number) => call<{ path: string | null }>("export_design", { designId }),
  revealFile: (path: string) => call<void>("reveal_file", { path }),
  openWeb: (page: WebPage) => call<void>("open_web", { page }),
  getPrefs: () => call<Prefs>("get_prefs"),
  chooseExportFolder: () => call<Prefs>("choose_export_folder"),
  setExportPrefs: (clearFolder: boolean, openAfterExport: boolean) => call<Prefs>("set_export_prefs", { clearFolder, openAfterExport }),
  webOpen: (path: string | null, bounds: WebBounds) => call<void>("web_open", { path, bounds }),
  webBounds: (bounds: WebBounds) => call<void>("web_bounds", { bounds }),
  webHide: () => call<void>("web_hide"),
  webAction: (action: "back" | "forward" | "reload" | "browser") => call<void>("web_action", { action }),
};

/** Where the website view sits in the window, in CSS pixels. */
export interface WebBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WebPageEvent {
  path: string;
  title: string | null;
  loading: boolean;
}

export interface WebDownloadEvent {
  ok: boolean;
  path: string | null;
  name: string | null;
  blocked: boolean;
}
