"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  autoFit, clone, DEFAULTS, exportSVG, layerContent, MATERIALS, mergeParams,
  type CutStyle, type Params,
} from "@/lib/hinge";
import { arrangeHinge } from "@/lib/fit/products";
import { autoFixAll, type Fix } from "@/lib/issues";
import { hingeIssues } from "@/lib/issues/hinge";
import { IssueList } from "@/components/shell/IssueList";
import { cleanFit } from "@/lib/fit/fitToSheets";
import { fitSummary } from "@/components/shell/SheetSection";
import { useHistory } from "@/hooks/useHistory";
import { readStored, readUnits, useAutosave } from "@/hooks/useAutosave";
import { useCloudAutosave, type CloudDoc } from "@/hooks/useCloudAutosave";
import { thumbnailSVG } from "@/lib/projects/thumbnail";
import { hingeLocks } from "@/lib/plans";
import { usePlan } from "@/components/billing/usePlan";
import { UpgradeDialog } from "@/components/billing/UpgradeDialog";
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
import { hingePresetParams } from "@/lib/hinge/presets";
import { useMyPresets } from "@/components/shell/useMyPresets";
import { Canvas } from "./Canvas";
import { rulerSvg } from "./Rulers";
import { PanelDock } from "./PanelDock";
import { StatusBar } from "./StatusBar";
import { Dialogs, type ModalState } from "./dialogs";

