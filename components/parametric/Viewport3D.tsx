"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { MeshData, SliceResult, ParametricParams } from "@/lib/parametric";
import type { GripSet } from "@/lib/three/grips";
import { useEditorPrefs } from "@/lib/prefs/editorStore";
import QuadView, { type QuadModel } from "@/lib/three/QuadView";
import { quadProps, useView3D, type View3DState } from "@/components/shell/view3d";
import type { Units } from "@/components/editor/format";
import { FINISH_COLORS, deviationObject, disposeTree, modelObject, partsObject, flatPartsObject, planesObject, type MovingParts } from "./scene";

export type ViewToggles = { model: boolean; planes: boolean; parts: boolean };

const SELECT_COLOR = 0x3b8ff0;
const NO_SHEETS: { x: number; y: number }[] = [];

/**
 * The source model, the slicing planes and the assembled parts in the shared four-view 3D
 * workspace. `explode` (mm) pushes the parts apart along their plane normals; clicking a part
 * reports its id.
 */
export default function Viewport3D({ mesh, result, T, show, explode = 0, finish = "wood", heat = false, selected = [], onSelect, className = "pdbg-view", v, units = "mm", grips, sheetPositions = NO_SHEETS, cutParams }: {
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
  grips?: GripSet;
  sheetPositions?: { x: number; y: number }[];
  cutParams?: ParametricParams;
}) {
  const own = useView3D();
  const editorPrefs = useEditorPrefs();
  const view = v ?? own;
  const flat = view.flat;
  const previousFlat = useRef(flat);
  const layers = useRef<{ model?: THREE.Object3D; planes?: THREE.Object3D; parts?: THREE.Object3D; heat?: THREE.Object3D }>({});
  const framed = useRef("");
  const frameNext = useRef(false);
  const hl = useRef<THREE.MeshStandardMaterial | null>(null);
  const live = useRef({ show, heat, flat });
  live.current = { show, heat, flat };
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
    hl.current.userData.shared = true;
    return () => { hl.current?.dispose(); hl.current = null; };
  }, []);

  const swap = (k: "model" | "planes" | "parts" | "heat", o: THREE.Object3D | undefined) => {
    const old = layers.current[k];
    if (old) { root.group.remove(old); disposeTree(old); }
    layers.current[k] = o;
    if (o) {
      o.visible = live.current.flat ? k === "parts" : k === "heat" ? live.current.heat : live.current.show[k];
      root.group.add(o);
    }
  };
  const redraw = (reframe = false) => view.handle.current?.refresh(reframe);

  const paintSelection = () => {
    const parts = layers.current.parts;
    if (!parts || !hl.current) return;
    const highlight = hl.current;
    const set = new Set(selected);
    parts.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.keepMaterial) return;
      m.userData.base ??= m.material;
      m.material = set.has(m.userData.partId as string) ? highlight : (m.userData.base as THREE.Material);
    });
  };

  useEffect(() => {
    swap("heat", result ? deviationObject(result) : undefined);
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  useEffect(() => {
    if (layers.current.heat) layers.current.heat.visible = heat && !flat;
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heat, flat]);

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

  const flatParams = flat ? cutParams : undefined;

  // After the planes: a new slice is framed once its parts are in.
  useEffect(() => {
    // QuadView supplies edges on demand; do not build a second always-visible edge overlay.
    const parts = result ? flat ? flatPartsObject(result, T, sheetPositions, flatParams) : partsObject(result, T, 0, finish, false) : undefined;
    if (parts && !flat) (parts as MovingParts).explode(explode);
    if (parts && flat) parts.traverse(o => {
      if (o instanceof THREE.Mesh && !o.userData.keepMaterial) (o.material as THREE.MeshStandardMaterial).color.setHex(FINISH_COLORS[finish][0]);
    });
    swap("parts", parts);
    if (parts && "ready" in parts) (parts.ready as Promise<unknown> | undefined)?.then(() => { if (layers.current.parts === parts) redraw(); });
    paintSelection();
    // Frame only the destination mode: the old source/planes must not enlarge flat-sheet bounds.
    for (const k of ["model", "planes", "parts"] as const) if (layers.current[k]) layers.current[k]!.visible = flat ? k === "parts" : show[k];
    if (layers.current.heat) layers.current.heat.visible = heat && !flat;
    redraw(frameNext.current || previousFlat.current !== flat);
    previousFlat.current = flat;
    frameNext.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, T, finish, flat, sheetPositions, flatParams]);

  useEffect(() => {
    if (!flat) (layers.current.parts as MovingParts | undefined)?.explode(explode);
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explode, flat]);

  useEffect(() => {
    paintSelection();
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    for (const k of ["model", "planes", "parts"] as const) if (layers.current[k]) layers.current[k]!.visible = flat ? k === "parts" : show[k];
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, flat]);

  return (
    <QuadView
      decimals={editorPrefs.decimals}
      {...quadProps(view)} model={root} look={null} frameKey="" units={units} measure={flat || explode === 0}
      className={className} testId="parametric-view" label="The model, planes and parts in 3D: Top, Front, Left and Perspective views"
      pickable={(m) => m.userData.partId != null && !!layers.current.parts?.visible}
      onPick={(m) => onSelectRef.current?.((m?.userData.partId as string | undefined) ?? null)}
      grips={flat ? undefined : grips}
    />
  );
}
