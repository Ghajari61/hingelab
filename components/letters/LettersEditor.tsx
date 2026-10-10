"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { autoFit, clone, MATERIALS } from "@/lib/hinge";
import {
  baseOffset, computeLetterModel, exportLetterSVG, fontFamilyName, hingeParamsOf, LETTER_DEFAULTS, layoutLetters,
  letterLayerContent, loadFont, wallHeightOf, zoneOverlay,
  type HarfBuzz, type LetterParams, type LoadedFont,
} from "@/lib/letters";
import { useHistory } from "@/hooks/useHistory";
import { readStored, readUnits, useAutosave } from "@/hooks/useAutosave";
import { useCloudAutosave, type CloudDoc } from "@/hooks/useCloudAutosave";
import { thumbnailSVG } from "@/lib/projects/thumbnail";
import { importIntoCloud, openNewCloudProject } from "@/components/editor/cloud";
import { PX_PER_MM, useCanvasView } from "@/hooks/useCanvasView";
import { fmtLen, type Units } from "@/components/editor/format";
import { MenuBar, type MenuEntry } from "@/components/editor/MenuBar";
import type { Product } from "@/components/editor/ControlBar";
import { ToolRail } from "@/components/editor/ToolRail";
import { Canvas } from "@/components/editor/Canvas";
import { rulerSvg } from "@/components/editor/Rulers";
import { StatusBar } from "@/components/editor/StatusBar";
import { Dialogs, type ModalState } from "@/components/editor/dialogs";
import { LettersControlBar } from "./LettersControlBar";
import { LettersDock } from "./LettersDock";
import type { LetterNumKey } from "./fields";
import { deleteStoredFont, listStoredFonts, putStoredFont, type StoredFontMeta } from "./fontStore";
import { forgetFont, getLoadedFont, loadHarfBuzz, UPLOAD_PREFIX } from "./runtime";

const KEY = "hingelab-letters-v2";
/** Saved before Letter Box: its hinge settings were never chosen in Letters, so the letter defaults replace them. */
const KEY_V1 = "hingelab-letters-v1";
const MAX_FONT_BYTES = 20 * 1024 * 1024;

const PRE_BOX_KEYS = ["slit", "bridge", "pitch", "overrun", "stretch", "pattern", "cutStyle", "slotW", "tabW", "slotClr", "lidGap", "lid", "wallStyle"] as const;

/** Saved settings over the defaults. */
function mergeParams(partial?: Partial<LetterParams>): LetterParams {
  const base = clone(LETTER_DEFAULTS);
  if (!partial) return base;
  return Object.assign(base, partial, {
    layers: Object.assign(clone(LETTER_DEFAULTS.layers), partial.layers || {}),
    marquee: Object.assign(clone(LETTER_DEFAULTS.marquee), partial.marquee || {}),
  });
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
  return { params: mergeParams(stored?.params), units };
}

function baseName(p: LetterParams) {
  const slug = p.text.trim().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]/gu, "").slice(0, 24) || "text";
  return `letters-${slug}-${p.mode}-${Math.round(p.size)}mm`;
}

