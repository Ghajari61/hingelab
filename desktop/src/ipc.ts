/**
 * The window's own calls to the Rust commands (sign-in, settings, files, the website view). The
 * shared editors use packages/platform instead. JavaScript has no network, file or token access of
 * its own; the Rust side talks to the server and keeps the session.
 */
import { invoke } from "@tauri-apps/api/core";
import type { DesktopAccount } from "@/lib/desktop/types";

export type { DesktopAccount };

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
  projectDir: string | null;
  recentFiles: string[];
  /** Settings: Save and Open start in this folder. */
  homeDir: string | null;
  /** Settings: how many files Recent keeps (0: the default). */
  recentMax: number;
}

export interface RecentProject { path: string; name: string; exists: boolean }

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
  revealFile: (path: string) => call<void>("reveal_file", { path }),
  openWeb: (page: WebPage) => call<void>("open_web", { page }),
  getPrefs: () => call<Prefs>("get_prefs"),
  chooseExportFolder: () => call<Prefs>("choose_export_folder"),
  setExportPrefs: (clearFolder: boolean, openAfterExport: boolean) => call<Prefs>("set_export_prefs", { clearFolder, openAfterExport }),
  chooseProjectFolder: () => call<Prefs>("choose_project_folder"),
  setProjectPrefs: (clearFolder: boolean, recentMax: number) => call<Prefs>("set_project_prefs", { clearFolder, recentMax }),
  /** Hands a project to the website view; returns the page to open there. */
  webOpenFile: (path: string) => call<string>("web_open_file", { path }),
  recentProjects: () => call<RecentProject[]>("recent_projects"),
  forgetRecent: (path: string | null) => call<void>("forget_recent", { path }),
  takeOpenRequest: () => call<string | null>("take_open_request"),
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
