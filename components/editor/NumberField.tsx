"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { clamp } from "@/lib/hinge";
import { Slider } from "@/components/shell/Slider";
import type { BaseField } from "./fields";
import { dispVal, stepMM, type Units } from "./format";

export function NumberField({
  field, value, units, label, hidden, defaultValue, slider = true, onLive, onCommit,
}: {
  field: BaseField;
  value: number;
  units: Units;
  label: string;
  hidden: boolean;
  /** Double-click on the label or the ↺ button restores it. */
  defaultValue?: number;
  /** Show a slider between the name and the value box. */
  slider?: boolean;
  onLive: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => dispVal(!!field.len, value, units));
  const [invalid, setInvalid] = useState(false);
  /** Why a committed entry was changed to `at` (the field's limits); shown while the value stays there. */
  const [note, setNote] = useState<{ text: string; at: number } | null>(null);
  const scrub = useRef<{ x: number; v: number; moved: boolean; current: number } | null>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setText(dispVal(!!field.len, value, units));
      setInvalid(false);
    }
  }, [value, units, field.len, label]);

  function applyRaw(raw: string, history: boolean) {
    const v0 = parseFloat(raw);
    if (!isFinite(v0)) {
      setInvalid(true);
      if (history) setText(dispVal(!!field.len, value, units));
      return;
    }
    setInvalid(false);
    const typed = field.len ? v0 * (units === "in" ? 25.4 : 1) : v0;
    const lo = field.min ?? -1e9, hi = field.max ?? 1e9;
    let v = clamp(typed, lo, hi);
    if (!field.len && !field.float) v = Math.round(v);
    if (history) {
      const limit = (word: string, x: number) => `${label} must be ${word} ${dispVal(!!field.len, x, units)}${field.len ? ` ${units}` : ""}`;
      setNote((prev) => (typed < lo ? { text: limit("at least", lo), at: v } : typed > hi ? { text: limit("at most", hi), at: v } : prev?.at === v ? prev : null));
      setText(dispVal(!!field.len, v, units));
      onCommit(v);
    } else onLive(v);
  }

  function nudge(dir: number, shift: boolean) {
    const step = stepMM(field.step, !!field.len, units, false) * (shift ? 10 : 1);
    let v = clamp(value + dir * step, field.min ?? -1e9, field.max ?? 1e9);
    if (!field.len && !field.float) v = Math.round(v);
    setText(dispVal(!!field.len, v, units));
    setInvalid(false);
    onCommit(v);
  }

  const canReset = defaultValue !== undefined && isFinite(defaultValue)
    && defaultValue >= (field.min ?? -1e9) && defaultValue <= (field.max ?? 1e9);
  const differs = canReset && Math.abs(defaultValue - value) > 1e-9;
  function reset() {
    if (!canReset) return;
    setText(dispVal(!!field.len, defaultValue, units));
    setInvalid(false);
    if (differs) onCommit(defaultValue);
  }

  const range = slider ? sliderRange(field, value, defaultValue) : null;
  const shownNote = !!note && Math.abs(note.at - value) < 1e-9;

  return (
    <div className={`fld${invalid ? " invalid" : ""}${range ? "" : " no-slider"}`} hidden={hidden} data-id={field.id}>
      <label
        htmlFor={`f_${field.id}`}
        title={canReset ? `Drag to change, double-click to reset to ${dispVal(!!field.len, defaultValue, units)}` : "Drag to change"}
        onDoubleClick={reset}
        onPointerDown={(e) => {
          e.preventDefault();
          scrub.current = { x: e.clientX, v: value, moved: false, current: value };
          (e.currentTarget as HTMLLabelElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const sd = scrub.current;
          if (!sd) return;
          const dx = e.clientX - sd.x;
          if (Math.abs(dx) > 2) sd.moved = true;
          const step = stepMM(field.step, !!field.len, units, true) * (e.shiftKey ? 10 : 1);
          let v = clamp(sd.v + Math.round(dx / 4) * step, field.min ?? -1e9, field.max ?? 1e9);
          v = (field.len || field.float) ? Math.round(v * 1000) / 1000 : Math.round(v);
          if (v !== sd.current) {
            sd.current = v;
            setText(dispVal(!!field.len, v, units));
            setInvalid(false);
            onLive(v);
          }
        }}
        onPointerUp={() => {
          const sd = scrub.current;
          scrub.current = null;
          if (!sd) return;
          if (!sd.moved) inputRef.current?.focus();
          else onCommit(sd.current);
        }}
        onPointerCancel={() => { scrub.current = null; }}
      >
        {label}
      </label>
      {range && (
        <Slider
          value={value} min={range[0]} max={range[1]} step={field.len || field.float ? field.step : Math.max(1, Math.round(field.step))} label={label}
          onLive={(v) => { setText(dispVal(!!field.len, v, units)); setInvalid(false); onLive(v); }}
          onCommit={(v) => { setText(dispVal(!!field.len, v, units)); setInvalid(false); onCommit(v); }}
        />
      )}
      <span className="in">
        <input
          ref={inputRef}
          id={`f_${field.id}`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            applyRaw(e.target.value, false);
          }}
          onBlur={(e) => { applyRaw(e.target.value, true); }}
          aria-describedby={shownNote ? `f_${field.id}_note` : undefined}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); applyRaw(e.currentTarget.value, true); return; }
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
            e.preventDefault();
            nudge(e.key === "ArrowUp" ? 1 : -1, e.shiftKey);
          }}
        />
        <span className="u">{field.len ? units : ""}</span>
        {differs && (
          <button type="button" className="rst" aria-label={`Reset ${label}`} title={`Reset to ${dispVal(!!field.len, defaultValue!, units)}`}
            onPointerDown={(e) => e.preventDefault()} onClick={reset}><RotateCcw size={12} strokeWidth={2.2} /></button>
        )}
      </span>
      {shownNote && note && <p className="fld-msg" id={`f_${field.id}_note`} role="status">{note.text}</p>}
    </div>
  );
}

/** Slider span: the field's own limits, or (open-ended fields) up to three times the default. */
function sliderRange(field: BaseField, value: number, def: number | undefined): [number, number] | null {
  const lo = field.min ?? 0;
  let hi = field.max;
  if (hi === undefined) {
    const base = Math.max(Math.abs(def ?? value), field.step * 10);
    hi = Math.max(lo + field.step * 10, base * 3, value);
  }
  return hi > lo && value >= lo - 1e-9 ? [lo, hi] : null;
}