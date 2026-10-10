"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  autoFit, clone, computeModel, DEFAULTS, exportSVG, layerContent, layoutParts, MATERIALS, migrate,
  type CutStyle, type Params,
} from "@/lib/hinge";
import { useHistory } from "@/hooks/useHistory";
import { readStored, useAutosave } from "@/hooks/useAutosave";
import { PX_PER_MM, useCanvasView } from "@/hooks/useCanvasView";
import { fmtLen, type Units } from "./format";
import type { NumericKey } from "./fields";
import { MenuBar, type MenuEntry } from "./MenuBar";
import { ControlBar, type Product } from "./ControlBar";
import { ToolRail } from "./ToolRail";
import { Canvas } from "./Canvas";
import { rulerSvg } from "./Rulers";
import { PanelDock } from "./PanelDock";
import { StatusBar } from "./StatusBar";
import { Dialogs, type ModalState } from "./dialogs";

/** Saved settings over DEFAULTS. Migrating first keeps old projects on single-line cuts. */
function mergeParams(partial?: Partial<Params>): Params {
  const base = clone(DEFAULTS);
  if (!partial) return base;
  const saved = migrate({ ...partial } as Record<string, unknown>) as Partial<Params>;
  return Object.assign(base, saved, {
    layers: Object.assign(clone(DEFAULTS.layers), saved.layers || {}),
  });
}

function loadInitial() {
  const stored = readStored<Params>();
  const units: Units = stored?.units === "in" ? "in" : "mm";
  return { params: mergeParams(stored?.params), units };
}

function baseName(p: Params) {
  const d = p.shape === "cyl" ? `cyl${Math.round(p.dia)}` : `${Math.round(p.W)}x${p.shape === "poly" ? p.sides + "gon" : Math.round(p.D)}`;
  return `hingebox-${d}x${Math.round(p.H)}-${p.T}mm`;
}

function shapeKind(p: Params) {
  return ({ rect: "Rounded box", pill: "Pill box", poly: `${p.sides}-sided box`, cyl: "Cylinder" })[p.shape];
}

