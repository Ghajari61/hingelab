"use client";

import { useRef } from "react";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A compact track-and-knob slider: live values while dragging, one commit on release or key press. */
export function Slider({ value, min, max, step, label, onLive, onCommit }: {
  value: number;
  min: number;
  max: number;
  step: number;
  label: string;
  onLive: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const snap = (v: number) => {
    const s = Math.round((v - min) / step) * step + min;
    return Math.round(clamp(s, min, max) * 1e6) / 1e6;
  };
  const at = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return snap(min + clamp((clientX - r.left) / r.width, 0, 1) * (max - min));
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
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.focus();
        const v = at(e.clientX);
        drag.current = v;
        onLive(v);
      }}
      onPointerMove={(e) => {
        if (drag.current === null) return;
        const v = at(e.clientX);
        if (v !== drag.current) { drag.current = v; onLive(v); }
      }}
      onPointerUp={() => {
        if (drag.current === null) return;
        const v = drag.current;
        drag.current = null;
        onCommit(v);
      }}
      onPointerCancel={() => { drag.current = null; }}
      onKeyDown={(e) => {
        const big = (max - min) / 10;
        const d = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: big, PageDown: -big }[e.key];
        let v: number | undefined;
        if (d !== undefined) v = snap(value + d * (e.shiftKey && Math.abs(d) === step ? 10 : 1));
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
