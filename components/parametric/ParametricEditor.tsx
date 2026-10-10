"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { r3, type LayerContent } from "@/lib/hinge";
import {
  PARAMETRIC_DEFAULTS, assemblyGuideSVG, exportZip, formatOf, mergeParametricParams, sheetFileName, sheetLayerContent, sheetSVG, toSheet,
  type MeshData, type ParametricParams, type Sheet, type SliceResult,
} from "@/lib/parametric";
import { clone } from "@/lib/hinge";
import { useHistory } from "@/hooks/useHistory";
import { readStored, useAutosave } from "@/hooks/useAutosave";
import { PX_PER_MM, useCanvasView } from "@/hooks/useCanvasView";
import { fmtLen, type Units } from "@/components/editor/format";
import { MenuBar, type MenuEntry } from "@/components/editor/MenuBar";
import type { Product } from "@/components/editor/ControlBar";
import { ToolRail } from "@/components/editor/ToolRail";
import { Canvas } from "@/components/editor/Canvas";
import { rulerSvg } from "@/components/editor/Rulers";
import { StatusBar } from "@/components/editor/StatusBar";
import { Dialogs, type ModalState } from "@/components/editor/dialogs";
import { ParametricControlBar } from "./ParametricControlBar";
import { ParametricDock } from "./ParametricDock";
import { getStoredModel, putStoredModel, type StoredModel } from "./modelStore";
import { Slicer } from "./slicerProtocol";
import Viewport3D, { type ViewToggles } from "./Viewport3D";

const KEY = "hingelab-parametric-v1";
const MAX_MODEL_BYTES = 100 * 1024 * 1024;
const SHEET_GAP = 40;

function loadInitial() {
  const stored = readStored<ParametricParams>(KEY);
  return { params: mergeParametricParams(stored?.params), units: (stored?.units === "in" ? "in" : "mm") as Units };
}

const slug = (s: string) => s.trim().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]/gu, "").slice(0, 32) || "sculpture";

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

