"use client";

import { Dices } from "lucide-react";

import { keepSetup } from "@/lib/prefs/editor";
import { editorPrefs } from "@/lib/prefs/editorStore";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  autoFit, clone, cutWidth, DEFAULTS, exportSVG, layerContent, mergeParams, withFittedLattice,
  type CutStyle, type LayerContent, type Layout, type Model, type Params,
} from "@/lib/hinge";
import { arrangeHinge } from "@/lib/fit/hinge";
import { hingeWithMaterial } from "@/lib/materials/apply";
import { usedArea, usedText } from "@/lib/fit/arrange";
import { autoFixAll, type Fix } from "@/lib/issues";
import { explainHingeError, hingeIssues } from "@/lib/issues/hinge";
import { IssueList } from "@/components/shell/IssueList";
import { HelpContext, useHelpPanel } from "@/components/help/HelpContext";
import { cleanFit } from "@/lib/fit/fitToSheets";
import { fitSummary } from "@/components/shell/SheetSection";
import { useHistory } from "@/hooks/useHistory";
import { readStored, readUnits, useAutosave } from "@/hooks/useAutosave";
import { useCloudAutosave, type CloudDoc } from "@/hooks/useCloudAutosave";
import { thumbnailSVG } from "@/lib/projects/thumbnail";
import { canUsePattern, hasPro, hingeLocks } from "@/lib/plans";
import { usePlan } from "@/components/billing/usePlan";
import { importIntoCloud, openNewCloudProject } from "./cloud";
import { PX_PER_MM, useCanvasView } from "@/hooks/useCanvasView";
import { fmtLen, type Units } from "./format";
import type { NumericKey } from "./fields";
import { MenuBar, type MenuEntry } from "./MenuBar";
import { hingeGroups, PRODUCT_INFO, type Product } from "./ControlBar";
import dynamic from "next/dynamic";
import { GalleryRail } from "@/components/shell/GalleryRail";
import { ViewToggle, type ViewMode } from "@/components/shell/ViewToggle";
import { ViewTools } from "@/components/shell/ViewTools";
import { DockColumn } from "@/components/shell/DockColumn";
import type { Preset } from "@/lib/presets";
import { HINGE_VARIANTS, hingePresetParams, hingeVariantOf, randomHingeBox, randomHingePattern } from "@/lib/hinge/presets";
import { useMyPresets } from "@/components/shell/useMyPresets";
import { useSharedView } from "@/components/shell/SharedView";
import { SHARED_ID } from "@/lib/share/id";
import { useProjectFile } from "@/components/shell/useProjectFile";
import { Canvas } from "./Canvas";
import { rulerSvg } from "./Rulers";
import { PanelDock } from "./PanelDock";
import { hingeMeta, hingeSize, type HingeMeta } from "./summary";
import { StatusBar } from "./StatusBar";
import { Dialogs, type ModalState } from "./dialogs";

const ExportDialog = dynamic(() => import("@/components/shell/ExportDialog"), { ssr: false });
const JobEstimate = dynamic(() => import("@/components/shell/JobEstimate"), { ssr: false });
const ShareDialog = dynamic(() => import("@/components/shell/ShareDialog"), { ssr: false });
const UpgradeDialog = dynamic(() => import("@/components/billing/UpgradeDialog").then((m) => m.UpgradeDialog), { ssr: false });
const HingeView3D = dynamic(() => import("./HingeView3D"), {
  ssr: false,
  loading: () => <div id="preview3d" className="v3" aria-busy="true" />,
});

function loadInitial(cloud: CloudDoc | null) {
  if (cloud) return { params: mergeParams(cloud.params as Partial<Params>), units: readUnits() };
  const stored = readStored<Params>();
  const units: Units = stored?.units === "in" ? "in" : "mm";
  return { params: mergeParams(stored?.params), units };
}

