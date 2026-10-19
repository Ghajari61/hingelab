/**
 * The Windows app: every request, file and token goes through the Rust core (`invoke`). The page
 * itself has no network or file access (CSP `connect-src ipc:`); Rust forwards allow-listed API
 * paths with the session from Windows Credential Manager and writes files the user picked.
 */
import { invoke } from "@tauri-apps/api/core";
import type { Platform, PlatformSession, RecentFile } from "./types";

interface ApiReply { status: number; contentType: string | null; body: string; base64: boolean }
interface DesktopMe { user: { id: string; email: string | null; name: string | null }; plan: string; tier?: string; status: string | null; periodEnd: string | null }

const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

const b64 = (bytes: Uint8Array) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** The Rust proxy's reply as a fetch Response, so shared code handles both platforms alike. */
async function apiFetch(path: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<Response> {
  const r = await invoke<ApiReply>("api_request", { request: { method: init?.method ?? "GET", path, contentType: init?.headers?.["content-type"] ?? null, body: init?.body ?? null } });
  const body = r.base64 ? unb64(r.body) : r.body;
  return new Response(typeof body === "string" ? body : body.slice(), { status: r.status, headers: r.contentType ? { "content-type": r.contentType } : {} });
}

/** Hash routes (#/editor/hinge): the bundle is served from local files, so paths cannot be real URLs. */
const hashPath = () => (window.location.hash.replace(/^#/, "").split("?")[0] || "/");
const hashSearch = () => new URLSearchParams(window.location.hash.split("?")[1] ?? "");

export function tauriPlatform(): Platform {
  return {
    kind: "tauri",
    capabilities: { trueScaleBed: true, jobFolder: true, recentFiles: true, offlineProjects: true, updater: true },
    fetch: apiFetch,
    async saveFile({ name, data, mime, intent }) {
      const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
      const r = await invoke<{ path: string | null }>("save_file", { request: { name, mime, data: b64(bytes), toExportFolder: intent === "export" } });
      return r.path ? { saved: true, path: r.path, message: `Saved ${r.path.split(/[\\/]/).pop()}` } : { saved: false, message: "Not saved" };
    },
    exportFile: (body) => apiFetch("/api/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    async openProject() {
      const r = await invoke<{ path: string; name: string; data: string } | null>("open_file", { path: null });
      return r ? { name: r.name, path: r.path, bytes: unb64(r.data) } : null;
    },
    recentProjects: () => invoke<RecentFile[]>("recent_projects"),
    async chooseFolder() {
      const p = await invoke<{ exportDir: string | null }>("choose_export_folder");
      return p.exportDir;
    },
    auth: {
      async session(): Promise<PlatformSession> {
        try {
          const me = await invoke<DesktopMe>("me");
          return { configured: true, user: me.user, plan: me.tier ?? me.plan, status: me.status, periodEnd: me.periodEnd };
        } catch {
          return { configured: true, user: null, plan: "free", status: null, periodEnd: null };
        }
      },
      async signIn() { await invoke("sign_in"); changed(); },
      async signOut() { await invoke("sign_out"); changed(); },
      onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
      refresh: changed,
    },
    updates: {
      async check() {
        const { check } = await import("@tauri-apps/plugin-updater");
        const u = await check();
        return u ? { version: u.version, notes: u.body ?? null } : null;
      },
      async install() {
        const { check } = await import("@tauri-apps/plugin-updater");
        const u = await check();
        if (!u) return;
        await u.downloadAndInstall();
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      },
    },
    openExternal: (url) => invoke("open_external", { url }),
    router: {
      path: hashPath,
      search: hashSearch,
      /** Replace only rewrites the address (the page made the change); otherwise the app opens the route afresh (hashchange). */
      navigate(to, opts) {
        if (opts?.replace) window.history.replaceState(null, "", `#${to}`);
        else window.location.hash = to;
      },
      subscribe(cb) {
        window.addEventListener("hashchange", cb);
        return () => window.removeEventListener("hashchange", cb);
      },
    },
  };
}
