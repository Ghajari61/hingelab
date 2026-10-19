"use client";

import { platform } from "@hingelab/platform";
import { keepSetup } from "@/lib/prefs/editor";
import { editorPrefs } from "@/lib/prefs/editorStore";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { clientOnly } from "@hingelab/ui/lazy";
import { autoFit, clone, MATERIALS } from "@/lib/hinge";
import {
  baseOffset, exportLetterSVG, hingeParamsOf, LETTER_DEFAULTS,
  letterLayerContent, mergeLetterParams, retiredLetterSample, wallHeightOf, zoneOverlay,
  type HarfBuzz, type LetterParams, type LoadedFont,
} from "@/lib/letters";
import { useHistory } from "@/hooks/useHistory";
import { readStored, readUnits, useAutosave } from "@/hooks/useAutosave";
import { useCloudAutosave, type CloudDoc } from "@/hooks/useCloudAutosave";
import { thumbnailSVG } from "@/lib/projects/thumbnail";
import { importIntoCloud, openNewCloudProject } from "@/components/editor/cloud";
import { useProjectFile } from "@/components/shell/useProjectFile";
import { PX_PER_MM, useCanvasView } from "@/hooks/useCanvasView";
import { fmtLen, type Units } from "@/components/editor/format";
import { MenuBar, type MenuEntry } from "@/components/editor/MenuBar";
import { PRODUCT_INFO, type Product } from "@/components/editor/ControlBar";
import { GalleryRail } from "@/components/shell/GalleryRail";
import { ViewToggle, type ViewMode } from "@/components/shell/ViewToggle";
import { ViewTools } from "@/components/shell/ViewTools";
import { DockColumn } from "@/components/shell/DockColumn";
import { fitSummary } from "@/components/shell/SheetSection";
import { arrangeLetters } from "@/lib/fit/letters";
import { usedArea, usedText } from "@/lib/fit/arrange";
import { cleanFit, type FitSettings } from "@/lib/fit/fitToSheets";
import type { Preset } from "@/lib/presets";
import { useMyPresets } from "@/components/shell/useMyPresets";
import { Canvas } from "@/components/editor/Canvas";
import { rulerSvg } from "@/components/editor/Rulers";
import { StatusBar } from "@/components/editor/StatusBar";
import { Dialogs, type ModalState } from "@/components/editor/dialogs";
import { lettersGroups } from "./LettersControlBar";
import { randomLetterStyle } from "@/lib/letters/randomStyle";
import { BUNDLED_FONTS } from "@/lib/letters/fonts";
import { LettersDock } from "./LettersDock";
import { MARQUEE_KEYS, isMarqueeKey, type LetterNumKey } from "./fields";
import { deleteStoredFont, FONTS_EVENT, getStoredFont, listStoredFonts, type StoredFontMeta } from "./fontStore";
import { useSharedView } from "@/components/shell/SharedView";
import { useFlags } from "@/components/shell/useFlags";
import { FREE_FONT_UPLOADS, gateLock } from "@/lib/gates";
import { SHARED_ID } from "@/lib/share/id";
import { addFontFile, forgetFont, getLoadedFont, isUploadId, loadHarfBuzz } from "./runtime";
import { autoFixAll, type Fix } from "@/lib/issues";
import { lettersIssues } from "@/lib/issues/letters";
import { IssueList } from "@/components/shell/IssueList";
import { HelpContext, useHelpPanel } from "@/components/help/HelpContext";
import { hasPro, lettersLock } from "@/lib/plans";
import { MAX_UPLOAD_FONT_BYTES } from "@/lib/billing/exportLetters";
import { usePlan } from "@/components/billing/usePlan";
import { getBrowserClient } from "@/lib/supabase/client";
import { UpgradeDialog } from "@/components/billing/UpgradeDialog";

const ExportDialog = clientOnly(() => import("@/components/shell/ExportDialog"));
const JobEstimate = clientOnly(() => import("@/components/shell/JobEstimate"));
const ShareDialog = clientOnly(() => import("@/components/shell/ShareDialog"));
const LetterPreview3D = clientOnly(() => import("./LetterPreview3D"), {
  loading: () => <div id="preview3d" className="v3" aria-busy="true" />,
});

const KEY = "hingelab-letters-v2";
/** Saved before Letter Box: its hinge settings were never chosen in Letters, so the letter defaults replace them. */
const KEY_V1 = "hingelab-letters-v1";
const PRE_BOX_KEYS = ["slit", "bridge", "pitch", "overrun", "stretch", "pattern", "cutStyle", "slotW", "tabW", "slotClr", "lidGap", "lid", "wallStyle"] as const;

