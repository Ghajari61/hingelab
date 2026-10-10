"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { r3, type LayerContent } from "@/lib/hinge";
import { IMAGE_DEFAULTS, PARAMETRIC_DEFAULTS, mergeParametricParams } from "@/lib/parametric/defaults";
import { allSheetsSVG, assemblyGuideSVG, exportZip, sheetFileName, sheetLayerContent, sheetSVG, slugName } from "@/lib/parametric/export";
import { toSheet } from "@/lib/parametric/nest";
import { formatOf } from "@/lib/parametric/source/mesh";
import { packOutline } from "@/lib/parametric/source/outlineBytes";
import { packDepth, unpackDepth } from "@/lib/parametric/source/relief";
import type { MeshData, ParametricParams, Sheet, SliceResult } from "@/lib/parametric/types";
import { syncShapes } from "@/lib/parametric/shapes";
import { clone } from "@/lib/hinge";
import { parametricLock, parametricLocks } from "@/lib/plans";
import { thumbnailSVG } from "@/lib/projects";
import { downloadModelFile, uploadModelFile } from "@/lib/projects/files";
import { getBrowserClient } from "@/lib/supabase/client";
import { useCloudAutosave, type CloudDoc } from "@/hooks/useCloudAutosave";
import { usePlan } from "@/components/billing/usePlan";
import { UpgradeDialog } from "@/components/billing/UpgradeDialog";
import { importIntoCloud, openNewCloudProject } from "@/components/editor/cloud";
import { useHistory } from "@/hooks/useHistory";
import { readStored, useAutosave } from "@/hooks/useAutosave";
import { PX_PER_MM, useCanvasView } from "@/hooks/useCanvasView";
import { fmtLen, type Units } from "@/components/editor/format";
import { MenuBar, type MenuEntry } from "@/components/editor/MenuBar";
import { PRODUCT_INFO, type Product } from "@/components/editor/ControlBar";
import { GalleryRail } from "@/components/shell/GalleryRail";
import { HelpContext, useHelpPanel } from "@/components/help/HelpContext";
import { ViewToggle } from "@/components/shell/ViewToggle";
import { ViewTools } from "@/components/shell/ViewTools";
import { DockColumn } from "@/components/shell/DockColumn";
import type { Preset } from "@/lib/presets";
import { useMyPresets } from "@/components/shell/useMyPresets";
import { Canvas } from "@/components/editor/Canvas";
import { rulerSvg } from "@/components/editor/Rulers";
import { StatusBar } from "@/components/editor/StatusBar";
import { Dialogs, type ModalState } from "@/components/editor/dialogs";
import { methodGroups } from "./ParametricControlBar";
import { ParametricDock } from "./ParametricDock";
import { depthPreview, estimateDepth } from "./depthProtocol";
import { getStoredModel, getStoredPhoto, putStoredModel, putStoredPhoto, type StoredModel } from "./modelStore";
import { Slicer } from "./slicerProtocol";
import Viewport3D, { type ViewToggles } from "./Viewport3D";

const KEY = "hingelab-parametric-v1";
const MAX_MODEL_BYTES = 100 * 1024 * 1024;
const MAX_PHOTO_BYTES = 30 * 1024 * 1024;
const SHEET_GAP = 40;

function loadInitial(cloud: CloudDoc | null) {
  const stored = readStored<ParametricParams>(KEY);
  const units = (stored?.units === "in" ? "in" : "mm") as Units;
  if (cloud) return { params: mergeParametricParams(cloud.params as Partial<ParametricParams>), units };
  return { params: mergeParametricParams(stored?.params), units };
}

/** Sheets in rows, left to right, `SHEET_GAP` mm apart. */
function layoutSheets(sheets: Sheet[]) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(sheets.length)));
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  let y = 0, W = 0;
  for (let r = 0; r * cols < sheets.length; r++) {
    let x = 0, rowH = 0;
    for (const s of sheets.slice(r * cols, (r + 1) * cols)) {
      rects.push({ x, y, w: s.width, h: s.height });
      x += s.width + SHEET_GAP;
      rowH = Math.max(rowH, s.height);
    }
    W = Math.max(W, x - SHEET_GAP);
    y += rowH + SHEET_GAP;
  }
  return { rects, W, H: Math.max(0, y - SHEET_GAP) };
}

