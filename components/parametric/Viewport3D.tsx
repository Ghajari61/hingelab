"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { MeshData, SliceResult } from "@/lib/parametric";
import type { Grip } from "@/lib/three/grips";
import QuadView, { type QuadModel } from "@/lib/three/QuadView";
import { quadProps, useView3D, type View3DState } from "@/components/shell/view3d";
import type { Units } from "@/components/editor/format";
import { FINISH_COLORS, deviationObject, disposeTree, modelObject, partsObject, planesObject } from "./scene";

export type ViewToggles = { model: boolean; planes: boolean; parts: boolean };

const SELECT_COLOR = 0x3b8ff0;

/**
 * The source model, the slicing planes and the assembled parts in the shared four-view 3D
 * workspace. `explode` (mm) pushes the parts apart along their plane normals; clicking a part
 * reports its id.
 */
export default function Viewport3D({ mesh, result, T, show, explode = 0, finish = "wood", heat = false, selected = [], onSelect, className = "pdbg-view", v, units = "mm", grips }: {
  mesh: MeshData | null;
  result: SliceResult | null;
  T: number;
  /** How the parts are coloured (a look only). */
  finish?: keyof typeof FINISH_COLORS;
  show: ViewToggles;
  explode?: number;
  /** Show the deviation samples as a heat map. */
  heat?: boolean;
  selected?: string[];
  onSelect?: (id: string | null) => void;
  className?: string;
  /** The editor's 3D settings (its toolbar); a view of its own when left out. */
  v?: View3DState;
  units?: Units;
  /** Handles on the model while a part is selected. */
  grips?: Grip[];
}) {
  const own = useView3D();
  const view = v ?? own;
  const layers = useRef<{ model?: THREE.Object3D; planes?: THREE.Object3D; parts?: THREE.Object3D; heat?: THREE.Object3D }>({});
  const framed = useRef("");
  const frameNext = useRef(false);
  const hl = useRef<THREE.MeshStandardMaterial | null>(null);
  const live = useRef({ show, heat });
  live.current = { show, heat };
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // One root for every layer; the layers are swapped in place and the stage told to redraw.
  const root = useMemo<QuadModel>(() => {
    const group = new THREE.Group();
    return {
      group,
      dispose: () => {
        for (const o of Object.values(layers.current)) if (o) disposeTree(o);
        layers.current = {};
      },
    };
  }, []);

  useEffect(() => {
    hl.current = new THREE.MeshStandardMaterial({ color: SELECT_COLOR, roughness: 0.6, emissive: 0x0c2a55 });
    return () => { hl.current?.dispose(); hl.current = null; };
  }, []);

  const swap = (k: "model" | "planes" | "parts" | "heat", o: THREE.Object3D | undefined) => {
    const old = layers.current[k];
    if (old) { root.group.remove(old); disposeTree(old); }
    layers.current[k] = o;
    if (o) {
      o.visible = k === "heat" ? live.current.heat : live.current.show[k];
      root.group.add(o);
    }
  };
  const redraw = (reframe = false) => view.handle.current?.refresh(reframe);

  const paintSelection = () => {
    const parts = layers.current.parts;
    if (!parts || !hl.current) return;
    const set = new Set(selected);
    for (const o of parts.children) {
      const m = o as THREE.Mesh;
      if (!m.isMesh) continue;
      m.userData.base ??= m.material;
      m.material = set.has(m.userData.partId as string) ? hl.current : (m.userData.base as THREE.Material);
    }
  };

  useEffect(() => {
    swap("heat", result ? deviationObject(result) : undefined);
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  useEffect(() => {
    if (layers.current.heat) layers.current.heat.visible = heat;
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heat]);

  useEffect(() => {
    swap("model", mesh ? modelObject(mesh) : undefined);
    // Frame a model shown before it is sliced; the first slice frames it again.
    redraw(!!mesh && !framed.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesh]);

  useEffect(() => {
    const planes = result ? planesObject(result) : undefined;
    // The planes are drawn a little larger than the model: they are not part of its size.
    planes?.traverse((o) => { o.userData.noMeasure = true; o.userData.noPick = true; });
    swap("planes", planes);
    if (result) {
      const { min, max } = result.bounds;
      const key = [...min, ...max].map((x) => Math.round(x)).join(",");
      if (key !== framed.current) { framed.current = key; frameNext.current = true; }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  // After the planes: a new slice is framed once its parts are in.
  useEffect(() => {
    swap("parts", result ? partsObject(result, T, explode, finish) : undefined);
    paintSelection();
    redraw(frameNext.current);
    frameNext.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, T, explode, finish]);

  useEffect(() => {
    paintSelection();
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    for (const k of ["model", "planes", "parts"] as const) if (layers.current[k]) layers.current[k]!.visible = show[k];
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  return (
    <QuadView
      {...quadProps(view)} model={root} look={null} frameKey="" units={units} measure={explode === 0}
      className={className} testId="parametric-view" label="The model, planes and parts in 3D: Top, Front, Left and Perspective views"
      pickable={(m) => m.userData.partId != null && !!layers.current.parts?.visible}
      onPick={(m) => onSelectRef.current?.((m?.userData.partId as string | undefined) ?? null)}
      grips={grips}
    />
  );
}
