import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { platform } from "@hingelab/platform";
import { matchRoute, productHref } from "@hingelab/app/routes";
import { DESKTOP_SIGN_OUT } from "@/lib/account/signOutEvent";
import { AI_START_KEY } from "@/lib/ai/types";
import { Sidebar, SignIn, Toasts, UpdateDialog, UpdateRequired, useModalOpen, type Route, type Toast } from "./components/Chrome";
import { Crash } from "./components/Crash";
import { Files } from "./components/Files";
import { Help, Settings, Subscription } from "./components/Pages";
import { isWebRoute, WEB_HOME, WebHost, type WebRequest, type WebRoute } from "./components/Web";
import { ipc, type AppError, type DesktopAccount, type Prefs, type RecentProject, type WebDownloadEvent, type WebPage } from "./ipc";
import { cacheAccount, cachedAccount, useFavorites, usePrefs, type Favorite } from "./local";
import { useAutoCheck, useUpdater } from "./updater";

/** The website's editor, the same code, built into the app: designs are made on this computer. */
const Workspace = lazy(() => import("@/components/editor/Workspace"));

type Phase = "boot" | "signedOut" | "ready" | "updateRequired";

/** Keeps a page mounted while hidden so its state and in-flight work survive a trip to another section. */
function Keep({ on, children, shell = true }: { on: boolean; children: ReactNode; shell?: boolean }) {
  return <div className={`keep-pane${shell ? " dk" : ""}${on ? " is-on" : ""}`} aria-hidden={!on}>{children}</div>;
}

