"use client";

import { useEffect, useId, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { evalNumberExpr } from "@/lib/studio/expr";
import { fromMM, toMM } from "@/lib/studio/units";
import type { Units } from "@/lib/studio/types";
import { ContextMenu, type MenuItem } from "./Menu";

/** Dispatched on a focused field's input by Edit → Reset ▸ Selected Field. */
export const RESET_FIELD_EVENT = "hingelab:reset-field";

/**
 * Numeric field (spec §4.4, §10): math, units, relative and percent input; arrow keys (Shift ×10,
 * Alt ×0.1); scrubbing on the label; ↺ when the value differs from its default (Alt+click on the label
 * resets too); right-click for reset, copy, paste and lock.
 * `length` fields hold millimetres and show `units`; other fields are shown as they are.
 */
export function NumberInput({
  label, value, onChange, units = "mm", length = false, min = -1e9, max = 1e9, step = 1, integer = false,
  defaultValue, presetValue, locked, onLockChange, suffix, hideLabel, testId, onResetToast,
}: {
  label: string;
  value: number;
  /** `commit` is false while scrubbing, true for typed values, arrows and resets (one undo step each). */
  onChange: (v: number, commit: boolean) => void;
  units?: Units;
  length?: boolean;
  min?: number; max?: number; step?: number; integer?: boolean;
  defaultValue?: number;
  presetValue?: number;
  locked?: boolean;
  onLockChange?: (locked: boolean) => void;
  suffix?: string;
  hideLabel?: boolean;
  testId?: string;
  onResetToast?: (message: string) => void;
}) {
  const id = useId();
  const show = (mm: number) => {
    const v = length ? fromMM(mm, units) : mm;
    const d = integer ? 0 : length && units === "in" ? 3 : 2;
    return String(Math.round(v * 10 ** d) / 10 ** d);
  };
  const [text, setText] = useState(() => show(value));
  const [invalid, setInvalid] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrub = useRef<{ x: number; v: number; moved: boolean; last: number } | null>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) { setText(show(value)); setInvalid(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, units, length]);

  const clampV = (v: number) => {
    let x = Math.min(max, Math.max(min, v));
    if (integer) x = Math.round(x);
    return x;
  };
  // Length steps are millimetres whatever the display unit, so arrows move the same distance in every unit.
  const unitStep = step;

  function commitText(raw: string) {
    const cur = length ? fromMM(value, units) : value;
    const r = evalNumberExpr(raw, { current: cur, unit: length ? units : null });
    if (r === null) { setInvalid(true); return; }
    const v = clampV(length ? toMM(r, units) : r);
    setInvalid(false);
    setText(show(v));
    if (v !== value) onChange(v, true);
  }

  function reset(to: number | undefined, what: string) {
    if (to === undefined || locked) return;
    onChange(to, true);
    setText(show(to));
    onResetToast?.(`Reset ${label} to ${show(to)}${length ? " " + units : suffix ? " " + suffix : ""}${what}`);
  }

  const differs = defaultValue !== undefined && Math.abs(defaultValue - value) > 1e-9;

  const resetRef = useRef(() => {});
  resetRef.current = () => reset(defaultValue, "");
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const on = () => resetRef.current();
    el.addEventListener(RESET_FIELD_EVENT, on);
    return () => el.removeEventListener(RESET_FIELD_EVENT, on);
  }, []);

  const items: MenuItem[] = [
    { id: "reset-default", label: "Reset to default", disabled: defaultValue === undefined || !differs || locked, run: () => reset(defaultValue, "") },
    { id: "reset-preset", label: "Reset to preset value", disabled: presetValue === undefined || locked, run: () => reset(presetValue, " (preset)") },
    "-",
    { id: "copy", label: "Copy value", run: () => { void navigator.clipboard?.writeText(show(value)); } },
    { id: "paste", label: "Paste value", disabled: locked, run: () => { void navigator.clipboard?.readText().then((t) => commitText(t)); } },
    "-",
    { id: "lock", label: locked ? "Unlock value" : "Lock value (excluded from Randomise)", disabled: !onLockChange, run: () => onLockChange?.(!locked) },
  ];

  return (
    <div className="ui-field" data-field={testId} onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}>
      <label
        htmlFor={id}
        className={hideLabel ? "ui-sr" : undefined}
        title="Drag to change, Alt+click to reset"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if (e.altKey) { e.preventDefault(); reset(defaultValue, ""); return; }
          if (locked) return;
          e.preventDefault();
          scrub.current = { x: e.clientX, v: value, moved: false, last: value };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const s = scrub.current;
          if (!s) return;
          const dx = e.clientX - s.x;
          if (Math.abs(dx) > 2) s.moved = true;
          if (!s.moved) return;
          const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
          const v = clampV(Math.round((s.v + Math.round(dx / 3) * unitStep * mult) * 1000) / 1000);
          if (v !== s.last) { s.last = v; setText(show(v)); onChange(v, false); }
        }}
        onPointerUp={() => {
          const s = scrub.current;
          scrub.current = null;
          if (!s) return;
          if (!s.moved) inputRef.current?.focus();
          else onChange(s.last, true);
        }}
        onPointerCancel={() => { scrub.current = null; }}
      >
        {label}
      </label>
      <span className="ui-field-row">
        <span className={`ui-num${invalid ? " invalid" : ""}${locked ? " locked" : ""}`}>
          <input
            ref={inputRef}
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            value={text}
            readOnly={locked}
            aria-invalid={invalid}
            data-testid={testId}
            onChange={(e) => { setText(e.target.value); setInvalid(false); }}
            onBlur={(e) => commitText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitText(e.currentTarget.value); e.currentTarget.select(); return; }
              if (e.key === "Escape") { setText(show(value)); setInvalid(false); e.currentTarget.blur(); return; }
              if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
              e.preventDefault();
              if (locked) return;
              const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
              const v = clampV(Math.round((value + (e.key === "ArrowUp" ? 1 : -1) * unitStep * mult) * 1e6) / 1e6);
              setText(show(v));
              onChange(v, true);
            }}
          />
          <span className="u">{length ? units : suffix ?? ""}</span>
        </span>
        {differs && !locked
          ? <button type="button" className="ui-reset" aria-label={`Reset ${label}`} title={`Reset to ${show(defaultValue!)}`} onClick={() => reset(defaultValue, "")}><RotateCcw size={12} /></button>
          : <span className="ui-reset spacer" aria-hidden />}
      </span>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} label={`${label} options`} />}
    </div>
  );
}
