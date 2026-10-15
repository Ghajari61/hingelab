"use client";

import { useMemo, useState } from "react";
import type { Layout } from "@/lib/hinge";
import { generatorGrips } from "@/lib/generators/grips3d";
import { flatOf, type CutPart } from "@/lib/generators/output";
import { generatorScene } from "@/lib/generators/scene3d";
import type { AnyGenerator, GenBase, GenOutput } from "@/lib/generators/types";
import { modelBox } from "@/lib/three/dims";
import { flatScene } from "@/lib/three/flat";
import { lookOf } from "@/lib/three/looks";
import QuadView from "@/lib/three/QuadView";
import { quadProps, useView3D } from "@/components/shell/view3d";
import { View3DBarTools } from "@/components/shell/View3DTools";
import type { Units } from "@/components/editor/format";

/**
 * A generator's design assembled in 3D, or its parts lying flat as cut. With `edit`, a selected
 * part, text, motif, number or picture shows handles that change the design's settings
 * (lib/generators/grips3d.ts).
 */
export default function GeneratorView3D({ out, lay, T, material, units, frameKey, edit }: {
  out: GenOutput | null;
  lay: Layout<CutPart> | null;
  T: number;
  material: string;
  units: Units;
  frameKey: string;
  edit?: { def: AnyGenerator; params: GenBase; set: (p: GenBase, record: boolean) => void };
}) {
  const v = useView3D();
  const { flat, explode } = v;
  const [sel, setSel] = useState<string | null>(null);
  const editable = !!edit;
  const scene = useMemo(() => {
    if (!out || out.error) return null;
    if (flat && lay) return flatScene(flatOf(lay), T);
    return generatorScene(out, T, explode);
  }, [out, lay, T, flat, explode]);
  // A different set of parts (another design) reframes; resizing the same parts does not.
  const parts = useMemo(() => out?.parts.map((p) => p.id).join(",") ?? "", [out]);
  const key = flat && lay ? `flat|${Math.round(lay.width)}x${Math.round(lay.height)}` : `${frameKey}|${parts}`;
  const size = useMemo((): [number, number, number] | null => {
    if (!scene || flat || explode || !sel || !editable) return null;
    const b = modelBox(scene.group);
    return b.isEmpty() ? null : [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
  }, [scene, flat, explode, sel, editable]);
  const grips = size && edit ? generatorGrips(edit.def, edit.params, edit.set, units, size, sel) : undefined;
  return (
    <QuadView
      {...quadProps(v)} id="preview3d" model={scene} look={lookOf(material)} frameKey={key} units={units}
      measure={flat || explode === 0} label="The design in 3D: Top, Front, Left and Perspective views" onSelect={setSel} grips={grips}
    >
      <View3DBarTools v={v} flat />
    </QuadView>
  );
}
