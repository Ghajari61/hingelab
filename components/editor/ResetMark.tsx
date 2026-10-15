"use client";

import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";

/** The ↺ beside a setting that differs from its default; one click restores the default. */
export function ResetMark({ label, show, to, onReset }: { label: string; show: boolean; to?: string; onReset: () => void }) {
  if (!show) return null;
  return (
    <button
      type="button" className="rst-mark" aria-label={`Reset ${label}`} title={to ? `Reset to ${to}` : "Reset to the default"}
      onPointerDown={(e) => e.preventDefault()} onClick={onReset}
    >
      <RotateCcw size={12} strokeWidth={2.2} />
    </button>
  );
}

/** A checkbox row with a ↺ while it differs from its default. */
export function CheckField({ label, checked, def, title, onChange, children }: {
  label: string;
  checked: boolean;
  def?: boolean;
  title?: string;
  onChange: (on: boolean) => void;
  /** The visible text, when it says more than `label`. */
  children?: ReactNode;
}) {
  return (
    <div className="chk-row">
      <label className="chk" title={title}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {children ?? label}
      </label>
      <ResetMark label={label} show={def !== undefined && checked !== def} to={def ? "on" : "off"} onReset={() => onChange(!!def)} />
    </div>
  );
}
