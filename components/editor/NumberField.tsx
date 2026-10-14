"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { clamp } from "@/lib/hinge";
import { Slider } from "@/components/shell/Slider";
import type { BaseField } from "./fields";
import { evalNumberExpr } from "@/lib/studio/expr";
import { dispVal, stepMM, type Units } from "./format";

export function NumberField({
  field, value, units, label, hidden, defaultValue, slider = true, extra, onLive, onCommit,
}: {
  /** A small control after the value (a Randomise lock). */
  extra?: ReactNode;
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
  const scrub = useRef<{ x: number; v: number; moved: boolean; current: number; travel: number; last: number } | null>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setText(dispVal(!!field.len, value, units));
      setInvalid(false);
    }
  }, [value, units, field.len, label]);

  function applyRaw(raw: string, history: boolean) {
    const per = field.len && units === "in" ? 25.4 : 1;
    const r = evalNumberExpr(label.endsWith("%") ? raw.replace(/%\s*$/, "") : raw, { current: value / per, unit: field.len ? units : null });
    const typed = r === null ? null : r * per;
    if (typed === null) {
      // Half-typed sums ("25.4*") wait for the rest; only a finished entry is flagged.
      if (history) { setInvalid(true); setText(dispVal(!!field.len, value, units)); }
      return;
    }
    setInvalid(false);
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
  const tip = [label, field.help, `Drag to change; hold Shift for fine steps.${canReset ? ` Double-click to reset to ${dispVal(!!field.len, defaultValue, units)}.` : ""}`].filter(Boolean).join("\n");
  /** Value steps: whole numbers stay whole; Shift makes lengths and decimals ten times finer. */
  const grain = (fine: boolean) => {
    const st = stepMM(field.step, !!field.len, units, true);
    return field.len || field.float ? (fine ? st / 10 : st) : Math.max(1, Math.round(st));
  };

  return (
    <div className={`fld${invalid ? " invalid" : ""}${range ? "" : " no-slider"}`} hidden={hidden} data-id={field.id}>
      <label
        htmlFor={`f_${field.id}`}
        title={tip}
        onDoubleClick={reset}
        onPointerDown={(e) => {
          e.preventDefault();
          scrub.current = { x: e.clientX, v: value, moved: false, current: value, travel: 0, last: e.clientX };
          (e.currentTarget as HTMLLabelElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const sd = scrub.current;
          if (!sd) return;
          if (Math.abs(e.clientX - sd.x) > 2) sd.moved = true;
          // Shift slows the drag ten times from where the pointer is, so pressing it never jumps.
          sd.travel += (e.clientX - sd.last) * (e.shiftKey ? 0.1 : 1);
          sd.last = e.clientX;
          const g = grain(e.shiftKey), step = stepMM(field.step, !!field.len, units, true);
          let v = clamp(sd.v + Math.round((sd.travel / 4) * step / g) * g, field.min ?? -1e9, field.max ?? 1e9);
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
          value={value} min={range[0]} max={range[1]} step={field.len || field.float ? field.step : Math.max(1, Math.round(field.step))} fine={field.len || field.float ? field.step / 10 : undefined} label={label}
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
        {extra}
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