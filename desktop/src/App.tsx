import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ConfirmDialog, Sidebar, SignIn, Toasts, UpdateDialog, UpdateRequired, useModalOpen, type Route, type Toast } from "./components/Chrome";
import { Dashboard, Favorites, Generators, Help, Recent, Settings, Subscription } from "./components/Pages";
import { Workspace } from "./components/Workspace";
import { resetValues } from "./components/SettingsPanel";
import { AIPage } from "./components/AIPage";
import { isWebRoute, WEB_HOME, WebHost, type WebRequest, type WebRoute } from "./components/Web";
import type { CanvasHandle } from "./components/Canvas";
import { isDirty, useDesign, type Params } from "./design";
import { ipc, type AppError, type DCatalog, type DesktopAccount, type ExportAs, type Prefs, type RecentProject, type WebDownloadEvent, type WebPage } from "./ipc";
import { projectText, readProject } from "./projectFile";
import { designThumb } from "./thumb";
import { addRecent, setRecentThumb, cacheAccount, cacheCatalog, cachedAccount, cachedCatalog, lastParams, rememberParams, useFavorites, useLocks, usePrefs, useRecent, type Favorite, type SavedDesign } from "./local";
import { useAutoCheck, useUpdater } from "./updater";

type Phase = "boot" | "signedOut" | "ready" | "updateRequired";

/** Keeps a page mounted while hidden so its state and in-flight work survive a trip to another section. */
function Keep({ on, children }: { on: boolean; children: ReactNode }) {
  return <div className={`keep-pane${on ? " is-on" : ""}`} aria-hidden={!on}>{children}</div>;
}

