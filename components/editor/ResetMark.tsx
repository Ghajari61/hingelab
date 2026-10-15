"use client";

import type { ReactNode } from "react";
import { Dices, RotateCcw } from "lucide-react";

/** A small dice beside a heading: a new random pick for that group (one undo step). */
export function RandomMark({ label, onRandom }: { label: string; onRandom: () => void }) {
  return (
    <button
      type="button" className="rst-mark" aria-label={`Randomise ${label}`} title={`A random ${label.toLowerCase()}. Ctrl+Z undoes it.`}
      onPointerDown={(e) => e.preventDefault()} onClick={onRandom}
    >
      <Dices size={12} strokeWidth={2.2} />
    </button>
  );
}

/**
 * The ↺ beside a setting that differs from its default; one click restores the default. Its name
 * leaves out the setting's label (given as its description), so the label names only the setting.
 */
export function ResetMark({ label, show, to, onReset }: { label: string; show: boolean; to?: string; onReset: () => void }) {
  if (!show) return null;
  return (
    <button
      type="button" className="rst-mark" aria-label="Reset to default" aria-description={label} data-field={label}
      title={to ? `Reset to ${to}` : "Reset to the default"}
      onPointerDown={(e) => e.preventDefault()} onClick={onReset}
    >
      <RotateCcw size={12} strokeWidth={2.2} />
    </button>
  );
}

/** A checkbox row with a ↺ while it differs from its default. */
export function CheckField({ label, checked, def, title, onChange, extra, children }: {
  label: string;
  checked: boolean;
  def?: boolean;
  title?: string;
  onChange: (on: boolean) => void;
  /** Sits after the label, outside it (e.g. a lock). */
  extra?: ReactNode;
  /** The visible text, when it says more than `label`. */
  children?: ReactNode;
}) {
  return (
    <div className="chk-row">
      <label className="chk" title={title}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {children ?? label}
      </label>
      {extra}
      <ResetMark label={label} show={def !== undefined && checked !== def} to={def ? "on" : "off"} onReset={() => onChange(!!def)} />
    </div>
  );
}