export default function LettersEditor({ onProduct, cloud = null }: { onProduct: (p: Product) => void; cloud?: CloudDoc | null }) {
  const boot = useState(() => loadInitial(cloud))[0];
  const { params, replace, undo, redo, canUndo, canRedo } = useHistory(boot.params);
  const [units, setUnits] = useState<Units>(boot.units);
  const [tool, setTool] = useState<"hand" | "zoom">("hand");
  const [spaceDown, setSpaceDown] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [cursor, setCursor] = useState({ x: "—", y: "—" });
  const [saved, setSaved] = useState(cloud ? "Saved to cloud" : "Autosaved locally");
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [uploads, setUploads] = useState<StoredFontMeta[]>([]);
  const [hb, setHb] = useState<HarfBuzz | null>(null);
  const [font, setFont] = useState<LoadedFont | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toastT = useRef<number>(0);
  const onStatus = useCallback((s: string) => setSaved(s), []);
  useAutosave(params, units, onStatus, KEY, !cloud);
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
  const result = useMemo(() => (ready ? computeLetterModel(deferred, font!, hb!) : null), [ready, deferred, font, hb]);
  const model = result && !("error" in result) ? result : null;
  const error = loadError ?? (result && "error" in result ? result.error : null);
  const lay = useMemo(() => (model ? layoutLetters(model, deferred) : null), [model, deferred]);
  const content = useMemo(() => (lay ? letterLayerContent(lay, deferred) : null), [lay, deferred]);
  thumbSrc.current = { content, w: lay?.width ?? 0, h: lay?.height ?? 0 };
  const overlay = useMemo(
    () => (showZones && model?.box && lay ? zoneOverlay(model.box, (letter) => baseOffset(lay, letter)) : null),
    [showZones, model, lay],
  );
  const hingeWalls = deferred.mode === "box" && deferred.wallStyle === "hinge";

  const viewApi = useCanvasView();
  viewApi.fitArgs.current = { bedW: params.bedW, bedH: params.bedH, layW: lay?.width ?? 0, layH: lay?.height ?? 0 };

  function patch(partial: Partial<LetterParams>, record: boolean) {
    replace({ ...params, ...partial }, record);
  }

  function setField(id: LetterNumKey, v: number, mat: boolean, record: boolean) {
    const next: LetterParams = { ...params, [id]: v };
    if (mat && next.material !== "custom") next.material = "custom";
    replace(next, record);
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

  const svgNow = () => (model && lay ? exportLetterSVG(lay, deferred, font?.name) : null);

  function exportNow() {
    const svg = svgNow();
    if (!svg) { toastMsg(error ? "Fix the settings before exporting" : "Still loading the font"); return; }
    offerFile(baseName(params) + ".svg", svg, "image/svg+xml");
  }

  function copySVG() {
    const svg = svgNow();
    if (!svg) return;
    const name = baseName(params) + ".svg";
    try {
      navigator.clipboard.writeText(svg).then(() => toastMsg("SVG copied to clipboard"), () => setModal({ type: "code", name, data: svg }));
    } catch {
      setModal({ type: "code", name, data: svg });
    }
  }

  function saveProject() {
    offerFile(baseName(params) + ".hingelab.json", JSON.stringify({ app: "HingeLab", product: "letters", version: 1, params }, null, 2), "application/json");
  }

  function openProject() {
    if (fileRef.current) { fileRef.current.value = ""; fileRef.current.click(); }
  }

  function newProject() {
    if (cloud) {
      toastMsg("Creating new letters…");
      void openNewCloudProject("letters").then((err) => { if (err) toastMsg(err); });
      return;
    }
    patch(clone(LETTER_DEFAULTS), true);
    window.setTimeout(() => viewApi.fit(), 50);
    toastMsg("New letters");
  }

  async function uploadFont(file: File) {
    if (!/\.(ttf|otf)$/i.test(file.name)) { toastMsg("Use a .ttf or .otf font file"); return; }
    if (file.size > MAX_FONT_BYTES) { toastMsg("That font file is larger than 20 MB"); return; }
    if (!hb) { toastMsg("Still loading, try again in a moment"); return; }
    try {
      const bytes = await file.arrayBuffer();
      const id = UPLOAD_PREFIX + crypto.randomUUID();
      const probe = loadFont(hb, id, file.name, bytes.slice(0));
      const name = fontFamilyName(probe) || file.name.replace(/\.(ttf|otf)$/i, "");
      await putStoredFont({ id, name, fileName: file.name, added: Date.now(), bytes });
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

  function doUndo() { if (undo()) toastMsg("Undo"); }
  function doRedo() { if (redo()) toastMsg("Redo"); }

  const api = useRef({ exportNow, saveProject, openProject, newProject, doUndo, doRedo, fit: viewApi.fit, zoomCenter: viewApi.zoomCenter, viewRef: viewApi.viewRef });
  api.current = { exportNow, saveProject, openProject, newProject, doUndo, doRedo, fit: viewApi.fit, zoomCenter: viewApi.zoomCenter, viewRef: viewApi.viewRef };

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

  // Fit the sheet once the first layout exists.
  const fittedOnce = useRef(false);
  const fitView = viewApi.fit;
  useEffect(() => {
    if (lay && !fittedOnce.current) fittedOnce.current = fitView();
  }, [lay, fitView]);

  const menus: Record<"file" | "edit" | "view" | "help", MenuEntry[]> = {
    file: [
      { label: "New letters", kbd: "Ctrl+N", run: newProject },
      { label: "Open project…", kbd: "Ctrl+O", run: openProject },
      { label: "Save project", kbd: "Ctrl+S", run: saveProject },
      "-",
      { label: "Export SVG…", kbd: "Ctrl+E", run: exportNow },
      { label: "Copy SVG code", kbd: "", run: copySVG },
      "-",
      { label: "Rename…", kbd: "", run: () => setModal({ type: "rename", name: params.name }) },
    ],
    edit: [
      { label: "Undo", kbd: "Ctrl+Z", run: doUndo, disabled: !canUndo },
      { label: "Redo", kbd: "Ctrl+Shift+Z", run: doRedo, disabled: !canRedo },
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
      { label: "Keyboard shortcuts", kbd: "", run: () => setModal({ type: "keys" }) },
    ],
  };

  const fits = !!lay && lay.width <= params.bedW + 1e-6 && lay.height <= params.bedH + 1e-6;
  const fit = error
    ? { cls: "s-err" as const, text: "Fix the highlighted setting" }
    : !model
      ? { cls: "s-ok" as const, text: "Loading font" }
      : fits
        ? { cls: "s-ok" as const, text: "Fits the bed" }
        : { cls: "s-warn" as const, text: "Larger than the bed — lower the size or use a bigger bed" };
  const zoom = Math.round(viewApi.view.z / PX_PER_MM * 100) + "%";
  const sizeLabel = `${params.sizeMode === "capHeight" ? "cap" : "total"} ${fmtLen(params.size, units)}`;

  return (
    <div className="app">
      <MenuBar title={params.name} kind={`Letters · ${font?.name ?? "…"} · ${sizeLabel}`} menus={menus} onExport={exportNow} />
      <LettersControlBar
        mode={params.mode}
        wallStyle={params.wallStyle}
        lid={params.lid}
        onMode={(m) => patch({ mode: m }, true)}
        onWallStyle={(w) => patch({ wallStyle: w }, true)}
        onLid={(l) => patch({ lid: l }, true)}
        onProduct={onProduct}
      />
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
          />
        </section>
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
          onMaterial={(id) => {
            const m = MATERIALS[id];
            const next: Partial<LetterParams> = { material: id };
            if (m && m.T != null && m.K != null) { next.T = m.T; next.K = m.K; }
            patch(next, true);
          }}
          onPick={(id) => patch({ fontId: id }, true)}
          onUpload={uploadFont}
          onDeleteFont={removeFont}
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
        noun="project"
        onClose={() => setModal(null)}
        onRename={(name) => {
          patch({ name: name.trim() || LETTER_DEFAULTS.name }, true);
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
            if (cloud) {
              toastMsg(`Opening ${f.name}…`);
              void importIntoCloud(String(rd.result)).then((err) => { if (err) toastMsg(err); });
              return;
            }
            try {
              const j = JSON.parse(String(rd.result)) as { product?: string; params?: Partial<LetterParams> };
              if (j.product !== "letters" || !j.params) {
                toastMsg(j.params ? "That is a Hinge Box project. Switch to Hinge Box to open it." : "That file is not a HingeLab project");
                return;
              }
              patch(mergeParams(j.params), true);
              window.setTimeout(() => viewApi.fit(), 50);
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
