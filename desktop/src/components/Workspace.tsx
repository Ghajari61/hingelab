import { lazy, Suspense, useEffect, useRef, useState, type RefObject } from "react";
import { AlertTriangle, Box, CircleAlert, Download, FileDown, Grid2x2, Grid3x3, Info, Lock, Maximize, Minus, Plus, Redo2, RefreshCw, Ruler, Scan, Sparkles, Square, Star, Undo2, WifiOff, Wrench } from "lucide-react";
import type { DProduct } from "../../../lib/desktop/types";
import type { DesignState } from "../design";
import type { AppError } from "../ipc";
import { DEFAULT_PREFS, usePrefs, type LocalPrefs, type Shade3D, type SheetTone, type Units } from "../local";
import { Canvas, zoomLabel, type CanvasHandle } from "./Canvas";
import { SettingsPanel } from "./SettingsPanel";
import type { PaneId } from "./View3D";

const View3D = lazy(() => import("./View3D"));

const SHEET_TONES: [SheetTone, string][] = [["plywood", "Plywood"], ["grey", "Soft grey"], ["white", "White"], ["dark", "Dark"]];
const SHADES: [Shade3D, string, string][] = [["shaded", "Shaded", "Shaded"], ["edges", "Edges", "Shaded with edges (F4)"]];

interface Props {
  product: DProduct;
  design: DesignState;
  plan: "free" | "pro";
  units: Units;
  online: boolean;
  canvas: RefObject<CanvasHandle | null>;
  favorite: boolean;
  onChange: (key: string, value: unknown, immediate: boolean) => void;
  onRename: (name: string) => void;
  onFix: (code: string, id: string) => void;
  onAutofix: () => void;
  onRefresh: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onExport: () => void;
  onUpgrade: () => void;
  onRefreshPlan: () => void;
  onFavorite: () => void;
  /** Absent when the product has no online editor (AI drawings). */
  onFullEditor?: () => void;
  /** The 3D view opened or closed: builds then bring the assembled model. */
  onWant3d: (on: boolean) => void;
}

