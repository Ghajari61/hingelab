"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Download, RotateCcw } from "lucide-react";
import type { Units } from "@/components/editor/format";
import { useEditorPrefs } from "@/lib/prefs/editorStore";

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
    <div className="dock-col" inert={inert || undefined}>
      <div className="dock-head">
        <span className="unit-toggle" role="group" aria-label="Units">
          <button type="button" data-u="mm" aria-pressed={units === "mm"} onClick={() => onUnits("mm")}>mm</button>
          <button type="button" data-u="in" aria-pressed={units === "in"} onClick={() => onUnits("in")}>inch</button>
        </span>
        <div className="reset-all" ref={box}>
          <button
            type="button" className="btn-ghost-sm" aria-haspopup={prefs.confirmReset ? "dialog" : undefined} aria-expanded={prefs.confirmReset ? confirm : undefined}
            onClick={() => (prefs.confirmReset ? setConfirm((c) => !c) : onResetAll())}
          >
            <RotateCcw size={14} aria-hidden />Reset all
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
      {children}
      <div className="dock-foot">
        {extra}
        <div className="export-row">
          <button className="btn-export wide" type="button" onClick={onExport}><Download size={16} aria-hidden />{exportLabel}</button>
          {alt.map((a) => <button key={a.label} className="btn-export-alt" type="button" title={a.title} onClick={a.run}>{a.label}</button>)}
        </div>
      </div>
    </div>
  );
}
