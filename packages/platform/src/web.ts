/**
 * The website: same-origin fetch with the session cookie, downloads through a temporary link, files
 * through the picker, the Supabase session, and the browser's history.
 */
import type { OpenedFile, Platform, PlatformSession } from "./types";

const listeners = new Set<() => void>();

function download(name: string, data: string | Uint8Array, mime: string) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(new Blob([typeof data === "string" ? data : data.slice()], { type: mime }));
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function pickFile(accept: string[]): Promise<OpenedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept.join(",");
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) } : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

async function session(): Promise<PlatformSession> {
  const { getBrowserClient } = await import("@/lib/supabase/client");
  const supabase = getBrowserClient();
  if (!supabase) return { configured: false, user: null, plan: "pro", status: null, periodEnd: null };
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  if (!u) return { configured: true, user: null, plan: "free", status: null, periodEnd: null };
  const { data: p } = await supabase.from("profiles").select("*").eq("id", u.id).maybeSingle();
  const meta = (u.user_metadata ?? {}) as { full_name?: string; name?: string };
  return {
    configured: true,
    user: { id: u.id, email: u.email ?? null, name: meta.full_name ?? meta.name ?? null },
    plan: p?.plan ?? "free", status: p?.plan_status ?? null, periodEnd: p?.current_period_end ?? null,
  };
}

export function webPlatform(): Platform {
  return {
    kind: "web",
    capabilities: { trueScaleBed: false, jobFolder: false, recentFiles: false, offlineProjects: false, updater: false },
    fetch: (path, init) => fetch(path, { method: init?.method ?? "GET", headers: init?.headers, body: init?.body, credentials: "same-origin" }),
    async saveFile({ name, data, mime }) {
      download(name, data, mime);
      return { saved: true, message: `Downloading ${name}` };
    },
    exportFile: (body) => fetch("/api/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" }),
    openProject: (accept) => pickFile(accept),
    recentProjects: async () => [],
    chooseFolder: async () => null,
    auth: {
      session,
      async signIn(next) { window.location.assign(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`); },
      async signOut() {
        const { getBrowserClient } = await import("@/lib/supabase/client");
        await getBrowserClient()?.auth.signOut();
        listeners.forEach((l) => l());
      },
      onChange(cb) {
        listeners.add(cb);
        let unsub = () => {};
        void import("@/lib/supabase/client").then(({ getBrowserClient }) => {
          const sub = getBrowserClient()?.auth.onAuthStateChange(() => cb());
          if (sub) unsub = () => sub.data.subscription.unsubscribe();
        });
        return () => { listeners.delete(cb); unsub(); };
      },
      refresh() { listeners.forEach((l) => l()); },
    },
    updates: { check: async () => null, install: async () => {} },
    async openExternal(url) { window.open(url, "_blank", "noopener,noreferrer"); },
    router: {
      path: () => window.location.pathname,
      search: () => new URLSearchParams(window.location.search),
      navigate(to, opts) {
        if (opts?.replace) window.history.replaceState(null, "", to);
        else window.location.assign(to);
      },
      subscribe(cb) {
        window.addEventListener("popstate", cb);
        return () => window.removeEventListener("popstate", cb);
      },
    },
  };
}