const mergeParams = mergeLetterParams;

/** A new design. Solid and Stencil are Pro, so Free and guest users start on Letter Box, the mode they can export. */
function freshParams(pro: boolean): LetterParams {
  const p = clone(LETTER_DEFAULTS);
  if (!pro) p.mode = "box";
  return p;
}

function loadInitial(cloud: CloudDoc | null) {
  if (cloud) return { params: mergeParams(cloud.params as Partial<LetterParams>), units: readUnits() };
  let stored = readStored<LetterParams>(KEY);
  if (!stored) {
    stored = readStored<LetterParams>(KEY_V1);
    if (stored?.params) {
      const params = { ...stored.params };
      for (const k of PRE_BOX_KEYS) delete params[k];
      stored = { ...stored, params };
    }
  }
  const units: Units = stored?.units === "in" ? "in" : "mm";
  // A saved draft keeps its mode, locked or not (previewing is free). Without accounts every mode is open.
  // The removed Persian sign sample still sits in older drafts; those open as a new design.
  if (!stored?.params || retiredLetterSample(stored.params)) return { params: freshParams(!getBrowserClient()), units };
  return { params: mergeParams(stored.params), units };
}

function baseName(p: LetterParams) {
  const slug = p.text.trim().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]/gu, "").slice(0, 24) || "text";
  return `letters-${slug}-${p.mode}-${Math.round(p.size)}mm`;
}

