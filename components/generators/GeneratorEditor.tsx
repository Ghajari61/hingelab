"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { MATERIALS, type LayerKey } from "@/lib/hinge";
import type { HarfBuzz, LoadedFont } from "@/lib/letters/fonts";
import { useHistory } from "@/hooks/useHistory";
import { readStored, useAutosave } from "@/hooks/useAutosave";
import { PX_PER_MM, useCanvasView } from "@/hooks/useCanvasView";
import { fmtLen, type Units } from "@/components/editor/format";
import { MenuBar, type MenuEntry } from "@/components/editor/MenuBar";
import { PRODUCT_INFO, type Opt, type Product } from "@/components/editor/ControlBar";
import { GalleryRail, type GalleryGroup } from "@/components/shell/GalleryRail";
import { ViewToggle, type ViewMode } from "@/components/shell/ViewToggle";
import { ViewTools } from "@/components/shell/ViewTools";
import { DockColumn } from "@/components/shell/DockColumn";
import { fitSummary } from "@/components/shell/SheetSection";
import { IssueList } from "@/components/shell/IssueList";
import { useMyPresets } from "@/components/shell/useMyPresets";
import { Canvas } from "@/components/editor/Canvas";
import { rulerSvg } from "@/components/editor/Rulers";
import { StatusBar } from "@/components/editor/StatusBar";
import { Dialogs, type ModalState } from "@/components/editor/dialogs";
import { HelpContext, useHelpPanel } from "@/components/help/HelpContext";
import { usePlan } from "@/components/billing/usePlan";
import { UpgradeDialog } from "@/components/billing/UpgradeDialog";
import { getLoadedFont, loadHarfBuzz } from "@/components/letters/runtime";
import { cleanFit, type FitSettings } from "@/lib/fit/fitToSheets";
import { usedArea, usedText } from "@/lib/fit/arrange";
import { autoFixAll, type Fix, type Issue } from "@/lib/issues";
import type { Preset } from "@/lib/presets";
import { generatorHelpMap } from "@/lib/generators/helpMap";
import { GENERATOR_INFO, type GeneratorId } from "@/lib/generators/ids";
import { arrangeGenerator, genContent, genSVG, sheetIssues } from "@/lib/generators/output";
import { getPath, setPath } from "@/lib/generators/path";
import { loadGenerator } from "@/lib/generators/registry";
import { makeTextFn } from "@/lib/generators/text";
import type { AnyGenerator, BuildContext, ChoiceSpec, GenBase, GenPreset } from "@/lib/generators/types";
import { GeneratorDock } from "./GeneratorDock";
import "./generators.css";

const GeneratorView3D = dynamic(() => import("./GeneratorView3D"), {
  ssr: false,
  loading: () => <div id="preview3d" className="p3d" />,
});

type P = GenBase & Record<string, unknown>;
type StartPreset = Preset<Record<string, unknown>>;

/** Loads the generator's code, then opens the editor on it. */
export default function GeneratorEditor({ id, ...rest }: {
  id: GeneratorId;
  onProduct: (p: Product) => void;
  onHome: () => void;
  start?: StartPreset;
}) {
  const [def, setDef] = useState<AnyGenerator | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    loadGenerator[id]().then((d) => { if (live) setDef(d); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [id]);
  if (!def) return <div className="boot">{failed ? "This generator could not load. Reload the page to try again." : `Loading ${GENERATOR_INFO[id].name}…`}</div>;
  return <GenEditor def={def} {...rest} />;
}

function ArtIcon({ paths }: { paths: { d: string; fill?: boolean }[] }) {
  return (
    <svg width="64" height="44" viewBox="0 0 64 44" aria-hidden>
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.fill ? "var(--card-fill)" : "none"} fillRule="evenodd" stroke="currentColor" strokeWidth={p.fill ? 1.2 : 1.1} strokeLinejoin="round" />
      ))}
    </svg>
  );
}