function baseName(p: Params) {
  const d = p.shape === "cyl" ? `cyl${Math.round(p.dia)}` : `${Math.round(p.W)}x${p.shape === "poly" ? p.sides + "gon" : Math.round(p.D)}`;
  return `hingebox-${d}x${Math.round(p.H)}-${p.T}mm`;
}

export default function EditorApp({ onProduct, onHome, start, cloud = null }: {
  onProduct: (p: Product) => void;
  onHome: () => void;
  /** Preset chosen on the start page, applied as one undoable step over the autosaved design. */
  start?: Preset<Record<string, unknown>>;
  cloud?: CloudDoc | null;
}) {
  const boot = useState(() => loadInitial(cloud))[0];
  const history = useHistory(boot.params);
  const { params, replace, undo, redo, canUndo, canRedo } = history;
  const [units, setUnits] = useState<Units>(boot.units);
  const [tool, setTool] = useState<"hand" | "zoom">("hand");
  const [spaceDown, setSpaceDown] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("sheets");
  /** three.js loads the first time the 3D view opens, then stays mounted. */
  const [seen3d, setSeen3d] = useState(false);
  if (viewMode === "3d" && !seen3d) setSeen3d(true);
  const [cursor, setCursor] = useState({ x: "—", y: "—" });
  const [saved, setSaved] = useState(cloud ? "Saved to cloud" : "Autosaved locally");
  const [modal, setModal] = useState<ModalState>(null);
  const [exporting, setExporting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const help = useHelpPanel("hinge");
  const [toast, setToast] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState<string | null>(null);
  const account = usePlan();
  const myPresets = useMyPresets();
  const locks = hingeLocks(account.plan, params);
  const toastT = useRef<number>(0);
  const onStatus = useCallback((s: string) => setSaved(s), []);
  const file = useProjectFile({
    section: "hinge", params, fileBase: () => (params.name?.trim() && params.name !== DEFAULTS.name ? params.name : baseName(params)), toast: (m) => toastMsg(m), opened: start?.file,
    cloudImport: cloud ? importIntoCloud : undefined,
    write: async () => (await import("@/components/shell/projectFile")).projectText({ app: "HingeLab", product: "hinge-box", version: 1 }, params),
    load: (f) => {
      const next = mergeParams(f.params as Partial<Params>);
      patch(next, true);
      applyFit(next);
    },
  });

  const arranged = useMemo(() => arrangeHinge(params), [params]);
  const result = arranged.result;
  /** The settings actually built: the design, shrunk when Fit is on. */
  const built = arranged.params;
  const model = "error" in result ? null : result;
  const error = "error" in result ? explainHingeError(built, result.error) : null;
  const lay = model ? arranged.lay : null;
  const content = useMemo(() => (model && lay ? layerContent(model, lay, built) : null), [model, lay, built]);
  const fitSet = cleanFit(params.fit);
  const checked = useDeferredValue(params);
  const issues = useMemo(() => hingeIssues(checked), [checked]);

  const shared = useSharedView(start, start?.name ?? "Hinge Box", (m) => toastMsg(m));
  useAutosave(params, units, onStatus, undefined, !cloud && !shared.viewing);
  useCloudAutosave(cloud, params, () => (content && lay ? thumbnailSVG(content, lay.width, lay.height) : null), onStatus);

  const viewApi = useCanvasView();
  viewApi.fitArgs.current = {
    bedW: params.bedW,
    bedH: params.bedH,
    layW: lay?.width ?? 0,
    layH: lay?.height ?? 0,
    sheets: arranged.sheets,
  };
  const fitKey = lay ? `${params.bedW}x${params.bedH}|${Math.round(lay.width)}x${Math.round(lay.height)}|${arranged.sheets?.length ?? 0}` : "";
  const refit = viewApi.refit;
  useEffect(() => {
    if (fitKey) refit();
  }, [fitKey, refit]);

  const metaRef = useRef<HingeMeta | null>(null);
  const meta = metaRef.current = hingeMeta(params, model, metaRef.current, units);

  /** The last design that built, shown dimmed while the settings do not build. */
  const lastGood = useRef<{ model: Model; lay: Layout; content: LayerContent; built: Params; sheets: typeof arranged.sheets } | null>(null);
  if (model && lay && content) lastGood.current = { model, lay, content, built, sheets: arranged.sheets };
  const stale = error ? lastGood.current : null;

  function toastMsg(msg: string) {
    setToast(msg);
    window.clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setToast(null), 2400);
  }

  function offerFile(filename: string, data: string, mime: string) {
    try {
      const a = document.createElement("a");
      const url = URL.createObjectURL(new Blob([data], { type: mime }));
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      toastMsg(`Downloading ${filename}`);
    } catch {
      setModal({ type: "code", name: filename, data });
    }
  }

  function applyFit(next: Params) {
    const a = arrangeHinge(next);
    viewApi.fitArgs.current = { bedW: next.bedW, bedH: next.bedH, layW: a.lay?.width ?? 0, layH: a.lay?.height ?? 0, sheets: a.sheets };
    viewApi.fit();
    return a;
  }

  function patch(next: Params, record: boolean) {
    replace(next, record);
  }

  function setField(id: NumericKey, v: number, mat: boolean | undefined, record: boolean) {
    const next: Params = { ...params, [id]: v };
    if (mat && next.material !== "custom") next.material = "custom";
    patch(next, record);
  }

  function setChoice(key: "shape" | "lid" | "pattern" | "cutStyle", value: string) {
    const next: Params = { ...params, [key]: value };
    if (key === "shape" && value === "pill") next.R = Math.min(next.W, next.D) / 2;
    // Honeycomb takes its cell width from the slot width, so it starts from a fitted lattice instead.
    if (key === "pattern" && value === "honeycomb" && params.pattern !== "honeycomb") {
      const wall = Math.max(0.9, 0.35 * next.T, next.minFeature ?? 0);
      next.slotW = Math.round((2 * next.pitch - wall) * 100) / 100;
      if (model) {
        const res = autoFit(next, model.hBody, model.rN);
        if (res.ok) Object.assign(next, withFittedLattice(next, res.q));
      }
    }
    // Its cells are far wider than any slot, so leaving it goes back to the default slot width.
    if (key === "pattern" && value !== "honeycomb" && params.pattern === "honeycomb") {
      next.slotW = DEFAULTS.slotW;
      if (next.pitch <= cutWidth(next) + 0.3) next.pitch = DEFAULTS.pitch;
    }
    patch(next, true);
    if ((key === "shape" || key === "pattern") && hingeLocks(account.plan, next).length > locks.length) {
      toastMsg("Pro feature: preview it freely. Export and cloud save need Pro.");
    }
  }

  function lockedReason() {
    const what = locks.join(" and ");
    return `${what} ${locks.length > 1 ? "are" : "is a"} Pro feature${locks.length > 1 ? "s" : ""}. Keep designing with it here; exporting and saving it to the cloud need Pro.`;
  }

  /**
   * The file to export. With accounts the server builds it so Free cannot bypass the plan.
   * Without accounts everything is open and it is built here.
   */
  const localSVG = () => (model && lay ? exportSVG(model, lay, built) : null);

  async function exportedSVG(): Promise<string | null> {
    if (!model || !lay) { toastMsg("Fix the settings before exporting"); return null; }
    if (locks.length) { setUpgrade(lockedReason()); return null; }
    if (account.configured && !hasPro(account.plan)) { setUpgrade("Saving and exporting need Pro. Upgrade to download cut files and keep cloud projects."); return null; }
    if (!account.configured) return exportSVG(model, lay, built);
    try {
      const res = await fetch("/api/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ params }) });
      if (res.ok) return await res.text();
      const err = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Export failed. Try again.";
      if (res.status === 403) setUpgrade(err);
      else toastMsg(err);
    } catch {
      toastMsg("Export needs a connection. Check your network and try again.");
    }
    return null;
  }

  /** The export SVG with lines that touching parts share cut once. */
  async function cutSVG(): Promise<string | null> {
    const svg = await exportedSVG();
    if (!svg) return null;
    const { mergedNote, watertightSVG } = await import("@/lib/export/watertight");
    const w = watertightSVG(svg);
    if (w.removed) window.setTimeout(() => toastMsg(mergedNote(w.removed)), 1600);
    return w.svg;
  }

  async function exportNow() {
    const svg = await cutSVG();
    if (!svg) return;
    offerFile(baseName(built) + ".svg", svg, "image/svg+xml");
  }

  async function exportDXFNow() {
    const svg = await cutSVG();
    if (!svg) return;
    const { svgToDXF } = await import("@/lib/export/dxf");
    const out = svgToDXF(svg);
    offerFile(baseName(built) + ".dxf", out.dxf, "application/dxf");
    if (out.skipped) window.setTimeout(() => toastMsg("Pictures cannot go into a DXF: engrave them from the SVG"), 1600);
  }

  async function copySVG() {
    const svg = await exportedSVG();
    if (!svg) return;
    const name = baseName(built) + ".svg";
    try {
      navigator.clipboard.writeText(svg).then(() => toastMsg("SVG copied to clipboard"), () => setModal({ type: "code", name, data: svg }));
    } catch {
      setModal({ type: "code", name, data: svg });
    }
  }

  function saveProject() {
    if (account.configured && !hasPro(account.plan)) { setUpgrade("Saving and exporting need Pro. Upgrade to download cut files and keep cloud projects."); return; }
    void file.save();
  }
  function saveProjectAs() {
    if (account.configured && !hasPro(account.plan)) { setUpgrade("Saving and exporting need Pro. Upgrade to download cut files and keep cloud projects."); return; }
    void file.saveAs();
  }
  function openProject() { void file.open(); }

  function newProject() {
    file.forget();
    if (cloud) {
      toastMsg("Creating a new box…");
      void openNewCloudProject("hinge-box").then((err) => { if (err) toastMsg(err); });
      return;
    }
    const next = editorPrefs().keepSetup ? keepSetup(params, clone(DEFAULTS)) : clone(DEFAULTS);
    patch(next, true);
    applyFit(next);
    toastMsg("New box");
  }

  function resetPattern() {
    patch({ ...params, pattern: DEFAULTS.pattern, slit: DEFAULTS.slit, bridge: DEFAULTS.bridge, pitch: DEFAULTS.pitch, overrun: DEFAULTS.overrun, stretch: DEFAULTS.stretch, cutStyle: DEFAULTS.cutStyle, slotW: DEFAULTS.slotW }, true);
  }

  function randomBox() {
    const next = randomHingeBox(params, account.plan);
    patch(next, true);
    toastMsg(`${next.name}: a new box idea. Ctrl+Z undoes it.`);
  }

  function randomPattern() {
    const next = randomHingePattern(params, (p) => canUsePattern(account.plan, p));
    patch(next, true);
    const style = HINGE_VARIANTS.find((v) => v.id === hingeVariantOf(next));
    toastMsg(`${next.pattern[0].toUpperCase()}${next.pattern.slice(1)} pattern${style ? `, ${style.name.toLowerCase()} style` : ""}${next.cutStyle === "line" ? ", single-line cuts" : ""}. Ctrl+Z undoes it.`);
  }

  function applyIssueFix(fix: Fix<Params>) {
    const next = fix.apply(params);
    patch(next, true);
    applyFit(next);
    toastMsg(`${fix.label}. Ctrl+Z undoes it.`);
  }

  function autoFixEverything() {
    const res = autoFixAll(params, hingeIssues);
    if (!res.applied.length) { toastMsg("Nothing to fix automatically"); return; }
    patch(res.params, true);
    applyFit(res.params);
    toastMsg(`Auto-fix: ${res.applied.join(", ")}. Ctrl+Z undoes it.`);
  }

  function runAutoFit() {
    if (!model) { toastMsg("Fix the settings first"); return; }
    const res = autoFit(params, model.hBody, model.rN);
    const next = withFittedLattice(params, res.q);
    patch(next, true);
    toastMsg(res.ok
      ? next.pattern === "honeycomb"
        ? `Fitted: spacing ${fmtLen(next.pitch, units, true)}, cell width ${fmtLen(next.slotW, units, true)}`
        : `Fitted: spacing ${fmtLen(next.pitch, units, true)}, bridge ${fmtLen(next.bridge, units, true)}${next.pattern !== "serpentine" ? `, slit ${fmtLen(next.slit, units, true)}` : ""}`
      : "No lattice reaches this radius safely. Try Serpentine or a larger corner radius.");
  }

  function resetSection(title: string, keys: (keyof Params)[]) {
    const next = { ...params };
    const def = clone(DEFAULTS);
    for (const k of keys) {
      if (def[k] === undefined) delete next[k];
      else (next as Record<keyof Params, unknown>)[k] = def[k];
    }
    patch(next, true);
    toastMsg(`${title} reset. Ctrl+Z undoes it.`);
  }

  function resetAll() {
    const next = { ...clone(DEFAULTS), name: params.name };
    patch(next, true);
    applyFit(next);
    toastMsg("All settings reset. Ctrl+Z undoes it.");
  }

  const started = useRef(false);
  useEffect(() => {
    if (!start || started.current) return;
    started.current = true;
    const next = start.file ? mergeParams(start.params as Partial<Params>) : hingePresetParams(start.params as Partial<Params>);
    patch(next, true);
    applyFit(next);
    if (start.file) { file.markClean(); toastMsg(`Opened ${start.file.name}`); }
    else if (start.id !== SHARED_ID) toastMsg(`Started from “${start.name}”. Ctrl+Z returns to your last design.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function doUndo() { if (undo()) toastMsg("Undo"); }
  function doRedo() { if (redo()) toastMsg("Redo"); }

  const openExport = () => setExporting(true);
  const api = useRef({ exportNow, openExport, saveProject, saveProjectAs, openProject, importPick: file.importPick, newProject, doUndo, doRedo, copySVG, fit: viewApi.fit, zoomCenter: viewApi.zoomCenter, viewRef: viewApi.viewRef });
  api.current = { exportNow, openExport, saveProject, saveProjectAs, openProject, importPick: file.importPick, newProject, doUndo, doRedo, copySVG, fit: viewApi.fit, zoomCenter: viewApi.zoomCenter, viewRef: viewApi.viewRef };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const inField = !!document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "Escape") { setModal(null); setUpgrade(null); }
      if (mod) {
        const k = e.key.toLowerCase();
        const va = api.current;
        if (k === "z" && !inField) { e.preventDefault(); e.shiftKey ? va.doRedo() : va.doUndo(); }
        else if (k === "y" && !inField) { e.preventDefault(); va.doRedo(); }
        else if (k === "s") { e.preventDefault(); if (e.shiftKey) va.saveProjectAs(); else va.saveProject(); }
        else if (k === "o") { e.preventDefault(); va.openProject(); }
        else if (k === "i" && !e.shiftKey) { e.preventDefault(); va.importPick(); }
        else if (k === "e") { e.preventDefault(); if (e.shiftKey) va.openExport(); else void va.exportNow(); }
        else if (k === "n") { e.preventDefault(); va.newProject(); }
        else if (k === "0") { e.preventDefault(); va.fit(); }
        else if (k === "1") { e.preventDefault(); va.zoomCenter(PX_PER_MM / va.viewRef.current.z); }
        else if (k === "=" || k === "+") { e.preventDefault(); va.zoomCenter(1.25); }
        else if (k === "-") { e.preventDefault(); va.zoomCenter(0.8); }
        return;
      }
      if (inField) return;
      if (e.key === "h" || e.key === "H") setTool("hand");
      if (e.key === "z" || e.key === "Z") setTool("zoom");
      if (e.key === "'") setShowGrid((g) => !g);
      if (e.code === "Space") { e.preventDefault(); setSpaceDown(true); }
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") setSpaceDown(false); };
    document.addEventListener("keydown", down);
    document.addEventListener("keyup", up);
    return () => {
      document.removeEventListener("keydown", down);
      document.removeEventListener("keyup", up);
    };
  }, []);

  const menus: Record<"file" | "edit" | "view" | "help", MenuEntry[]> = {
    file: [
      { label: "New box", kbd: "Ctrl+N", run: newProject },
      { label: "Start page", kbd: "", run: onHome },
      { label: "Open project…", kbd: "Ctrl+O", run: openProject },
      { label: "Import settings from a project…", kbd: "Ctrl+I", run: file.importPick },
      { label: "Save project", kbd: "Ctrl+S", run: saveProject },
      { label: "Save project as…", kbd: "Ctrl+Shift+S", run: saveProjectAs },
      { label: "Save as my preset…", kbd: "", run: () => setModal({ type: "preset", name: params.name }) },
      { label: "Share link…", kbd: "", run: () => setSharing(true) },
      "-",
      { label: "Export SVG…", kbd: "Ctrl+E", run: exportNow },
      { label: "Export DXF…", kbd: "", run: () => void exportDXFNow() },
      { label: "Export (PDF, LightBurn, per sheet)…", kbd: "Ctrl+Shift+E", run: openExport },
      { label: "Copy SVG code", kbd: "", run: copySVG },
      "-",
      { label: "Rename box…", kbd: "", run: () => setModal({ type: "rename", name: params.name }) },
    ],
    edit: [
      { label: "Undo", kbd: "Ctrl+Z", run: doUndo, disabled: !canUndo },
      { label: "Redo", kbd: "Ctrl+Shift+Z", run: doRedo, disabled: !canRedo },
      "-",
      { label: "Randomise box", kbd: "", run: randomBox },
      { label: "Randomise hinge pattern", kbd: "", run: randomPattern },
      { label: "Reset hinge pattern", kbd: "", run: resetPattern },
      { label: "Reset all settings", kbd: "", run: resetAll },
    ],
    view: [
      { label: "Zoom in", kbd: "Ctrl++", run: () => viewApi.zoomCenter(1.25) },
      { label: "Zoom out", kbd: "Ctrl+−", run: () => viewApi.zoomCenter(0.8) },
      { label: "Fit sheet", kbd: "Ctrl+0", run: () => viewApi.fit() },
      { label: "Actual size", kbd: "Ctrl+1", run: () => viewApi.zoomCenter(PX_PER_MM / viewApi.viewRef.current.z) },
      "-",
      { label: "Toggle grid", kbd: "'", run: () => setShowGrid((g) => !g) },
      { label: "Units: millimeters", kbd: "", run: () => setUnits("mm") },
      { label: "Units: inches", kbd: "", run: () => setUnits("in") },
    ],
    help: [
      ...help.menu,
      "-",
      { label: "Living hinge guide", kbd: "", run: () => setModal({ type: "guide" }) },
      { label: "Keyboard shortcuts", kbd: "", run: () => setModal({ type: "keys" }) },
    ],
  };

  const fitInfo = arranged.fit;
  const fits = fitInfo ? fitInfo.fits : !!lay && lay.width <= params.bedW + 1e-6 && lay.height <= params.bedH + 1e-6;
  const longStrip = !!model && model.parts.some((pt) => pt.kind === "wall" && pt.w + 10 > params.bedW);
  const sheetsText = fitInfo ? `${fitInfo.sheets} sheet${fitInfo.sheets === 1 ? "" : "s"}` : "";
  const fit = !model
    ? { cls: "s-err" as const, text: "Fix the highlighted setting" }
    : fits
      ? { cls: "s-ok" as const, text: fitInfo ? `Fits ${sheetsText}${fitInfo.scale < 1 ? ` at ${Math.round(fitInfo.scale * 1000) / 10} %` : ""}` : "Fits the bed" }
      : { cls: "s-warn" as const, text: `Larger than the ${fitInfo ? "sheet" : "bed"}${longStrip && params.split === 1 ? " — try Two halves under Joints" : fitInfo ? "" : " — try Fit product to under Sheet"}` };
  const sheetProps = {
    info: fitInfo,
    size: hingeSize(built, units),
    meta: fitSet.mode === "off" ? undefined : fitSet.mode === "auto" ? `Auto · ${sheetsText}` : `Fit · ${fitSet.sheets} sheet${fitSet.sheets === 1 ? "" : "s"}`,
    onSheet: (w: number, h: number) => { const next = { ...params, bedW: w, bedH: h }; patch(next, true); applyFit(next); },
    onFit: (f: { mode: "off" | "sheets" | "auto"; sheets: number }) => {
      const next = { ...params, fit: f };
      patch(next, true);
      toastMsg(fitSummary(f, applyFit(next).fit, null));
    },
  };

  const zoom = Math.round(viewApi.view.z / PX_PER_MM * 100) + "%";

  return (
    <HelpContext.Provider value={help.ctx}>
    <div className="app">
      <MenuBar
        title={meta.title} kind={meta.kind} menus={menus} product="hinge" onProduct={onProduct}
        onSave={saveProject} onOpen={openProject}
      />
      <div className="main">
        <GalleryRail
          title={PRODUCT_INFO.hinge.name} icon={PRODUCT_INFO.hinge.icon}
          groups={hingeGroups({ params, plan: account.plan, onShape: (v) => setChoice("shape", v), onLid: (v) => setChoice("lid", v), onPattern: (v) => setChoice("pattern", v), onVariant: (v) => { patch({ ...params, ...v.params }, true); toastMsg(`${v.name} hinge style`); }, onRandom: randomPattern })}
          history={{ canUndo, canRedo, undo: doUndo, redo: doRedo }}
          inert={shared.viewing}
        >
          <button type="button" className="btn-auto gen-shuffle" onClick={randomBox} title="A whole new box idea: tissue box, money box, lantern, planter and more. Your material and sheet stay. Ctrl+Z undoes it.">
            <Dices size={15} aria-hidden /> Randomise box
          </button>
        </GalleryRail>
        <div className={`stage${viewMode === "3d" ? " no-rulers" : ""}`}>
        <ViewToggle value={viewMode} onChange={setViewMode} />
        <div className={`stage-3d${stale ? " stale" : ""}`} hidden={viewMode !== "3d"}>
          {seen3d && <HingeView3D model={stale?.model ?? model} params={stale?.built ?? built} lay={stale?.lay ?? lay} content={stale?.content ?? content} units={units} edit={{ params, set: replace }} />}
          {seen3d && error && <div className="canvas-error">{error}</div>}
        </div>
        <section className="viewport" aria-label="Canvas">
          <div className="ruler-corner" />
          <div className="ruler h" ref={viewApi.rulerHRef} dangerouslySetInnerHTML={{ __html: rulerSvg(viewApi.rulerSize.w, true, viewApi.view, units) }} />
          <div className="ruler v" ref={viewApi.rulerVRef} dangerouslySetInnerHTML={{ __html: rulerSvg(viewApi.rulerSize.h, false, viewApi.view, units) }} />
          <Canvas
            canvasRef={viewApi.canvasRef}
            view={viewApi.view}
            viewRef={viewApi.viewRef}
            bedW={params.bedW}
            bedH={params.bedH}
            sheets={stale ? stale.sheets : arranged.sheets}
            content={stale ? stale.content : content}
            stale={!!stale}
            layers={params.layers}
            labels={params.labels}
            pitch={params.pitch}
            error={error}
            showGrid={showGrid}
            tool={tool}
            spaceDown={spaceDown}
            units={units}
            onCursor={(x, y) => setCursor({ x, y })}
            zoomAt={viewApi.zoomAt}
            panBy={viewApi.panBy}
            onZoomCenter={viewApi.zoomCenter}
            onActual={() => viewApi.zoomCenter(PX_PER_MM / viewApi.viewRef.current.z)}
            onFit={() => viewApi.fit()}
            tools={<ViewTools tool={tool} showGrid={showGrid} onTool={setTool} onGrid={() => setShowGrid((g) => !g)} />}
          />
        </section>
        </div>
        <DockColumn onExport={exportNow} exportLabel="Export SVG" alt={[{ label: "DXF", title: "Export as DXF (R12, mm)", run: () => void exportDXFNow() }, { label: "More…", title: "PDF, LightBurn, one file per sheet, mirror, and a check against your machine's bed (Ctrl+Shift+E)", run: openExport }]} units={units} onUnits={setUnits} onResetAll={resetAll} inert={shared.viewing}>
        <PanelDock
          params={params}
          model={model}
          error={error}
          units={units}
          dimsMeta={meta.dims}
          patMeta={meta.pat}
          onLive={(id, v, mat) => setField(id, v, mat, false)}
          onCommit={(id, v, mat) => setField(id, v, mat, true)}
          onMaterial={(id, info) => patch(hingeWithMaterial(params, id, info), true)}
          onPatch={(next) => patch(next, true)}
          onSplit={(n) => patch({ ...params, split: n }, true)}
          onCutStyle={(v: CutStyle) => setChoice("cutStyle", v)}
          onAutoFit={runAutoFit}
          onTestStrip={(on) => patch({ ...params, testStrip: on }, true)}
          onVis={(key) => {
            const layers = { ...params.layers, [key]: { ...params.layers[key], vis: !params.layers[key].vis } };
            patch({ ...params, layers }, true);
          }}
          onExp={(key, exp) => {
            const layers = { ...params.layers, [key]: { ...params.layers[key], exp } };
            patch({ ...params, layers }, true);
          }}
          onLabels={(on) => patch({ ...params, labels: on }, true)}
          onResetSection={resetSection}
          sheet={sheetProps}
          checks={<>
            <IssueList issues={issues} onFix={applyIssueFix} onAutoFix={autoFixEverything} />
            {lay && model && <JobEstimate svg={localSVG} version={lay} sheets={arranged.sheets} material={params.material} units={units === "in" ? "in" : "mm"} />}
          </>}
        />
        </DockColumn>
      </div>
      <StatusBar
        x={cursor.x}
        y={cursor.y}
        zoom={zoom}
        parts={model && lay ? { count: model.parts.length, used: usedText(usedArea(lay, arranged.sheets), (mm) => fmtLen(mm, units, true)) } : null}
        fit={fit}
        saved={shared.viewing ? "Shared design, not saved" : file.status ?? saved}
      />
      <Dialogs
        modal={modal}
        onClose={() => setModal(null)}
        onRename={(name) => {
          patch({ ...params, name: name.trim() || "Untitled box" }, true);
          setModal(null);
        }}
        onSavePreset={(name) => { setModal(null); void myPresets.save("hinge-box", name, params).then(toastMsg); }}
      />
      {help.drawer}
      {exporting && (
        <ExportDialog
          getSVG={exportedSVG} localSVG={localSVG} sheets={arranged.sheets} size={{ w: lay?.width ?? 0, h: lay?.height ?? 0 }}
          base={baseName(built)} units={units} material={params.material} onClose={() => setExporting(false)} toast={toastMsg}
        />
      )}
      {sharing && (
        <ShareDialog
          product="hinge" params={params as unknown as Record<string, unknown>} defaults={DEFAULTS} svg={localSVG} signedIn={account.signedIn}
          onClose={() => setSharing(false)} toast={toastMsg}
        />
      )}
      {shared.banner}
      {upgrade && <UpgradeDialog reason={upgrade} signedIn={account.signedIn} onClose={() => setUpgrade(null)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
      {file.input}
    </div>
    </HelpContext.Provider>
  );
}