export function App() {
  const [phase, setPhase] = useState<Phase>("boot");
  const [version, setVersion] = useState("");
  const [server, setServer] = useState("");
  const [account, setAccount] = useState<DesktopAccount | null>(cachedAccount);
  const [catalog, setCatalog] = useState<DCatalog | null>(cachedCatalog);
  const [route, setRoute] = useState<Route>("dashboard");
  /** Native (and web) sections opened at least once stay mounted so work is not thrown away. */
  const [seen, setSeen] = useState<Partial<Record<Route, true>>>({ dashboard: true });
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
  const [recent, setRecent] = useRecent();
  const [favorites, setFavorites] = useFavorites();
  const updater = useUpdater();
  const canvas = useRef<CanvasHandle>(null);
  const toastId = useRef(0);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = ++toastId.current;
    setToasts((l) => [...l.slice(-3), { ...t, id }]);
    window.setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), t.path ? 9000 : 5000);
  }, []);

  const signedOut = useCallback((message: string | null) => {
    void ipc.signOut().catch(() => {});
    setRoute("dashboard");
    webSection.current = null;
    cacheAccount(null);
    setAccount(null);
    setSignError(message);
    setPhase("signedOut");
  }, []);

  /** Errors that change the whole app: an ended session or an unsupported version. */
  const fatal = useCallback((e: AppError) => {
    if (e.kind === "unauthorized") signedOut("Your session has ended. Sign in again.");
    else if (e.kind === "update_required") {
      setMinimum(e.minimumVersion ?? null);
      setPhase("updateRequired");
    }
  }, [signedOut]);

  const design = useDesign(fatal);

  const loadAccount = useCallback(async () => {
    try {
      const [a, c] = await Promise.all([ipc.me(), ipc.catalog()]);
      setAccount(a);
      cacheAccount(a);
      setCatalog(c);
      cacheCatalog(c);
      return true;
    } catch (e) {
      const err = e as AppError;
      if (err.kind === "unauthorized" || err.kind === "update_required") fatal(err);
      else if (err.kind === "network") setOnline(false);
      else toast({ text: err.message, kind: "err" });
      return false;
    }
  }, [fatal, toast]);

  // Start-up: version, session, then account and catalog in the background (cached copies show at once).
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
  useEffect(() => {
    if (design.state.error?.kind === "network") setOnline(false);
    else if (design.state.result && !design.state.error) setOnline(true);
  }, [design.state.error, design.state.result]);
  // Back online: the change that could not be sent goes now.
  const unsent = useRef(false);
  unsent.current = design.state.unsent;
  const { refresh } = design;
  useEffect(() => {
    if (online && unsent.current) refresh();
  }, [online, refresh]);

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
      setRoute("dashboard");
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

  // The website inside the window: one view, kept (hidden) while native pages show, so going back
  // to the same section finds it as it was left.
  const [webRequest, setWebRequest] = useState<WebRequest>({ path: WEB_HOME["web-editors"], n: 0 });
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
    if (ok) {
      if (design.state.result?.locked) design.refresh();
      toast({ text: "Plan updated." });
    }
  }, [loadAccount, design, toast]);

  const product = useMemo(() => (catalog?.art?.id === design.state.product ? catalog.art : catalog?.products.find((p) => p.id === design.state.product)) ?? null, [catalog, design.state.product]);

  const [askReset, setAskReset] = useState(false);
  const resetAll = () => {
    if (!product || !design.state.params) return;
    if (local.confirmReset) setAskReset(true);
    else doReset();
  };
  const doReset = () => {
    setAskReset(false);
    if (!product || !design.state.params) return;
    const values = resetValues(product.sections.flatMap((s) => s.fields), design.state.params, design.state.result?.form);
    if (!Object.keys(values).length) return toast({ text: "Every setting is already at its default.", kind: "ok" });
    design.changeMany(values);
    toast({ text: "All settings reset. Ctrl+Z undoes it.", kind: "ok" });
  };

  const locks = useLocks(product && product.id !== "art" ? product.id : null);
  const canRandom = !!product && (product.id === "hinge" || product.sections.some((s) => s.fields.some((f) => f.kind !== "text" && f.shuffle)));
  const randomise = useCallback(() => {
    if (!canRandom || !design.state.params || design.state.busy) return;
    const hinge = design.state.product === "hinge";
    design.randomise(hinge ? [] : locks.list);
    toast({ text: hinge ? "A random hinge pattern. Ctrl+Z undoes it." : locks.list.length ? "New random design; locked settings kept. Ctrl+Z undoes it." : "New random design. Ctrl+Z undoes it.", kind: "ok" });
  }, [canRandom, design, locks.list, toast]);

  // Settings > Open designs in: the sheet or 3D, whatever was showing last.
  const startView = useCallback(() => {
    if (local.openIn !== "last") setLocal((o) => ({ ...o, view3d: local.openIn === "3d" }));
  }, [local.openIn, setLocal]);
  const openNew = useCallback((id: string) => {
    const saved = local.reuseLastSettings ? lastParams(id) : null;
    design.open(id, saved ? { params: saved } : {});
    startView();
    setRoute("workspace");
  }, [design, local.reuseLastSettings, startView]);
  const openPreset = useCallback((id: string, preset: string) => {
    design.open(id, { preset });
    startView();
    setRoute("workspace");
  }, [design, startView]);
  const openSaved = useCallback((d: { product: string; params?: Params; preset?: string }) => {
    design.open(d.product, d.preset ? { preset: d.preset } : { params: d.params });
    startView();
    setRoute("workspace");
  }, [design, startView]);

  // Remember designs as they change (settings only, on this computer).
  const r = design.state.result;
  useEffect(() => {
    if (!r || (design.state.status !== 200 && design.state.status !== 403)) return;
    if (r.product !== "art") rememberParams(r.product, r.params);
    const name = String(r.params.name ?? "Untitled");
    setRecent((list) => addRecent(list, { product: r.product, name, params: r.params, summary: r.summary }));
    if (!r.svg) return;
    const svg = r.svg;
    let live = true;
    const t = window.setTimeout(() => {
      void designThumb(svg).then((thumb) => {
        if (live && thumb) setRecent((list) => setRecentThumb(list, r.product, name, thumb));
      });
    }, 700);
    return () => { live = false; window.clearTimeout(t); };
  }, [r, design.state.status, setRecent]);

  const currentFavorite = r ? favorites.find((f) => !f.preset && f.product === r.product && f.name === String(r.params.name)) : undefined;
  const toggleFavorite = useCallback(() => {
    if (!r) return;
    if (currentFavorite) setFavorites((l) => l.filter((f) => f.id !== currentFavorite.id));
    else setFavorites((l) => [{ id: crypto.randomUUID(), product: r.product, params: r.params, name: String(r.params.name ?? "Untitled"), note: r.summary, at: Date.now() }, ...l]);
  }, [r, currentFavorite, setFavorites]);

  // Project files (.oclc).
  const [files, setFiles] = useState<RecentProject[]>([]);
  const loadFiles = useCallback(() => void ipc.recentProjects().then((l) => setFiles(Array.isArray(l) ? l : [])).catch(() => {}), []);
  useEffect(() => { if (phase === "ready") loadFiles(); }, [phase, loadFiles]);

  const saveProject = useCallback(async (asNew: boolean) => {
    if ((account?.plan ?? "free") !== "pro") {
      toast({ text: "Saving and exporting need Pro. Upgrade to download cut files.", kind: "err" });
      return;
    }
    design.flush();
    const cur = design.current();
    if (!cur.product || !cur.params || cur.product === "art") return;
    const text = projectText(cur.product, cur.params, design.state.result?.version ?? 1);
    const name = String(cur.params.name ?? "") || (product?.name ?? "design");
    const file = design.state.file;
    try {
      const out = asNew || !file ? await ipc.saveProjectAs(text, name) : await ipc.saveProject(text, name, file.path);
      if (!out.path || !out.name) return;
      design.markSaved({ path: out.path, name: out.name });
      toast({ text: `Saved ${out.name}`, kind: "ok", path: out.path });
      loadFiles();
    } catch (e) {
      toast({ text: (e as AppError).message, kind: "err" });
    }
  }, [account?.plan, design, product, toast, loadFiles]);

  const nativeIds = useMemo(() => new Set(["hinge", ...(catalog?.products.map((p) => p.id) ?? [])]), [catalog]);
  const openFile = useCallback(async (path: string | null) => {
    try {
      const f = await ipc.openProject(path);
      if (!f) return;
      loadFiles();
      const r = readProject(f.text, nativeIds);
      if (r.kind === "error") { toast({ text: r.message, kind: "err" }); return; }
      if (r.kind === "native") {
        design.open(r.product, { params: r.params, version: r.version, file: { path: f.path, name: f.name } });
        startView();
        setRoute("workspace");
        toast({ text: `Opened ${f.name}` });
        return;
      }
      openOnline(r.section === "studio" ? "web-studio" : "web-editors", await ipc.webOpenFile(f.path));
      toast({ text: `Opening ${f.name} in the online ${r.section === "studio" ? "Studio" : "editor"}…` });
    } catch (e) {
      toast({ text: (e as AppError).message, kind: "err" });
      loadFiles();
    }
  }, [design, nativeIds, openOnline, toast, loadFiles, startView]);

  // A file double-clicked in Explorer, dropped on the window or passed to a second launch.
  const canOpen = phase === "ready" && !!catalog;
  const openRef = useRef(openFile);
  openRef.current = openFile;
  const started = useRef(false);
  const openLast = useRef(local.openLast);
  openLast.current = local.openLast;
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

  // The window title names the open file, with a dot while it has unsaved changes.
  const titleName = route === "workspace" && design.state.product ? (design.state.file?.name ?? String(design.state.params?.name ?? product?.name ?? "")) : "";
  const titleDirty = route === "workspace" && !!design.state.file && isDirty(design.state);
  useEffect(() => {
    void getCurrentWindow().setTitle(titleName ? `${titleDirty ? "\u2022 " : ""}${titleName} \u2014 HingeLab` : "HingeLab").catch(() => {});
  }, [titleName, titleDirty]);

  const save = useCallback(async (how: "save" | "export" | ExportAs) => {
    if ((account?.plan ?? "free") !== "pro") {
      toast({ text: "Saving and exporting need Pro. Upgrade to download cut files.", kind: "err" });
      return;
    }
    const id = design.state.result?.designId;
    if (!id) return;
    try {
      const out = how === "save" ? await ipc.saveDesign(id) : how === "export" ? await ipc.exportDesign(id) : await ipc.exportDesignAs(id, how);
      if (out.path) toast({ text: `Saved ${out.path.split(/[\\/]/).pop()}`, kind: "ok", path: out.path });
    } catch (e) {
      toast({ text: (e as AppError).message, kind: "err" });
    }
  }, [account?.plan, design.state.result, toast]);

  // Keyboard shortcuts.
  useEffect(() => {
    if (phase !== "ready") return;
    const key = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      if (e.key === "F1") { e.preventDefault(); setRoute("help"); return; }
      if (!e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const inWs = route === "workspace";
      const art = design.state.product === "art";
      if (k === ",") { e.preventDefault(); setRoute("settings"); }
      else if (k === "b") { e.preventDefault(); toggleSidebar(); }
      else if (k === "o") { e.preventDefault(); void openFile(null); }
      else if (k === "s" && inWs) { e.preventDefault(); if (art) void save("save"); else void saveProject(e.shiftKey); }
      else if (k === "e" && inWs) { e.preventDefault(); void save(e.shiftKey ? "save" : "export"); }
      else if (k === "enter" && inWs) { e.preventDefault(); design.refresh(); }
      else if ((k === "=" || k === "+") && inWs) { e.preventDefault(); canvas.current?.zoomIn(); }
      else if (k === "-" && inWs) { e.preventDefault(); canvas.current?.zoomOut(); }
      else if (k === "0" && inWs) { e.preventDefault(); canvas.current?.fit(); }
      else if (k === "1" && inWs) { e.preventDefault(); canvas.current?.reset(); }
      else if (k === "z" && inWs && !typing) { e.preventDefault(); if (e.shiftKey) design.redo(); else design.undo(); }
      else if (k === "y" && inWs && !typing) { e.preventDefault(); design.redo(); }
      else if (k === "r") { e.preventDefault(); if (inWs && !typing) randomise(); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [phase, route, save, saveProject, openFile, design, toggleSidebar, randomise]);

  // Block the WebView's own context menu and file drops (dropped project files are opened by the app itself).
  useEffect(() => {
    const menu = (e: MouseEvent) => {
      if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) e.preventDefault();
    };
    const drop = (e: DragEvent) => e.preventDefault();
    window.addEventListener("contextmenu", menu);
    window.addEventListener("dragover", drop);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("contextmenu", menu);
      window.removeEventListener("dragover", drop);
      window.removeEventListener("drop", drop);
    };
  }, []);

  const installUpdate = useCallback(async () => {
    setShowUpdate(true);
    await updater.install();
  }, [updater]);

  if (phase === "boot") return <div className="boot" aria-busy="true" />;
  if (phase === "updateRequired") {
    return (
      <UpdateRequired
        minimum={minimum}
        status={updater.status}
        onUpdate={async () => {
          if (await updater.checkNow()) await updater.install();
        }}
        onWebsite={() => web("home")}
      />
    );
  }
  const updateDialog = showUpdate && <UpdateDialog status={updater.status} onInstall={installUpdate} onLater={() => { setShowUpdate(false); if (updater.status.phase === "error") updater.dismiss(); }} onRetry={async () => { if (await updater.checkNow()) await updater.install(); }} />;
  if (phase === "signedOut") {
    return (
      <>
        <SignIn busy={signing} error={signError} version={version} onSignIn={signIn} onCancel={() => void ipc.cancelSignIn()} onSignUp={() => web("signup")} />
        {updateDialog}
      </>
    );
  }

  const plan = account?.plan ?? "free";
  return (
    <div className={`app${local.sidebarCollapsed ? " side-collapsed" : ""}${onWebRoute ? " on-web" : ""}`}>
      <Sidebar route={route} onRoute={go} account={account} hasDesign={!!design.state.product} update={updater.status} onUpdate={() => setShowUpdate(true)} collapsed={local.sidebarCollapsed} onToggle={toggleSidebar} />
      <div className="main">
        {!online && route !== "workspace" && <div className="offline-bar" role="status">You're offline. Designs are built on HingeLab's servers, so new changes wait until you're back online.</div>}
        {seen.dashboard && (
          <Keep on={route === "dashboard"}>
            <Dashboard account={account} catalog={catalog} recent={recent} files={files} defaultProduct={local.defaultProduct} onNew={openNew} onPreset={openPreset} onBrowse={() => setRoute("generators")} onOpenRecent={openSaved} onOpenFile={(p) => void openFile(p)} onUpgrade={() => web("upgrade")} onOnline={openOnline} />
          </Keep>
        )}
        {(seen.generators || (route === "workspace" && !product)) && (
          <Keep on={route === "generators" || (route === "workspace" && !product)}>
            <Generators catalog={catalog} plan={plan} initial={design.state.product ?? local.defaultProduct} favorites={favorites} onPreset={openPreset} onNew={openNew} onFavorite={(p, pr) => {
              const hit = favorites.find((f) => f.product === p.id && f.preset === pr.id);
              setFavorites((l) => (hit ? l.filter((f) => f.id !== hit.id) : [{ id: crypto.randomUUID(), product: p.id, preset: pr.id, name: pr.name, note: pr.note, at: Date.now() }, ...l]));
            }} />
          </Keep>
        )}
        {seen.ai && (
          <Keep on={route === "ai"}>
            <AIPage
              catalog={catalog}
              plan={plan}
              online={online}
              onOpen={(id, params, in3d) => {
                design.open(id, { params });
                if (in3d) setLocal((o) => ({ ...o, view3d: true }));
                else startView();
                setRoute("workspace");
              }}
              onOnline={(path) => openOnline("web-editors", path)}
              onUpgrade={() => web("upgrade")}
            />
          </Keep>
        )}
        {seen.workspace && product && (
          <Keep on={route === "workspace"}>
            <Workspace
              product={product}
              design={design.state}
              plan={plan}
              units={local.units}
              online={online}
              canvas={canvas}
              favorite={!!currentFavorite}
              onChange={design.change}
              onChangeMany={design.changeMany}
              onSetValues={design.setValues}
              onScale={design.scaleBy}
              onRename={(name) => design.change("name", name, true)}
              onFix={design.fix}
              onAutofix={design.autofix}
              onRefresh={design.refresh}
              onUndo={design.undo}
              onRedo={design.redo}
              onSave={() => void (product.id === "art" ? save("save") : saveProject(false))}
              onSaveAs={() => void saveProject(true)}
              onOpenFile={() => void openFile(null)}
              onExportAs={() => void save("save")}
              onResetAll={product.id === "art" ? undefined : resetAll}
              onRandomise={canRandom ? randomise : undefined}
              randomLabel={product.id === "hinge" ? "Randomise pattern" : undefined}
              locks={product.id === "hinge" ? undefined : { has: locks.has, toggle: locks.toggle, count: locks.list.length }}
              onExport={() => void save("export")}
              onExportFormat={(f) => void save(f)}
              onUpgrade={() => web("upgrade")}
              onRefreshPlan={refreshPlan}
              onFavorite={toggleFavorite}
              onWant3d={design.setWant3d}
            />
          </Keep>
        )}
        {seen.recent && (
          <Keep on={route === "recent"}>
            <Recent recent={recent} catalog={catalog} onOpen={openSaved} onRemove={(d: SavedDesign) => setRecent((l) => l.filter((x) => x.id !== d.id))} onClear={() => setRecent([])} />
          </Keep>
        )}
        {seen.favorites && (
          <Keep on={route === "favorites"}>
            <Favorites favorites={favorites} catalog={catalog} onOpen={(f: Favorite) => openSaved(f)} onRemove={(f) => setFavorites((l) => l.filter((x) => x.id !== f.id))} />
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
              account={account} local={local} setLocal={setLocal} prefs={prefs} catalog={catalog} version={version} server={server} update={updater.status}
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
        {(seen["web-editors"] || seen["web-studio"] || seen["web-ai"] || seen["web-projects"]) && (
          <Keep on={onWebRoute}>
            <WebHost request={webRequest} covered={modalOpen || !onWebRoute} onError={(e) => toast({ text: e.message, kind: "err" })} />
          </Keep>
        )}
      </div>
      {updateDialog}
      {askReset && <ConfirmDialog title="Reset all settings?" text="Every setting of this design goes back to its default. Ctrl+Z undoes it." action="Reset all" onConfirm={doReset} onCancel={() => setAskReset(false)} />}
      <Toasts items={toasts} onReveal={(p) => void ipc.revealFile(p).catch((e: AppError) => toast({ text: e.message, kind: "err" }))} onClose={(id) => setToasts((l) => l.filter((x) => x.id !== id))} />
    </div>
  );
}
