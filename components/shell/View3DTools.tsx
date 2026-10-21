"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Grid2x2, Maximize, Ruler, Square } from "lucide-react";
import type { EditorPrefs } from "@/lib/prefs/editor";
import { EDITOR_PREFS_EVENT, editorPrefs, saveEditorPrefs } from "@/lib/prefs/editorStore";
import type { View3DState } from "./view3d";

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

  const view = useRef(v);
  view.current = v;
  useEffect(() => {
    const p = editorPrefs();
    if (!p.quad) v.setQuad(false);
    if (p.shade === "edges") v.setShade("edges");
    if (!p.dims3d) v.setDims(false);
    const on = (e: Event) => {
      const n = (e as CustomEvent<EditorPrefs>).detail, c = view.current;
      if (n.quad !== c.quad) c.setQuad(n.quad);
      if (n.shade !== c.shade) c.setShade(n.shade);
      if (n.dims3d !== c.dims) c.setDims(n.dims3d);
    };
    window.addEventListener(EDITOR_PREFS_EVENT, on);
    return () => window.removeEventListener(EDITOR_PREFS_EVENT, on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // The first run still has the defaults: the restored values arrive on the next render.
    if (!restored.current) { restored.current = true; return; }
    const p = editorPrefs();
    if (p.quad !== v.quad || p.shade !== v.shade || p.dims3d !== v.dims) saveEditorPrefs({ quad: v.quad, shade: v.shade, dims3d: v.dims });
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
export function View3DBarTools(props: ToolsProps) {
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
