"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Download, RotateCcw } from "lucide-react";
import type { Units } from "@/components/editor/format";

/** Right column: units and Reset all on top, the scrolling panel dock, the export button pinned underneath. */
export function DockColumn({ children, onExport, exportLabel, units, onUnits, onResetAll, extra }: {
  children: ReactNode;
  onExport: () => void;
  exportLabel: string;
  units: Units;
  onUnits: (u: Units) => void;
  /** Restores every setting of the product; the editor records it as one undo step. */
  onResetAll: () => void;
  extra?: ReactNode;
}) {
  const [confirm, setConfirm] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!confirm) return;
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setConfirm(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setConfirm(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [confirm]);

  return (
    <div className="dock-col">
      <div className="dock-head">
        <span className="unit-toggle" role="group" aria-label="Units">
          <button type="button" data-u="mm" aria-pressed={units === "mm"} onClick={() => onUnits("mm")}>mm</button>
          <button type="button" data-u="in" aria-pressed={units === "in"} onClick={() => onUnits("in")}>inch</button>
        </span>
        <div className="reset-all" ref={box}>
          <button type="button" className="btn-ghost-sm" aria-haspopup="dialog" aria-expanded={confirm} onClick={() => setConfirm((c) => !c)}>
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
        <button className="btn-export wide" type="button" onClick={onExport}><Download size={16} aria-hidden />{exportLabel}</button>
      </div>
    </div>
  );
}
