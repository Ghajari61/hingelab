"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Download, Lock, RotateCcw, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useSession } from "@hingelab/app/session";
import type { Units } from "@/components/editor/format";
import { saveEditorPrefs, useEditorPrefs } from "@/lib/prefs/editorStore";
import { clampDockWidth } from "@/lib/editor/workflow";

const FIRST_EXPORT_KEY = "hingelab-first-export-v1";

/** Settings › Units: the open editor switches (detail: "mm" | "in"). */
export const UNITS_EVENT = "hingelab:units";

/** Right column: units and Reset all on top, the scrolling panel dock, the export button pinned underneath. */
export function DockColumn({ children, onExport, exportLabel, alt = [], units, onUnits, onResetAll, extra, inert }: {
  children: ReactNode;
  /** A shared design being viewed: nothing here can be changed. */
  inert?: boolean;
  onExport: () => void;
  exportLabel: string;
  /** Other formats beside the main export (DXF). */
  alt?: { label: string; title: string; run: () => void }[];
  units: Units;
  onUnits: (u: Units) => void;
  /** Restores every setting of the product; the editor records it as one undo step. */
  onResetAll: () => void;
  extra?: ReactNode;
}) {
  const [confirm, setConfirm] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const col = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const bodyId = useId();
  const drag = useRef<{ x: number; width: number } | null>(null);
  const session = useSession();
  // Free plan: say so beside Export before the click (Export then shows the upgrade with a preview).
  const needsPro = session.configured && !session.loading && !session.pro;
  const [tip, setTip] = useState(false);
  const exportNow = () => {
    // The first export ever: a reminder about material and kerf, beside the download.
    try {
      if (!localStorage.getItem(FIRST_EXPORT_KEY)) { localStorage.setItem(FIRST_EXPORT_KEY, "1"); setTip(true); }
    } catch { /* storage off */ }
    onExport();
  };
  const prefs = useEditorPrefs();
  const setUnits = useRef(onUnits);
  setUnits.current = onUnits;
  useEffect(() => {
    const on = (e: Event) => setUnits.current((e as CustomEvent<Units>).detail);
    window.addEventListener(UNITS_EVENT, on);
    return () => window.removeEventListener(UNITS_EVENT, on);
  }, []);
  useEffect(() => {
    if (!confirm) return;
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setConfirm(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setConfirm(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [confirm]);

  return (
    <div ref={col} className="dock-col" data-detail={prefs.detail} data-collapsed={prefs.dockCollapsed || undefined} inert={inert || undefined}>
      <div className="dock-resize" role="separator" aria-label="Settings panel width" aria-orientation="vertical"
        aria-valuemin={280} aria-valuemax={560} aria-valuenow={prefs.dockW || 340} tabIndex={prefs.dockCollapsed ? -1 : 0}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          drag.current = { x: e.clientX, width: col.current?.getBoundingClientRect().width ?? 340 };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => { if (drag.current) saveEditorPrefs({ dockW: clampDockWidth(drag.current.width + drag.current.x - e.clientX) }); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
        onLostPointerCapture={() => { drag.current = null; }}
        onDoubleClick={() => saveEditorPrefs({ dockW: 0 })}
        onKeyDown={(e) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
          e.preventDefault();
          const current = col.current?.getBoundingClientRect().width ?? 340;
          saveEditorPrefs({ dockW: clampDockWidth(e.key === "Home" ? 280 : e.key === "End" ? 560 : current + (e.key === "ArrowLeft" ? 1 : -1) * (e.shiftKey ? 1 : 16)) });
        }} />
      <div className="dock-head">
        <button type="button" className="btn-ghost-sm dock-collapse" aria-label={prefs.dockCollapsed ? "Expand settings" : "Collapse settings"}
          aria-expanded={!prefs.dockCollapsed} aria-controls={bodyId} onClick={() => saveEditorPrefs({ dockCollapsed: !prefs.dockCollapsed })}>
          {prefs.dockCollapsed ? <PanelRightOpen size={16} aria-hidden /> : <PanelRightClose size={16} aria-hidden />}
        </button>
        <span className="unit-toggle detail-toggle" role="group" aria-label="How many settings to show">
          <button type="button" aria-pressed={prefs.detail === "simple"} title="The main settings only; fine-tuning (kerf, clearances, layers) keeps its values" onClick={() => saveEditorPrefs({ detail: "simple" })}>Simple</button>
          <button type="button" aria-pressed={prefs.detail === "advanced"} title="Every setting, including kerf, clearances and export layers" onClick={() => saveEditorPrefs({ detail: "advanced" })}>All</button>
        </span>
        <span className="unit-toggle" role="group" aria-label="Units">
          <button type="button" data-u="mm" aria-pressed={units === "mm"} onClick={() => onUnits("mm")}>mm</button>
          <button type="button" data-u="in" aria-pressed={units === "in"} onClick={() => onUnits("in")}>inch</button>
        </span>
        <div className="reset-all" ref={box}>
          <button
            type="button" className="btn-ghost-sm" aria-label="Reset all" title="Reset all settings" aria-haspopup={prefs.confirmReset ? "dialog" : undefined} aria-expanded={prefs.confirmReset ? confirm : undefined}
            onClick={() => (prefs.confirmReset ? setConfirm((c) => !c) : onResetAll())}
          >
            <RotateCcw size={14} aria-hidden /><span className="reset-word">Reset</span><span className="reset-all-word"> all</span>
          </button>
          {confirm && (
            <div className="confirm-pop" role="dialog" aria-label="Reset all settings">
              <p>Reset every setting to its default? Your text or model stays. You can undo this.</p>
              <div>
                <button type="button" className="btn-ghost-sm" onClick={() => setConfirm(false)}>Cancel</button>
                <button type="button" className="btn-dark-sm" onClick={() => { setConfirm(false); onResetAll(); }}>Reset</button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div ref={body} id={bodyId} className="dock-body" hidden={prefs.dockCollapsed}>{children}</div>
      <div className="dock-foot">
        {extra}
        {tip && (
          <div className="first-export" role="status">
            <p><b>Before the first cut:</b> check the material&apos;s thickness and kerf in Material, and cut the small kerf test square first, so joints fit.</p>
            <div>
              <a className="btn-ghost-sm" href="/learn/kerf" target="_blank" rel="noopener">Kerf guide</a>
              <button type="button" className="btn-dark-sm" onClick={() => setTip(false)}>Got it</button>
            </div>
          </div>
        )}
        {needsPro && <p className="pro-note"><Lock size={12} aria-hidden /> Export needs Pro. Designing and previewing are free.</p>}
        <div className="export-row">
          <button className="btn-export wide" type="button" onClick={exportNow}><Download size={16} aria-hidden />{exportLabel}{needsPro && <span className="pro-badge">Pro</span>}</button>
          {alt.map((a) => <button key={a.label} className="btn-export-alt" type="button" title={a.title} onClick={a.run}>{a.label}</button>)}
        </div>
      </div>
    </div>
  );
}