export default function ParametricEditor({ onProduct }: { onProduct: (p: Product) => void }) {
  const boot = useState(loadInitial)[0];
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
  const [saved, setSaved] = useState("Autosaved locally");
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [model, setModel] = useState<StoredModel | null>(null);
  const [modelChecked, setModelChecked] = useState(false);
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
  useAutosave(params, units, onStatus, KEY, true);

  function toastMsg(msg: string) {
    setToast(msg);
    window.clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setToast(null), 2600);
  }

  const edit = useCallback((f: (q: ParametricParams) => void, record: boolean) => {
    const next = structuredClone(params);
    f(next);
    replace(next, record);
  }, [params, replace]);

  useEffect(() => {
    slicer.current = new Slicer((s) => setStage(s));
    getStoredModel().then((m) => setModel(m ?? null), () => {}).finally(() => setModelChecked(true));
    return () => slicer.current?.dispose();
  }, []);

  // A saved project that points at an imported model this browser no longer has falls back to the library.
  useEffect(() => {
    if (!modelChecked || params.source.kind !== "mesh") return;
    if (!model || model.name !== params.source.fileName) {
      replace({ ...params, source: clone(PARAMETRIC_DEFAULTS.source) }, false);
      toastMsg("The imported model is not on this device. Import it again.");
    }
  }, [modelChecked, model, params, replace]);

  const sourceReady = modelChecked && (params.source.kind !== "mesh" || (!!model && model.name === params.source.fileName));

  // Re-slice in the worker 250 ms after the last change; the previous result stays on screen meanwhile.
  useEffect(() => {
    const s = slicer.current;
    if (!s || !sourceReady) return;
    const fileKey = params.source.kind === "mesh" ? model?.key ?? "" : "";
    const key = JSON.stringify([params.source, params.sourceSettings, fileKey]);
    const wantMesh = key !== meshKey.current;
    let live = true;
    setBusy(true);
    const t = window.setTimeout(() => {
      s.run({ params, file: params.source.kind === "mesh" ? model?.bytes.slice(0) : undefined, fileKey, wantMesh })
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
  }, [params, model, sourceReady]);

  const result = res?.result ?? null;
  const partsById = useMemo(() => new Map((result?.parts ?? []).map((q) => [q.id, q])), [result]);
  const layout = useMemo(() => layoutSheets(result?.sheets ?? []), [result]);
  const content = useMemo<LayerContent | null>(() => {
    if (!result?.sheets.length) return null;
    const all: LayerContent = { outline: [], slots: [], hinge: [], labels: [], fills: [] };
    result.sheets.forEach((sh, i) => {
      const c = sheetLayerContent(sh, partsById, layout.rects[i].x, layout.rects[i].y);
      all.outline.push(...c.outline); all.slots.push(...c.slots); all.hinge.push(...c.hinge); all.fills.push(...c.fills);
    });
    return all;
  }, [result, partsById, layout]);
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

  const base = () => `parametric-${slug(params.name)}`;
  const ready = () => {
    if (!result?.sheets.length) { toastMsg(error ? "Fix the settings before exporting" : "Still slicing"); return false; }
    return true;
  };
  function exportZipNow() { if (ready()) offerFile(`${base()}.zip`, exportZip(result!, params), "application/zip"); }
  function exportSheetNow() { if (ready()) offerFile(`${base()}-${sheetFileName(currentSheet, result!.sheets.length)}`, sheetSVG(result!, currentSheet, params), "image/svg+xml"); }
  function guideNow() { if (ready()) offerFile(`${base()}-assembly-guide.svg`, assemblyGuideSVG(result!, params), "image/svg+xml"); }
  function saveProject() {
    offerFile(`${base()}.hingelab.json`, JSON.stringify({ app: "HingeLab", product: "parametric", version: 1, params }, null, 2), "application/json");
  }
  function openProject() { if (fileRef.current) { fileRef.current.value = ""; fileRef.current.click(); } }
  function newProject() {
    replace(clone(PARAMETRIC_DEFAULTS), true);
    setSelected([]);
    toastMsg("New sculpture");
  }

  async function importModel(f: File) {
    if (!formatOf(f.name)) { toastMsg("Use an STL, OBJ or GLB file"); return; }
    if (f.size > MAX_MODEL_BYTES) { toastMsg("That model is larger than 100 MB"); return; }
    const m: StoredModel = { name: f.name, key: `${f.name}:${f.size}:${f.lastModified}`, bytes: await f.arrayBuffer() };
    setModel(m);
    putStoredModel(m).catch(() => toastMsg("The model is loaded but could not be kept on this device"));
    replace({ ...params, source: { kind: "mesh", fileName: f.name, units: "auto", upAxis: "Y" } }, true);
    setSelected([]);
    toastMsg(`Imported ${f.name}`);
  }

  function doUndo() { if (undo()) toastMsg("Undo"); }
  function doRedo() { if (redo()) toastMsg("Redo"); }
  const select = (ids: string[]) => setSelected(ids);

  const api = useRef({ exportZipNow, saveProject, openProject, newProject, doUndo, doRedo, fit: viewApi.fit, zoomCenter: viewApi.zoomCenter, viewRef: viewApi.viewRef });
  api.current = { exportZipNow, saveProject, openProject, newProject, doUndo, doRedo, fit: viewApi.fit, zoomCenter: viewApi.zoomCenter, viewRef: viewApi.viewRef };

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
        else if (k === "e") { e.preventDefault(); va.exportZipNow(); }
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
      { label: "Open project…", kbd: "Ctrl+O", run: openProject },
      { label: "Save project", kbd: "Ctrl+S", run: saveProject },
      { label: "Import 3D model…", kbd: "", run: () => { const i = document.querySelector<HTMLInputElement>('input[aria-label="Import model"]'); i?.click(); } },
      "-",
      { label: "Export all sheets (ZIP)", kbd: "Ctrl+E", run: exportZipNow },
      { label: "Export this sheet (SVG)", kbd: "", run: exportSheetNow },
      { label: "Assembly guide (SVG)", kbd: "", run: guideNow },
      "-",
      { label: "Rename…", kbd: "", run: () => setModal({ type: "rename", name: params.name }) },
    ],
    edit: [
      { label: "Undo", kbd: "Ctrl+Z", run: doUndo, disabled: !canUndo },
      { label: "Redo", kbd: "Ctrl+Shift+Z", run: doRedo, disabled: !canRedo },
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
    <div className="app">
      <MenuBar title={params.name} kind={`Parametric · ${result ? `${result.stats.partCount} parts` : "…"}`} menus={menus} onExport={exportZipNow} exportLabel="Export ZIP" />
      <ParametricControlBar method={params.method} onMethod={(m) => edit((q) => { q.method = m; }, true)} onProduct={onProduct} />
      <div className="main">
        <ToolRail
          tool={tool}
          showGrid={showGrid}
          onTool={(t) => { setTool(t); setTab("sheets"); }}
          onFit={() => (tab === "sheets" ? viewApi.fit() : setTab("sheets"))}
          onGrid={() => setShowGrid((g) => !g)}
          onSave={saveProject}
          onOpen={openProject}
        />
        <div className="pe-center">
          <div className="pe-tabs" role="tablist" aria-label="View">
            <button type="button" role="tab" aria-selected={tab === "3d"} onClick={() => setTab("3d")}>3D</button>
            <button type="button" role="tab" aria-selected={tab === "sheets"} onClick={() => setTab("sheets")}>Sheets{result ? ` (${result.sheets.length})` : ""}</button>
            <span className="pe-stage">{busy ? (stage ?? "Slicing…") : res ? `${result!.stats.partCount} parts · ${Math.round(res.ms)} ms` : ""}</span>
            {busy && <span className="pe-progress" aria-hidden />}
          </div>
          {tab === "3d" ? (
            <div className="pe-3d">
              <Viewport3D className="pe-view" mesh={result && !result.usesModel ? null : mesh} result={result} T={params.material.T} show={show} explode={exploded} selected={selected} onSelect={(id) => setSelected(id ? [id] : [])} />
              <div className="pe-hud">
                {(["model", "planes", "parts"] as const).map((k) => (
                  <label key={k} className="chk"><input type="checkbox" checked={show[k]} onChange={(e) => setShow((s) => ({ ...s, [k]: e.target.checked }))} /> {k === "model" ? "Model" : k === "planes" ? "Planes" : "Parts"}</label>
                ))}
                <label className="pe-explode">Explode <input type="range" min={0} max={1} step={0.01} value={explode} aria-label="Explode" onChange={(e) => setExplode(parseFloat(e.target.value))} /></label>
              </div>
              {error && <div className="canvas-error">{error}</div>}
            </div>
          ) : (
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
              />
            </section>
          )}
        </div>
        <ParametricDock
          params={params}
          result={result}
          error={error}
          busy={busy}
          units={units}
          selected={selected}
          fileName={model?.name ?? null}
          askUnits={askUnits}
          onEdit={edit}
          onSelect={select}
          onImport={importModel}
          onExportSheet={exportSheetNow}
          onExportZip={exportZipNow}
          onGuide={guideNow}
        />
      </div>
      <StatusBar
        x={cursor.x}
        y={cursor.y}
        zoom={zoom}
        parts={result ? { count: result.stats.partCount, used: `${result.sheets.length} sheet${result.sheets.length === 1 ? "" : "s"}, ${Math.round(result.stats.materialUsage * 100)}%` } : null}
        fit={fit}
        saved={saved}
        units={units}
        onUnits={setUnits}
      />
      <Dialogs
        modal={modal}
        noun="project"
        onClose={() => setModal(null)}
        onRename={(name) => {
          edit((q) => { q.name = name.trim() || PARAMETRIC_DEFAULTS.name; }, true);
          setModal(null);
        }}
      />
      {toast && <div className="toast" role="status">{toast}</div>}
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
    </div>
  );
}
