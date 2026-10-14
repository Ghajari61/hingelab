"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clamp } from "@/lib/hinge";
import { sheetGrid } from "@/lib/fit/grid";

/** CSS pixels per millimeter at 100% zoom (96 dpi). */
export const PX_PER_MM = 96 / 25.4;

export interface View {
  z: number;
  tx: number;
  ty: number;
}

/**
 * Pan, zoom and "fit sheet". The view keeps fitting the design (resizes, new sheets) until the
 * user pans or zooms; Fit sheet goes back to that.
 */
export function useCanvasView() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const rulerHRef = useRef<HTMLDivElement>(null);
  const rulerVRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ z: 2, tx: 40, ty: 40 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [rulerSize, setRulerSize] = useState({ w: 0, h: 0 });
  const moved = useRef(false);
  const fitArgs = useRef<{ bedW: number; bedH: number; layW: number; layH: number; sheets?: { w: number; h: number }[] | null }>({ bedW: 600, bedH: 400, layW: 0, layH: 0 });

  const setViewNow = useCallback((next: View) => {
    viewRef.current = next;
    setView(next);
  }, []);

  const fit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const { bedW, bedH, layW, layH, sheets } = fitArgs.current;
    const g = sheets && sheets.length > 1 ? sheetGrid(sheets, r.width / r.height) : null;
    const W = g ? g.width : Math.max(bedW, layW);
    const H = g ? g.height : Math.max(bedH, layH);
    // Room above for the Sheets/3D switch and the sheet labels, below for the zoom bar.
    const top = 62, bottom = 52;
    const z = Math.min((r.width - 60) / W, (r.height - top - bottom) / H);
    moved.current = false;
    setViewNow({ z, tx: (r.width - W * z) / 2, ty: top + (r.height - top - bottom - H * z) / 2 });
    return true;
  }, [setViewNow]);

  /** Fit again unless the user has panned or zoomed since the last fit. */
  const refit = useCallback(() => (moved.current ? false : fit()), [fit]);

  const zoomAt = useCallback((f: number, cx: number, cy: number) => {
    const v = viewRef.current;
    const nz = clamp(v.z * f, 0.2, 80);
    moved.current = true;
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
    moved.current = true;
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
      refit();
    });
    if (canvas) ro.observe(canvas);
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    const id = requestAnimationFrame(() => { refit(); });
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(id);
    };
  }, [refit]);

  return { canvasRef, rulerHRef, rulerVRef, view, viewRef, rulerSize, fit, refit, zoomAt, zoomCenter, panBy, fitArgs };
}
