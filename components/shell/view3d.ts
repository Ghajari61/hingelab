"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PaneId, QuadViewHandle, Shade3D } from "@/lib/three/QuadView";

/** A full open or close (0 to 1) takes this long, ms; smaller moves take their share of it. */
export const EXPLODE_MS = 2600;
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

/**
 * The 3D workspace's settings, kept by the editor so the toolbar and the view share them. The
 * toolbar (loaded with the 3D view) restores and saves the layout preferences.
 *
 * Explode is eased: `explodeTarget` is where the slider (or the play button) asks to go, and
 * `explode` glides there, so the model opens and closes smoothly instead of jumping.
 */
export function useView3D() {
  const [quad, setQuad] = useState(true);
  const [shade, setShade] = useState<Shade3D>("shaded");
  const [dims, setDims] = useState(true);
  const [active, setActive] = useState<PaneId>("persp");
  const [explode, setShown] = useState(0);
  const [explodeTarget, setTarget] = useState(0);
  const [flat, setFlat] = useState(false);
  const handle = useRef<QuadViewHandle | null>(null);
  const now = useRef(0);
  const frame = useRef(0);
  const setExplode = useCallback((to: number, ms?: number) => {
    const target = Math.min(1, Math.max(0, to));
    setTarget(target);
    cancelAnimationFrame(frame.current);
    const from = now.current, d = Math.abs(target - from);
    const still = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (d < 1e-4 || still || typeof requestAnimationFrame === "undefined") { now.current = target; setShown(target); return; }
    const dur = ms ?? Math.max(160, EXPLODE_MS * d), t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      now.current = from + (target - from) * ease(k);
      setShown(now.current);
      if (k < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }, []);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return { quad, setQuad, shade, setShade, dims, setDims, active, setActive, explode, explodeTarget, setExplode, flat, setFlat, handle };
}

export type View3DState = ReturnType<typeof useView3D>;

/** The props every editor's 3D view passes to the shared four-view stage. */
export function quadProps(v: View3DState) {
  return { ref: v.handle, shade: v.shade, quad: v.quad, active: v.active, onActive: v.setActive, onQuad: v.setQuad, onShade: v.setShade, dims: v.dims };
}
