"use client";

import { useEffect, useMemo, useState } from "react";
import type { Layout } from "@/lib/hinge";
import { generatorGrips } from "@/lib/generators/grips3d";
import { flatOf, genSVG, type CutPart } from "@/lib/generators/output";
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
export default function GeneratorView3D({ out, lay, T, material, units, frameKey, edit, cutFile }: {
  out: GenOutput | null;
  lay: Layout<CutPart> | null;
  T: number;
  material: string;
  units: Units;
  frameKey: string;
  cutFile?: { def: AnyGenerator; params: GenBase };
  edit?: { def: AnyGenerator; params: GenBase; set: (p: GenBase, record: boolean) => void };
}) {
  const v = useView3D();
  const editorPrefs = useEditorPrefs();
  const { flat, explode } = v;
  const [sel, setSel] = useState<string | null>(null);
  // A box that folds (Paper Box): 0 % is the flat net, 100 % the folded box; it folds and explodes in place.
  const [fold, setFold] = useState(1);
  const folds = useMemo(() => !!out?.parts.some((p) => p.views3d?.some((q) => q.frames?.length)), [out]);
  useEffect(() => { setFold(1); }, [frameKey, folds]);
  const editable = !!edit;
  // Rigid and folding parts move in place without rebuilding their meshes at each animation frame.
  const flatLayout = flat ? lay : null;
  const flatDef = flat ? cutFile?.def : undefined, flatParams = flat ? cutFile?.params : undefined;
  const scene = useMemo(() => {
    if (!out || out.error) return null;
    if (flat && flatLayout) return flatScene(flatOf(flatLayout), T, flatDef && flatParams ? { svg: genSVG(flatDef, flatParams, flatLayout), width: flatLayout.width, height: flatLayout.height } : undefined);
    return generatorScene(out, T, 0);
  }, [out, flatLayout, T, flat, flatDef, flatParams]);
  useEffect(() => {
    const folder = scene && "fold" in scene ? scene.fold : undefined;
    if (!folder) return;
    folder(fold);
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
      {...quadProps(v)} id="preview3d" model={scene} look={lookOf(material)} frameKey={key} units={units} explode={explode}
      measure={flat || (explode === 0 && fold === 1)} label="The design in 3D: Top, Front, Left and Perspective views" onSelect={setSel} grips={grips}
    >
      <View3DBarTools v={v} flat>
        {folds && !flat && (
          <label className="v3-explode" title="0 % is flat, 100 % is the assembled target">Fold
            <input type="range" min={0} max={1} step={0.01} value={fold} aria-label="Fold" aria-valuetext={`${Math.round(fold * 100)} %`} onChange={(e) => setFold(parseFloat(e.target.value))} />
          </label>
        )}
      </View3DBarTools>
    </QuadView>
  );
}
