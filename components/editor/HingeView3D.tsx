"use client";

import { useMemo, useState } from "react";
import type { LayerContent, Layout, Model, Params } from "@/lib/hinge";
import { buildHingeScene, hingeFlatScene } from "@/lib/hinge3d/scene";
import { hingeUnfoldScene } from "@/lib/hinge3d/unfold";
import { hingeGrips } from "@/lib/hinge3d/grips";
import { lookOf } from "@/lib/three/looks";
import { useEditorPrefs } from "@/lib/prefs/editorStore";
import QuadView from "@/lib/three/QuadView";
import { quadProps, useView3D } from "@/components/shell/view3d";
import { View3DBarTools } from "@/components/shell/View3DTools";
import type { Units } from "./format";

/**
 * Hinge Box in the shared 3D workspace: the assembled box (explodable) or its parts lying flat.
 * With `edit`, a selected part shows handles that size the box.
 */
export default function HingeView3D({ model, params, lay, content, units, edit }: {
  model: Model | null; params: Params; lay: Layout | null; content: LayerContent | null; units: Units;
  edit?: { params: Params; set: (p: Params, record: boolean) => void };
}) {
  const v = useView3D();
  const editorPrefs = useEditorPrefs();
  const { flat, explode } = v;
  const [sel, setSel] = useState<string | null>(null);
  // Assembled, the box opens out in place (lid, walls, then every part to its place on the sheet),
  // so scrubbing and the play button move it without rebuilding it.
  const unfolds = !flat && !!lay;
  const scene = useMemo(() => {
    if (!model) return null;
    if (flat && lay) return hingeFlatScene(lay, content, params);
    return lay ? hingeUnfoldScene(model, params, lay, content) : buildHingeScene(model, params, 0);
  }, [model, params, flat, lay, content]);
  const size = flat && lay ? `${Math.round(lay.width)}x${Math.round(lay.height)}` : `${params.shape}|${Math.round(params.W)}|${Math.round(params.D)}|${Math.round(params.H)}|${Math.round(params.dia)}`;
  const grips = sel && edit && !flat && !explode ? hingeGrips(edit.params, (patch) => edit.set({ ...edit.params, ...patch }, true), units) : undefined;
  return (
    <QuadView
      decimals={editorPrefs.decimals}
      {...quadProps(v)} id="preview3d" model={scene} look={lookOf(params.material)} frameKey={`${flat ? "flat" : "box"}|${size}`} units={units} {...(unfolds ? { explode } : {})}
      measure={flat || explode === 0} label="Hinge Box in 3D: Top, Front, Left and Perspective views" onSelect={setSel} grips={grips}
    >
      <View3DBarTools v={v} flat />
    </QuadView>
  );
}
