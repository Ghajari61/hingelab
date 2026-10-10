"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clamp } from "@/lib/hinge";

/** CSS pixels per millimeter at 100% zoom (96 dpi). */
export const PX_PER_MM = 96 / 25.4;

export interface View {
  z: number;
  tx: number;
  ty: number;
}

/**
 * Pan, zoom and the one-shot "fit sheet". Later resizes redraw the rulers
 * without changing the zoom, matching the prototype.
 */
export function useCanvasView() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const rulerHRef = useRef<HTMLDivElement>(null);
  const rulerVRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ z: 2, tx: 40, ty: 40 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [rulerSize, setRulerSize] = useState({ w: 0, h: 0 });
  const fitted = useRef(false);
  const fitArgs = useRef({ bedW: 600, bedH: 400, layW: 0, layH: 0 });

  const setViewNow = useCallback((next: View) => {
    viewRef.current = next;
    setView(next);
  }, []);

  const fit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const { bedW, bedH, layW, layH } = fitArgs.current;
    const W = Math.max(bedW, layW);
    const H = Math.max(bedH, layH);
    const z = Math.min((r.width - 60) / W, (r.height - 60) / H);
    setViewNow({ z, tx: (r.width - W * z) / 2, ty: (r.height - H * z) / 2 + 6 });
    return true;
  }, [setViewNow]);

  const zoomAt = useCallback((f: number, cx: number, cy: number) => {
    const v = viewRef.current;
    const nz = clamp(v.z * f, 0.2, 80);
    setViewNow({
      z: nz,
      tx: cx - (cx - v.tx) * (nz / v.z),
      ty: cy - (cy - v.ty) * (nz / v.z),
    });
  }, [setViewNow]);

  const zoomCenter = useCallback((f: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    zoomAt(f, r.width / 2, r.height / 2);
  }, [zoomAt]);

  const panBy = useCallback((tx: number, ty: number) => {
    const v = viewRef.current;
    setViewNow({ ...v, tx, ty });
  }, [setViewNow]);

  useEffect(() => {
    const measure = () => {
      setRulerSize({
        w: rulerHRef.current?.clientWidth ?? 0,
        h: rulerVRef.current?.clientHeight ?? 0,
      });
    };
    measure();
    const canvas = canvasRef.current;
    const ro = new ResizeObserver(() => {
      measure();
      if (!fitted.current && fit()) fitted.current = true;
    });
    if (canvas) ro.observe(canvas);
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    const id = requestAnimationFrame(() => { if (fit()) fitted.current = true; });
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(id);
    };
  }, [fit]);

  return { canvasRef, rulerHRef, rulerVRef, view, viewRef, rulerSize, fit, zoomAt, zoomCenter, panBy, fitArgs };
}
