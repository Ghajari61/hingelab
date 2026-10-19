"use client";

import { platform } from "@hingelab/platform";
import { keepSetup } from "@/lib/prefs/editor";
import { editorPrefs } from "@/lib/prefs/editorStore";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { clientOnly } from "@hingelab/ui/lazy";
import type { LayerKey } from "@/lib/hinge";
import { genWithMaterial } from "@/lib/materials/apply";
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
import { batchLimitMessage, designBatchCount, hasPro } from "@/lib/plans";
import { UpgradeDialog } from "@/components/billing/UpgradeDialog";
import { getLoadedFont, loadHarfBuzz } from "@/components/letters/runtime";
import { fontsForExport, useFontUploads } from "@/components/letters/useFontUploads";
import { cleanFit, type FitSettings } from "@/lib/fit/fitToSheets";
import { usedArea, usedText } from "@/lib/fit/arrange";
import { autoFixAll, type Fix, type Issue } from "@/lib/issues";
import type { Preset } from "@/lib/presets";
import { generatorHelpMap } from "@/lib/generators/helpMap";
import { GENERATOR_INFO, type GeneratorId } from "@/lib/generators/ids";
import { arrangeGenerator, assemblySteps, genContent, genSVG, sheetIssues } from "@/lib/generators/output";
import { NestChip, useNestWorker } from "./useNestWorker";
import { getPath, setPath } from "@/lib/generators/path";
import { loadGenerator } from "@/lib/generators/registry";
import { makeTextFn } from "@/lib/generators/text";
import type { AnyGenerator, BuildContext, ChoiceSpec, FieldSpec, GenBase, GenPreset, ImageSpec } from "@/lib/generators/types";
import { GEN_RAIL_GROUPS } from "@/lib/generators/railArt.generated";
import { addRailGroups } from "@/lib/railArt";
import { presetMatches, randomiseParams, shuffleFields } from "@/lib/generators/randomise";
import { Dices } from "lucide-react";
import { GeneratorDock } from "./GeneratorDock";
import { useGenPrefs } from "./useGenPrefs";
import { LockToggle } from "./LockToggle";
import { useSharedView } from "@/components/shell/SharedView";
import { useProjectFile } from "@/components/shell/useProjectFile";
import { useFlags } from "@/components/shell/useFlags";
import { usePhoneFlow } from "@/components/shell/usePhone";
import { designGates, gateLock } from "@/lib/gates";
import { SHARED_ID } from "@/lib/share/id";
import "./generators.css";

addRailGroups(GEN_RAIL_GROUPS);

