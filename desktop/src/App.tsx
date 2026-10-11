import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Sidebar, SignIn, Toasts, UpdateDialog, UpdateRequired, type Route, type Toast } from "./components/Chrome";
import { Dashboard, Favorites, Generators, Help, Recent, Settings, Subscription } from "./components/Pages";
import { Workspace } from "./components/Workspace";
import type { CanvasHandle } from "./components/Canvas";
import { useDesign, type Params } from "./design";
import { ipc, type AppError, type DCatalog, type DesktopAccount, type Prefs, type WebPage } from "./ipc";
import { designThumb } from "./thumb";
import { addRecent, setRecentThumb, cacheAccount, cacheCatalog, cachedAccount, cachedCatalog, lastParams, rememberParams, useFavorites, usePrefs, useRecent, type Favorite, type SavedDesign } from "./local";
import { useAutoCheck, useUpdater } from "./updater";

type Phase = "boot" | "signedOut" | "ready" | "updateRequired";

export function App() {
  const [phase, setPhase] = useState<Phase>("boot");
  const [version, setVersion] = useState("");
  const [server, setServer] = useState("");
  const [account, setAccount] = useState<DesktopAccount | null>(cachedAccount);
  const [catalog, setCatalog] = useState<DCatalog | null>(cachedCatalog);
  const [route, setRoute] = useState<Route>("dashboard");
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [minimum, setMinimum] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [online, setOnline] = useState(navigator.onLine);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);
  const [local, setLocal] = usePrefs();
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

  // Theme.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => (document.documentElement.dataset.theme = local.theme === "system" ? (mq.matches ? "dark" : "light") : local.theme);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [local.theme]);

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

  const refreshPlan = useCallback(async () => {
    setRefreshing(true);
    const ok = await loadAccount();
    setRefreshing(false);
    if (ok) {
      if (design.state.result?.locked) design.refresh();
      toast({ text: "Plan updated." });
    }
  }, [loadAccount, design, toast]);

  const product = useMemo(() => catalog?.products.find((p) => p.id === design.state.product) ?? null, [catalog, design.state.product]);

  const openNew = useCallback((id: string) => {
    const saved = local.reuseLastSettings ? lastParams(id) : null;
    design.open(id, saved ? { params: saved } : {});
    setRoute("workspace");
  }, [design, local.reuseLastSettings]);
  const openPreset = useCallback((id: string, preset: string) => {
    design.open(id, { preset });
    setRoute("workspace");
  }, [design]);
  const openSaved = useCallback((d: { product: string; params?: Params; preset?: string }) => {
    design.open(d.product, d.preset ? { preset: d.preset } : { params: d.params });
    setRoute("workspace");
  }, [design]);

  // Remember designs as they change (settings only, on this computer).
  const r = design.state.result;
  useEffect(() => {
    if (!r || (design.state.status !== 200 && design.state.status !== 403)) return;
    rememberParams(r.product, r.params);
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

  const save = useCallback(async (how: "save" | "export") => {
    const id = design.state.result?.designId;
    if (!id) return;
    try {
      const out = how === "save" ? await ipc.saveDesign(id) : await ipc.exportDesign(id);
      if (out.path) toast({ text: `Saved ${out.path.split(/[\\/]/).pop()}`, kind: "ok", path: out.path });
    } catch (e) {
      toast({ text: (e as AppError).message, kind: "err" });
    }
  }, [design.state.result, toast]);

  // Keyboard shortcuts.
  useEffect(() => {
    if (phase !== "ready") return;
    const key = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      if (e.key === "F1") { e.preventDefault(); setRoute("help"); return; }
      if (!e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const inWs = route === "workspace";
      if (k === ",") { e.preventDefault(); setRoute("settings"); }
      else if (k === "s" && inWs) { e.preventDefault(); void save("save"); }
      else if (k === "e" && inWs) { e.preventDefault(); void save("export"); }
      else if (k === "enter" && inWs) { e.preventDefault(); design.refresh(); }
      else if ((k === "=" || k === "+") && inWs) { e.preventDefault(); canvas.current?.zoomIn(); }
      else if (k === "-" && inWs) { e.preventDefault(); canvas.current?.zoomOut(); }
      else if (k === "0" && inWs) { e.preventDefault(); canvas.current?.fit(); }
      else if (k === "1" && inWs) { e.preventDefault(); canvas.current?.reset(); }
      else if (k === "z" && inWs && !typing) { e.preventDefault(); if (e.shiftKey) design.redo(); else design.undo(); }
      else if (k === "y" && inWs && !typing) { e.preventDefault(); design.redo(); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [phase, route, save, design]);

  // Block the WebView's own context menu and file drops (nothing here opens files).
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
    <div className="app">
      <Sidebar route={route} onRoute={setRoute} account={account} hasDesign={!!design.state.product} update={updater.status} onUpdate={() => setShowUpdate(true)} />
      <div className="main">
        {!online && route !== "workspace" && <div className="offline-bar" role="status">You're offline. Designs are built on HingeLab's servers, so new changes wait until you're back online.</div>}
        {route === "dashboard" && <Dashboard account={account} catalog={catalog} recent={recent} defaultProduct={local.defaultProduct} onNew={openNew} onPreset={openPreset} onBrowse={() => setRoute("generators")} onOpenRecent={openSaved} onUpgrade={() => web("upgrade")} />}
        {route === "generators" && <Generators catalog={catalog} plan={plan} initial={design.state.product ?? local.defaultProduct} favorites={favorites} onPreset={openPreset} onNew={openNew} onFavorite={(p, pr) => {
          const hit = favorites.find((f) => f.product === p.id && f.preset === pr.id);
          setFavorites((l) => (hit ? l.filter((f) => f.id !== hit.id) : [{ id: crypto.randomUUID(), product: p.id, preset: pr.id, name: pr.name, note: pr.note, at: Date.now() }, ...l]));
        }} />}
        {route === "workspace" && product && (
          <Workspace
            product={product}
            design={design.state}
            plan={plan}
            units={local.units}
            online={online}
            canvas={canvas}
            favorite={!!currentFavorite}
            onChange={design.change}
            onRename={(name) => design.change("name", name, true)}
            onFix={design.fix}
            onAutofix={design.autofix}
            onRefresh={design.refresh}
            onUndo={design.undo}
            onRedo={design.redo}
            onSave={() => void save("save")}
            onExport={() => void save("export")}
            onUpgrade={() => web("upgrade")}
            onRefreshPlan={refreshPlan}
            onFavorite={toggleFavorite}
          />
        )}
        {route === "workspace" && !product && <Generators catalog={catalog} plan={plan} initial={local.defaultProduct} favorites={favorites} onPreset={openPreset} onNew={openNew} onFavorite={() => {}} />}
        {route === "recent" && <Recent recent={recent} catalog={catalog} onOpen={openSaved} onRemove={(d: SavedDesign) => setRecent((l) => l.filter((x) => x.id !== d.id))} onClear={() => setRecent([])} />}
        {route === "favorites" && <Favorites favorites={favorites} catalog={catalog} onOpen={(f: Favorite) => openSaved(f)} onRemove={(f) => setFavorites((l) => l.filter((x) => x.id !== f.id))} />}
        {route === "subscription" && <Subscription account={account} onWeb={web} onRefresh={refreshPlan} refreshing={refreshing} />}
        {route === "settings" && (
          <Settings
            account={account} local={local} setLocal={setLocal} prefs={prefs} catalog={catalog} version={version} server={server} update={updater.status}
            onCheck={() => void updater.checkNow()}
            onInstall={installUpdate}
            onChooseFolder={() => void ipc.chooseExportFolder().then(setPrefs).catch((e: AppError) => toast({ text: e.message, kind: "err" }))}
            onExportPrefs={(clear, openAfter) => void ipc.setExportPrefs(clear, openAfter).then(setPrefs).catch((e: AppError) => toast({ text: e.message, kind: "err" }))}
            onWeb={web}
            onSignOut={() => signedOut(null)}
            onRefreshPlan={refreshPlan}
          />
        )}
        {route === "help" && <Help onWeb={web} version={version} />}
      </div>
      {updateDialog}
      <Toasts items={toasts} onReveal={(p) => void ipc.revealFile(p).catch((e: AppError) => toast({ text: e.message, kind: "err" }))} onClose={(id) => setToasts((l) => l.filter((x) => x.id !== id))} />
    </div>
  );
}
