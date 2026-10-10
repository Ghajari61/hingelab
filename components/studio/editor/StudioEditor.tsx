"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "zustand";
import { LogoMark } from "@/components/site/LogoMark";
import { UserMenu } from "@/components/auth/UserMenu";
import { ContextMenu, Dock, MenuBar, PanelSection, Toolbar, isMac, useToast, type MenuItem } from "@/components/ui";
import { generatorMeta } from "@/lib/generators/catalog";
import { bindingsFor, COMMAND_BY_ID, isSingleKey, MENUS, type MenuEntry, type ToolId } from "@/lib/studio/commands";
import { loadKeymap, saveKeymap, type Keymap } from "@/lib/studio/keymap";
import { isTypingTarget, matches } from "@/lib/studio/keys";
import { isLocalId, loadLocalProject, newLocalId, saveLocalProject, touchLocalProject } from "@/lib/studio/localStore";
import { cleanName } from "@/lib/studio/naming";
import { DEFAULT_PREFS } from "@/lib/studio/prefs";
import { isEmptyBox } from "@/lib/studio/geom";
import { selectionBox, topLevel } from "@/lib/studio/scene";
import { documentThumbnail } from "@/lib/studio/thumbnail";
import { fmtLength, UNIT_LIST } from "@/lib/studio/units";
import { builtIn, loadWorkspaces, PANEL_LABELS, saveWorkspaces, showPanel, type PanelId, type Workspace, type WorkspaceState } from "@/lib/studio/workspace";
import type { Document, Units } from "@/lib/studio/types";
import { downloadProject, editorPath, importProjectFile } from "../projectActions";
import { usePrefs } from "../usePrefs";
import { Canvas, PX_PER_MM, pointerStore, type CanvasApi } from "./Canvas";
import { buildHandlers, type CommandContext, type Handler } from "./commandHandlers";
import { ControlBar } from "./ControlBar";
import { CommandPalette, DocumentSetupDialog, MoveDialog, PreferencesDialog, ResetPrefsDialog, ShortcutsDialog } from "./EditorDialogs";
import { AlignPanel, CutLayersPanel, DocumentPanel, HistoryPanel, LayersPanel, PropertiesPanel } from "./Panels";
import { createEditorStore, EditorContext, useEditor, useEditorApi, type EditorState } from "./store";
import { toolSlots } from "./tools";
import { useTextSync } from "./useTextSync";
import type { StoreApi } from "zustand";
import { Dialog } from "@/components/ui";

type SaveState = "saved" | "saving" | "error";
type DialogId = "documentSetup" | "move" | "shortcuts" | "preferences" | "palette" | "resetPrefs" | "revert";
const AUTOSAVE_MS = 1500;
/** Shortcuts that still work while the focus is in a text field. */
const WHILE_TYPING = new Set(["file.save", "edit.preferences", "window.palette"]);

export default function StudioEditor({ projectId }: { projectId: string }) {
  const [store, setStore] = useState<StoreApi<EditorState> | null>(null);
  const [opened, setOpened] = useState<Document | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!isLocalId(projectId)) { setFailed("cloud"); return; }
    loadLocalProject(projectId).then((d) => {
      if (!alive) return;
      if (!d) { setFailed("missing"); return; }
      setOpened(d);
      setStore(createEditorStore(d));
      void touchLocalProject(projectId);
    }).catch((e) => setFailed(e instanceof Error ? e.message : "This project could not be opened."));
    return () => { alive = false; };
  }, [projectId]);

  if (failed) {
    return (
      <div className="st-boot">
        <div style={{ textAlign: "center", display: "grid", gap: 12 }}>
          <b>{failed === "missing" ? "This project is not on this device." : failed === "cloud" ? "Cloud projects open after you sign in." : failed}</b>
          <Link className="ui-btn" href="/home">Back to the start screen</Link>
        </div>
      </div>
    );
  }
  if (!store || !opened) return <div className="st-boot">Opening…</div>;
  return <EditorContext.Provider value={store}><EditorShell opened={opened} /></EditorContext.Provider>;
}