function GenEditor({ def, onProduct, onHome, start }: {
  def: AnyGenerator;
  onProduct: (p: Product) => void;
  onHome: () => void;
  start?: StartPreset;
}) {
  const info = GENERATOR_INFO[def.id];
  const KEY = info.storageKey;
  const defaults = useMemo(() => def.defaults() as P, [def]);
  const boot = useState(() => {
    const stored = readStored<P>(KEY);
    const from = typeof stored?.v === "number" ? stored.v : 1;
    return { params: def.merge(def.migrate && stored?.params ? def.migrate(stored.params, from) : stored?.params) as P, units: (stored?.units === "in" ? "in" : "mm") as Units };
  })[0];
  const { params, replace, undo, redo, canUndo, canRedo } = useHistory<P>(boot.params);
  const [units, setUnits] = useState<Units>(boot.units);
  const [tool, setTool] = useState<"hand" | "zoom">("hand");
  const [spaceDown, setSpaceDown] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("sheets");
  const [seen3d, setSeen3d] = useState(false);
  if (viewMode === "3d" && !seen3d) setSeen3d(true);
  const [cursor, setCursor] = useState({ x: "—", y: "—" });
  const [saved, setSaved] = useState("Autosaved locally");
  const [modal, setModal] = useState<ModalState>(null);
  const helpMap = useMemo(() => generatorHelpMap(def), [def]);
  const help = useHelpPanel(helpMap);
  const myPresets = useMyPresets();
  const account = usePlan();
  const [upgrade, setUpgrade] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastT = useRef<number>(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const onStatus = useCallback((s: string) => setSaved(s), []);
  useAutosave(params, units, onStatus, KEY, true, def.version);

  function toastMsg(msg: string) {
    setToast(msg);
    window.clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setToast(null), 2600);
  }

  // Typing and scrubbing stay responsive; the geometry follows a moment later.
  const deferred = useDeferredValue(params);

  // Fonts (numerals, labels) load only when the design asks for them.
  const fontKey = (def.fonts?.(deferred) ?? []).join("|");
  const [hb, setHb] = useState<HarfBuzz | null>(null);
  const [fonts, setFonts] = useState<Record<string, LoadedFont>>({});
  const [fontError, setFontError] = useState<string | null>(null);
  useEffect(() => {
    if (!fontKey || hb) return;
    loadHarfBuzz().then(setHb, () => setFontError("The text shaper could not load. Reload the page to try again."));
  }, [fontKey, hb]);
  useEffect(() => {
    if (!hb || !fontKey) return;
    let live = true;
    for (const fid of fontKey.split("|")) {
      if (fonts[fid]) continue;
      getLoadedFont(hb, fid).then(
        (f) => { if (live) setFonts((m) => ({ ...m, [fid]: f })); },
        (e: Error) => { if (live) setFontError(e.message); },
      );
    }
    return () => { live = false; };
  }, [hb, fontKey, fonts]);
  const ctx = useMemo<BuildContext>(() => (hb ? { text: makeTextFn(hb, (fid) => fonts[fid] ?? null) } : {}), [hb, fonts]);

  const arranged = useMemo(() => arrangeGenerator(def, deferred, ctx), [def, deferred, ctx]);
  const model = "error" in arranged.result ? null : arranged.result;
  const out = model?.out ?? null;
  const built = arranged.params as P;
  const error = fontError ?? ("error" in arranged.result ? arranged.result.error : null);
  const lay = model ? arranged.lay : null;
  const content = useMemo(() => (lay ? genContent(lay) : null), [lay]);
  const lock = out && def.pro ? def.pro(built, out) : null;
  const locked = !!lock && account.plan !== "pro";
  const issues = useMemo<Issue<P>[]>(
    () => (out ? [
      ...def.check(deferred, out),
      ...sheetIssues(def, deferred, arranged),
      ...(locked && lock ? [{ code: "NEEDS_PRO", level: "info" as const, message: `${lock} You can design it freely; exporting needs Pro.`, fixes: [] }] : []),
    ] : []),
    [def, deferred, out, arranged, locked, lock],
  );
  const layerKeys = useMemo<LayerKey[]>(() => {
    const k: LayerKey[] = ["outline"];
    if (content?.slots.length) k.push("slots");
    if (content?.hinge.length) k.push("hinge");
    if (content?.engrave.length || content?.images.length) k.push("labels");
    return k;
  }, [content]);

  const viewApi = useCanvasView();
  viewApi.fitArgs.current = { bedW: params.bedW, bedH: params.bedH, layW: lay?.width ?? 0, layH: lay?.height ?? 0 };

  function setField(key: string, value: unknown, record: boolean, mat?: boolean) {
    const next = setPath(params, key, value);
    if (mat && next.material !== "custom") next.material = "custom";
    replace(next, record);
  }

  function checkAll(q: P): Issue<P>[] {
    const a = arrangeGenerator(def, q, ctx);
    if ("error" in a.result) return [];
    return [...def.check(q, a.result.out), ...sheetIssues(def, q, a)];
  }

  function applyIssueFix(fix: Fix<P>) {
    replace(fix.apply(params), true);
    toastMsg(`${fix.label}. Ctrl+Z undoes it.`);
  }

  function autoFixEverything() {
    const res = autoFixAll(params, checkAll);
    if (!res.applied.length) { toastMsg("Nothing to fix automatically"); return; }
    replace(res.params, true);
    toastMsg(`Auto-fix: ${res.applied.join(", ")}. Ctrl+Z undoes it.`);
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

  async function exportedSVG(): Promise<string | null> {
    if (!lay || !out) { toastMsg(error ? "Fix the settings before exporting" : "Still loading"); return null; }
    if (out.notice) { toastMsg(out.notice); return null; }
    if (issues.some((i) => i.code === "MISSING_GLYPHS")) { toastMsg("Pick a font that has every character first"); return null; }
    if (!lock || !account.configured) return genSVG(def, built, lay);
    if (locked) { setUpgrade(lock); return null; }
    // A Pro design: the server checks the plan and builds it again.
    try {
      const res = await fetch("/api/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ product: def.id, params }) });
      if (res.ok) return await res.text();
      const err = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Export failed. Try again.";
      if (res.status === 403) setUpgrade(err);
      else toastMsg(err);
    } catch {
      toastMsg("Export failed. Check your connection and try again.");
    }
    return null;
  }

  async function exportNow() {
    const svg = await exportedSVG();
    if (svg) offerFile(def.fileName(built) + ".svg", svg, "image/svg+xml");
  }

  async function exportDXFNow() {
    const svg = await exportedSVG();
    if (!svg) return;
    const { svgToDXF } = await import("@/lib/export/dxf");
    const out = svgToDXF(svg);
    offerFile(def.fileName(built) + ".dxf", out.dxf, "application/dxf");
    if (out.skipped) window.setTimeout(() => toastMsg("Pictures cannot go into a DXF: engrave them from the SVG"), 1600);
  }

  async function copySVG() {
    const svg = await exportedSVG();
    if (!svg) return;
    const name = def.fileName(built) + ".svg";
    try {
      navigator.clipboard.writeText(svg).then(() => toastMsg("SVG copied to clipboard"), () => setModal({ type: "code", name, data: svg }));
    } catch {
      setModal({ type: "code", name, data: svg });
    }
  }

  function saveProject() {
    offerFile(def.fileName(params) + ".hingelab.json", JSON.stringify({ app: "HingeLab", product: def.id, version: def.version, params }, null, 2), "application/json");
  }

  function openProject() {
    if (fileRef.current) { fileRef.current.value = ""; fileRef.current.click(); }
  }

  function newProject() {
    replace(def.defaults() as P, true);
    window.setTimeout(() => viewApi.fit(), 50);
    toastMsg(`New ${def.name.toLowerCase()}`);
  }

  function resetSection(title: string, keys: string[]) {
    let next = params;
    for (const k of keys) next = setPath(next, k, structuredClone(getPath(defaults, k)));
    replace(next, true);
    toastMsg(`${title} reset. Ctrl+Z undoes it.`);
  }

  function resetAll() {
    replace({ ...(def.defaults() as P), name: params.name }, true);
    window.setTimeout(() => viewApi.fit(), 50);
    toastMsg("All settings reset. Ctrl+Z undoes it.");
  }

  function applyPreset(pr: GenPreset<unknown>) {
    replace(def.merge(pr.params) as P, true);
    window.setTimeout(() => viewApi.fit(), 50);
    toastMsg(`Preset “${pr.name}”. Ctrl+Z returns to your last design.`);
  }

  const started = useRef(false);
  useEffect(() => {
    if (!start || started.current) return;
    started.current = true;
    replace(def.merge(start.params) as P, true);
    window.setTimeout(() => viewApi.fit(), 50);
    toastMsg(`Started from “${start.name}”. Ctrl+Z returns to your last design.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const fittedOnce = useRef(false);
  const fitView = viewApi.fit;
  useEffect(() => {
    if (lay && !fittedOnce.current) fittedOnce.current = fitView();
  }, [lay, fitView]);

  const noun = def.name.toLowerCase();
  const menus: Record<"file" | "edit" | "view" | "help", MenuEntry[]> = {
    file: [
      { label: `New ${noun}`, kbd: "Ctrl+N", run: newProject },
      { label: "Start page", kbd: "", run: onHome },
      { label: "Open project…", kbd: "Ctrl+O", run: openProject },
      { label: "Save project", kbd: "Ctrl+S", run: saveProject },
      { label: "Save as my preset…", kbd: "", run: () => setModal({ type: "preset", name: params.name }) },
      "-",
      { label: "Export SVG…", kbd: "Ctrl+E", run: exportNow },
      { label: "Export DXF…", kbd: "", run: () => void exportDXFNow() },
      { label: "Copy SVG code", kbd: "", run: copySVG },
      "-",
      { label: "Rename…", kbd: "", run: () => setModal({ type: "rename", name: params.name }) },
    ],
    edit: [
      { label: "Undo", kbd: "Ctrl+Z", run: doUndo, disabled: !canUndo },
      { label: "Redo", kbd: "Ctrl+Shift+Z", run: doRedo, disabled: !canRedo },
      "-",
      { label: "Auto-fix all", kbd: "", run: autoFixEverything },
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
    help: [...help.menu, "-", { label: "Keyboard shortcuts", kbd: "", run: () => setModal({ type: "keys" }) }],
  };

  // Left rail: the definition's big choices as picture cards, then the presets.
  const groups: GalleryGroup[] = [];
  for (const s of def.sections) {
    if (s.show && !s.show(params)) continue;
    for (const f of s.fields) {
      if (f.kind !== "choice" || !f.rail || (f.show && !f.show(params))) continue;
      const c = f as ChoiceSpec<P>;
      const options: Opt[] = c.options.map((o) => ({
        v: o.v, text: o.text, title: o.title,
        icon: <ArtIcon paths={def.art?.(c.key, o.v) ?? []} />,
        onClick: () => (c.apply ? replace(c.apply(params, o.v), true) : setField(c.key, o.v, true)),
      }));
      groups.push({ label: c.label, name: c.label, art: `gen-${def.id}`, value: String(getPath(params, c.key)), options, cols: options.length === 3 || options.length >= 5 ? 3 : 2 });
    }
  }
  groups.push({
    label: "Presets", name: `${def.name} presets`, art: `gen-${def.id}-preset`, value: "", cols: 2,
    options: def.presets.map((pr) => ({
      v: pr.id, text: pr.name, title: pr.note,
      // eslint-disable-next-line @next/next/no-img-element -- static preset thumbnails
      icon: <img src={`/presets/${def.id}/${pr.id}.svg`} alt="" width={66} height={44} loading="lazy" />,
      onClick: () => applyPreset(pr),
    })),
  });

  const fitInfo = arranged.fit;
  const fitSet = cleanFit(params.fit);
  const sheetsText = fitInfo ? `${fitInfo.sheets} sheet${fitInfo.sheets === 1 ? "" : "s"}` : "";
  const fit = error
    ? { cls: "s-err" as const, text: "Fix the highlighted setting" }
    : !lay
      ? { cls: "s-ok" as const, text: "Loading" }
      : fitInfo?.fits
        ? { cls: "s-ok" as const, text: `Fits ${sheetsText}${fitInfo.scale < 1 ? ` at ${Math.round(fitInfo.scale * 1000) / 10} %` : ""}` }
        : { cls: "s-warn" as const, text: "Larger than the sheet — use a larger sheet or Fit to sheets" };
  const sheetProps = {
    info: fitInfo,
    size: out ? def.summary(built) : null,
    meta: fitSet.mode === "off" ? undefined : fitSet.mode === "auto" ? `Auto · ${sheetsText}` : `Fit · ${fitSet.sheets} sheet${fitSet.sheets === 1 ? "" : "s"}`,
    onSheet: (w: number, h: number) => replace({ ...params, bedW: w, bedH: h }, true),
    onFit: (f: FitSettings) => {
      replace({ ...params, fit: f }, true);
      toastMsg(fitSummary(f, arrangeGenerator(def, { ...params, fit: f }, ctx).fit, null));
    },
  };
  const zoom = Math.round(viewApi.view.z / PX_PER_MM * 100) + "%";
  const notice = !error && out?.notice ? out.notice : !error && !lay ? "Loading…" : null;

  return (
    <HelpContext.Provider value={help.ctx}>
    <div className="app gen-app" data-generator={def.id}>
      <MenuBar
        title={params.name} kind={`${def.name} · ${def.summary(params)}`} menus={menus} product={def.id} onProduct={onProduct}
        onSave={saveProject} onOpen={openProject}
      />
      <div className="main">
        <GalleryRail title={PRODUCT_INFO[def.id].name} icon={PRODUCT_INFO[def.id].icon} groups={groups} history={{ canUndo, canRedo, undo: doUndo, redo: doRedo }} />
        <div className="stage">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <div className="stage-3d" hidden={viewMode !== "3d"}>
            {seen3d && <GeneratorView3D out={out} lay={lay} T={built.T} material={params.material} frameKey={`${def.id}|${Math.round(lay?.width ?? 0)}x${Math.round(lay?.height ?? 0)}`} />}
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
              engrave={content?.engrave}
              images={content?.images}
              layers={params.layers}
              labels={false}
              error={error}
              notice={notice}
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
        <DockColumn onExport={exportNow} exportLabel="Export SVG" alt={[{ label: "DXF", title: "Export as DXF (R12, mm)", run: () => void exportDXFNow() }]} units={units} onUnits={setUnits} onResetAll={resetAll}>
          <GeneratorDock
            def={def}
            params={params}
            defaults={defaults}
            out={out}
            units={units}
            layerKeys={layerKeys}
            onSet={setField}
            onApply={(next) => replace(next, true)}
            onMaterial={(mid) => {
              const m = MATERIALS[mid];
              const next: P = { ...params, material: mid };
              if (m && m.T != null && m.K != null) { next.T = m.T; next.K = m.K; }
              replace(next, true);
            }}
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
        parts={out && lay ? { count: lay.items.filter((it) => it.i >= 0).length, used: usedText(usedArea(lay, arranged.sheets), (mm) => fmtLen(mm, units, true)) } : null}
        fit={fit}
        saved={saved}
      />
      <Dialogs
        modal={modal}
        noun={noun}
        onClose={() => setModal(null)}
        onRename={(name) => {
          replace({ ...params, name: name.trim() || defaults.name }, true);
          setModal(null);
        }}
        onSavePreset={(name) => { setModal(null); void myPresets.save(def.id, name, params).then(toastMsg); }}
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
            try {
              const j = JSON.parse(String(rd.result)) as { product?: string; version?: number; params?: unknown };
              if (j.product !== def.id || !j.params) {
                toastMsg(j.params ? `That is not a ${noun} project. Switch to its product to open it.` : "That file is not a HingeLab project");
                return;
              }
              replace(def.merge(def.migrate ? def.migrate(j.params, typeof j.version === "number" ? j.version : 1) : j.params) as P, true);
              window.setTimeout(() => viewApi.fit(), 50);
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
