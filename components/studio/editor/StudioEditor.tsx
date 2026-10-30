"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useStore } from "zustand";
import { AlignCenterHorizontal, Braces, FileText, Flame, History, Layers, LayoutGrid, RotateCw, Search, SlidersHorizontal, Sparkles, SquaresUnite, Wand2, WandSparkles } from "lucide-react";
import { LogoMark } from "@/components/site/LogoMark";
import { UserMenu } from "@/components/auth/UserMenu";
import { ContextMenu, Dock, MenuBar, PanelSection, Toolbar, isMac, useToast, type MenuItem } from "@/components/ui";
import { generatorHref, generatorMeta } from "@/lib/generators/catalog";
import { bindingsFor, COMMAND_BY_ID, isSingleKey, MENUS, type MenuEntry, type ToolId } from "@/lib/studio/commands";
import { loadKeymap, saveKeymap, type Keymap } from "@/lib/studio/keymap";
import { isTypingTarget, matches } from "@/lib/studio/keys";
import { fieldUndoes, releaseField } from "@/lib/ui/undoKeys";
import { isLocalId, loadLocalProject, newLocalId, saveLocalProject, touchLocalProject } from "@/lib/studio/localStore";
import { cleanName } from "@/lib/studio/naming";
import { DEFAULT_PREFS } from "@/lib/studio/prefs";
import { isEmptyBox } from "@/lib/studio/geom";
import { pasteNodes, selectionBox, topLevel } from "@/lib/studio/scene";
import { documentThumbnail } from "@/lib/studio/thumbnail";
import { documentArt } from "@/lib/studio/thumbnailArt";
import { fmtLength, UNIT_LIST } from "@/lib/studio/units";
import { builtIn, loadWorkspaces, PANEL_LABELS, saveWorkspaces, showPanel, WORKSPACES, type PanelId, type Workspace, type WorkspaceState } from "@/lib/studio/workspace";
import type { Document, Units } from "@/lib/studio/types";
import { computerFile, editorPath, importProjectFile, MAX_SVG_BYTES, saveProjectToComputer } from "../projectActions";
import { detectProject, OPEN_ACCEPT } from "@/lib/projects/file";
import { usePrefs } from "../usePrefs";
import { Canvas, PX_PER_MM, pointerStore, type CanvasApi } from "./Canvas";
import { buildHandlers, type CommandContext, type EditorDialog, type Handler } from "./commandHandlers";
import { ControlBar } from "./ControlBar";
import { CommandPalette, DocumentSetupDialog, MoveDialog, PreferencesDialog, ResetPrefsDialog, ShortcutsDialog } from "./EditorDialogs";
import { AlignPanel, CutLayersPanel, DocumentPanel, HistoryPanel, LayersPanel, PathfinderPanel, PropertiesPanel } from "./Panels";
import { CornersDialog, JoinNearbyDialog, OffsetDialog, SimplifyDialog, StrokeToPathDialog } from "./PathDialogs";
import { LiveEffectsPanel } from "./LiveEffectsPanel";
import { InspectorPanel } from "./InspectorPanel";
import { runPreflight } from "./preflightToast";
import { CircularArrayDialog, GridArrayDialog, PathArrayDialog, StepRepeatDialog, TransformEachDialog } from "./ArrayDialogs";
import { PrintMergeDialog } from "./PrintMergeDialog";
import { ArrangeDialog, TiledClonesDialog, TransformDialog } from "./ParityDialogs";
import { createEditorStore, EditorContext, useEditor, useEditorApi, type EditorState } from "./store";
import { toolSlots } from "./tools";
import { ToolFooter } from "./ToolFooter";
import { SnapControls } from "./SnapBar";
import { SwatchBar } from "./SwatchBar";
import { useTextSync } from "./useTextSync";
import { openWorkspace, workspaceStore } from "./ai/jobs";
import type { StoreApi } from "zustand";
import { Dialog } from "@/components/ui";

const PANEL_ICONS: Record<PanelId, ReactNode> = {
  properties: <SlidersHorizontal size={16} />, layers: <Layers size={16} />, cutLayers: <Flame size={16} />,
  align: <AlignCenterHorizontal size={16} />, pathfinder: <SquaresUnite size={16} />, history: <History size={16} />, document: <FileText size={16} />, liveEffects: <Sparkles size={16} />,
  inspector: <Braces size={16} />, aiStudio: <WandSparkles size={16} />,
};