function menuItems(entries: MenuEntry[], handlers: Record<string, Handler>, bindings: Map<string, string[]>): MenuItem[] {
  return entries.map((e, k): MenuItem => {
    if (e === "-") return "-";
    if (typeof e !== "string") return { id: `sub-${e.label}-${k}`, label: e.label, items: menuItems(e.items, handlers, bindings) };
    const def = COMMAND_BY_ID.get(e);
    const h = handlers[e];
    return {
      id: e, label: def?.label ?? e, shortcut: bindings.get(e)?.[0], run: h?.run,
      disabled: !h || h.enabled === false, reason: h ? h.reason : "Not available yet",
      ...(h?.checked !== undefined ? { checked: h.checked } : {}),
    };
  });
}

function EditorShell({ opened }: { opened: Document }) {
  const api = useEditorApi();
  const router = useRouter();
  const pushToast = useToast();
  const [prefs, setPrefs] = usePrefs();
  const [keymap, setKeymapState] = useState<Keymap>({});
  const [ws, setWs] = useState<WorkspaceState>(() => ({ current: "essentials", layouts: { essentials: builtIn("essentials") } }));
  const [save, setSave] = useState<SaveState>("saved");
  const [renaming, setRenaming] = useState(false);
  const [dialog, setDialog] = useState<DialogId | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<CanvasApi | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastField = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-render for anything that changes what commands can do; drags (previews) leave `base` fixed.
  const doc = useEditor((s) => s.base ?? s.doc);
  useEditor((s) => s.selection);
  useEditor((s) => s.history);
  useEditor((s) => s.lastTransform);
  const ui = useEditor((s) => s.ui);
  const tool = useEditor((s) => s.tool);

  useEffect(() => {
    setKeymapState(loadKeymap());
    setWs(loadWorkspaces());
    const on = (e: Event) => setKeymapState((e as CustomEvent<Keymap>).detail);
    window.addEventListener("hingelab-keymap", on);
    return () => window.removeEventListener("hingelab-keymap", on);
  }, []);
  const setKeymap = useCallback((k: Keymap) => { setKeymapState(k); saveKeymap(k); }, []);
  const layout: Workspace = ws.layouts[ws.current] ?? builtIn(ws.current);
  const setLayout = useCallback((fn: (w: Workspace) => Workspace) => {
    setWs((s) => { const next = { ...s, layouts: { ...s.layouts, [s.current]: fn(s.layouts[s.current] ?? builtIn(s.current)) } }; saveWorkspaces(next); return next; });
  }, []);

  const toast = useCallback((message: string, undo?: boolean) => {
    pushToast({ message, ...(undo ? { action: { label: "Undo", run: () => { api.getState().undo(); } } } : {}) });
  }, [api, pushToast]);
  const toastAction = useCallback((message: string, action?: { label: string; run: () => void }) => pushToast({ message, ...(action ? { action } : {}) }), [pushToast]);
  const onMissing = useCallback((chars: string[]) => toast(`This font has no glyph for ${chars.slice(0, 6).join(" ")}. Choose another font.`), [toast]);
  useTextSync(api, onMissing);

  // Autosave on this device; a drag saves when it ends.
  const persist = useCallback(async (d: Document) => {
    setSave("saving");
    try { await saveLocalProject(d, documentThumbnail(d)); setSave("saved"); } catch { setSave("error"); }
  }, []);
  useEffect(() => api.subscribe((s, p) => {
    if (s.doc === p.doc || s.base) return;
    if (timer.current) clearTimeout(timer.current);
    setSave("saving");
    timer.current = setTimeout(() => void persist(api.getState().doc), AUTOSAVE_MS);
  }), [api, persist]);
  useEffect(() => {
    const flush = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; void persist(api.getState().doc); } };
    window.addEventListener("beforeunload", flush);
    return () => { window.removeEventListener("beforeunload", flush); flush(); };
  }, [api, persist]);

  useEffect(() => {
    const on = (e: FocusEvent) => { const t = e.target as HTMLElement; if (t?.closest?.(".ui-field, .ui-section")) lastField.current = t; };
    document.addEventListener("focusin", on);
    return () => document.removeEventListener("focusin", on);
  }, []);

  const saveNow = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    void persist(api.getState().doc).then(() => toast("Saved on this device"));
  }, [api, persist, toast]);

  const resetWorkspace = useCallback(() => {
    const prev = layout;
    setLayout(() => builtIn(ws.current));
    toastAction(`Reset the ${prev.label} workspace`, { label: "Undo", run: () => setLayout(() => prev) });
  }, [layout, setLayout, toastAction, ws]);

  const ctx: CommandContext = {
    api,
    canvas: () => canvasRef.current,
    toast,
    navigate: (href) => router.push(href),
    openFile: () => fileRef.current?.click(),
    save: saveNow,
    saveCopy: () => {
      const d = api.getState().doc;
      const copy: Document = { ...structuredClone(d), id: newLocalId(), name: `${d.name} copy`, updatedAt: new Date().toISOString() };
      void saveLocalProject(copy, documentThumbnail(copy)).then(() => toastAction(`Saved “${copy.name}” on this device`, { label: "Open", run: () => router.push(editorPath(copy.id)) }));
    },
    download: () => void downloadProject(api.getState().doc),
    rename: () => setRenaming(true),
    revert: () => setDialog("revert"),
    dialog: (d) => setDialog(d),
    showPanel: (p) => setLayout((w) => showPanel(w, p)),
    workspace: ws.current,
    setWorkspace: (id) => setWs((s) => { const next = { ...s, current: id }; saveWorkspaces(next); return next; }),
    resetWorkspace,
    theme: prefs.theme,
    setTheme: (theme) => setPrefs({ theme }),
    lastField: () => lastField.current,
    viewCenter: () => canvasRef.current?.center() ?? { x: 0, y: 0 },
  };
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const handlers = buildHandlers(ctx);
  const bindings = useMemo(() => bindingsFor(prefs.shortcutSet, keymap), [prefs.shortcutSet, keymap]);
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;
  const dialogRef = useRef(dialog);
  dialogRef.current = dialog;

  const menus = MENUS.map((m) => ({ id: m.id, label: m.label, items: menuItems(m.items, handlers, bindings) }));

  // Keyboard: every shortcut goes through the command registry.
  useEffect(() => {
    const mac = isMac();
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (dialogRef.current || document.querySelector(".ui-overlay")) return;
      const typing = isTypingTarget(e.target);
      for (const [id, keys] of bindingsRef.current) {
        const k = keys.find((x) => matches(e, x, mac));
        if (!k) continue;
        if (typing && (isSingleKey(k) || !WHILE_TYPING.has(id))) return;
        if (/^(shift\+)?tab$/i.test(k)) {
          const a = document.activeElement;
          if (a && a !== document.body && !a.closest?.(".st-stage")) return;
        }
        const h = buildHandlers(ctxRef.current)[id];
        e.preventDefault();
        if (h && h.enabled !== false) h.run();
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const contextItems = (): MenuItem[] => menuItems([
    "edit.cut", "edit.copy", "edit.paste", "edit.duplicate", "edit.delete", "-",
    "object.group", "object.ungroup", { label: "Arrange", items: ["object.front", "object.forward", "object.backward", "object.back"] },
    { label: "Transform", items: ["object.move", "object.rotate90", "object.rotate-90", "object.reflectH", "object.reflectV"] }, "-",
    "object.lock", "object.hide", "object.expand", "object.compound.make", "-",
    { label: "Assign to Layer", items: Array.from({ length: 10 }, (_, k) => `laser.assign.${k}`) },
  ], buildHandlers(ctxRef.current), bindingsRef.current);

  const keyOf = (t: ToolId) => bindings.get(`tool.${t}`)?.[0];
  const slots = useMemo(() => toolSlots(keyOf), [bindings]); // eslint-disable-line react-hooks/exhaustive-deps
  const generators = doc.root.children.filter((n) => n.type === "generator");
  const panelContent = (p: PanelId) => {
    switch (p) {
      case "properties": return <PropertiesPanel toast={toast} />;
      case "layers": return <LayersPanel />;
      case "cutLayers": return <CutLayersPanel toast={toast} />;
      case "align": return <AlignPanel handlers={handlers} />;
      case "history": return <HistoryPanel />;
      case "document": return <DocumentPanel toast={toast} />;
    }
  };
  const dockTabs = [
    ...layout.panels.map((p) => ({ id: p, label: PANEL_LABELS[p], content: panelContent(p) })),
    ...(generators.length ? [{ id: "generator", label: "Generator", content: (
      <PanelSection title={generatorMeta((generators[0] as { generatorId: string }).generatorId)?.name ?? "Generator"}>
        <p className="dlg-note">{generatorMeta((generators[0] as { generatorId: string }).generatorId)?.blurb}</p>
        <p className="dlg-note">Live generator editing arrives with the generator framework.</p>
      </PanelSection>
    ) }] : []),
  ];

  return (
    <div className={`st-app${ui.presentation ? " presentation" : ""}`} data-testid="studio-editor">
      <header className="st-menubar">
        <Link href="/home" className="brand" aria-label="HingeLab start screen"><LogoMark /></Link>
        <MenuBar menus={menus} />
        <div className="right">
          <button type="button" className="ui-btn" onClick={() => setDialog("palette")} title="Command Palette (Ctrl+/)" data-testid="open-palette">Commands</button>
          <UserMenu />
        </div>
      </header>
      <div className="st-tabs" role="tablist" aria-label="Open documents">
        <div className="st-tab on" role="tab" aria-selected="true">
          {renaming ? (
            <input
              autoFocus defaultValue={doc.name} aria-label="Project name" data-testid="rename-input"
              onBlur={(e) => { const n = cleanName(e.target.value); if (n && n !== api.getState().doc.name) api.getState().edit("Rename Project", (d) => { d.name = n; }); setRenaming(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenaming(false); }}
            />
          ) : (
            <span className="nm" onDoubleClick={() => setRenaming(true)} title="Double-click to rename" data-testid="doc-name">{doc.name}</span>
          )}
          {save === "saving" && <span className="dot" aria-label="Unsaved changes" />}
        </div>
      </div>
      <ControlBar onResetToast={(m) => toast(m, true)} />
      <div className="st-main" style={{ gridTemplateColumns: `auto minmax(0, 1fr) ${layout.dockWidth}px` }}>
        <Toolbar slots={slots} active={tool} onSelect={(t) => api.getState().setTool(t as ToolId)} columns={layout.toolbarColumns} />
        <Canvas apiRef={canvasRef} onContextMenu={(x, y) => setMenu({ x, y })} onToast={toast} />
        <Dock tabs={dockTabs} active={layout.active} onActive={(id) => setLayout((w) => ({ ...w, active: id as PanelId }))} onReorder={(ids) => setLayout((w) => ({ ...w, panels: ids.filter((i): i is PanelId => i in PANEL_LABELS) }))} width={layout.dockWidth} />
      </div>
      <StatusBar save={save} handlers={handlers} onZoom={(z) => canvasRef.current?.zoomBy(z)} onFit={() => canvasRef.current?.fit("artboard")} />

      {menu && <ContextMenu x={menu.x} y={menu.y} items={contextItems()} label="Object" onClose={() => setMenu(null)} />}
      <CommandPalette open={dialog === "palette"} onClose={() => setDialog(null)} handlers={handlers} bindings={bindings} navigate={(h) => router.push(h)} />
      <ShortcutsDialog open={dialog === "shortcuts"} onClose={() => setDialog(null)} set={prefs.shortcutSet} onSet={(shortcutSet) => setPrefs({ shortcutSet })} keymap={keymap} onKeymap={setKeymap} toast={toastAction} />
      <PreferencesDialog open={dialog === "preferences"} onClose={() => setDialog(null)} prefs={prefs} setPrefs={setPrefs} openShortcuts={() => setDialog("shortcuts")} toast={toastAction} />
      <MoveDialog open={dialog === "move"} onClose={() => setDialog(null)} />
      <DocumentSetupDialog open={dialog === "documentSetup"} onClose={() => setDialog(null)} />
      <ResetPrefsDialog open={dialog === "resetPrefs"} onClose={() => setDialog(null)} onConfirm={() => {
        const prev = { prefs, keymap, ws };
        setPrefs({ ...DEFAULT_PREFS, onboarded: prefs.onboarded, tourDone: prefs.tourDone, dismissed: prefs.dismissed, recentGenerators: prefs.recentGenerators });
        setKeymap({});
        const fresh = loadWorkspaces();
        const reset: WorkspaceState = { current: "essentials", layouts: Object.fromEntries(Object.keys(fresh.layouts).map((id) => [id, builtIn(id)])) };
        setWs(reset); saveWorkspaces(reset);
        toastAction("Reset all preferences", { label: "Undo", run: () => { setPrefs(prev.prefs); setKeymap(prev.keymap); setWs(prev.ws); saveWorkspaces(prev.ws); } });
      }} />
      <Dialog open={dialog === "revert"} title="Revert to the opened version?" onClose={() => setDialog(null)} size="narrow" testId="revert-dialog"
        footer={<><span style={{ flex: 1 }} /><button type="button" className="ui-btn" onClick={() => setDialog(null)}>Cancel</button><button type="button" className="ui-btn danger" onClick={() => {
          api.getState().edit("Revert to Saved", (d) => { Object.assign(d, structuredClone(opened)); });
          setDialog(null);
          toast("Reverted to the version you opened", true);
        }}>Revert</button></>}>
        <p className="dlg-note">Every change since you opened this project is undone. You can still redo them from Edit → Undo.</p>
      </Dialog>
      <input ref={fileRef} type="file" accept=".hingelab,application/zip" hidden aria-label="Open a project file" onChange={(e) => {
        const f = e.target.files?.[0]; e.target.value = "";
        if (f) void importProjectFile(f).then((r) => { if ("id" in r) router.push(editorPath(r.id)); else toast("That file belongs to the classic editor."); }).catch((err) => toast(err.message));
      }} />
    </div>
  );
}

function StatusBar({ save, handlers, onZoom, onFit }: { save: SaveState; handlers: Record<string, Handler>; onZoom: (f: number) => void; onFit: () => void }) {
  const api = useEditorApi();
  const p = useStore(pointerStore, (s) => s.p);
  const units = useEditor((s) => s.doc.units);
  const zoom = useEditor((s) => s.view.zoom);
  const snapping = useEditor((s) => s.doc.snapping);
  const sel = useEditor((s) => s.selection);
  const doc = useEditor((s) => s.doc);
  const box = sel.length ? selectionBox(doc, topLevel(doc.root, sel)) : null;
  const pct = Math.round((zoom / PX_PER_MM) * 100);
  const toggle = (id: string, label: string, on: boolean) => (
    <button type="button" className="tg" aria-pressed={on} onClick={handlers[id]?.run} title={label}>{label}</button>
  );
  return (
    <footer className="st-status" aria-label="Status bar">
      <span data-testid="status-xy">X {p ? fmtLength(p.x, units) : "—"} Y {p ? fmtLength(p.y, units) : "—"}</span>
      <span data-testid="status-size">{box && !isEmptyBox(box) ? `W ${fmtLength(box.maxX - box.minX, units)} H ${fmtLength(box.maxY - box.minY, units)}` : `${sel.length ? sel.length : "No"} selection`}</span>
      <span style={{ display: "inline-flex", gap: 2, alignItems: "center" }}>
        <button type="button" onClick={() => onZoom(0.8)} aria-label="Zoom out">−</button>
        <button type="button" onClick={onFit} title="Fit artboard (Ctrl+0)" data-testid="status-zoom">{pct}%</button>
        <button type="button" onClick={() => onZoom(1.25)} aria-label="Zoom in">+</button>
      </span>
      <span className="sp" />
      {toggle("view.snapGrid", "Grid snap", snapping.grid)}
      {toggle("view.snapPoint", "Point snap", snapping.points)}
      {toggle("view.smartGuides", "Smart guides", snapping.smart)}
      <label style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
        <span className="ui-sr">Units</span>
        <select className="ui-select" style={{ height: 20 }} value={units} aria-label="Units" onChange={(e) => api.getState().edit("Units", (d) => { d.units = e.target.value as Units; })}>
          {UNIT_LIST.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </label>
      <span className={`save ${save === "saved" ? "ok" : save === "saving" ? "busy" : "off"}`} data-testid="save-state">
        {save === "saved" ? "Saved on this device" : save === "saving" ? "Saving…" : "Not saved"}
      </span>
    </footer>
  );
}
