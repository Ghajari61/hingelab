"use client";

import { useRef } from "react";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * A compact track-and-knob slider: live values while dragging, one commit on release or key press.
 * Shift slows a drag ten times and makes arrow keys move by `fine`.
 */
export function Slider({ value, min, max, step, fine, label, onLive, onCommit }: {
  value: number;
  min: number;
  max: number;
  step: number;
  /** Step while Shift is held (defaults to `step`, for whole numbers). */
  fine?: number;
  label: string;
  onLive: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  /** Knob position along the track (px from the left) and the value it gave. */
  const drag = useRef<{ pos: number; last: number; v: number } | null>(null);
  const snap = (v: number, s = step) => {
    const x = Math.round((v - min) / s) * s + min;
    return Math.round(clamp(x, min, max) * 1e6) / 1e6;
  };
  const move = (clientX: number, shift: boolean) => {
    const d = drag.current!, w = ref.current!.getBoundingClientRect().width || 1;
    d.pos = clamp(d.pos + (clientX - d.last) * (shift ? 0.1 : 1), 0, w);
    d.last = clientX;
    return snap(min + (d.pos / w) * (max - min), shift ? fine ?? step : step);
  };
  const frac = clamp((value - min) / (max - min), 0, 1) * 100;
  return (
    <div
      ref={ref}
      className="slider"
      role="slider"
      tabIndex={0}
      aria-label={`${label} slider`}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      title="Drag, or use the arrow keys; hold Shift for fine steps"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.focus();
        const r = e.currentTarget.getBoundingClientRect();
        // A Shift-press keeps the knob where it is, ready for a fine drag.
        drag.current = { pos: e.shiftKey ? (frac / 100) * r.width : e.clientX - r.left, last: e.clientX, v: value };
        const v = e.shiftKey ? value : move(e.clientX, false);
        drag.current.v = v;
        if (v !== value) onLive(v);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const v = move(e.clientX, e.shiftKey);
        if (v !== d.v) { d.v = v; onLive(v); }
      }}
      onPointerUp={() => {
        const d = drag.current;
        if (!d) return;
        drag.current = null;
        onCommit(d.v);
      }}
      onPointerCancel={() => { drag.current = null; }}
      onKeyDown={(e) => {
        const s = e.shiftKey ? fine ?? step : step, big = (max - min) / 10;
        const d = { ArrowRight: s, ArrowUp: s, ArrowLeft: -s, ArrowDown: -s, PageUp: big, PageDown: -big }[e.key];
        let v: number | undefined;
        if (d !== undefined) v = snap(value + d, e.shiftKey ? fine ?? step : step);
        else if (e.key === "Home") v = min;
        else if (e.key === "End") v = max;
        if (v === undefined) return;
        e.preventDefault();
        if (v !== value) onCommit(v);
      }}
    >
      <span className="fill" style={{ width: `${frac}%` }} />
      <span className="knob" style={{ left: `${frac}%` }} />
    </div>
  );
}