const HingeView3D = dynamic(() => import("./HingeView3D"), {
  ssr: false,
  loading: () => <div id="preview3d" className="p3d v3d" />,
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

function shapeKind(p: Params) {
  return ({ rect: "Rounded box", pill: "Pill box", poly: `${p.sides}-sided box`, cyl: "Cylinder" })[p.shape];
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
  const [toast, setToast] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState<string | null>(null);
  const account = usePlan();
  const myPresets = useMyPresets();
  const locks = hingeLocks(account.plan, params);
  const fileRef = useRef<HTMLInputElement>(null);
  const toastT = useRef<number>(0);
  const onStatus = useCallback((s: string) => setSaved(s), []);

  const arranged = useMemo(() => arrangeHinge(params), [params]);
  const result = arranged.result;
  /** The settings actually built: the design, shrunk when Fit is on. */
  const built = arranged.params;
  const model = "error" in result ? null : result;
  const error = "error" in result ? result.error : null;
  const lay = model ? arranged.lay : null;
  const content = useMemo(() => (model && lay ? layerContent(model, lay, built) : null), [model, lay, built]);
  const fitSet = cleanFit(params.fit);
  const checked = useDeferredValue(params);
  const issues = useMemo(() => hingeIssues(checked), [checked]);

  useAutosave(params, units, onStatus, undefined, !cloud);
  useCloudAutosave(cloud, params, () => (content && lay ? thumbnailSVG(content, lay.width, lay.height) : null), onStatus);

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
    const a = arrangeHinge(next);
    viewApi.fitArgs.current = { bedW: next.bedW, bedH: next.bedH, layW: a.lay?.width ?? 0, layH: a.lay?.height ?? 0 };
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
   * The file to export. With accounts the server builds it, so the plan (and the Free mark) is
   * applied where it can't be bypassed. Without accounts everything is open and it is built here.
   */
  async function exportedSVG(): Promise<string | null> {
    if (!model || !lay) { toastMsg("Fix the settings before exporting"); return null; }
    if (locks.length) { setUpgrade(lockedReason()); return null; }
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

  async function exportNow() {
    const svg = await exportedSVG();
    if (!svg) return;
    offerFile(baseName(built) + ".svg", svg, "image/svg+xml");
    if (svg.includes('id="watermark"')) toastMsg("Exported with the small “Made with HingeLab” mark (Free plan)");
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
    offerFile(baseName(params) + ".hingelab.json", JSON.stringify({ app: "HingeLab", version: 1, params }, null, 2), "application/json");
  }

  function openProject() {
    if (fileRef.current) { fileRef.current.value = ""; fileRef.current.click(); }
  }

  function newProject() {
    if (cloud) {
      toastMsg("Creating a new box…");
      void openNewCloudProject("hinge-box").then((err) => { if (err) toastMsg(err); });
      return;
    }
    const next = clone(DEFAULTS);
    patch(next, true);
    applyFit(next);
    toastMsg("New box");
  }

  function resetPattern() {
    patch({ ...params, pattern: DEFAULTS.pattern, slit: DEFAULTS.slit, bridge: DEFAULTS.bridge, pitch: DEFAULTS.pitch, overrun: DEFAULTS.overrun, stretch: DEFAULTS.stretch, cutStyle: DEFAULTS.cutStyle, slotW: DEFAULTS.slotW }, true);
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
    const next: Params = { ...params, pitch: res.q.pitch, bridge: res.q.bridge };
    if (next.pattern !== "serpentine") next.slit = res.q.slit;
    patch(next, true);
    toastMsg(res.ok
      ? `Fitted: spacing ${fmtLen(next.pitch, units, true)}, bridge ${fmtLen(next.bridge, units, true)}${next.pattern !== "serpentine" ? `, slit ${fmtLen(next.slit, units, true)}` : ""}`
      : "No lattice reaches this radius safely. Try Serpentine or a larger corner radius.");
  }

  function resetSection(title: string, keys: (keyof Params)[]) {
    const next = { ...params };
    const def = clone(DEFAULTS);
    for (const k of keys) (next as Record<keyof Params, unknown>)[k] = def[k];
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
    const next = hingePresetParams(start.params as Partial<Params>);
    patch(next, true);
    applyFit(next);
    toastMsg(`Started from “${start.name}”. Ctrl+Z returns to your last design.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function doUndo() { if (undo()) toastMsg("Undo"); }
  function doRedo() { if (redo()) toastMsg("Redo"); }

  const api = useRef({ exportNow, saveProject, openProject, newProject, doUndo, doRedo, copySVG, fit: viewApi.fit, zoomCenter: viewApi.zoomCenter, viewRef: viewApi.viewRef });
  api.current = { exportNow, saveProject, openProject, newProject, doUndo, doRedo, copySVG, fit: viewApi.fit, zoomCenter: viewApi.zoomCenter, viewRef: viewApi.viewRef };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const inField = !!document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "Escape") { setModal(null); setUpgrade(null); }
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
      { label: "Start page", kbd: "", run: onHome },
      { label: "Open project…", kbd: "Ctrl+O", run: openProject },
      { label: "Save project", kbd: "Ctrl+S", run: saveProject },
      { label: "Save as my preset…", kbd: "", run: () => setModal({ type: "preset", name: params.name }) },
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
  const fittedSize = built.shape === "cyl"
    ? `Ø${fmtLen(built.dia, units)} × ${fmtLen(built.H, units)}`
    : `${fmtLen(built.W, units)} × ${built.shape === "poly" ? built.sides + " sides" : fmtLen(built.D, units)} × ${fmtLen(built.H, units)}`;
  const sheetProps = {
    info: fitInfo,
    size: fittedSize,
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
    <div className="app">
      <MenuBar
        title={meta.current.title} kind={meta.current.kind} menus={menus} product="hinge" onProduct={onProduct}
        onSave={saveProject} onOpen={openProject}
      />
      <div className="main">
        <GalleryRail
          title={PRODUCT_INFO.hinge.name} icon={PRODUCT_INFO.hinge.icon}
          groups={hingeGroups({ params, plan: account.plan, onShape: (v) => setChoice("shape", v), onLid: (v) => setChoice("lid", v), onPattern: (v) => setChoice("pattern", v), onVariant: (v) => { patch({ ...params, ...v.params }, true); toastMsg(`${v.name} hinge style`); } })}
          history={{ canUndo, canRedo, undo: doUndo, redo: doRedo }}
        />
        <div className="stage">
        <ViewToggle value={viewMode} onChange={setViewMode} />
        <div className="stage-3d" hidden={viewMode !== "3d"}>
          {seen3d && <HingeView3D model={model} params={built} lay={lay} content={content} />}
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
            sheets={arranged.sheets}
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
            tools={<ViewTools tool={tool} showGrid={showGrid} onTool={setTool} onGrid={() => setShowGrid((g) => !g)} />}
          />
        </section>
        </div>
        <DockColumn onExport={exportNow} exportLabel="Export SVG" units={units} onUnits={setUnits} onResetAll={resetAll}>
        <PanelDock
          params={params}
          model={model}
          error={error}
          units={units}
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
          onResetSection={resetSection}
          sheet={sheetProps}
          checks={<IssueList issues={issues} onFix={applyIssueFix} onAutoFix={autoFixEverything} />}
        />
        </DockColumn>
      </div>
      <StatusBar
        x={cursor.x}
        y={cursor.y}
        zoom={zoom}
        parts={model && lay ? { count: model.parts.length, used: `${fmtLen(lay.width, units, true)} × ${fmtLen(lay.height, units, true)}` } : null}
        fit={fit}
        saved={saved}
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
      {upgrade && <UpgradeDialog reason={upgrade} signedIn={account.signedIn} onClose={() => setUpgrade(null)} />}
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
            if (cloud) {
              toastMsg(`Opening ${f.name}…`);
              void importIntoCloud(String(rd.result)).then((err) => { if (err) toastMsg(err); });
              return;
            }
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