export function Workspace(p: Props) {
  const { design, product } = p;
  const r = design.result;
  const [zoom, setZoom] = useState(1);
  const [prefs, setPrefs] = usePrefs();
  const [editingName, setEditingName] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const name = String(design.params?.name ?? r?.params.name ?? product.name);
  const canSave = !!r?.designId && !design.busy;
  const issues = r?.issues ?? [];
  const safeFixes = issues.some((i) => i.fixes.some((f) => f.safe));
  const err = design.error;
  const set = (patch: Partial<LocalPrefs>) => setPrefs((o) => ({ ...DEFAULT_PREFS, ...o, ...patch }));
  const is3d = prefs.view3d;
  const [active, setActive] = useState<PaneId>("persp");
  const [explode, setExplode] = useState(0);
  const { onWant3d } = p;
  useEffect(() => { onWant3d(is3d); }, [is3d, onWant3d]);
  const dim = design.busy || !!r?.locked || (!!err && err.kind !== "network" && err.kind !== "rate_limited");

  const overlays = (
    <>
      {r?.locked && (
        <div className="overlay locked" role="status">
          <Lock size={22} aria-hidden />
          <h2>This design needs Pro</h2>
          <p>{r.locked}</p>
          <div className="row">
            <button type="button" className="btn primary" onClick={p.onUpgrade}>Upgrade to Pro</button>
            <button type="button" className="btn" onClick={p.onRefreshPlan}>I've upgraded</button>
          </div>
        </div>
      )}
      {!r?.locked && r?.error && !design.busy && (
        <div className="overlay problem" role="alert">
          <CircleAlert size={22} aria-hidden />
          <h2>This design can't be built</h2>
          <p>{r.error}</p>
          {issues.some((i) => i.fixes.length) && <p className="hint">The checks on the right suggest fixes.</p>}
        </div>
      )}
      {err && !design.busy && <ErrorOverlay error={err} online={p.online} onRetry={p.onRefresh} />}
      {!r && design.busy && <div className="overlay quiet" aria-busy="true"><RefreshCw size={20} className="spin" aria-hidden /><p>Building on the server…</p></div>}
    </>
  );

  return (
    <div className="workspace">
      <header className="ws-head">
        <div className="ws-title">
          <span className="ws-product">{product.name}</span>
          {editingName ? (
            <input
              ref={nameRef}
              className="ws-name-input"
              defaultValue={name}
              maxLength={120}
              aria-label="Design name"
              autoFocus
              onBlur={(e) => {
                setEditingName(false);
                const v = e.target.value.trim();
                if (v && v !== name) p.onRename(v);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setEditingName(false);
              }}
            />
          ) : (
            <h1><button type="button" className="ws-name" title="Rename" onClick={() => setEditingName(true)}>{name}</button></h1>
          )}
          {r?.summary && <span className="ws-summary">{r.summary}</span>}
        </div>
        <div className="ws-actions">
          <button type="button" className="icon-btn" aria-pressed={p.favorite} title={p.favorite ? "Remove from favorites" : "Add to favorites"} onClick={p.onFavorite}>
            <Star size={16} fill={p.favorite ? "currentColor" : "none"} aria-hidden />
          </button>
          <button type="button" className="icon-btn" title="Undo (Ctrl+Z)" disabled={!design.canUndo} onClick={p.onUndo}><Undo2 size={16} aria-hidden /></button>
          <button type="button" className="icon-btn" title="Redo (Ctrl+Y)" disabled={!design.canRedo} onClick={p.onRedo}><Redo2 size={16} aria-hidden /></button>
          <span className="sep" />
          {p.onFullEditor && <button type="button" className="btn ghost" title={`Open the online ${product.name} editor in this window: 3D view, DXF, sheets and more`} onClick={p.onFullEditor}><Box size={15} aria-hidden />Full editor</button>}
          <button type="button" className="btn" title="Build the design again (Ctrl+Enter)" onClick={p.onRefresh} disabled={design.busy || !p.online}>
            <RefreshCw size={15} className={design.busy ? "spin" : undefined} aria-hidden />{design.busy ? "Updating" : "Update"}
          </button>
          <button type="button" className="btn" title="Export to your export folder (Ctrl+E)" onClick={p.onExport} disabled={!canSave}><FileDown size={15} aria-hidden />Export</button>
          <button type="button" className="btn primary" title="Save SVG (Ctrl+S)" onClick={p.onSave} disabled={!canSave}><Download size={15} aria-hidden />Save SVG</button>
        </div>
      </header>

      <div className="ws-body">
        <main className="ws-canvas">
          <div className={`canvas-tools${is3d ? " tools3d" : ""}`} role="toolbar" aria-label="View">
            <span className="seg" role="group" aria-label="Workspace view">
              <button type="button" aria-pressed={!is3d} title="The cut sheet, as it will be saved" onClick={() => set({ view3d: false })}>2D sheet</button>
              <button type="button" aria-pressed={is3d} title="The design assembled in 3D: Top, Front, Left and Perspective views" onClick={() => set({ view3d: true })}><Box size={13} aria-hidden /> 3D</button>
            </span>
            <span className="sep" />
            {is3d ? (
              <>
                <button type="button" className="icon-btn" aria-pressed={prefs.view3dQuad} title={prefs.view3dQuad ? "Maximize the active view (Alt+W)" : "Show all four views (Alt+W)"} onClick={() => set({ view3dQuad: !prefs.view3dQuad })}>
                  {prefs.view3dQuad ? <Grid2x2 size={15} aria-hidden /> : <Square size={15} aria-hidden />}
                </button>
                <span className="seg" role="group" aria-label="Display">
                  {SHADES.map(([v, label, title]) => <button key={v} type="button" aria-pressed={prefs.view3dShade === v} title={title} onClick={() => set({ view3dShade: v })}>{label}</button>)}
                </span>
                <label className="explode" title="Pull the layers apart">Explode <input type="range" min={0} max={1} step={0.01} value={explode} aria-label="Explode" onChange={(e) => setExplode(parseFloat(e.target.value))} /></label>
                <button
                  type="button" className="icon-btn" aria-pressed={prefs.view3dDims} aria-label="Dimensions"
                  title={prefs.view3dDims ? "Hide the overall dimensions" : "Show the overall dimensions (hidden while exploded)"}
                  onClick={() => set({ view3dDims: !prefs.view3dDims })}
                ><Ruler size={15} aria-hidden /></button>
                <button type="button" className="icon-btn" title="Zoom extents, all views (Ctrl+0)" onClick={() => p.canvas.current?.fit()}><Maximize size={15} aria-hidden /></button>
              </>
            ) : (
              <>
                <button type="button" className="icon-btn" title="Zoom out (Ctrl+-)" onClick={() => p.canvas.current?.zoomOut()}><Minus size={15} aria-hidden /></button>
                <span className="zoom" aria-live="polite">{zoomLabel(zoom)}</span>
                <button type="button" className="icon-btn" title="Zoom in (Ctrl+=)" onClick={() => p.canvas.current?.zoomIn()}><Plus size={15} aria-hidden /></button>
                <button type="button" className="icon-btn" title="Fit to window (Ctrl+0)" onClick={() => p.canvas.current?.fit()}><Maximize size={15} aria-hidden /></button>
                <button type="button" className="icon-btn" title="Actual size, 100% (Ctrl+1)" onClick={() => p.canvas.current?.reset()}><Scan size={15} aria-hidden /></button>
                <span className="sep" />
                <button type="button" className="icon-btn" aria-pressed={prefs.sheetGrid} title={prefs.sheetGrid ? "Hide the 10 mm grid on the sheet" : "Show a 10 mm grid on the sheet"} onClick={() => set({ sheetGrid: !prefs.sheetGrid })}><Grid3x3 size={15} aria-hidden /></button>
                <span className="tones" role="radiogroup" aria-label="Sheet colour">
                  {SHEET_TONES.map(([v, label]) => (
                    <button key={v} type="button" role="radio" aria-checked={prefs.sheetTone === v} aria-label={label} title={`Sheet: ${label}`} className={`tone-sw tone-${v}`} onClick={() => set({ sheetTone: v })} />
                  ))}
                </span>
              </>
            )}
          </div>
          {is3d ? (
            <Suspense fallback={<div className="v3" aria-busy="true" />}>
              <View3D
                ref={p.canvas} model={r?.model ?? null} material={String(r?.params.material ?? "")} explode={explode}
                shade={prefs.view3dShade} quad={prefs.view3dQuad} active={active} dims={prefs.view3dDims} units={p.units} dim={dim}
                onActive={(a) => setActive(a)} onQuad={(q) => set({ view3dQuad: q })} onShade={(s) => set({ view3dShade: s })}
              >
                {overlays}
                {r?.svg && !r.model && !design.busy && !err && (
                  <div className="overlay quiet" role="status"><Box size={20} aria-hidden /><p>{p.onFullEditor ? "This design is too large to show in 3D. Full editor shows it on the website." : "This design has no closed cut parts to show in 3D, or too many."}</p></div>
                )}
                {r?.svg && !r.model && design.busy && <div className="overlay quiet" aria-busy="true"><RefreshCw size={20} className="spin" aria-hidden /><p>Building the 3D model…</p></div>}
              </View3D>
            </Suspense>
          ) : (
            <Canvas ref={p.canvas} svg={r?.svg ?? null} tone={prefs.sheetTone} grid={prefs.sheetGrid} width={r?.width ?? 0} height={r?.height ?? 0} fitKey={`${product.id}:${r ? "1" : "0"}`} dim={dim} onZoom={setZoom}>
              {overlays}
            </Canvas>
          )}
          <footer className="status">
            {r?.stats.map((s) => <span key={s.label}><b>{s.label}</b> {s.value}</span>)}
            {r?.watermark && <span className="wm" title="Free plan exports carry a small Made with HingeLab mark below the parts.">Free plan mark included</span>}
            <span className="spacer" />
            {!p.online && <span className="offline"><WifiOff size={13} aria-hidden />Offline</span>}
            {design.busy && <span className="sync">Updating…</span>}
          </footer>
        </main>

        <aside className="ws-panel">
          {design.params ? (
            <SettingsPanel product={product} params={design.params} form={r?.form ?? null} units={p.units} plan={p.plan} onChange={p.onChange} />
          ) : (
            <div className="panel-loading" aria-busy="true"><div className="sk" /><div className="sk" /><div className="sk short" /></div>
          )}
          {issues.length > 0 && (
            <section className="checks" aria-label="Checks">
              <div className="checks-head">
                <h3>Checks</h3>
                {safeFixes && <button type="button" className="link-btn" onClick={p.onAutofix}><Sparkles size={13} aria-hidden />Fix all</button>}
              </div>
              <ul>
                {issues.map((i) => (
                  <li key={i.code + i.message} className={`issue ${i.level}`}>
                    {i.level === "error" ? <CircleAlert size={14} aria-hidden /> : i.level === "warn" ? <AlertTriangle size={14} aria-hidden /> : <Info size={14} aria-hidden />}
                    <div>
                      <p>{i.message}</p>
                      {i.fixes.map((f) => (
                        <button key={f.id} type="button" className="fix-btn" onClick={() => p.onFix(i.code, f.id)}><Wrench size={12} aria-hidden />{f.label}</button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function ErrorOverlay({ error, online, onRetry }: { error: AppError; online: boolean; onRetry: () => void }) {
  if (error.kind === "unauthorized" || error.kind === "update_required") return null;
  const title = error.kind === "network" || !online ? "You're offline" : error.kind === "rate_limited" ? "Slow down a little" : error.kind === "server" ? "The server had a problem" : "That didn't work";
  const text = error.kind === "network" || !online
    ? "Designs are built on HingeLab's servers. The last preview stays here and can still be saved; changes update when you're back online."
    : error.kind === "rate_limited" ? `Too many changes at once. Trying again in ${error.retryAfter ?? 5} seconds.` : error.message;
  return (
    <div className={`overlay ${error.kind === "network" || error.kind === "rate_limited" ? "banner" : "problem"}`} role="alert">
      {error.kind === "network" ? <WifiOff size={22} aria-hidden /> : <CircleAlert size={22} aria-hidden />}
      <h2>{title}</h2>
      <p>{text}</p>
      {error.kind !== "rate_limited" && <button type="button" className="btn" onClick={onRetry}><RefreshCw size={14} aria-hidden />Try again</button>}
    </div>
  );
}