export default function LettersEditor({ onProduct, onHome, start, cloud = null }: {
  onProduct: (p: Product) => void;
  onHome: () => void;
  /** Preset chosen on the start page, applied as one undoable step over the autosaved design. */
  start?: Preset<Record<string, unknown>>;
  cloud?: CloudDoc | null;
}) {
  const boot = useState(() => loadInitial(cloud))[0];
  const { params, replace, undo, redo, canUndo, canRedo } = useHistory(boot.params);
  const [units, setUnits] = useState<Units>(boot.units);
  const [tool, setTool] = useState<"hand" | "zoom">("hand");
  const [spaceDown, setSpaceDown] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("sheets");
  /** three.js loads the first time the 3D view opens, then stays mounted. */
  const [seen3d, setSeen3d] = useState(false);
  if (viewMode === "3d" && !seen3d) setSeen3d(true);
  const [upgrade, setUpgrade] = useState<string | null>(null);
  const account = usePlan();
  const myPresets = useMyPresets();
  const [cursor, setCursor] = useState({ x: "—", y: "—" });
  const [saved, setSaved] = useState(cloud ? "Saved to cloud" : "Autosaved locally");
  const [modal, setModal] = useState<ModalState>(null);
  const [exporting, setExporting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const help = useHelpPanel("letters");
  const [toast, setToast] = useState<string | null>(null);
  const [uploads, setUploads] = useState<StoredFontMeta[]>([]);
  const [hb, setHb] = useState<HarfBuzz | null>(null);
  const [font, setFont] = useState<LoadedFont | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const toastT = useRef<number>(0);
  const onStatus = useCallback((s: string) => setSaved(s), []);
  const shared = useSharedView(start, start?.name ?? "Letters", (m) => toastMsg(m));
  const file = useProjectFile({
    section: "letters", params, fileBase: () => baseName(params), toast: (m) => toastMsg(m), opened: start?.file,
    cloudImport: cloud ? importIntoCloud : undefined,
    write: async () => (await import("@/components/shell/projectFile")).projectText({ app: "HingeLab", product: "letters", version: 1 }, params),
    load: (f) => {
      patch(mergeParams(f.params as Partial<LetterParams>), true);
      window.setTimeout(() => viewApi.fit(), 50);
    },
    importAccept: ".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2",
    importOther: (f) => {
      if (/\.(ttf|otf|woff2?)$/i.test(f.name)) return uploadFont(f);
      toastMsg("Import takes fonts (TTF, OTF, WOFF) or .oclc projects here.");
    },
  });
  const flags = useFlags();
  useAutosave(params, units, onStatus, KEY, !cloud && !shared.viewing);
  const thumbSrc = useRef<{ content: ReturnType<typeof letterLayerContent> | null; w: number; h: number }>({ content: null, w: 0, h: 0 });
  useCloudAutosave(cloud, params, () => (thumbSrc.current.content ? thumbnailSVG(thumbSrc.current.content, thumbSrc.current.w, thumbSrc.current.h) : null), onStatus);

  function toastMsg(msg: string) {
    setToast(msg);
    window.clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setToast(null), 2600);
  }

  useEffect(() => {
    loadHarfBuzz().then(setHb, () => setLoadError("The text shaper could not load. Reload the page to try again."));
    listStoredFonts().then(setUploads, () => {});
    const relist = () => { listStoredFonts().then(setUploads, () => {}); };
    window.addEventListener(FONTS_EVENT, relist);
    return () => window.removeEventListener(FONTS_EVENT, relist);
  }, []);

  useEffect(() => {
    if (!hb) return;
    let live = true;
    setLoadError(null);
    getLoadedFont(hb, params.fontId).then(
      (f) => { if (live) setFont(f); },
      (e: Error) => { if (live) { setFont(null); setLoadError(e.message); } },
    );
    return () => { live = false; };
  }, [hb, params.fontId]);

  // Typing and scrubbing stay responsive; the geometry follows a moment later.
  const deferred = useDeferredValue(params);
  const ready = !!hb && !!font && font.id === deferred.fontId;
  const arranged = useMemo(() => (ready ? arrangeLetters(deferred, font!, hb!) : null), [ready, deferred, font, hb]);
  const result = arranged?.result ?? null;
  /** The settings actually built: the design, shrunk when Fit is on. */
  const built = arranged?.params ?? deferred;
  const model = result && !("error" in result) ? result : null;
  const error = loadError ?? (result && "error" in result ? result.error : null);
  const lay = model ? arranged?.lay ?? null : null;
  const content = useMemo(() => (lay ? letterLayerContent(lay, built) : null), [lay, built]);
  thumbSrc.current = { content, w: lay?.width ?? 0, h: lay?.height ?? 0 };
  const overlay = useMemo(
    () => (showZones && model?.box && lay ? zoneOverlay(model.box, (letter) => baseOffset(lay, letter)) : null),
    [showZones, model, lay],
  );
  const hingeWalls = deferred.mode === "box" && deferred.wallStyle === "hinge";
  const fontsOf = useCallback((id: string) => (font && font.id === id ? font : null), [font]);
  const issues = useMemo(() => (ready && arranged ? lettersIssues(deferred, fontsOf, hb!, arranged) : []), [ready, arranged, deferred, fontsOf, hb]);

  const viewApi = useCanvasView();
  viewApi.fitArgs.current = { bedW: params.bedW, bedH: params.bedH, layW: lay?.width ?? 0, layH: lay?.height ?? 0, sheets: arranged?.sheets };

  function patch(partial: Partial<LetterParams>, record: boolean) {
    replace({ ...params, ...partial }, record);
  }

  function applyIssueFix(fix: Fix<LetterParams>) {
    replace(fix.apply(params), true);
    toastMsg(`${fix.label}. Ctrl+Z undoes it.`);
  }

  function autoFixEverything() {
    if (!hb) return;
    const res = autoFixAll(params, (q) => lettersIssues(q, fontsOf, hb));
    if (!res.applied.length) { toastMsg("Nothing to fix automatically"); return; }
    replace(res.params, true);
    toastMsg(`Auto-fix: ${res.applied.join(", ")}. Ctrl+Z undoes it.`);
  }

  function setField(id: LetterNumKey, v: number, mat: boolean, record: boolean) {
    if (isMarqueeKey(id)) { replace({ ...params, marquee: { ...params.marquee, [MARQUEE_KEYS[id]]: v } }, record); return; }
    const next: LetterParams = { ...params, [id]: v };
    if (mat && next.material !== "custom") next.material = "custom";
    replace(next, record);
  }

  function offerFile(filename: string, data: string, mime: string) {
    platform().saveFile({ name: filename, data, mime, intent: "export" })
      .then((r) => toastMsg(r.message))
      .catch(() => setModal({ type: "code", name: filename, data }));
  }

  /** The uploaded font for an export request, or an error message. */
  async function uploadForExport(): Promise<{ name: string; data: string } | { error: string } | null> {
    if (!isUploadId(deferred.fontId)) return null;
    const f = await getStoredFont(deferred.fontId);
    if (!f) return { error: "The uploaded font is not on this device. Upload it again, then export." };
    if (f.bytes.byteLength > MAX_UPLOAD_FONT_BYTES) return { error: "Fonts over 3 MB cannot be exported through the server yet. Use a smaller font file." };
    const bytes = new Uint8Array(f.bytes);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { name: f.name, data: btoa(bin) };
  }

  /**
   * The file to export. With accounts the server builds it so Free cannot bypass the plan.
   * Without accounts it is built here.
   */
  const localSVG = () => (model && lay ? exportLetterSVG(lay, built, font?.name) : null);

  async function exportedSVG(): Promise<string | null> {
    if (!model || !lay) { toastMsg(error ? "Fix the settings before exporting" : "Still loading the font"); return null; }
    if (account.configured && !hasPro(account.plan)) { setUpgrade("Saving and exporting need Pro. Upgrade to download cut files and keep cloud projects."); return null; }
    const lock = lettersLock(account.plan, deferred);
    if (lock) { setUpgrade(lock); return null; }
    if (!account.configured) return exportLetterSVG(lay, built, font?.name);
    try {
      const upload = await uploadForExport();
      if (upload && "error" in upload) {
        if (hasPro(account.plan)) return exportLetterSVG(lay, built, font?.name);
        toastMsg(upload.error);
        return null;
      }
      const res = await platform().exportFile({ product: "letters", params: deferred, ...(upload ? { font: upload } : {}) });
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
      toastMsg("Creating new letters…");
      void openNewCloudProject("letters").then((err) => { if (err) toastMsg(err); });
      return;
    }
    const fresh = freshParams(hasPro(account.plan));
    patch(editorPrefs().keepSetup ? keepSetup(params, fresh) : fresh, true);
    window.setTimeout(() => viewApi.fit(), 50);
    toastMsg("New letters");
  }

  async function uploadFont(file: File) {
    const limit = gateLock("customFonts", account.plan, flags);
    if (limit && uploads.length >= FREE_FONT_UPLOADS) { setUpgrade(limit); return; }
    try {
      const { id, name } = await addFontFile(file);
      setUploads(await listStoredFonts());
      patch({ fontId: id }, true);
      toastMsg(`Added ${name} on this device`);
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : "Could not read that font");
    }
  }

  async function removeFont(id: string) {
    const meta = uploads.find((u) => u.id === id);
    if (!window.confirm(`Remove ${meta?.name ?? "this font"} from this device?`)) return;
    await deleteStoredFont(id).catch(() => {});
    forgetFont(id);
    setUploads(await listStoredFonts().catch(() => []));
    if (params.fontId === id) patch({ fontId: LETTER_DEFAULTS.fontId }, true);
  }

  function runAutoFit() {
    const tightest = model?.box ? Math.min(...model.box.letters.map((s) => s.rTight)) : Infinity;
    if (!model?.box || !Number.isFinite(tightest)) { toastMsg(model ? "No curves to fit the hinge to" : "Fix the settings first"); return; }
    const res = autoFit(hingeParamsOf(params), wallHeightOf(params), tightest);
    const next: Partial<LetterParams> = { pitch: res.q.pitch, bridge: res.q.bridge };
    if (params.pattern !== "serpentine") next.slit = res.q.slit;
    patch(next, true);
    toastMsg(res.ok
      ? `Fitted: spacing ${fmtLen(res.q.pitch, units, true)}, bridge ${fmtLen(res.q.bridge, units, true)}${params.pattern !== "serpentine" ? `, slit ${fmtLen(res.q.slit, units, true)}` : ""}`
      : "No lattice reaches this radius safely. Try Serpentine, a larger size or a larger corner radius.");
  }

  function resetSection(title: string, keys: (keyof LetterParams)[]) {
    const def = clone(LETTER_DEFAULTS);
    const next: Partial<LetterParams> = {};
    for (const k of keys) (next as Record<string, unknown>)[k] = def[k];
    patch(next, true);
    toastMsg(`${title} reset. Ctrl+Z undoes it.`);
  }

  function randomStyle() {
    const next = randomLetterStyle(params, { pro: hasPro(account.plan) });
    patch(next, true);
    const font = BUNDLED_FONTS.find((f) => f.id === next.fontId)?.name ?? next.fontId;
    toastMsg(`${font}, ${next.mode === "box" ? "letter box" : next.mode}. Ctrl+Z undoes it.`);
  }

  function resetAll() {
    replace({ ...freshParams(hasPro(account.plan)), name: params.name, text: params.text, fontId: params.fontId }, true);
    window.setTimeout(() => viewApi.fit(), 50);
    toastMsg("All settings reset. Ctrl+Z undoes it.");
  }

  const started = useRef(false);
  useEffect(() => {
    if (!start || started.current) return;
    started.current = true;
    replace(mergeParams(start.params as Partial<LetterParams>), true);
    window.setTimeout(() => viewApi.fit(), 50);
    if (start.file) { file.markClean(); toastMsg(`Opened ${start.file.name}`); }
    else if (start.id !== SHARED_ID) toastMsg(`Started from “${start.name}”. Ctrl+Z returns to your last design.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function doUndo() { if (undo()) toastMsg("Undo"); }
  function doRedo() { if (redo()) toastMsg("Redo"); }

  const openExport = () => setExporting(true);
  const api = useRef({ exportNow, openExport, saveProject, saveProjectAs, openProject, importPick: file.importPick, newProject, doUndo, doRedo, fit: viewApi.fit, zoomCenter: viewApi.zoomCenter, viewRef: viewApi.viewRef });
  api.current = { exportNow, openExport, saveProject, saveProjectAs, openProject, importPick: file.importPick, newProject, doUndo, doRedo, fit: viewApi.fit, zoomCenter: viewApi.zoomCenter, viewRef: viewApi.viewRef };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const inField = !!document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "Escape") setModal(null);
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

  // Fit the sheet once the first layout exists.
  const fitKey = lay ? `${params.bedW}x${params.bedH}|${Math.round(lay.width)}x${Math.round(lay.height)}|${arranged?.sheets?.length ?? 0}` : "";
  const refit = viewApi.refit;
  useEffect(() => {
    if (fitKey) refit();
  }, [fitKey, refit]);

  const menus: Record<"file" | "edit" | "view" | "help", MenuEntry[]> = {
    file: [
      { label: "New letters", kbd: "Ctrl+N", run: newProject },
      { label: "Start page", kbd: "", run: onHome },
      { label: "Open project…", kbd: "Ctrl+O", run: openProject },
      { label: "Import font or project…", kbd: "Ctrl+I", run: file.importPick },
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
      { label: "Rename…", kbd: "", run: () => setModal({ type: "rename", name: params.name }) },
    ],
    edit: [
      { label: "Undo", kbd: "Ctrl+Z", run: doUndo, disabled: !canUndo },
      { label: "Redo", kbd: "Ctrl+Shift+Z", run: doRedo, disabled: !canRedo },
      "-",
      { label: "Randomise style", kbd: "", run: randomStyle },
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
      { label: "Keyboard shortcuts", kbd: "", run: () => setModal({ type: "keys" }) },
    ],
  };

  const fitInfo = arranged?.fit ?? null;
  const fitSet = cleanFit(params.fit);
  const fits = fitInfo ? fitInfo.fits : !!lay && lay.width <= params.bedW + 1e-6 && lay.height <= params.bedH + 1e-6;
  const sheetsText = fitInfo ? `${fitInfo.sheets} sheet${fitInfo.sheets === 1 ? "" : "s"}` : "";
  const fit = error
    ? { cls: "s-err" as const, text: "Fix the highlighted setting" }
    : !model
      ? { cls: "s-ok" as const, text: "Loading font" }
      : fits
        ? { cls: "s-ok" as const, text: fitInfo ? `Fits ${sheetsText}${fitInfo.scale < 1 ? ` at ${Math.round(fitInfo.scale * 1000) / 10} %` : ""}` : "Fits the bed" }
        : { cls: "s-warn" as const, text: fitInfo ? "Larger than the sheet — use a larger sheet or more sheets" : "Larger than the bed — try Fit product to under Sheet" };
  const sheetProps = {
    info: fitInfo,
    size: `${built.sizeMode === "capHeight" ? "cap" : "total"} ${fmtLen(built.size, units)}${built.mode === "box" ? `, depth ${fmtLen(built.depth, units)}` : ""}`,
    meta: fitSet.mode === "off" ? undefined : fitSet.mode === "auto" ? `Auto · ${sheetsText}` : `Fit · ${fitSet.sheets} sheet${fitSet.sheets === 1 ? "" : "s"}`,
    onSheet: (w: number, h: number) => patch({ bedW: w, bedH: h }, true),
    onFit: (f: FitSettings) => {
      patch({ fit: f }, true);
      if (font && hb) toastMsg(fitSummary(f, arrangeLetters({ ...params, fit: f }, font, hb).fit, null));
    },
  };
  const zoom = Math.round(viewApi.view.z / PX_PER_MM * 100) + "%";
  const sizeLabel = `${params.sizeMode === "capHeight" ? "cap" : "total"} ${fmtLen(params.size, units)}`;

  return (
    <HelpContext.Provider value={help.ctx}>
    <div className="app">
      <MenuBar
        title={params.name} kind={`Letters · ${font?.name ?? "…"} · ${sizeLabel}`} menus={menus} product="letters" onProduct={onProduct}
        onSave={saveProject} onOpen={openProject}
      />
      <div className="main">
        <GalleryRail
          title={PRODUCT_INFO.letters.name} icon={PRODUCT_INFO.letters.icon}
          groups={lettersGroups({
            mode: params.mode, pro: hasPro(account.plan), wallStyle: params.wallStyle, lid: params.lid,
            onMode: (m) => patch({ mode: m }, true), onWallStyle: (w) => patch({ wallStyle: w }, true), onLid: (l) => patch({ lid: l }, true), onRandom: randomStyle,
          })}
          history={{ canUndo, canRedo, undo: doUndo, redo: doRedo }}
          inert={shared.viewing}
        />
        <div className={`stage${viewMode === "3d" ? " no-rulers" : ""}`}>
        <ViewToggle value={viewMode} onChange={setViewMode} />
        <div className="stage-3d" hidden={viewMode !== "3d"}>
          {seen3d && <LetterPreview3D model={model} params={built} lay={lay} content={content} units={units} edit={{ params, set: replace }} />}
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
            sheets={arranged?.sheets ?? null}
            content={content}
            layers={hingeWalls ? params.layers : { ...params.layers, hinge: { ...params.layers.hinge, vis: false } }}
            labels={params.labels}
            pitch={hingeWalls ? deferred.pitch : 0}
            overlay={overlay}
            error={error}
            notice={!model && !error ? "Loading font…" : null}
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
        <LettersDock
          params={params}
          model={model}
          error={error}
          units={units}
          uploads={uploads}
          showZones={showZones}
          onShowZones={setShowZones}
          onAutoFit={runAutoFit}
          onPatch={patch}
          onField={setField}
          onMaterial={(id, info) => {
            const next: Partial<LetterParams> = { material: id };
            if (info?.T != null) next.T = info.T;
            if (info?.kx != null) next.K = info.kx;
            patch(next, true);
          }}
          onPick={(id) => patch({ fontId: id }, true)}
          onUpload={uploadFont}
          onDeleteFont={removeFont}
          onResetSection={resetSection}
          sheet={sheetProps}
          checks={<>
            <IssueList issues={issues} onFix={applyIssueFix} onAutoFix={autoFixEverything} />
            {lay && model && <JobEstimate svg={localSVG} version={lay} sheets={arranged?.sheets} material={params.material} units={units === "in" ? "in" : "mm"} />}
          </>}
        />
        </DockColumn>
      </div>
      <StatusBar
        x={cursor.x}
        y={cursor.y}
        zoom={zoom}
        parts={model && lay ? { count: model.parts.length, used: usedText(usedArea(lay, arranged?.sheets ?? null), (mm) => fmtLen(mm, units, true)) } : null}
        fit={fit}
        saved={shared.viewing ? "Shared design, not saved" : file.status ?? saved}
      />
      <Dialogs
        modal={modal}
        noun="project"
        onClose={() => setModal(null)}
        onRename={(name) => {
          patch({ name: name.trim() || LETTER_DEFAULTS.name }, true);
          setModal(null);
        }}
        onSavePreset={(name) => { setModal(null); void myPresets.save("letters", name, params).then(toastMsg); }}
      />
      {exporting && (
        <ExportDialog
          getSVG={exportedSVG} localSVG={localSVG} sheets={arranged?.sheets} size={{ w: lay?.width ?? 0, h: lay?.height ?? 0 }}
          base={baseName(built)} units={units} material={params.material} onClose={() => setExporting(false)} toast={toastMsg}
        />
      )}
      {sharing && (
        <ShareDialog
          product="letters" params={params as unknown as Record<string, unknown>} defaults={LETTER_DEFAULTS} svg={localSVG} signedIn={account.signedIn}
          onClose={() => setSharing(false)} toast={toastMsg}
        />
      )}
      {shared.banner}
      {upgrade && <UpgradeDialog reason={upgrade} signedIn={account.signedIn} onClose={() => setUpgrade(null)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
      {file.input}
      {help.drawer}
    </div>
    </HelpContext.Provider>
  );
}