const TraceDialog = dynamic(() => import("./TraceDialog").then((m) => m.TraceDialog), { ssr: false });
const Assembly3D = dynamic(() => import("./assembly/Assembly3D").then((m) => m.Assembly3D), { ssr: false, loading: () => <div className="asm asm-loading" role="status">Loading 3D…</div> });
/** What the keyboard still does while the 3D assembly is shown (the 3D view has its own keys). */
const KEYS_IN_3D = new Set(["edit.undo", "edit.redo", "file.save", "view.assembly3d", "window.palette"]);
const AIStudioPanel = dynamic(() => import("./ai/AIStudioPanel").then((m) => m.AIStudioPanel), { ssr: false, loading: () => <p className="dlg-note" style={{ padding: 12 }}>Loading AI Studio…</p> });
const AIWorkspace = dynamic(() => import("./ai/AIWorkspace").then((m) => m.AIWorkspace), { ssr: false, loading: () => <div className="aiw aiw-loading" role="status">Loading AI Studio…</div> });

type SaveState = "saved" | "saving" | "error";
type DialogId = EditorDialog | "revert";
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
  const [snapOpen, setSnapOpen] = useState(false);
  const [view3d, setView3d] = useState(false);
  const view3dRef = useRef(view3d);
  view3dRef.current = view3d;
  const canvasRef = useRef<CanvasApi | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<HTMLInputElement>(null);
  const lastField = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-render for anything that changes what commands can do; drags (previews) leave `base` fixed.
  const doc = useEditor((s) => s.base ?? s.doc);
  useEditor((s) => s.selection);
  useEditor((s) => s.history);
  useEditor((s) => s.lastTransform);
  const ui = useEditor((s) => s.ui);
  const tool = useEditor((s) => s.tool);
  const aiOpen = useStore(workspaceStore, (s) => s.open);
  useEffect(() => () => openWorkspace(false), []);

  useEffect(() => {
    setKeymapState(loadKeymap());
    const loaded = loadWorkspaces(), panel = new URLSearchParams(window.location.search).get("panel");
    if (panel && panel in PANEL_LABELS) loaded.layouts[loaded.current] = showPanel(loaded.layouts[loaded.current], panel as PanelId);
    if (panel === "aiStudio") openWorkspace(true);
    setWs(loaded);
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
    try { await saveLocalProject(d, documentThumbnail(d, documentArt(d))); setSave("saved"); } catch { setSave("error"); }
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
    const doc = api.getState().doc;
    void persist(doc).then(async () => {
      if (!computerFile(doc.id)) { toast("Saved on this device"); return; }
      const name = await saveProjectToComputer(doc, false).catch((e: Error) => { toast(`Saved on this device, but not to the file: ${e.message}`); return undefined; });
      if (name) toast(`Saved to ${name} and on this device`);
    });
  }, [api, persist, toast]);

  // File ▸ Import SVG or DXF: the drawing keeps its page position on the first sheet when it fits, else lands in the view centre.
  const placeSvg = useCallback(async (f: File) => {
    const dxf = /\.dxf$/i.test(f.name);
    if (f.size > MAX_SVG_BYTES) { toast(`That ${dxf ? "DXF" : "SVG"} is larger than 40 MB.`); return; }
    try {
      const { importSvg } = await import("@/lib/studio/svgImport");
      let text = await f.text();
      if (dxf) {
        const { dxfToSvg, readDxf } = await import("@/lib/ai/dxfRead");
        text = dxfToSvg(readDxf(text));
      }
      const r = importSvg(text, { name: f.name.replace(/\.(svgz?|dxf)$/i, "") });
      if (!r.group) { toast("The SVG has no paths to cut. Convert text to paths and try again."); return; }
      const sheet = api.getState().doc.sheets[0];
      const b = r.box;
      let offset = sheet ? { x: sheet.x, y: sheet.y } : { x: 0, y: 0 };
      if (!sheet || b.minX < -1 || b.minY < -1 || b.maxX > sheet.w + 1 || b.maxY > sheet.h + 1) {
        const c = canvasRef.current?.center() ?? { x: 0, y: 0 };
        offset = { x: c.x - (b.minX + b.maxX) / 2, y: c.y - (b.minY + b.maxY) / 2 };
      }
      let ids: string[] = [];
      api.getState().edit("Import SVG", (d) => { ids = pasteNodes(d, [r.group!], offset); });
      api.getState().select(ids);
      toast(`Imported ${r.objects} object${r.objects === 1 ? "" : "s"} from ${f.name}${r.warnings[0] ? `. ${r.warnings[0]}` : ""}`, true);
    } catch (e) {
      toast(e instanceof Error ? e.message : "That SVG could not be imported.");
    }
  }, [api, toast]);

  // A picture goes in the middle of the view at its 96 dpi size (at most 200 mm wide), ready to trace.
  const placeImage = useCallback(async (f: File) => {
    if (f.size > MAX_SVG_BYTES) { toast("That picture is larger than 40 MB."); return; }
    try {
      const bmp = await createImageBitmap(f);
      const pxW = bmp.width, pxH = bmp.height;
      bmp.close();
      const { addImage } = await import("./ai/assets");
      const center = canvasRef.current?.center() ?? { x: 0, y: 0 };
      const id = await addImage(api, { blob: f, name: f.name.replace(/\.\w+$/, "") || "Picture", label: "Import image", pxW, pxH, place: { kind: "at", center, widthMm: Math.min(200, (pxW * 25.4) / 96) } });
      if (id) toast(`Imported ${f.name}. Path › Trace Bitmap turns it into cut lines.`, true);
    } catch {
      toast("That picture could not be read. Use a PNG, JPEG or WebP file.");
    }
  }, [api, toast]);

  const importAny = useCallback(async (f: File) => {
    if (/^image\/(png|jpeg|webp)$/.test(f.type)) await placeImage(f);
    else await placeSvg(f);
  }, [placeImage, placeSvg]);

  const openAny = useCallback(async (f: File) => {
    try {
      const d = detectProject(new Uint8Array(await f.arrayBuffer()));
      if ("error" in d) { toast(d.error); return; }
      if (d.section !== "studio") {
        const { openProjectFile } = await import("@/components/shell/projectFiles");
        await openProjectFile(f, null, null, toast);
        return;
      }
      const r = await importProjectFile(f);
      if ("id" in r) router.push(editorPath(r.id)); else toast("That file belongs to the classic editor.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "That file could not be opened.");
    }
  }, [router, toast]);

  // Files dropped on the editor: drawings and pictures are imported, project files opened.
  const dropRef = useRef({ importAny, openAny });
  dropRef.current = { importAny, openAny };
  useEffect(() => {
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes("Files")) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (e.defaultPrevented) return;
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      e.preventDefault();
      if (/\.(oclc|hingelab|json)$/i.test(f.name)) void dropRef.current.openAny(f);
      else if (/\.(svgz?|dxf)$/i.test(f.name) || /^image\/(png|jpeg|webp|svg\+xml)$/.test(f.type)) void dropRef.current.importAny(f);
      else toast("Drop an SVG, DXF, PNG, JPEG or WebP file to import it, or an .oclc project to open it.");
    };
    document.addEventListener("dragover", over);
    document.addEventListener("drop", drop);
    return () => { document.removeEventListener("dragover", over); document.removeEventListener("drop", drop); };
  }, [toast]);

  const resetWorkspace = useCallback(() => {
    const prev = layout;
    setLayout(() => builtIn(ws.current));
    toastAction(`Reset the ${prev.label} workspace`, { label: "Undo", run: () => setLayout(() => prev) });
  }, [layout, setLayout, toastAction, ws]);

  const ctx: CommandContext = {
    api,
    canvas: () => canvasRef.current,
    toast,
    notify: toastAction,
    navigate: (href) => router.push(href),
    openFile: () => fileRef.current?.click(),
    importSvg: () => svgRef.current?.click(),
    save: saveNow,
    saveCopy: () => {
      const d = api.getState().doc;
      const copy: Document = { ...structuredClone(d), id: newLocalId(), name: `${d.name} copy`, updatedAt: new Date().toISOString() };
      void saveLocalProject(copy, documentThumbnail(copy)).then(() => toastAction(`Saved “${copy.name}” on this device`, { label: "Open", run: () => router.push(editorPath(copy.id)) }));
    },
    download: () => void saveProjectToComputer(api.getState().doc, true).then((name) => { if (name) toast(`Saved ${name}`); }, (e: Error) => toast(`Could not save the file: ${e.message}`)),
    rename: () => setRenaming(true),
    revert: () => setDialog("revert"),
    dialog: (d) => setDialog(d),
    showPanel: (p) => setLayout((w) => showPanel(w, p)),
    workspace: ws.current,
    setWorkspace: (id) => setWs((s) => { const next = { ...s, current: id }; saveWorkspaces(next); return next; }),
    resetWorkspace,
    theme: prefs.editorTheme,
    setTheme: (editorTheme) => setPrefs({ editorTheme }),
    lastField: () => lastField.current,
    viewCenter: () => canvasRef.current?.center() ?? { x: 0, y: 0 },
    offsetStep: prefs.offsetStep,
    snapAngle: prefs.snapAngle,
    swatchBar: layout.swatchBar,
    toggleSwatchBar: () => setLayout((w) => ({ ...w, swatchBar: !w.swatchBar })),
    openSnapOptions: () => setSnapOpen(true),
    view3d,
    toggleView3d: () => setView3d((x) => !x),
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
        if (view3dRef.current && !KEYS_IN_3D.has(id)) return;
        const undoing = id === "edit.undo" || id === "edit.redo";
        // Undo and Redo work from any control; a text field with fresh typing undoes that first
        if (undoing && typing) { if (fieldUndoes(e.target)) return; releaseField(); }
        else if (typing && (isSingleKey(k) || !WHILE_TYPING.has(id))) return;
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
  const aiProps = {
    toast, notify: toastAction, viewCenter: () => canvasRef.current?.center() ?? { x: 0, y: 0 },
    beforeLeave: async () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } await persist(api.getState().doc); },
    preflight: (ids: string[], label: string, cut: boolean) => runPreflight(api, toastAction, ids, label, cut),
  };
  const panelContent = (p: PanelId) => {
    switch (p) {
      case "properties": return <PropertiesPanel toast={toast} handlers={handlers} />;
      case "layers": return <LayersPanel />;
      case "cutLayers": return <CutLayersPanel toast={toast} />;
      case "align": return <AlignPanel handlers={handlers} />;
      case "pathfinder": return <PathfinderPanel handlers={handlers} />;
      case "history": return <HistoryPanel />;
      case "document": return <DocumentPanel toast={toast} />;
      case "liveEffects": return <LiveEffectsPanel toast={toast} />;
      case "inspector": return <InspectorPanel toast={toast} />;
      case "aiStudio": return <AIStudioPanel {...aiProps} />;
    }
  };
  const dockTabs = [
    ...layout.panels.map((p) => ({ id: p, label: PANEL_LABELS[p], icon: PANEL_ICONS[p], content: panelContent(p) })),
    ...(generators.length ? [{ id: "generator", label: "Generator", icon: <Wand2 size={16} />, content: (() => {
      const g = generatorMeta((generators[0] as { generatorId: string }).generatorId);
      return (
        <PanelSection title={g?.name ?? "Generator"}>
          <p className="dlg-note">{g?.blurb}</p>
          <p className="dlg-note">This project was made empty by an earlier version. {g ? `${g.name} now opens with a design ready to edit.` : ""}</p>
          {g && <a className="ui-btn primary" href={generatorHref(g)} data-testid="generator-open">Open {g.name}</a>}
        </PanelSection>
      );
    })() }] : []),
  ];

  return (
    <div className={`st-app${ui.presentation ? " presentation" : ""}`} data-testid="studio-editor">
      <header className="st-menubar">
        <Link href="/home" className="brand" aria-label="HingeLab start screen"><LogoMark /></Link>
        <MenuBar menus={menus} />
        <div className="right">
          <span className="st-view-seg" role="group" aria-label="View">
            <button type="button" aria-pressed={!view3d} onClick={() => setView3d(false)} data-testid="view-2d" title="The drawing">2D</button>
            <button type="button" aria-pressed={view3d} onClick={() => setView3d(true)} data-testid="view-3d" title="Put the parts together in 3D (Ctrl+Shift+3)">3D</button>
          </span>
          <label className="st-ws">
            <LayoutGrid size={14} aria-hidden />
            <select className="ui-select" value={ws.current} aria-label="Workspace" onChange={(e) => ctx.setWorkspace(e.target.value)}>
              {WORKSPACES.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
            </select>
          </label>
          <button type="button" className="ui-btn" onClick={() => setDialog("palette")} title="Command Palette (Ctrl+/)" data-testid="open-palette"><Search size={14} aria-hidden /> Commands</button>
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
          <DocTabMeta />
          {save === "saving" && <span className="dot" aria-label="Unsaved changes" />}
        </div>
      </div>
      <ControlBar onResetToast={(m) => toast(m, true)} handlers={handlers} />
      <div className="st-main" style={{ gridTemplateColumns: `auto minmax(0, 1fr) ${layout.dockCollapsed ? "auto" : `${layout.dockWidth}px`}` }}>
        <Toolbar slots={slots} active={tool} onSelect={(t) => api.getState().setTool(t as ToolId)} columns={layout.toolbarColumns} footer={<ToolFooter handlers={handlers} />} />
        <Canvas apiRef={canvasRef} onContextMenu={(x, y) => setMenu({ x, y })} onToast={toast} snapAngle={prefs.snapAngle} />
        <Dock
          tabs={dockTabs} active={layout.active} width={layout.dockWidth} collapsed={layout.dockCollapsed}
          onActive={(id) => setLayout((w) => ({ ...w, active: id as PanelId }))}
          onReorder={(ids) => setLayout((w) => ({ ...w, panels: ids.filter((i): i is PanelId => i in PANEL_LABELS) }))}
          onCollapse={(dockCollapsed) => setLayout((w) => ({ ...w, dockCollapsed }))}
          onResize={(dockWidth) => setLayout((w) => ({ ...w, dockWidth }))}
        />
        {aiOpen && <AIWorkspace {...aiProps} />}
        {view3d && (
          <Assembly3D
            toast={toast} onBack={() => setView3d(false)}
            onShow={(ids) => {
              api.getState().select(ids);
              setView3d(false);
              requestAnimationFrame(() => canvasRef.current?.fit("selection"));
            }}
          />
        )}
      </div>
      <div className="st-swatch-slot">
        {layout.swatchBar && (
          <SwatchBar handlers={handlers} toast={toast}
            onEditLayer={(k) => { api.getState().set({ currentLayer: k }); setLayout((w) => showPanel(w, "cutLayers")); }} />
        )}
      </div>
      <StatusBar save={save} handlers={handlers} onZoom={(z) => canvasRef.current?.zoomBy(z)} onFit={() => canvasRef.current?.fit("artboard")}
        onRotate={(deg) => canvasRef.current?.setRotation(deg)} snapOpen={snapOpen} setSnapOpen={setSnapOpen} />

      {menu && <ContextMenu x={menu.x} y={menu.y} items={contextItems()} label="Object" onClose={() => setMenu(null)} />}
      <CommandPalette open={dialog === "palette"} onClose={() => setDialog(null)} handlers={handlers} bindings={bindings} navigate={(h) => router.push(h)} />
      <ShortcutsDialog open={dialog === "shortcuts"} onClose={() => setDialog(null)} set={prefs.shortcutSet} onSet={(shortcutSet) => setPrefs({ shortcutSet })} keymap={keymap} onKeymap={setKeymap} toast={toastAction} />
      <PreferencesDialog open={dialog === "preferences"} onClose={() => setDialog(null)} prefs={prefs} setPrefs={setPrefs} openShortcuts={() => setDialog("shortcuts")} toast={toastAction} />
      <MoveDialog open={dialog === "move"} onClose={() => setDialog(null)} />
      <OffsetDialog open={dialog === "offset"} onClose={() => setDialog(null)} onDone={(ids) => runPreflight(api, toastAction, ids, "Offset Path")} />
      <OffsetDialog contour open={dialog === "contour"} onClose={() => setDialog(null)} onDone={(ids) => runPreflight(api, toastAction, ids, "Contour")} />
      <SimplifyDialog open={dialog === "simplify"} onClose={() => setDialog(null)} />
      <CornersDialog open={dialog === "corners"} onClose={() => setDialog(null)} />
      <StrokeToPathDialog open={dialog === "strokeToPath"} onClose={() => setDialog(null)} />
      <JoinNearbyDialog open={dialog === "joinNearby"} onClose={() => setDialog(null)} toast={toast} />
      <StepRepeatDialog open={dialog === "stepRepeat"} onClose={() => setDialog(null)} />
      <PrintMergeDialog open={dialog === "printMerge"} onClose={() => setDialog(null)} />
      <TransformEachDialog open={dialog === "transformEach"} onClose={() => setDialog(null)} />
      <GridArrayDialog open={dialog === "gridArray"} onClose={() => setDialog(null)} />
      <CircularArrayDialog open={dialog === "circularArray"} onClose={() => setDialog(null)} />
      <PathArrayDialog open={dialog === "pathArray"} onClose={() => setDialog(null)} />
      <TransformDialog open={dialog === "transform"} onClose={() => setDialog(null)} />
      <ArrangeDialog open={dialog === "arrange"} onClose={() => setDialog(null)} />
      <TiledClonesDialog open={dialog === "tiledClones"} onClose={() => setDialog(null)} />
      <DocumentSetupDialog open={dialog === "documentSetup"} onClose={() => setDialog(null)} />
      {dialog === "traceBitmap" && <TraceDialog open onClose={() => setDialog(null)} onDone={(id, lines) => runPreflight(api, toastAction, [id], "Trace Bitmap", !lines)} />}
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
      <input ref={svgRef} type="file" accept=".svg,.dxf,image/svg+xml,application/dxf,image/png,image/jpeg,image/webp" hidden aria-label="Import an SVG drawing" onChange={(e) => {
        const f = e.target.files?.[0]; e.target.value = "";
        if (f) void importAny(f);
      }} />
      <input ref={fileRef} type="file" accept={OPEN_ACCEPT} hidden aria-label="Open a project file" onChange={(e) => {
        const f = e.target.files?.[0]; e.target.value = "";
        if (f) void openAny(f);
      }} />
    </div>
  );
}

