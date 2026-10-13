"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Grid2x2, Maximize, Ruler, Square } from "lucide-react";
import type { View3DState } from "./view3d";

const PREFS_KEY = "hl.view3d";
const DIMS_KEY = "hl.dims3d";

interface ToolsProps {
  v: View3DState;
  /** Adds Assembled / Lay flat. */
  flat?: boolean;
  /** Null hides the slider. */
  explodeLabel?: string | null;
  /** Extra controls for this editor (after the display mode). */
  children?: React.ReactNode;
}

/**
 * The 3D toolbar beside the Sheets / 3D switch: one or four views, display mode, explode,
 * dimensions and zoom extents. It restores and saves the layout preferences, and publishes the
 * bar's height on the stage as --view-bar-h so the 3D views start below it.
 */
export function View3DTools({ v, flat = false, explodeLabel = "Explode", children }: ToolsProps) {
  const el = useRef<HTMLDivElement>(null);
  const restored = useRef(false);

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as { quad?: unknown; shade?: unknown };
      if (p.quad === false) v.setQuad(false);
      if (p.shade === "edges") v.setShade("edges");
      if (localStorage.getItem(DIMS_KEY) === "0") v.setDims(false);
    } catch { /* storage blocked or bad JSON */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // The first run still has the defaults: the restored values arrive on the next render.
    if (!restored.current) { restored.current = true; return; }
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ quad: v.quad, shade: v.shade }));
      localStorage.setItem(DIMS_KEY, v.dims ? "1" : "0");
    } catch { /* storage blocked */ }
  }, [v.quad, v.shade, v.dims]);

  useLayoutEffect(() => {
    const bar = el.current?.parentElement, stage = bar?.parentElement;
    if (!bar || !stage) return;
    const set = () => stage.style.setProperty("--view-bar-h", `${bar.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="v3-tools" ref={el} role="toolbar" aria-label="3D view">
      <button
        type="button" className="v3-tool" aria-pressed={v.quad} aria-label={v.quad ? "Maximize the active view" : "Show all four views"}
        title={v.quad ? "Maximize the active view (Alt+W)" : "Show all four views (Alt+W)"} onClick={() => v.setQuad(!v.quad)}
      >{v.quad ? <Grid2x2 size={15} aria-hidden /> : <Square size={15} aria-hidden />}</button>
      <span className="v3-seg" role="group" aria-label="Display">
        <button type="button" aria-pressed={v.shade === "shaded"} title="Shaded" onClick={() => v.setShade("shaded")}>Shaded</button>
        <button type="button" aria-pressed={v.shade === "edges"} title="Shaded with edges (F4)" onClick={() => v.setShade("edges")}>Edges</button>
      </span>
      {flat && (
        <span className="v3-seg" role="group" aria-label="3D layout">
          <button type="button" aria-pressed={!v.flat} title="The design put together" onClick={() => v.setFlat(false)}>Assembled</button>
          <button type="button" aria-pressed={v.flat} title="The parts lying flat as cut" onClick={() => v.setFlat(true)}>Lay flat</button>
        </span>
      )}
      {children}
      {!(flat && v.flat) && explodeLabel && (
        <label className="v3-explode" title="Pull the parts apart">{explodeLabel}
          <input type="range" min={0} max={1} step={0.01} value={v.explode} aria-label={explodeLabel} onChange={(e) => v.setExplode(parseFloat(e.target.value))} />
        </label>
      )}
      <button
        type="button" className="v3-tool" aria-pressed={v.dims} aria-label="Dimensions"
        title={v.dims ? "Hide the overall dimensions" : "Show the overall dimensions (hidden while exploded)"} onClick={() => v.setDims(!v.dims)}
      ><Ruler size={15} aria-hidden /></button>
      <button type="button" className="v3-tool" aria-label="Zoom extents" title="Zoom extents, all views (Shift+Z)" onClick={() => v.handle.current?.fit()}><Maximize size={15} aria-hidden /></button>
    </div>
  );
}

/**
 * The toolbar rendered from inside a 3D view (which loads lazily with three.js): it is placed in
 * the stage's Sheets / 3D bar, which hides it while the sheets are shown.
 */
export function View3DBarTools(props: Omit<ToolsProps, "children">) {
  const probe = useRef<HTMLSpanElement>(null);
  const [bar, setBar] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { setBar(probe.current?.closest(".stage")?.querySelector<HTMLElement>(".view-bar") ?? null); }, []);
  return (
    <>
      <span ref={probe} hidden />
      {bar && createPortal(<View3DTools {...props} />, bar)}
    </>
  );
}
