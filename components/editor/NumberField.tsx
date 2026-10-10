"use client";

import { useEffect, useRef, useState } from "react";
import { clamp } from "@/lib/hinge";
import type { BaseField } from "./fields";
import { dispVal, stepMM, type Units } from "./format";

export function NumberField({
  field, value, units, label, hidden, defaultValue, onLive, onCommit,
}: {
  field: BaseField;
  value: number;
  units: Units;
  label: string;
  hidden: boolean;
  /** Double-click on the label or the ↺ button restores it. */
  defaultValue?: number;
  onLive: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => dispVal(!!field.len, value, units));
  const [invalid, setInvalid] = useState(false);
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
    let v = field.len ? v0 * (units === "in" ? 25.4 : 1) : v0;
    v = clamp(v, field.min ?? -1e9, field.max ?? 1e9);
    if (!field.len && !field.float) v = Math.round(v);
    if (history) setText(dispVal(!!field.len, v, units));
    if (history) onCommit(v);
    else onLive(v);
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

  return (
    <div className={`fld${invalid ? " invalid" : ""}`} hidden={hidden} data-id={field.id}>
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
          onKeyDown={(e) => {
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
            e.preventDefault();
            nudge(e.key === "ArrowUp" ? 1 : -1, e.shiftKey);
          }}
        />
        <span className="u">{field.len ? units : ""}</span>
        {differs && (
          <button type="button" className="rst" aria-label={`Reset ${label}`} title={`Reset to ${dispVal(!!field.len, defaultValue!, units)}`}
            onPointerDown={(e) => e.preventDefault()} onClick={reset}>↺</button>
        )}
      </span>
    </div>
  );
}
