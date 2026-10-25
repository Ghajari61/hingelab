"use client";

import { useEffect, useMemo, useState } from "react";
import type { Layout } from "@/lib/hinge";
import { generatorGrips } from "@/lib/generators/grips3d";
import { flatOf, type CutPart } from "@/lib/generators/output";
import { generatorScene } from "@/lib/generators/scene3d";
import type { AnyGenerator, GenBase, GenOutput } from "@/lib/generators/types";
import { modelBox } from "@/lib/three/dims";
import { flatScene } from "@/lib/three/flat";
import { lookOf } from "@/lib/three/looks";
import { useEditorPrefs } from "@/lib/prefs/editorStore";
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
  const editorPrefs = useEditorPrefs();
  const { flat, explode } = v;
  const [sel, setSel] = useState<string | null>(null);
  // A box that folds (Paper Box): 0 % is the flat net, 100 % the folded box; it folds and explodes in place.
  const [fold, setFold] = useState(1);
  const folds = useMemo(() => !!out?.parts.some((p) => p.views3d?.some((q) => q.frames?.length)), [out]);
  const editable = !!edit;
  const rebuildOn = folds ? 0 : explode;
  const scene = useMemo(() => {
    if (!out || out.error) return null;
    if (flat && lay) return flatScene(flatOf(lay), T);
    return generatorScene(out, T, rebuildOn);
  }, [out, lay, T, flat, rebuildOn]);
  useEffect(() => {
    if (!scene?.fold) return;
    scene.fold(fold);
    v.handle.current?.refresh();
  }, [scene, fold, v.handle]);
  // A different set of parts (another design) reframes; resizing the same parts does not.
  const parts = useMemo(() => out?.parts.map((p) => p.id).join(",") ?? "", [out]);
  const key = flat && lay ? `flat|${Math.round(lay.width)}x${Math.round(lay.height)}` : `${frameKey}|${parts}`;
  const size = useMemo((): [number, number, number] | null => {
    if (!scene || flat || explode || fold < 1 || !sel || !editable) return null;
    const b = modelBox(scene.group);
    return b.isEmpty() ? null : [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
  }, [scene, flat, explode, fold, sel, editable]);
  const grips = size && edit ? generatorGrips(edit.def, edit.params, edit.set, units, size, sel) : undefined;
  return (
    <QuadView
      decimals={editorPrefs.decimals}
      {...quadProps(v)} id="preview3d" model={scene} look={lookOf(material)} frameKey={key} units={units} {...(folds ? { explode } : {})}
      measure={flat || (explode === 0 && fold === 1)} label="The design in 3D: Top, Front, Left and Perspective views" onSelect={setSel} grips={grips}
    >
      <View3DBarTools v={v} flat>
        {folds && !flat && (
          <label className="v3-explode" title={out?.fold?.title ?? "Fold the box: 0 % is the flat net, 100 % the folded box"}>{out?.fold?.label ?? "Fold"}
            <input type="range" min={0} max={1} step={0.01} value={fold} aria-label={out?.fold?.label ?? "Fold"} aria-valuetext={`${Math.round(fold * 100)} %`} onChange={(e) => setFold(parseFloat(e.target.value))} />
          </label>
        )}
      </View3DBarTools>
    </QuadView>
  );
}