/** "@ 100% (Preview)" after the document name, like Illustrator's document tab. */
function DocTabMeta() {
  const zoom = useEditor((s) => s.view.zoom);
  const outline = useEditor((s) => s.ui.outline);
  return <span className="meta">@ {Math.round((zoom / PX_PER_MM) * 100)}% ({outline ? "Outline" : "Preview"})</span>;
}

function StatusBar({ save, handlers, onZoom, onFit, onRotate, snapOpen, setSnapOpen }: {
  save: SaveState; handlers: Record<string, Handler>; onZoom: (f: number) => void; onFit: () => void;
  onRotate: (deg: number) => void; snapOpen: boolean; setSnapOpen: (o: boolean) => void;
}) {
  const api = useEditorApi();
  const p = useStore(pointerStore, (s) => s.p);
  const units = useEditor((s) => s.doc.units);
  const zoom = useEditor((s) => s.view.zoom);
  const rotation = useEditor((s) => s.view.rotation ?? 0);
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
      <RotationField value={rotation} onChange={onRotate} />
      <span className="sp" />
      <SnapControls open={snapOpen} setOpen={setSnapOpen} />
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

/** View rotation in degrees (clockwise on screen); Enter or leaving the field applies it. */
function RotationField({ value, onChange }: { value: number; onChange: (deg: number) => void }) {
  const shown = String(Math.round(value * 10) / 10);
  const [text, setText] = useState(shown);
  const cancel = useRef(false);
  useEffect(() => setText(shown), [shown]);
  const commit = () => {
    if (cancel.current) { cancel.current = false; return; }
    const v = parseFloat(text.replace(",", "."));
    if (Number.isFinite(v) && String(v) !== shown) onChange(v); else setText(shown);
  };
  return (
    <label className="st-rot" title="View rotation (Ctrl+Shift+scroll). The document is not changed.">
      <RotateCw size={11} aria-hidden />
      <input value={text} inputMode="decimal" aria-label="View rotation in degrees" data-testid="status-rotation"
        onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { cancel.current = true; setText(shown); e.currentTarget.blur(); } }} />°
    </label>
  );
}
