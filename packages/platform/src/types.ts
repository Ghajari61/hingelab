/**
 * The platform adapter: everything the shared app needs from its host. The website and the Windows
 * app each provide one implementation; UI code calls only this, never Tauri or browser file APIs.
 */

/** The signed-in account as the app sees it. */
export interface PlatformSession {
  /** Accounts exist (Supabase on the website, the HingeLab server on the desktop). */
  configured: boolean;
  user: { id: string; email: string | null; name: string | null } | null;
  /** The real plan id ("free", "pro", "business", "lifetime"). */
  plan: string;
  /** The subscription status and end of the paid period, when known. */
  status: string | null;
  periodEnd: string | null;
}

export interface SaveRequest {
  /** File name, with extension. */
  name: string;
  data: string | Uint8Array;
  mime: string;
  /** Where it goes: a download / Save dialog ("save"), or the export folder when the platform has one ("export"). */
  intent?: "save" | "export";
}

export interface SaveResult {
  saved: boolean;
  /** The file's path, on platforms that know it. */
  path?: string;
  /** A short note for the toast ("Downloading model.svg", "Saved to Exports"). */
  message: string;
}

export interface OpenedFile {
  name: string;
  /** The file's bytes. */
  bytes: Uint8Array;
  path?: string;
}

export interface RecentFile { name: string; path: string; exists: boolean }

export interface UpdateInfo { version: string; notes: string | null }

export interface Capabilities {
  /** The canvas can show the laser bed at true scale with rulers. */
  trueScaleBed: boolean;
  /** Exports can go straight to a chosen job folder. */
  jobFolder: boolean;
  /** Recently used project files are listed. */
  recentFiles: boolean;
  /** Projects open and save as files on this computer while offline. */
  offlineProjects: boolean;
  /** The app updates itself. */
  updater: boolean;
}

export interface Router {
  /** The current path, e.g. "/editor/hinge". */
  path(): string;
  search(): URLSearchParams;
  navigate(to: string, opts?: { replace?: boolean }): void;
  subscribe(cb: () => void): () => void;
}

export interface Platform {
  kind: "web" | "tauri";
  capabilities: Capabilities;
  /** A request to the HingeLab API (same paths on both: /api/...). */
  fetch(path: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<Response>;
  saveFile(req: SaveRequest): Promise<SaveResult>;
  /** Asks the server for the export of a design (the plan is checked there). */
  exportFile(body: unknown): Promise<Response>;
  openProject(accept: string[]): Promise<OpenedFile | null>;
  recentProjects(): Promise<RecentFile[]>;
  chooseFolder(): Promise<string | null>;
  auth: {
    session(): Promise<PlatformSession>;
    signIn(next?: string): Promise<void>;
    signOut(): Promise<void>;
    /** Calls back when the session changes; returns the unsubscribe. */
    onChange(cb: () => void): () => void;
    /** Reads the session again (after the plan changed outside the editor). */
    refresh(): void;
  };
  updates: { check(): Promise<UpdateInfo | null>; install(): Promise<void> };
  openExternal(url: string): Promise<void>;
  router: Router;
}