const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function App() {
  const [phase, setPhase] = useState<Phase>("boot");
  const [version, setVersion] = useState("");
  const [server, setServer] = useState("");
  const [account, setAccount] = useState<DesktopAccount | null>(cachedAccount);
  const [route, setRoute] = useState<Route>("editor");
  /** Native (and web) sections opened at least once stay mounted so work is not thrown away. */
  const [seen, setSeen] = useState<Partial<Record<Route, true>>>({ editor: true });
  /** A new key opens the editor afresh at the address in the hash (a file, a preset, the start gallery). */
  const [editorKey, setEditorKey] = useState(0);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [minimum, setMinimum] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [online, setOnline] = useState(navigator.onLine);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);
  const [local, setLocal] = usePrefs();
  const toggleSidebar = useCallback(() => setLocal((old) => ({ ...old, sidebarCollapsed: !old.sidebarCollapsed })), [setLocal]);
  const [favorites, setFavorites] = useFavorites();
  const updater = useUpdater();
  const toastId = useRef(0);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = ++toastId.current;
    setToasts((l) => [...l.slice(-3), { ...t, id }]);
    window.setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), t.path ? 9000 : 5000);
  }, []);

  const signedOut = useCallback((message: string | null) => {
    void ipc.signOut().catch(() => {});
    setRoute("editor");
    webSection.current = null;
    cacheAccount(null);
    setAccount(null);
    setSignError(message);
    setPhase("signedOut");
    platform().auth.refresh();
  }, []);

  /** Errors that change the whole app: an ended session or an unsupported version. */
  const fatal = useCallback((e: AppError) => {
    if (e.kind === "unauthorized") signedOut("Your session has ended. Sign in again.");
    else if (e.kind === "update_required") {
      setMinimum(e.minimumVersion ?? null);
      setPhase("updateRequired");
    }
  }, [signedOut]);

  const loadAccount = useCallback(async () => {
    try {
      const a = await ipc.me();
      setAccount(a);
      cacheAccount(a);
      platform().auth.refresh();
      return true;
    } catch (e) {
      const err = e as AppError;
      if (err.kind === "unauthorized" || err.kind === "update_required") fatal(err);
      else if (err.kind === "network") setOnline(false);
      else toast({ text: err.message, kind: "err" });
      return false;
    }
  }, [fatal, toast]);

  // Start-up: version, session, then the account in the background (a cached copy shows at once).
  useEffect(() => {
    void (async () => {
      setVersion(await getVersion().catch(() => ""));
      try {
        const info = await ipc.appInfo();
        setServer(info.server);
        if (!info.signedIn) return setPhase("signedOut");
        setPhase("ready");
        void loadAccount();
        void ipc.getPrefs().then(setPrefs).catch(() => {});
      } catch {
        setPhase("signedOut");
      }
    })();
  }, [loadAccount]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Theme.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => (document.documentElement.dataset.theme = local.theme === "system" ? (mq.matches ? "dark" : "light") : local.theme);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [local.theme]);

  // Settings > Interface zoom and Reduce motion.
  useEffect(() => {
    const root = document.documentElement;
    root.style.zoom = local.uiZoom === 100 ? "" : String(local.uiZoom / 100);
    if (local.reduceMotion) root.dataset.reduceMotion = "";
    else delete root.dataset.reduceMotion;
  }, [local.uiZoom, local.reduceMotion]);

  // Updates: a quiet check after start; a found update opens the dialog once.
  useAutoCheck(phase !== "boot" && local.autoCheckUpdates, async () => {
    if (await updater.checkNow()) setShowUpdate(true);
  });

  const signIn = useCallback(async () => {
    setSigning(true);
    setSignError(null);
    try {
      const a = await ipc.signIn();
      setAccount(a);
      cacheAccount(a);
      setPhase("ready");
      setRoute("editor");
      void loadAccount();
      void ipc.getPrefs().then(setPrefs).catch(() => {});
    } catch (e) {
      const err = e as AppError;
      if (err.kind === "update_required") fatal(err);
      else if (err.kind !== "cancelled") setSignError(err.message);
    } finally {
      setSigning(false);
    }
  }, [fatal, loadAccount]);

  const web = useCallback((p: WebPage) => void ipc.openWeb(p).catch((e: AppError) => toast({ text: e.message, kind: "err" })), [toast]);

  // The website inside the window (Studio, AI Studio, cloud projects): one view, kept (hidden)
  // while native pages show, so going back to the same section finds it as it was left.
  const [webRequest, setWebRequest] = useState<WebRequest>({ path: WEB_HOME["web-studio"], n: 0 });
  const webSection = useRef<WebRoute | null>(null);
  const openOnline = useCallback((section: WebRoute, path?: string) => {
    if (path || webSection.current !== section) setWebRequest((old) => ({ path: path ?? WEB_HOME[section], n: old.n + 1 }));
    webSection.current = section;
    setRoute(section);
  }, []);
  const go = useCallback((r: Route) => (isWebRoute(r) ? openOnline(r) : setRoute(r)), [openOnline]);
  const modalOpen = useModalOpen();
  const onWebRoute = isWebRoute(route);
  useEffect(() => {
    setSeen((s) => (s[route] ? s : { ...s, [route]: true }));
  }, [route]);

  /** Opens the editor at an app address (`/editor/clock?preset=…`), afresh. */
  const openEditor = useCallback((to: string) => {
    window.history.replaceState(null, "", `#${to}`);
    setEditorKey((k) => k + 1);
    setRoute("editor");
  }, []);

  // The shared code moves between pages through the router; pages the app has no local copy of
  // open in the website view (Studio, cloud projects) or the browser (account).
  useEffect(() => {
    const on = () => {
      const r = platform().router;
      const m = matchRoute(r.path());
      const q = r.search().toString();
      if (m.page === "editor" || m.page === "start" || m.page === "generators") { setEditorKey((k) => k + 1); setRoute("editor"); }
      else if (m.page === "studio") openOnline("web-studio", `/editor/${encodeURIComponent(m.projectId)}`);
      else if (m.page === "projects") openOnline("web-projects", "/app");
      else if (m.page === "account") web("account");
      else openOnline("web-studio", `${r.path()}${q ? `?${q}` : ""}`);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, [openOnline, web]);

  // Links in the shared pages: app routes stay here; other HingeLab pages open in the browser.
  useEffect(() => {
    const click = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || e.defaultPrevented) return;
      const href = a.getAttribute("href") ?? "";
      if (href.startsWith("#") || href.startsWith("blob:") || href.startsWith("data:") || a.hasAttribute("download")) return;
      e.preventDefault();
      if (!href.startsWith("/") || href.startsWith("//")) {
        if (/^https?:\/\//i.test(href)) void platform().openExternal(href).catch(() => toast({ text: "HingeLab opens its own pages only.", kind: "err" }));
        return;
      }
      const m = matchRoute(href.split(/[?#]/)[0]);
      if (m.page === "editor" || m.page === "start") platform().router.navigate(href);
      else void platform().openExternal(href).catch((err: AppError) => toast({ text: err.message, kind: "err" }));
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, [toast]);

  useEffect(() => {
    const off = listen<WebDownloadEvent>("web-download", ({ payload: d }) => {
      if (d.blocked) toast({ text: "HingeLab saves drawings and project files only (SVG, DXF, OCLC, ZIP, JSON, PNG, PDF).", kind: "err" });
      else if (d.ok && d.path) toast({ text: `Saved ${d.name ?? d.path.split(/[\\/]/).pop()}`, kind: "ok", path: d.path });
      else toast({ text: "The download did not finish.", kind: "err" });
    });
    return () => void off.then((f) => f());
  }, [toast]);

  const refreshPlan = useCallback(async () => {
    setRefreshing(true);
    const ok = await loadAccount();
    setRefreshing(false);
    if (ok) toast({ text: "Plan updated." });
  }, [loadAccount, toast]);

  // Project files (.oclc): the editor reads the file itself; Studio projects open in the website view.
  const [files, setFiles] = useState<RecentProject[]>([]);
  const loadFiles = useCallback(() => void ipc.recentProjects().then((l) => setFiles(Array.isArray(l) ? l : [])).catch(() => {}), []);
  useEffect(() => { if (phase === "ready") loadFiles(); }, [phase, loadFiles]);

  const openFile = useCallback(async (path: string | null) => {
    try {
      const f = await invoke<{ path: string; name: string; data: string } | null>("open_file", { path });
      if (!f) return;
      loadFiles();
      const bytes = unb64(f.data);
      if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
        openOnline("web-studio", await ipc.webOpenFile(f.path));
        toast({ text: `Opening ${f.name} in the online Studio…` });
        return;
      }
      // The same file opened twice is still a new address, so the editor opens it again.
      window.history.replaceState(null, "", "#/");
      const { openProjectFile } = await import("@/components/shell/projectFiles");
      await openProjectFile(new File([bytes], f.name), null, null, (text) => toast({ text }));
    } catch (e) {
      toast({ text: (e as AppError).message ?? "That file could not be opened.", kind: "err" });
      loadFiles();
    }
  }, [loadFiles, openOnline, toast]);

  const openFavorite = useCallback((f: Favorite) => {
    if (!f.preset && f.params) {
      try { sessionStorage.setItem(AI_START_KEY, JSON.stringify({ product: f.product, preset: { id: `favorite-${f.id}`, name: f.name, note: f.note ?? "", params: f.params } })); } catch { /* storage off */ }
      openEditor(`${productHref(f.product, "tauri")}?ai=1`);
    } else openEditor(`${productHref(f.product, "tauri")}${f.preset ? `?preset=${encodeURIComponent(f.preset)}` : ""}`);
  }, [openEditor]);

  // A file double-clicked in Explorer, dropped on the window or passed to a second launch.
  const canOpen = phase === "ready";
  const openRef = useRef(openFile);
  openRef.current = openFile;
  const started = useRef(false);
  const openLast = useRef(local.openLast);
  openLast.current = local.openLast;
  // Sign out in the website view's account menu signs the whole app out.
  useEffect(() => {
    const off = listen("web-sign-out", () => signedOut(null));
    // …and Sign out in the app's own account menu (the editor's top bar).
    const fromMenu = () => signedOut(null);
    window.addEventListener(DESKTOP_SIGN_OUT, fromMenu);
    return () => { void off.then((f) => f()); window.removeEventListener(DESKTOP_SIGN_OUT, fromMenu); };
  }, [signedOut]);

  useEffect(() => {
    if (!canOpen) return;
    const take = () => void ipc.takeOpenRequest().then((p) => { if (p) void openRef.current(p); }).catch(() => {});
    // Settings > Open the last project at start (unless Windows asked for a file).
    if (!started.current && openLast.current) {
      void ipc.takeOpenRequest().then(async (p) => {
        if (p) return void openRef.current(p);
        const last = (await ipc.recentProjects()).find((f) => f.exists);
        if (last) void openRef.current(last.path);
      }).catch(() => {});
    } else take();
    started.current = true;
    const off = listen("open-file-request", take);
    return () => void off.then((f) => f());
  }, [canOpen]);

  // App shortcuts; the editor has its own (Ctrl+S, Ctrl+Z, zoom...) while it shows.
  useEffect(() => {
    if (phase !== "ready") return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "F1") { e.preventDefault(); setRoute("help"); return; }
      if (!e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === ",") { e.preventDefault(); setRoute("settings"); }
      else if (k === "b" && e.shiftKey) { e.preventDefault(); toggleSidebar(); }
      else if (k === "o" && route !== "editor") { e.preventDefault(); void openFile(null); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [phase, route, openFile, toggleSidebar]);

  // Block the WebView's own file drops (dropped project files are opened by the app itself).
  useEffect(() => {
    const drop = (e: DragEvent) => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); };
    window.addEventListener("dragover", drop);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", drop);
      window.removeEventListener("drop", drop);
    };
  }, []);

  const installUpdate = useCallback(async () => {
    setShowUpdate(true);
    await updater.install();
  }, [updater]);

  if (phase === "boot") return <div className="dk boot" aria-busy="true" />;
  if (phase === "updateRequired") {
    return (
      <div className="dk dk-fill">
        <UpdateRequired
          minimum={minimum}
          status={updater.status}
          onUpdate={async () => {
            if (await updater.checkNow()) await updater.install();
          }}
          onWebsite={() => web("home")}
        />
      </div>
    );
  }
  const updateDialog = showUpdate && <div className="dk dk-contents"><UpdateDialog status={updater.status} onInstall={installUpdate} onLater={() => { setShowUpdate(false); if (updater.status.phase === "error") updater.dismiss(); }} onRetry={async () => { if (await updater.checkNow()) await updater.install(); }} /></div>;
  if (phase === "signedOut") {
    return (
      <div className="dk dk-fill">
        <SignIn busy={signing} error={signError} version={version} onSignIn={signIn} onCancel={() => void ipc.cancelSignIn()} onSignUp={() => web("signup")} />
        {updateDialog}
      </div>
    );
  }

  return (
    <div className={`dk-app${local.sidebarCollapsed ? " side-collapsed" : ""}${onWebRoute ? " on-web" : ""}`}>
      <div className="dk dk-side">
        <Sidebar route={route} onRoute={go} account={account} update={updater.status} onUpdate={() => setShowUpdate(true)} collapsed={local.sidebarCollapsed} onToggle={toggleSidebar} />
      </div>
      <div className="dk-main">
        {!online && route !== "editor" && <div className="dk offline-bar" role="status">You&apos;re offline. You can keep designing; exporting cut files and the online sections need a connection.</div>}
        <Keep on={route === "editor"} shell={false}>
          <div className="dk-editor">
            <Crash onReset={() => setEditorKey((k) => k + 1)}>
              <Suspense fallback={<div className="boot">Loading HingeLab…</div>}>
                <Workspace key={editorKey} />
              </Suspense>
            </Crash>
          </div>
        </Keep>
        {seen.files && (
          <Keep on={route === "files"}>
            <Files
              files={files} favorites={favorites}
              onOpenFile={(p) => void openFile(p)}
              onForget={(p) => void ipc.forgetRecent(p).then(loadFiles).catch((e: AppError) => toast({ text: e.message, kind: "err" }))}
              onOpenFavorite={openFavorite}
              onRemoveFavorite={(f) => setFavorites((l) => l.filter((x) => x.id !== f.id))}
            />
          </Keep>
        )}
        {seen.subscription && (
          <Keep on={route === "subscription"}>
            <Subscription account={account} onWeb={web} onRefresh={refreshPlan} refreshing={refreshing} />
          </Keep>
        )}
        {seen.settings && (
          <Keep on={route === "settings"}>
            <Settings
              account={account} local={local} setLocal={setLocal} prefs={prefs} version={version} server={server} update={updater.status}
              onCheck={() => void updater.checkNow()}
              onInstall={installUpdate}
              onChooseFolder={() => void ipc.chooseExportFolder().then(setPrefs).catch((e: AppError) => toast({ text: e.message, kind: "err" }))}
              onExportPrefs={(clear, openAfter) => void ipc.setExportPrefs(clear, openAfter).then(setPrefs).catch((e: AppError) => toast({ text: e.message, kind: "err" }))}
              onChooseProjectFolder={() => void ipc.chooseProjectFolder().then(setPrefs).catch((e: AppError) => toast({ text: e.message, kind: "err" }))}
              onProjectPrefs={(clear, max) => void ipc.setProjectPrefs(clear, max).then((p) => { setPrefs(p); loadFiles(); }).catch((e: AppError) => toast({ text: e.message, kind: "err" }))}
              onWeb={web}
              onSignOut={() => signedOut(null)}
              onRefreshPlan={refreshPlan}
            />
          </Keep>
        )}
        {seen.help && (
          <Keep on={route === "help"}>
            <Help onWeb={web} version={version} onHelpCentre={() => openOnline("web-studio", "/help")} />
          </Keep>
        )}
        {(seen["web-studio"] || seen["web-ai"] || seen["web-projects"]) && (
          <Keep on={onWebRoute}>
            <WebHost request={webRequest} covered={modalOpen || !onWebRoute} onError={(e) => toast({ text: e.message, kind: "err" })} />
          </Keep>
        )}
      </div>
      {updateDialog}
      <div className="dk dk-contents">
        <Toasts items={toasts} onReveal={(p) => void ipc.revealFile(p).catch((e: AppError) => toast({ text: e.message, kind: "err" }))} onClose={(id) => setToasts((l) => l.filter((x) => x.id !== id))} />
      </div>
    </div>
  );
}