const ExportDialog = clientOnly(() => import("@/components/shell/ExportDialog"));
const JobEstimate = clientOnly(() => import("@/components/shell/JobEstimate"));
const BatchDialog = clientOnly(() => import("./BatchDialog"));
const ShareDialog = clientOnly(() => import("@/components/shell/ShareDialog"));
const PhoneFlow = clientOnly(() => import("./PhoneFlow"), { loading: () => <div className="boot">Loading…</div> });
const GeneratorView3D = clientOnly(() => import("./GeneratorView3D"), {
  loading: () => <div id="preview3d" className="v3" aria-busy="true" />,
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
  const [exporting, setExporting] = useState(false);
  const [batching, setBatching] = useState(false);
  const [sharing, setSharing] = useState(false);
  const helpMap = useMemo(() => generatorHelpMap(def), [def]);
  const help = useHelpPanel(helpMap);
  const myPresets = useMyPresets();
  const prefs = useGenPrefs(def.id);
  const [presetQuery, setPresetQuery] = useState("");
  const account = usePlan();
  const [upgrade, setUpgrade] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastT = useRef<number>(0);
  const onStatus = useCallback((s: string) => setSaved(s), []);
  const shared = useSharedView(start, start?.name ?? def.name, toastMsg);
  useAutosave(params, units, onStatus, KEY, !shared.viewing, def.version);
  const file = useProjectFile({
    section: def.id, params, fileBase: () => def.fileName(params), toast: toastMsg, opened: start?.file,
    write: async () => (await import("@/components/shell/projectFile")).projectText({ app: "HingeLab", product: def.id, version: def.version }, params),
    load: (f) => {
      replace(def.merge(def.migrate ? def.migrate(f.params, f.version) : f.params) as P, true);
      window.setTimeout(() => viewApi.fit(), 50);
    },
    importAccept: ".svg,.dxf,image/svg+xml,image/png,image/jpeg,image/webp",
    importOther: importPicture,
  });

  /** A picture or drawing goes into the design's picture field when it shows one; otherwise it opens in Studio. */
  async function importPicture(f: File) {
    const { DRAWING, PICTURE, dxfAsSvg, feedFileInput, importToStudio } = await import("@/components/shell/importFiles");
    const drawing = DRAWING.test(f.name);
    if (!drawing && !PICTURE.test(f.type)) { toastMsg("Import takes SVG, DXF, PNG, JPEG or WebP pictures, or .oclc projects."); return; }
    const fields = def.sections.filter((s) => !s.show || s.show(params)).flatMap((s) => s.fields as FieldSpec<P>[])
      .filter((x): x is ImageSpec<P> => x.kind === "image" && (!x.show || x.show(params)) && (!drawing || !!x.trace));
    for (const fd of fields) {
      const input = document.querySelector<HTMLInputElement>(`.gen-app .dock input[type=file][aria-label="${CSS.escape(fd.label)}"]`);
      if (!input) continue;
      input.closest("details")?.setAttribute("open", "");
      input.closest(".gen-image, .ipick")?.scrollIntoView({ block: "center" });
      if (feedFileInput(input, /\.dxf$/i.test(f.name) ? await dxfAsSvg(f) : f)) return;
    }
    await importToStudio(f, toastMsg);
  }
  const flags = useFlags();
  const phoneFlow = usePhoneFlow();
  const [lastPreset, setLastPreset] = useState<string | null>(null);

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
  useEffect(() => { setFontError(null); }, [fontKey]);
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

  const nest = useNestWorker();
  const arranged = useMemo(
    () => nest.arrange(() => arrangeGenerator(def, deferred, ctx)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nest.tick: the worker stored a nest
    [def, deferred, ctx, nest.arrange, nest.tick],
  );
  const flushNest = nest.flush;
  useEffect(() => { flushNest(); }, [arranged, flushNest]);
  const nesting = nest.progress != null;
  const model = "error" in arranged.result ? null : arranged.result;
  const out = model?.out ?? null;
  const built = arranged.params as P;
  const error = fontError ?? ("error" in arranged.result ? arranged.result.error : null);
  const lay = model ? arranged.lay : null;
  const content = useMemo(() => (lay ? genContent(lay) : null), [lay]);
  const photos = out ? out.parts.reduce((n, pt) => n + (pt.images?.length ?? 0), 0) : 0;
  const gated = out ? designGates(built as { sheet?: { nest?: unknown } }, photos, account.plan, flags) : [];
  const lock = [out && def.pro ? def.pro(built, out) : null, ...gated].filter(Boolean).join(" ") || null;
  const locked = !!lock && !hasPro(account.plan);
  const batchNote = batchLimitMessage(account.plan, designBatchCount(params), !account.configured);
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
  viewApi.fitArgs.current = { bedW: params.bedW, bedH: params.bedH, layW: lay?.width ?? 0, layH: lay?.height ?? 0, sheets: arranged.sheets };

  const fontFiles = useFontUploads(toastMsg, gateLock("customFonts", account.plan, flags));
  /** Font fields set to a removed upload go back to their default font. */
  function withoutFont(q: P, id: string): P {
    let next = q;
    for (const s of def.sections) for (const f of s.fields) if (f.kind === "font" && getPath(next, f.key) === id) next = setPath(next, f.key, getPath(defaults, f.key));
    return next;
  }

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
    platform().saveFile({ name: filename, data, mime, intent: "export" })
      .then((r) => toastMsg(r.message))
      .catch(() => setModal({ type: "code", name: filename, data }));
  }

  const localSVG = () => (lay && out && !out.notice ? genSVG(def, built, lay) : null);

  async function exportedSVG(): Promise<string | null> {
    if (!lay || !out) { toastMsg(error ? "Fix the settings before exporting" : "Still loading"); return null; }
    if (out.notice) { toastMsg(out.notice); return null; }
    if (nesting) { toastMsg("Still nesting the parts by shape. Wait a moment, or press Cancel to keep the box layout."); return null; }
    if (issues.some((i) => i.code === "MISSING_GLYPHS")) { toastMsg("Pick a font that has every character first"); return null; }
    const over = batchLimitMessage(account.plan, designBatchCount(params), !account.configured);
    if (over) { setUpgrade(over); return null; }
    if (account.configured && !hasPro(account.plan)) { setUpgrade("Saving and exporting need Pro. Upgrade to download cut files and keep cloud projects."); return null; }
    if (!lock || !account.configured) return genSVG(def, built, lay);
    if (locked) { setUpgrade(lock); return null; }
    // A Pro design: the server checks the plan and builds it again.
    try {
      const fonts = await fontsForExport(def.fonts?.(built) ?? []);
      if ("error" in fonts) { toastMsg(fonts.error); return null; }
      const res = await platform().exportFile({ product: def.id, params, ...(fonts.length ? { fonts } : {}) });
      if (res.ok) return await res.text();
      const err = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Export failed. Try again.";
      if (res.status === 403) setUpgrade(err);
      else toastMsg(err);
    } catch {
      toastMsg("Export failed. Check your connection and try again.");
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
    if (svg) offerFile(def.fileName(built) + ".svg", svg, "image/svg+xml");
  }

  async function exportDXFNow() {
    const svg = await cutSVG();
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
    replace(editorPrefs().keepSetup ? keepSetup(params, def.defaults() as P) : (def.defaults() as P), true);
    window.setTimeout(() => viewApi.fit(), 50);
    toastMsg(`New ${def.name.toLowerCase()}`);
  }

  function resetSection(title: string, keys: string[]) {
    let next = params;
    // A choice's apply() also sets what it implies outside the section; the section's own keys then go to their defaults.
    const all = def.sections.flatMap((s) => s.fields as FieldSpec<P>[]);
    for (const k of keys) {
      const f = all.find((x) => x.key === k);
      const d = getPath(defaults, k);
      if (f?.kind === "choice" && f.apply && getPath(next, k) !== d) next = f.apply(next, String(d)) as P;
    }
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
    prefs.used(pr.id);
    setLastPreset(pr.id);
    replace(def.merge(pr.params) as P, true);
    window.setTimeout(() => viewApi.fit(), 50);
    toastMsg(`Preset “${pr.name}”. Ctrl+Z returns to your last design.`);
  }

  const started = useRef(false);
  useEffect(() => {
    if (!start || started.current) return;
    started.current = true;
    // Start presets with no settings (featured cards, links) take the built-in preset with that id.
    const from = !start.params || Object.keys(start.params).length === 0 ? def.presets.find((x) => x.id === start.id) : start;
    if (!from) return;
    const f = start.file;
    replace(def.merge(f && def.migrate ? def.migrate(from.params, f.version) : from.params) as P, true);
    window.setTimeout(() => viewApi.fit(), 50);
    if (f) { file.markClean(); toastMsg(`Opened ${f.name}`); }
    else if (start.id !== SHARED_ID) toastMsg(`Started from “${from.name}”. Ctrl+Z returns to your last design.`);
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

  const fitKey = lay ? `${params.bedW}x${params.bedH}|${Math.round(lay.width)}x${Math.round(lay.height)}|${arranged.sheets?.length ?? 0}` : "";
  const refit = viewApi.refit;
  useEffect(() => {
    if (fitKey) refit();
  }, [fitKey, refit]);

  const noun = def.name.toLowerCase();
  const menus: Record<"file" | "edit" | "view" | "help", MenuEntry[]> = {
    file: [
      { label: `New ${noun}`, kbd: "Ctrl+N", run: newProject },
      { label: "Start page", kbd: "", run: onHome },
      { label: "Open project…", kbd: "Ctrl+O", run: openProject },
      { label: "Import picture or project…", kbd: "Ctrl+I", run: file.importPick },
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
      { label: "Auto-fix all", kbd: "", run: autoFixEverything },
      ...(shuffleFields(def).length ? [{ label: "Randomise design", kbd: "", run: () => randomiseDesign() }] : []),
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
      ...(phoneFlow.narrow ? ["-" as const, { label: "Simple phone view", kbd: "", run: phoneFlow.simple }] : []),
    ],
    help: [...help.menu, "-", { label: "Keyboard shortcuts", kbd: "", run: () => setModal({ type: "keys" }) }],
  };

  // Left rail: the definition's big choices as picture cards, then the presets.
  const lockSet = new Set(prefs.locks);
  const locks = { has: (k: string) => lockSet.has(k), toggle: prefs.toggleLock };
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
      groups.push({
        label: c.label, name: c.label, art: `gen-${def.id}`, pics: `gen-${def.id}-${c.key}`, value: String(getPath(params, c.key)), options, cols: options.length === 3 || options.length >= 5 ? 3 : 2,
        tools: c.shuffle ? <LockToggle on={lockSet.has(c.key)} toggle={() => prefs.toggleLock(c.key)} label={c.label} /> : undefined,
        home: String(getPath(defaults, c.key)),
      });
    }
  }
  const presetOpt = (pr: GenPreset<unknown>): Opt => ({
    v: pr.id, text: pr.name, title: pr.note,
    // eslint-disable-next-line @next/next/no-img-element -- static preset thumbnails
    icon: <img src={`/presets/${def.id}/${pr.id}.svg`} alt="" width={66} height={44} loading="lazy" />,
    onClick: () => applyPreset(pr),
  });
  const byId = new Map(def.presets.map((pr) => [pr.id, pr] as const));
  const listed = (ids: string[]) => ids.map((id) => byId.get(id)).filter((pr): pr is GenPreset<unknown> => !!pr);
  const fav = { has: (v: string) => prefs.favs.includes(v), toggle: (v: string) => prefs.toggleFav(v) };
  const art = `gen-${def.id}-preset`;
  const favs = listed(prefs.favs).filter((pr) => presetMatches(presetQuery, pr));
  if (favs.length) groups.push({ label: "Favourites", name: `${def.name} favourite presets`, art, value: "", cols: 2, fav, options: favs.map(presetOpt) });
  const recent = presetQuery ? [] : listed(prefs.recent);
  if (recent.length) groups.push({ label: "Recent", name: `${def.name} recent presets`, art, value: "", cols: 2, fav, options: recent.map(presetOpt) });
  groups.push({
    label: "Presets", name: `${def.name} presets`, art, value: "", cols: 2, fav,
    head: def.presets.length > 6 ? (
      <input
        type="search" className="gsearch" placeholder={`Search ${def.presets.length} presets`} aria-label={`Search ${def.name} presets`}
        value={presetQuery} onChange={(e) => setPresetQuery(e.target.value)}
      />
    ) : undefined,
    empty: "No presets match. Try another word.",
    options: def.presets.filter((pr) => presetMatches(presetQuery, pr)).map(presetOpt),
  });
  const canShuffle = useMemo(() => shuffleFields(def).length > 0, [def]);
  function randomiseDesign() {
    replace(randomiseParams(def, params, lockSet), true);
    toastMsg(lockSet.size ? "New random design; locked settings kept. Ctrl+Z undoes it." : "New random design. Ctrl+Z undoes it.");
  }

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
  const phoneSVG = useMemo(() => (phoneFlow.phone && lay && out && !out.notice ? genSVG(def, built, lay) : null), [phoneFlow.phone, def, built, lay, out]);

  if (phoneFlow.phone) {
    return (
      <HelpContext.Provider value={help.ctx}>
        <PhoneFlow
          name={def.name} summary={def.summary(out ? built : params)} presets={def.presets} thumb={(pr) => `/presets/${def.id}/${pr.id}.svg`}
          current={lastPreset} onPreset={applyPreset}
          fields={
            <GeneratorDock
              simple def={def} params={params} defaults={defaults} out={out} units={units} layerKeys={layerKeys} onSet={setField}
              onApply={(next) => replace(next, true)} onMaterial={(mid, info) => replace(genWithMaterial(params, mid, info), true)}
              fonts={{
                uploads: fontFiles.uploads,
                onUpload: async (key, file) => { const id = await fontFiles.add(file); if (id) setField(key, id, true); },
                onDelete: async (id) => { if (await fontFiles.remove(id)) replace(withoutFont(params, id), true); },
              }}
              onResetSection={resetSection} sheet={sheetProps} checks={null}
            />
          }
          svg={phoneSVG} status={error ? `Fix this in the full editor: ${error}` : notice} nesting={nesting} assembly={assemblySteps(out?.assembly, params.gap)}
          onSVG={() => void exportNow()} onDXF={() => void exportDXFNow()} onFull={phoneFlow.full} onHome={onHome}
          history={{ canUndo, canRedo, undo: doUndo, redo: doRedo }}
        />
        {upgrade && <UpgradeDialog reason={upgrade} signedIn={account.signedIn} onClose={() => setUpgrade(null)} />}
        {toast && <div className="toast" role="status">{toast}</div>}
        {help.drawer}
      </HelpContext.Provider>
    );
  }

  return (
    <HelpContext.Provider value={help.ctx}>
    <div className="app gen-app" data-generator={def.id}>
      <MenuBar
        title={params.name} kind={`${def.name} · ${def.summary(params)}`} menus={menus} product={def.id} onProduct={onProduct}
        onSave={saveProject} onOpen={openProject}
      />
      <div className="main">
        <GalleryRail title={PRODUCT_INFO[def.id].name} icon={PRODUCT_INFO[def.id].icon} groups={groups} history={{ canUndo, canRedo, undo: doUndo, redo: doRedo }} inert={shared.viewing}>
          {canShuffle && (
            <button type="button" className="btn-auto gen-shuffle" onClick={randomiseDesign} title="A new random design. Lock a setting (its lock icon) to keep it. Ctrl+Z undoes it.">
              <Dices size={15} aria-hidden /> Randomise design{prefs.locks.length ? ` · ${prefs.locks.length} locked` : ""}
            </button>
          )}
        </GalleryRail>
        <div className={`stage${viewMode === "3d" ? " no-rulers" : ""}`}>
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <NestChip progress={nest.progress} onCancel={nest.cancel} />
          <div className="stage-3d" hidden={viewMode !== "3d"}>
            {seen3d && <GeneratorView3D out={out} lay={lay} T={built.T} material={params.material} units={units} frameKey={`${def.id}|${Math.round(lay?.width ?? 0)}x${Math.round(lay?.height ?? 0)}`} edit={{ def, params, set: replace as never }} />}
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
        <DockColumn onExport={exportNow} exportLabel="Export SVG" alt={[{ label: "DXF", title: "Export as DXF (R12, mm)", run: () => void exportDXFNow() }, { label: "More…", title: "PDF, LightBurn, one file per sheet, mirror, and a check against your machine's bed (Ctrl+Shift+E)", run: openExport }]} units={units} onUnits={setUnits} onResetAll={resetAll} inert={shared.viewing}>
          <GeneratorDock
            def={def}
            locks={canShuffle ? locks : undefined}
            params={params}
            defaults={defaults}
            out={out}
            units={units}
            layerKeys={layerKeys}
            onSet={setField}
            onApply={(next) => replace(next, true)}
            onMaterial={(mid, info) => replace(genWithMaterial(params, mid, info), true)}
            fonts={{
              uploads: fontFiles.uploads,
              onUpload: async (key, file) => { const id = await fontFiles.add(file); if (id) setField(key, id, true); },
              onDelete: async (id) => { if (await fontFiles.remove(id)) replace(withoutFont(params, id), true); },
            }}
            onResetSection={resetSection}
            sheet={sheetProps}
            onBatch={() => { const l = gateLock("batch", account.plan, flags); if (l) setUpgrade(l); else setBatching(true); }}
            checks={<>
              {batchNote && <p className="note err" role="status">{batchNote} <button type="button" className="btn-ghost-sm" onClick={() => setUpgrade(batchNote)}>Upgrade</button></p>}
              <IssueList issues={issues} onFix={applyIssueFix} onAutoFix={autoFixEverything} />
              {lay && <JobEstimate svg={localSVG} version={lay} sheets={arranged.sheets} material={params.material} units={units === "in" ? "in" : "mm"} />}
            </>}
          />
        </DockColumn>
      </div>
      <StatusBar
        x={cursor.x}
        y={cursor.y}
        zoom={zoom}
        parts={out && lay ? { count: lay.items.filter((it) => it.i >= 0).length, used: usedText(usedArea(lay, arranged.sheets), (mm) => fmtLen(mm, units, true)) } : null}
        fit={fit}
        saved={shared.viewing ? "Shared design, not saved" : file.status ?? saved}
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
      {exporting && (
        <ExportDialog
          getSVG={exportedSVG} localSVG={localSVG} sheets={arranged.sheets} size={{ w: lay?.width ?? 0, h: lay?.height ?? 0 }}
          base={def.fileName(built)} units={units} material={params.material} onClose={() => setExporting(false)} toast={toastMsg}
        />
      )}
      {batching && (
        <BatchDialog
          def={def} params={params} ctx={ctx} start={String(getPath(params, "job.names") ?? "")} pro={hasPro(account.plan)}
          capOf={(n) => batchLimitMessage(account.plan, n, !account.configured)}
          onUpgrade={(msg) => { setBatching(false); setUpgrade(msg); }}
          base={def.fileName(built)} onClose={() => setBatching(false)} toast={toastMsg}
        />
      )}
      {sharing && (
        <ShareDialog
          product={def.id} params={params} defaults={defaults} svg={localSVG} signedIn={account.signedIn}
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
