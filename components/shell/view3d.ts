"use client";

import { useRef, useState } from "react";
import type { PaneId, QuadViewHandle, Shade3D } from "@/lib/three/QuadView";

/**
 * The 3D workspace's settings, kept by the editor so the toolbar and the view share them. The
 * toolbar (loaded with the 3D view) restores and saves the layout preferences.
 */
export function useView3D() {
  const [quad, setQuad] = useState(true);
  const [shade, setShade] = useState<Shade3D>("shaded");
  const [dims, setDims] = useState(true);
  const [active, setActive] = useState<PaneId>("persp");
  const [explode, setExplode] = useState(0);
  const [flat, setFlat] = useState(false);
  const handle = useRef<QuadViewHandle | null>(null);
  return { quad, setQuad, shade, setShade, dims, setDims, active, setActive, explode, setExplode, flat, setFlat, handle };
}

export type View3DState = ReturnType<typeof useView3D>;

/** The props every editor's 3D view passes to the shared four-view stage. */
export function quadProps(v: View3DState) {
  return { ref: v.handle, shade: v.shade, quad: v.quad, active: v.active, onActive: v.setActive, onQuad: v.setQuad, onShade: v.setShade, dims: v.dims };
}