export default function ParametricEditor({ onProduct, onHome, start, cloud = null }: {
  onProduct: (p: Product) => void;
  onHome: () => void;
  /** Preset chosen on the start page, applied as one undoable step over the autosaved design. */
  start?: Preset<Record<string, unknown>>;
  cloud?: CloudDoc | null;
}) {
  const boot = useState(() => loadInitial(cloud))[0];
  const { params, replace, undo, redo, canUndo, canRedo } = useHistory(boot.params);
  const [units, setUnits] = useState<Units>(boot.units);
  const [tab, setTab] = useState<"3d" | "sheets">("3d");
  const [tool, setTool] = useState<"hand" | "zoom">("hand");
  const [spaceDown, setSpaceDown] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [show, setShow] = useState<ViewToggles>({ model: true, planes: false, parts: true });
  const [explode, setExplode] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [cursor, setCursor] = useState({ x: "—", y: "—" });
  const [saved, setSaved] = useState(cloud ? "Saved to cloud" : "Autosaved locally");
  const [upgrade, setUpgrade] = useState<string | null>(null);
  /** idle → loading → done | failed: fetching a cloud project's model or photo onto this device. */
  const [cloudFile, setCloudFile] = useState<"idle" | "loading" | "done" | "failed">("idle");
  const account = usePlan();
  const myPresets = useMyPresets();
  const thumbRef = useRef<() => string | null>(() => null);
  const [modal, setModal] = useState<ModalState>(null);
  const help = useHelpPanel("parametric");
  const [toast, setToast] = useState<string | null>(null);
  const [model, setModel] = useState<StoredModel | null>(null);
  const [modelChecked, setModelChecked] = useState(false);
  const [photo, setPhoto] = useState<StoredModel | null>(null);
  const [textFile, setTextFile] = useState<(StoredModel & { missing: string[] }) | null>(null);
  const [depthBusy, setDepthBusy] = useState(false);
  const [showHeat, setShowHeat] = useState(false);
  const [res, setRes] = useState<{ result: SliceResult; ms: number } | null>(null);
  const [mesh, setMesh] = useState<MeshData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [askUnits, setAskUnits] = useState(false);
  const slicer = useRef<Slicer | null>(null);
  const meshKey = useRef("");
  const fileRef = useRef<HTMLInputElement>(null);
  const toastT = useRef<number>(0);
  const onStatus = useCallback((s: string) => setSaved(s), []);
  useAutosave(params, units, onStatus, KEY, !cloud);
  useCloudAutosave(cloud, params, () => thumbRef.current(), onStatus);

  function toastMsg(msg: string) {
    setToast(msg);
    window.clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setToast(null), 2600);
  }

  const edit = useCallback((f: (q: ParametricParams) => void, record: boolean) => {
    const next = structuredClone(params);
    f(next);
    syncShapes(params, next);
    replace(next, record);
  }, [params, replace]);

  useEffect(() => {
    slicer.current = new Slicer((s) => setStage(s));
    Promise.all([
      getStoredModel().then((m) => setModel(m ?? null), () => {}),
      getStoredPhoto().then((m) => setPhoto(m ?? null), () => {}),
    ]).finally(() => setModelChecked(true));
    return () => slicer.current?.dispose();
  }, []);

  // A cloud project whose model or photo is not on this device fetches it from Storage once.
  const srcRef = params.source.kind === "mesh" || params.source.kind === "image" ? params.source : null;
  const needsCloudFile = !!cloud && !!srcRef?.fileId && modelChecked
    && !((srcRef.kind === "mesh" ? model : photo)?.name === srcRef.fileName);
  useEffect(() => {
    if (!needsCloudFile || cloudFile !== "idle" || !srcRef?.fileId) return;
    const db = getBrowserClient();
    if (!db) { setCloudFile("failed"); return; }
    setCloudFile("loading");
    setStage(srcRef.kind === "mesh" ? "Loading the model from the cloud" : "Loading the photo's depth from the cloud");
    const { kind, fileName, fileId } = srcRef;
    downloadModelFile(db, fileId)
      .then((bytes) => {
        const m: StoredModel = { name: fileName, key: fileId, bytes };
        if (kind === "mesh") { setModel(m); void putStoredModel(m).catch(() => {}); }
        else {
          m.depthPreview = depthPreview(unpackDepth(bytes));
          setPhoto(m);
          void putStoredPhoto(m).catch(() => {});
        }
        setCloudFile("done");
      })
      .catch(() => setCloudFile("failed"))
      .finally(() => setStage(null));
  }, [needsCloudFile, cloudFile, srcRef]);

  // A saved project that points at a model or photo this browser no longer has falls back to the library.
  useEffect(() => {
    if (!modelChecked || depthBusy || cloudFile === "loading" || (needsCloudFile && cloudFile === "idle")) return;
    if (needsCloudFile && cloudFile === "failed") { setError("This project's file could not be loaded from the cloud. Check your connection and reload the page."); return; }
    const src = params.source;
    if (src.kind === "mesh" && (!model || model.name !== src.fileName)) {
      replace({ ...params, source: clone(PARAMETRIC_DEFAULTS.source) }, false);
      toastMsg("The imported model is not on this device. Import it again.");
    }
    if (src.kind === "image" && (!photo || photo.name !== src.fileName)) {
      replace({ ...params, source: clone(PARAMETRIC_DEFAULTS.source) }, false);
      toastMsg("The photo is not on this device. Load it again.");
    }
  }, [modelChecked, model, photo, depthBusy, cloudFile, needsCloudFile, params, replace]);

  // A Text source is shaped here (HarfBuzz and the font live on the main thread) and sent as outlines.
  const textSrc = params.source.kind === "text" ? params.source : null;
  const textKey = textSrc ? JSON.stringify([textSrc.text, textSrc.font, textSrc.size, textSrc.letterSpacing]) : null;
  useEffect(() => {
    if (!textSrc || !textKey) return;
    let live = true;
    (async () => {
      const [{ getLoadedFont, loadHarfBuzz }, { shapeText }] = await Promise.all([import("@/components/letters/runtime"), import("@/lib/letters/shape")]);
      const hb = await loadHarfBuzz();
      const font = await getLoadedFont(hb, textSrc.font);
      const out = shapeText(hb, font, textSrc.text, { direction: "auto", size: textSrc.size, sizeMode: "capHeight", letterSpacing: textSrc.letterSpacing });
      if (live) setTextFile({ name: textKey, key: textKey, bytes: packOutline(out.glyphs.flatMap((g) => g.contours)), missing: out.shaped.missing });
    })().catch((e: Error) => { if (live) setError(e.message || "The font could not be loaded"); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textKey]);

  const fileOf = (p: ParametricParams) => (p.source.kind === "mesh" ? model : p.source.kind === "image" ? photo : p.source.kind === "text" && textFile?.key === textKey ? textFile : null);
  const srcFile = fileOf(params);
  const sourceReady = modelChecked && (params.source.kind === "text" ? !!srcFile
    : (params.source.kind !== "mesh" && params.source.kind !== "image") || (!!srcFile && srcFile.name === params.source.fileName));

  // Re-slice in the worker 250 ms after the last change; the previous result stays on screen meanwhile.
  useEffect(() => {
    const s = slicer.current;
    if (!s || !sourceReady) return;
    const fileKey = srcFile?.key ?? "";
    const key = JSON.stringify([params.source, params.sourceSettings, fileKey]);
    const wantMesh = key !== meshKey.current;
    let live = true;
    setBusy(true);
    const t = window.setTimeout(() => {
      s.run({ params, file: srcFile?.bytes.slice(0), fileKey, wantMesh })
        .then((r) => {
          if (!live) return;
          if (r.mesh) { setMesh(r.mesh); meshKey.current = key; }
          setRes({ result: r.result, ms: r.ms });
          setAskUnits(r.askUnits);
          setError(null);
        })
        .catch((e: Error) => { if (live) setError(e.message); })
        .finally(() => { if (live) { setBusy(false); setStage(null); } });
    }, 250);
    return () => { live = false; window.clearTimeout(t); };
  }, [params, srcFile, sourceReady]);

  const result = res?.result ?? null;
  const partsById = useMemo(() => new Map((result?.parts ?? []).map((q) => [q.id, q])), [result]);
  const layout = useMemo(() => layoutSheets(result?.sheets ?? []), [result]);
  const content = useMemo<LayerContent | null>(() => {
    if (!result?.sheets.length) return null;
    const all: LayerContent = { outline: [], slots: [], hinge: [], labels: [], fills: [] };
    result.sheets.forEach((sh, i) => {
      const c = sheetLayerContent(sh, partsById, layout.rects[i].x, layout.rects[i].y, params.material.K);
      all.outline.push(...c.outline); all.slots.push(...c.slots); all.hinge.push(...c.hinge); all.fills.push(...c.fills);
    });
    return all;
  }, [result, partsById, layout, params.material.K]);
  thumbRef.current = () => (content && layout.W > 0 ? thumbnailSVG(content, layout.W, layout.H) : null);
  const sheetRects = useMemo(() => (result?.sheets ?? []).map((sh, i) => ({
    ...layout.rects[i],
    label: `Sheet ${i + 1} · ${fmtLen(sh.width, units)} × ${fmtLen(sh.height, units)} · ${Math.round(sh.usage * 100)}% used${sh.oversize ? " · larger than your sheet" : ""}`,
    warn: !!sh.oversize,
  })), [result, layout, units]);
  const overlay = useMemo(() => {
    if (!result || !selected.length) return null;
    const out: { d: string; color: string; width: number }[] = [];
    result.sheets.forEach((sh, i) => {
      for (const it of sh.items) {
        if (!selected.includes(it.partId)) continue;
        const part = partsById.get(it.partId);
        if (!part?.cut) continue;
        const { x, y } = layout.rects[i];
        const d = part.cut.outline.map((c) => `M${c.map((q) => { const [sx, sy] = toSheet(q, it); return `${r3(sx + x)} ${r3(sy + y)}`; }).join("L")}Z`).join("");
        out.push({ d, color: "var(--accent)", width: 3 });
      }
    });
    return out;
  }, [result, selected, partsById, layout]);
  /** The sheet holding the selected part (else the first). */
  const currentSheet = result ? Math.max(0, result.sheets.findIndex((s) => s.items.some((it) => it.partId === selected[0]))) : 0;

  const viewApi = useCanvasView();
  viewApi.fitArgs.current = { bedW: layout.W || params.material.sheetW, bedH: layout.H || params.material.sheetH, layW: 0, layH: 0 };

  function offerFile(filename: string, data: string | Uint8Array, mime: string) {
    try {
      const a = document.createElement("a");
      const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }));
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      toastMsg(`Downloading ${filename}`);
    } catch {
      if (typeof data === "string") setModal({ type: "code", name: filename, data });
    }
  }

  type ExportWhat = { kind: "zip" } | { kind: "all" } | { kind: "sheet"; index: number } | { kind: "guide" };
  const base = () => slugName(params.name);
  const ready = () => {
    if (!result?.sheets.length) { toastMsg(error ? "Fix the settings before exporting" : "Still slicing"); return false; }
    return true;
  };
  const locks = parametricLocks(account.plan, params, result?.stats.partCount);

  /**
   * Exports with the plan applied. Pro (and servers without accounts) build the file here, clean.
   * Free asks the server, which slices again and adds the HingeLab mark, so the limits hold (D56).
   */
  async function exportData(what: ExportWhat, build: () => string | Uint8Array): Promise<{ data: string | Uint8Array; marked: boolean } | null> {
    if (!ready()) return null;
    const lock = parametricLock(account.plan, params, result!.stats.partCount);
    if (lock) { setUpgrade(lock); return null; }
    if (!account.configured || account.plan === "pro") return { data: build(), marked: false };
    try {
      toastMsg("Preparing the export…");
      const res = await fetch("/api/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ product: "parametric", params, what }) });
      if (!res.ok) {
        const err = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Export failed. Try again.";
        if (res.status === 403) setUpgrade(err); else toastMsg(err);
        return null;
      }
      return { data: new Uint8Array(await res.arrayBuffer()), marked: what.kind !== "guide" };
    } catch {
      toastMsg("Export needs a connection. Check your network and try again.");
      return null;
    }
  }
  async function exportWith(what: ExportWhat, name: string, mime: string, build: () => string | Uint8Array) {
    const out = await exportData(what, build);
    if (!out) return;
    offerFile(name, out.data, mime);
    if (out.marked) window.setTimeout(() => toastMsg("Exported with the small “Made with HingeLab” mark (Free plan)"), 1600);
  }
  function exportAllNow() { void exportWith({ kind: "all" }, `${base()}.svg`, "image/svg+xml", () => allSheetsSVG(result!, params)); }
  async function exportDXFNow() {
    const out = await exportData({ kind: "all" }, () => allSheetsSVG(result!, params));
    if (!out) return;
    const { svgToDXF } = await import("@/lib/export/dxf");
    offerFile(`${base()}.dxf`, svgToDXF(typeof out.data === "string" ? out.data : new TextDecoder().decode(out.data)).dxf, "application/dxf");
    if (out.marked) window.setTimeout(() => toastMsg("Exported with the small “Made with HingeLab” mark (Free plan)"), 1600);
  }
  function exportZipNow() { void exportWith({ kind: "zip" }, `${base()}.zip`, "application/zip", () => exportZip(result!, params)); }
  function exportSheetNow() {
    if (!ready()) return;
    void exportWith({ kind: "sheet", index: currentSheet }, `${base()}-${sheetFileName(currentSheet, result!.sheets.length)}`, "image/svg+xml", () => sheetSVG(result!, currentSheet, params));
  }
  function guideNow() { void exportWith({ kind: "guide" }, `${base()}-assembly-guide.svg`, "image/svg+xml", () => assemblyGuideSVG(result!, params)); }
  function saveProject() {
    offerFile(`${base()}.hingelab.json`, JSON.stringify({ app: "HingeLab", product: "parametric", version: 1, params }, null, 2), "application/json");
  }
  function openProject() { if (fileRef.current) { fileRef.current.value = ""; fileRef.current.click(); } }
  function newProject() {
    if (cloud) {
      toastMsg("Creating a new sculpture…");
      void openNewCloudProject("parametric").then((err) => { if (err) toastMsg(err); });
      return;
    }
    replace(clone(PARAMETRIC_DEFAULTS), true);
    setSelected([]);
    toastMsg("New sculpture");
  }

  /** In a cloud project, keeps the file in Storage so the project opens on any device. */
  async function keepInCloud(name: string, bytes: ArrayBuffer): Promise<string | undefined> {
    const db = cloud ? getBrowserClient() : null;
    if (!db || !cloud) return undefined;
    try {
      const { data } = await db.auth.getUser();
      if (!data.user) return undefined;
      setStage("Saving the file to the cloud");
      return await uploadModelFile(db, data.user.id, cloud.id, name, bytes);
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : "The file could not be saved to the cloud");
      return undefined;
    } finally {
      setStage(null);
    }
  }

  async function importModel(f: File) {
    if (!formatOf(f.name)) { toastMsg("Use an STL, OBJ or GLB file"); return; }
    if (f.size > MAX_MODEL_BYTES) { toastMsg("That model is larger than 100 MB"); return; }
    const m: StoredModel = { name: f.name, key: `${f.name}:${f.size}:${f.lastModified}`, bytes: await f.arrayBuffer() };
    setModel(m);
    putStoredModel(m).catch(() => toastMsg("The model is loaded but could not be kept on this device"));
    const fileId = await keepInCloud(f.name, m.bytes);
    replace({ ...params, source: { kind: "mesh", fileName: f.name, units: "auto", upAxis: "Y", ...(fileId ? { fileId } : {}) } }, true);
    setSelected([]);
    toastMsg(`Imported ${f.name}`);
  }

  async function importPhoto(f: File) {
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { toastMsg("Use a JPEG, PNG or WebP photo"); return; }
    if (f.size > MAX_PHOTO_BYTES) { toastMsg("That photo is larger than 30 MB"); return; }
    setDepthBusy(true);
    setStage("Reading depth from the photo");
    try {
      const r = await estimateDepth(f, (s) => setStage(s));
      const m: StoredModel = { name: f.name, key: `${f.name}:${f.size}:${f.lastModified}`, bytes: packDepth(r.depth), preview: r.preview, depthPreview: r.depthPreview };
      setPhoto(m);
      putStoredPhoto(m).catch(() => toastMsg("The photo is loaded but could not be kept on this device"));
      const fileId = await keepInCloud(`${f.name}.depth`, m.bytes);
      const { fileId: _old, ...keep } = params.source.kind === "image" ? params.source : IMAGE_DEFAULTS;
      void _old;
      replace({ ...params, source: { ...keep, kind: "image", fileName: f.name, ...(fileId ? { fileId } : {}) } }, true);
      setSelected([]);
      toastMsg(`Depth read in ${(r.ms / 1000).toFixed(1)} s (${r.ep})`);
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : "The photo could not be read");
    } finally {
      setDepthBusy(false);
      setStage(null);
    }
  }

  function resetSection(title: string, keys: (keyof ParametricParams)[]) {
    const def = clone(PARAMETRIC_DEFAULTS) as unknown as Record<string, unknown>;
    edit((q) => { for (const k of keys) (q as unknown as Record<string, unknown>)[k] = def[k]; }, true);
    toastMsg(`${title} reset. Ctrl+Z undoes it.`);
  }

  function resetAll() {
    replace({ ...clone(PARAMETRIC_DEFAULTS), name: params.name, source: params.source }, true);
    setSelected([]);
    toastMsg("All settings reset. Ctrl+Z undoes it.");
  }

  const started = useRef(false);
  useEffect(() => {
    if (!start || started.current) return;
    started.current = true;
    replace(mergeParametricParams(start.params as Partial<ParametricParams>), true);
    setSelected([]);
    toastMsg(`Started from “${start.name}”. Ctrl+Z returns to your last design.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function doUndo() { if (undo()) toastMsg("Undo"); }
  function doRedo() { if (redo()) toastMsg("Redo"); }
  const select = (ids: string[]) => setSelected(ids);

  const api = useRef({ exportAllNow, saveProject, openProject, newProject, doUndo, doRedo, fit: viewApi.fit, zoomCenter: viewApi.zoomCenter, viewRef: viewApi.viewRef });
  api.current = { exportAllNow, saveProject, openProject, newProject, doUndo, doRedo, fit: viewApi.fit, zoomCenter: viewApi.zoomCenter, viewRef: viewApi.viewRef };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const inField = !!document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "Escape") { setModal(null); setSelected([]); }
      if (mod) {
        const k = e.key.toLowerCase();
        const va = api.current;
        if (k === "z" && !inField) { e.preventDefault(); e.shiftKey ? va.doRedo() : va.doUndo(); }
        else if (k === "s") { e.preventDefault(); va.saveProject(); }
        else if (k === "o") { e.preventDefault(); va.openProject(); }
        else if (k === "e") { e.preventDefault(); va.exportAllNow(); }
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

  // Fit the sheets whenever the Sheets tab opens or the sheet layout changes size.
  const fitKey = `${tab}:${Math.round(layout.W)}x${Math.round(layout.H)}`;
  const fitView = viewApi.fit;
  useEffect(() => {
    if (tab === "sheets" && layout.W > 0) window.requestAnimationFrame(() => fitView());
  }, [fitKey, tab, layout.W, fitView]);

  const menus: Record<"file" | "edit" | "view" | "help", MenuEntry[]> = {
    file: [
      { label: "New sculpture", kbd: "Ctrl+N", run: newProject },
      { label: "Start page", kbd: "", run: onHome },
      { label: "Open project…", kbd: "Ctrl+O", run: openProject },
      { label: "Save project", kbd: "Ctrl+S", run: saveProject },
      { label: "Save as my preset…", kbd: "", run: () => setModal({ type: "preset", name: params.name }) },
      { label: "Import 3D model…", kbd: "", run: () => { const i = document.querySelector<HTMLInputElement>('input[aria-label="Import model"]'); i?.click(); } },
      "-",
      { label: "Export SVG (all sheets)…", kbd: "Ctrl+E", run: exportAllNow },
      { label: "Export DXF (all sheets)", kbd: "", run: () => void exportDXFNow() },
      { label: "Export all sheets (ZIP)", kbd: "", run: exportZipNow },
      { label: "Export this sheet (SVG)", kbd: "", run: exportSheetNow },
      { label: "Assembly guide (SVG)", kbd: "", run: guideNow },
      "-",
      { label: "Rename…", kbd: "", run: () => setModal({ type: "rename", name: params.name }) },
    ],
    edit: [
      { label: "Undo", kbd: "Ctrl+Z", run: doUndo, disabled: !canUndo },
      { label: "Redo", kbd: "Ctrl+Shift+Z", run: doRedo, disabled: !canRedo },
      "-",
      { label: "Reset all settings", kbd: "", run: resetAll },
    ],
    view: [
      { label: "3D view", kbd: "", run: () => setTab("3d") },
      { label: "Sheets", kbd: "", run: () => setTab("sheets") },
      "-",
      { label: "Zoom in", kbd: "Ctrl++", run: () => viewApi.zoomCenter(1.25) },
      { label: "Zoom out", kbd: "Ctrl+−", run: () => viewApi.zoomCenter(0.8) },
      { label: "Fit sheets", kbd: "Ctrl+0", run: () => viewApi.fit() },
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

  const serious = result?.warnings.some((w) => ["PART_TOO_BIG", "TOO_MANY_SHEETS", "TOO_MANY_PARTS"].includes(w.code));
  const fit = error
    ? { cls: "s-err" as const, text: error }
    : !result
      ? { cls: "s-ok" as const, text: busy ? "Slicing" : "Loading" }
      : serious
        ? { cls: "s-warn" as const, text: "Some parts need attention — see Analysis" }
        : { cls: "s-ok" as const, text: `Fits ${result.sheets.length} sheet${result.sheets.length === 1 ? "" : "s"}` };
  const zoom = tab === "sheets" ? Math.round(viewApi.view.z / PX_PER_MM * 100) + "%" : "—";
  const exploded = explode * Math.max(4, (params.parallel.spacing ?? 2.5 * params.material.T) * 1.5);
  const labelsVisible = params.layers.labels.vis && params.labels.enabled;

  return (
    <HelpContext.Provider value={help.ctx}>
    <div className="app">
      <MenuBar
        title={params.name} kind={`Parametric · ${result ? `${result.stats.partCount} parts` : "…"}`} menus={menus} product="parametric" onProduct={onProduct}
        onSave={saveProject} onOpen={openProject}
      />
      <div className="main">
        <GalleryRail
          title={PRODUCT_INFO.parametric.name} icon={PRODUCT_INFO.parametric.icon}
          groups={methodGroups({ method: params.method, plan: account.plan, onMethod: (m) => edit((q) => {
            q.method = m;
            // Folding needs card or paper.
            if (m === "folded" && q.material.T > 1) q.material = { ...q.material, id: "custom", T: 0.3, K: 0.05 };
          }, true) })}
          history={{ canUndo, canRedo, undo: doUndo, redo: doRedo }}
        />
        <div className={`stage pe-center${tab === "3d" ? " no-rulers" : ""}`}>
          <ViewToggle value={tab} onChange={setTab} sheetsLabel={`Sheets${result ? ` (${result.sheets.length})` : ""}`} />
          <div className="stage-chip"><span className="pe-stage">{busy || depthBusy ? (stage ?? "Slicing…") : res ? `${result!.stats.partCount} parts · ${Math.round(res.ms)} ms` : ""}</span>
            {(busy || depthBusy) && <span className="pe-progress" aria-hidden />}</div>
          <div className="pe-3d stage-3d" hidden={tab !== "3d"}>
              <Viewport3D className="pe-view" mesh={result && !result.usesModel ? null : mesh} result={result} T={params.material.T} show={show} explode={exploded} selected={selected} onSelect={(id) => setSelected(id ? [id] : [])} heat={showHeat && !!result?.deviation} />
              <div className="pe-hud">
                {(["model", "planes", "parts"] as const).map((k) => (
                  <label key={k} className="chk"><input type="checkbox" checked={show[k]} onChange={(e) => setShow((s) => ({ ...s, [k]: e.target.checked }))} /> {k === "model" ? "Model" : k === "planes" ? "Planes" : "Parts"}</label>
                ))}
                {result?.deviation && (
                  <label className="chk" title="How far the model's surface lies from the nearest part"><input type="checkbox" checked={showHeat} onChange={(e) => setShowHeat(e.target.checked)} /> Deviation</label>
                )}
                <label className="pe-explode">Explode <input type="range" min={0} max={1} step={0.01} value={explode} aria-label="Explode" onChange={(e) => setExplode(parseFloat(e.target.value))} /></label>
              </div>
              {showHeat && result?.deviation && (
                <div className="pe-legend" data-testid="deviation-legend">
                  <span>0</span>
                  <span className="pe-legend-bar" aria-hidden />
                  <span>{fmtLen(result.deviation.spacing, units)}</span>
                  <span className="pe-legend-note">distance from surface to nearest part</span>
                </div>
              )}
              {error && <div className="canvas-error">{error}</div>}
            </div>
            <section className="viewport" aria-label="Sheets">
              <div className="ruler-corner" />
              <div className="ruler h" ref={viewApi.rulerHRef} dangerouslySetInnerHTML={{ __html: rulerSvg(viewApi.rulerSize.w, true, viewApi.view, units) }} />
              <div className="ruler v" ref={viewApi.rulerVRef} dangerouslySetInnerHTML={{ __html: rulerSvg(viewApi.rulerSize.h, false, viewApi.view, units) }} />
              <Canvas
                canvasRef={viewApi.canvasRef}
                view={viewApi.view}
                viewRef={viewApi.viewRef}
                bedW={params.material.sheetW}
                bedH={params.material.sheetH}
                sheets={sheetRects}
                content={content}
                layers={{ ...params.layers, hinge: { ...params.layers.hinge, vis: labelsVisible } }}
                labels={false}
                pitch={10}
                overlay={overlay}
                error={error}
                notice={!content && !error ? "Slicing…" : null}
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
        <DockColumn onExport={exportAllNow} exportLabel="Export SVG" alt={[{ label: "DXF", title: "Export all sheets as a DXF (R12, mm)", run: () => void exportDXFNow() }]} units={units} onUnits={setUnits} onResetAll={resetAll}>
        <ParametricDock
          params={params}
          result={result}
          error={error}
          busy={busy}
          units={units}
          selected={selected}
          textMissing={textSrc && textFile?.key === textKey ? textFile.missing : []}
          fileName={model?.name ?? null}
          photo={photo}
          depthBusy={depthBusy}
          plan={account.plan}
          locks={locks}
          onUpgrade={() => setUpgrade(parametricLock(account.plan, params, result?.stats.partCount))}
          askUnits={askUnits}
          onEdit={edit}
          onSelect={select}
          onImport={importModel}
          onImportPhoto={importPhoto}
          onExportSheet={exportSheetNow}
          onExportAll={exportAllNow}
          onExportDXF={() => void exportDXFNow()}
          onExportZip={exportZipNow}
          onGuide={guideNow}
          onResetSection={resetSection}
        />
        </DockColumn>
      </div>
      <StatusBar
        x={cursor.x}
        y={cursor.y}
        zoom={zoom}
        parts={result ? { count: result.stats.partCount, used: `${result.sheets.length} sheet${result.sheets.length === 1 ? "" : "s"}, ${Math.round(result.stats.materialUsage * 100)}%` } : null}
        fit={fit}
        saved={saved}
      />
      <Dialogs
        modal={modal}
        noun="project"
        onClose={() => setModal(null)}
        onRename={(name) => {
          edit((q) => { q.name = name.trim() || PARAMETRIC_DEFAULTS.name; }, true);
          setModal(null);
        }}
        onSavePreset={(name) => { setModal(null); void myPresets.save("parametric", name, params).then(toastMsg); }}
      />
      {toast && <div className="toast" role="status">{toast}</div>}
      {upgrade && <UpgradeDialog reason={upgrade} signedIn={account.signedIn} onClose={() => setUpgrade(null)} />}
      <input
        ref={fileRef}
        type="file"
        accept=".json,.hingelab.json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const rd = new FileReader();
          rd.onload = () => {
            try {
              const j = JSON.parse(String(rd.result)) as { product?: string; params?: Partial<ParametricParams> };
              if (j.product !== "parametric" || !j.params) {
                toastMsg(j.params ? "That is a Hinge Box or Letters project. Switch products to open it." : "That file is not a HingeLab project");
                return;
              }
              if (cloud) {
                toastMsg("Opening as a new cloud project…");
                void importIntoCloud(String(rd.result)).then((err) => { if (err) toastMsg(err); });
                return;
              }
              replace(mergeParametricParams(j.params), true);
              setSelected([]);
              toastMsg(`Opened ${f.name}`);
            } catch {
              toastMsg("That file is not a HingeLab project");
            }
          };
          rd.readAsText(f);
        }}
      />
      {help.drawer}
    </div>
    </HelpContext.Provider>
  );
}