export default function EditorApp({ onProduct }: { onProduct: (p: Product) => void }) {
  const boot = useState(loadInitial)[0];
  const history = useHistory(boot.params);
  const { params, replace, undo, redo, canUndo, canRedo } = history;
  const [units, setUnits] = useState<Units>(boot.units);
  const [tool, setTool] = useState<"hand" | "zoom">("hand");
  const [spaceDown, setSpaceDown] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [explode, setExplode] = useState(0.35);
  const [cursor, setCursor] = useState({ x: "—", y: "—" });
  const [saved, setSaved] = useState("Autosaved locally");
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toastT = useRef<number>(0);
  const onStatus = useCallback((s: string) => setSaved(s), []);
  useAutosave(params, units, onStatus);

  const result = useMemo(() => computeModel(params), [params]);
  const model = "error" in result ? null : result;
  const error = "error" in result ? result.error : null;
  const lay = useMemo(
    () => (model ? layoutParts(model.parts, params.bedW, params.gap) : null),
    [model, params.bedW, params.gap],
  );
  const content = useMemo(() => (model && lay ? layerContent(model, lay, params) : null), [model, lay, params]);

  const viewApi = useCanvasView();
  viewApi.fitArgs.current = {
    bedW: params.bedW,
    bedH: params.bedH,
    layW: lay?.width ?? 0,
    layH: lay?.height ?? 0,
  };

  const meta = useRef({ title: "", kind: "", dims: "", pat: "" });
  if (model) {
    meta.current = {
      title: params.name,
      kind: shapeKind(params),
      dims: params.shape === "cyl"
        ? `Ø${fmtLen(params.dia, units)} × ${fmtLen(params.H, units)}`
        : `${fmtLen(params.W, units)} × ${params.shape === "poly" ? params.sides + " sides" : fmtLen(params.D, units)} × ${fmtLen(params.H, units)}`,
      pat: `${model.analysis.columns} slits`,
    };
  }

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
    const m = computeModel(next);
    const packed = "error" in m ? null : layoutParts(m.parts, next.bedW, next.gap);
    viewApi.fitArgs.current = { bedW: next.bedW, bedH: next.bedH, layW: packed?.width ?? 0, layH: packed?.height ?? 0 };
    viewApi.fit();
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
    patch(next, true);
  }

  function exportNow() {
    if (!model || !lay) { toastMsg("Fix the settings before exporting"); return; }
    offerFile(baseName(params) + ".svg", exportSVG(model, lay, params), "image/svg+xml");
  }

  function copySVG() {
    if (!model || !lay) return;
    const svg = exportSVG(model, lay, params);
    const name = baseName(params) + ".svg";
    try {
      navigator.clipboard.writeText(svg).then(() => toastMsg("SVG copied to clipboard"), () => setModal({ type: "code", name, data: svg }));
    } catch {
      setModal({ type: "code", name, data: svg });
    }
  }

  function saveProject() {
    offerFile(baseName(params) + ".hingelab.json", JSON.stringify({ app: "HingeLab", version: 1, params }, null, 2), "application/json");
  }

  function openProject() {
    if (fileRef.current) { fileRef.current.value = ""; fileRef.current.click(); }
  }

  function newProject() {
    const next = clone(DEFAULTS);
    patch(next, true);
    applyFit(next);
    toastMsg("New box");
  }

  function resetPattern() {
    patch({ ...params, pattern: DEFAULTS.pattern, slit: DEFAULTS.slit, bridge: DEFAULTS.bridge, pitch: DEFAULTS.pitch, overrun: DEFAULTS.overrun, stretch: DEFAULTS.stretch, cutStyle: DEFAULTS.cutStyle, slotW: DEFAULTS.slotW }, true);
  }

  function runAutoFit() {
    if (!model) { toastMsg("Fix the settings first"); return; }
    const res = autoFit(params, model.hBody, model.rN);
    const next: Params = { ...params, pitch: res.q.pitch, bridge: res.q.bridge };
    if (next.pattern !== "serpentine") next.slit = res.q.slit;
    patch(next, true);
    toastMsg(res.ok
      ? `Fitted: spacing ${fmtLen(next.pitch, units, true)}, bridge ${fmtLen(next.bridge, units, true)}${next.pattern !== "serpentine" ? `, slit ${fmtLen(next.slit, units, true)}` : ""}`
      : "No lattice reaches this radius safely. Try Serpentine or a larger corner radius.");
  }

  function doUndo() { if (undo()) toastMsg("Undo"); }
  function doRedo() { if (redo()) toastMsg("Redo"); }

  const api = useRef({ exportNow, saveProject, openProject, newProject, doUndo, doRedo, copySVG, fit: viewApi.fit, zoomCenter: viewApi.zoomCenter, viewRef: viewApi.viewRef });
  api.current = { exportNow, saveProject, openProject, newProject, doUndo, doRedo, copySVG, fit: viewApi.fit, zoomCenter: viewApi.zoomCenter, viewRef: viewApi.viewRef };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const inField = !!document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "Escape") setModal(null);
      if (mod) {
        const k = e.key.toLowerCase();
        const va = api.current;
        if (k === "z" && !inField) { e.preventDefault(); e.shiftKey ? va.doRedo() : va.doUndo(); }
        else if (k === "s") { e.preventDefault(); va.saveProject(); }
        else if (k === "o") { e.preventDefault(); va.openProject(); }
        else if (k === "e") { e.preventDefault(); va.exportNow(); }
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
      { label: "Open project…", kbd: "Ctrl+O", run: openProject },
      { label: "Save project", kbd: "Ctrl+S", run: saveProject },
      "-",
      { label: "Export SVG…", kbd: "Ctrl+E", run: exportNow },
      { label: "Copy SVG code", kbd: "", run: copySVG },
      "-",
      { label: "Rename box…", kbd: "", run: () => setModal({ type: "rename", name: params.name }) },
    ],
    edit: [
      { label: "Undo", kbd: "Ctrl+Z", run: doUndo, disabled: !canUndo },
      { label: "Redo", kbd: "Ctrl+Shift+Z", run: doRedo, disabled: !canRedo },
      "-",
      { label: "Reset hinge pattern", kbd: "", run: resetPattern },
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
      { label: "Living hinge guide", kbd: "", run: () => setModal({ type: "guide" }) },
      { label: "Keyboard shortcuts", kbd: "", run: () => setModal({ type: "keys" }) },
    ],
  };

  const fits = !!lay && lay.width <= params.bedW + 1e-6 && lay.height <= params.bedH + 1e-6;
  const longStrip = !!model && model.parts.some((pt) => pt.kind === "wall" && pt.w + 10 > params.bedW);
  const fit = !model
    ? { cls: "s-err" as const, text: "Fix the highlighted setting" }
    : fits
      ? { cls: "s-ok" as const, text: "Fits the bed" }
      : { cls: "s-warn" as const, text: `Larger than the bed${longStrip && params.split === 1 ? " — try Two halves under Joints" : ""}` };

  const zoom = Math.round(viewApi.view.z / PX_PER_MM * 100) + "%";

  return (
    <div className="app">
      <MenuBar title={meta.current.title} kind={meta.current.kind} menus={menus} onExport={exportNow} />
      <ControlBar params={params} onShape={(v) => setChoice("shape", v)} onLid={(v) => setChoice("lid", v)} onPattern={(v) => setChoice("pattern", v)} onProduct={onProduct} />
      <div className="main">
        <ToolRail
          tool={tool}
          showGrid={showGrid}
          onTool={setTool}
          onFit={() => viewApi.fit()}
          onGrid={() => setShowGrid((g) => !g)}
          onSave={saveProject}
          onOpen={openProject}
        />
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
            content={content}
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
          />
        </section>
        <PanelDock
          params={params}
          model={model}
          error={error}
          units={units}
          explode={explode}
          dimsMeta={meta.current.dims}
          patMeta={meta.current.pat}
          onLive={(id, v, mat) => setField(id, v, mat, false)}
          onCommit={(id, v, mat) => setField(id, v, mat, true)}
          onMaterial={(id) => {
            const m = MATERIALS[id];
            const next: Params = { ...params, material: id };
            if (m && m.T != null && m.K != null) { next.T = m.T; next.K = m.K; }
            patch(next, true);
          }}
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
          onExplode={setExplode}
        />
      </div>
      <StatusBar
        x={cursor.x}
        y={cursor.y}
        zoom={zoom}
        parts={model && lay ? { count: model.parts.length, used: `${fmtLen(lay.width, units, true)} × ${fmtLen(lay.height, units, true)}` } : null}
        fit={fit}
        saved={saved}
        units={units}
        onUnits={setUnits}
      />
      <Dialogs
        modal={modal}
        onClose={() => setModal(null)}
        onRename={(name) => {
          patch({ ...params, name: name.trim() || "Untitled box" }, true);
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
              const j = JSON.parse(String(rd.result)) as { product?: string; params?: Partial<Params> };
              if (j.product === "letters") { toastMsg("That is a Letters project. Switch to Letters to open it."); return; }
              if (!j.params) throw new Error("missing params");
              const next = mergeParams(j.params);
              patch(next, true);
              applyFit(next);
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
