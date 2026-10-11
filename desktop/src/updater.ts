/**
 * Updates through the official Tauri updater. The plugin downloads the installer named by the
 * server and installs it only if its signature matches the public key built into this app; a
 * missing, wrong or tampered signature is an error and nothing is installed.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateStatus =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "none"; checkedAt: number }
  | { phase: "available"; info: UpdateInfo }
  | { phase: "downloading"; info: UpdateInfo; done: number; total: number | null }
  | { phase: "installing"; info: UpdateInfo }
  | { phase: "restarting"; info: UpdateInfo }
  | { phase: "error"; message: string; info?: UpdateInfo };

export interface UpdateInfo {
  version: string;
  current: string;
  notes: string;
  date: string | null;
  size: number | null;
}

function infoOf(u: Update): UpdateInfo {
  const raw = (u.rawJson ?? {}) as { size?: unknown };
  return { version: u.version, current: u.currentVersion, notes: (u.body ?? "").slice(0, 5000), date: u.date ?? null, size: typeof raw.size === "number" && raw.size > 0 ? raw.size : null };
}

/** What went wrong, in words a user can act on. */
export function updateErrorMessage(e: unknown): string {
  const s = String((e as { message?: string })?.message ?? e).toLowerCase();
  if (/signature|signed for|verif|minisign|public key|pubkey|tampered|key id/.test(s)) return "The update could not be verified, so it was not installed. Your current version is unchanged.";
  if (/network|connect|dns|timed? ?out|request|tls|certificate|sending/.test(s)) return "Couldn't reach the update server. Check your connection and try again.";
  if (/json|parse|invalid|manifest|deserialize/.test(s)) return "The update information was not valid, so nothing was installed.";
  return "The update failed. Your current version is unchanged. Try again later.";
}

export function useUpdater() {
  const [status, setStatus] = useState<UpdateStatus>({ phase: "idle" });
  const update = useRef<Update | null>(null);
  const busy = useRef(false);

  const checkNow = useCallback(async (): Promise<UpdateInfo | null> => {
    if (busy.current) return null;
    busy.current = true;
    setStatus({ phase: "checking" });
    try {
      const u = await check({ timeout: 30_000 });
      update.current = u;
      if (!u) {
        setStatus({ phase: "none", checkedAt: Date.now() });
        return null;
      }
      const info = infoOf(u);
      setStatus({ phase: "available", info });
      return info;
    } catch (e) {
      setStatus({ phase: "error", message: updateErrorMessage(e) });
      return null;
    } finally {
      busy.current = false;
    }
  }, []);

  const install = useCallback(async () => {
    const u = update.current;
    if (!u || busy.current) return;
    busy.current = true;
    const info = infoOf(u);
    let done = 0;
    let total: number | null = info.size;
    setStatus({ phase: "downloading", info, done, total });
    try {
      await u.downloadAndInstall((ev) => {
        if (ev.event === "Started") total = ev.data.contentLength ?? total;
        else if (ev.event === "Progress") {
          done += ev.data.chunkLength;
          setStatus({ phase: "downloading", info, done, total });
        } else if (ev.event === "Finished") setStatus({ phase: "installing", info });
      });
      setStatus({ phase: "restarting", info });
      await relaunch();
    } catch (e) {
      setStatus({ phase: "error", message: updateErrorMessage(e), info });
    } finally {
      busy.current = false;
    }
  }, []);

  const dismiss = useCallback(() => setStatus((s) => (s.phase === "available" || s.phase === "error" || s.phase === "none" ? { phase: "idle" } : s)), []);

  return { status, checkNow, install, dismiss, pending: update.current !== null };
}

/** Checks once shortly after start when the user allows it. */
export function useAutoCheck(enabled: boolean, checkNow: () => Promise<unknown>) {
  const fn = useRef(checkNow);
  fn.current = checkNow;
  const done = useRef(false);
  useEffect(() => {
    if (!enabled || done.current) return;
    const t = window.setTimeout(() => {
      done.current = true;
      void fn.current();
    }, 4000);
    return () => window.clearTimeout(t);
  }, [enabled]);
}

export function formatBytes(n: number | null): string {
  if (!n) return "";
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}
