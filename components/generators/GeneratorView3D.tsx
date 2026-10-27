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
import { rebuiltExplode } from "@/lib/three/rebuilt";
import { quadProps, useView3D } from "@/components/shell/view3d";
import { View3DBarTools } from "@/components/shell/View3DTools";
import type { Units } from "@/components/editor/format";
import {ribAssemblyPlan} from '@/lib/photoproduct/ribAssembly';
import {ribAssemblyScene,type RibAssemblyScene} from '@/lib/photoproduct/ribAssemblyScene';
import RibAssemblyGuide from '@/components/photoproduct/RibAssemblyGuide';

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
  const [guide,setGuide]=useState(false);
  const plan=useMemo(()=>out?ribAssemblyPlan(out):null,[out]);
  const guiding=guide&&!!plan;
  const [sel, setSel] = useState<string | null>(null);
  // A box that folds (Paper Box): 0 % is the flat net, 100 % the folded box; it folds and explodes in place.
  const [fold, setFold] = useState(1);
  const folds = useMemo(() => !!out?.parts.some((p) => p.views3d?.some((q) => q.frames?.length)), [out]);
  const editable = !!edit;
  // Folding boxes fold and explode in place; the rest are rebuilt as they pull apart where they
  // stand, behind one root, so the views widen with them.
  const scene = useMemo(() => {
    if (!out || out.error) return null;
    if(guiding&&plan)return ribAssemblyScene(out,T,lookOf(material),plan);
    if (flat && lay) return flatScene(flatOf(lay), T);
    return folds ? generatorScene(out, T, 0) : rebuiltExplode((e) => generatorScene(out, T, e));
  }, [out, lay, T, flat, folds, guiding,plan,material]);
  useEffect(() => {
    const folder = scene && "fold" in scene ? scene.fold : undefined;
    if (!folder) return;
    folder(fold);
    v.handle.current?.refresh();
  }, [scene, fold, v.handle]);
  // A different set of parts (another design) reframes; resizing the same parts does not.
  const parts = useMemo(() => out?.parts.map((p) => p.id).join(",") ?? "", [out]);
  const key = guiding?`assembly|${frameKey}|${parts}`:flat && lay ? `flat|${Math.round(lay.width)}x${Math.round(lay.height)}` : `${frameKey}|${parts}`;
  const size = useMemo((): [number, number, number] | null => {
    if (!scene || guiding || flat || explode || fold < 1 || !sel || !editable) return null;
    const b = modelBox(scene.group);
    return b.isEmpty() ? null : [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
  }, [scene, guiding,flat, explode, fold, sel, editable]);
  const grips = size && edit ? generatorGrips(edit.def, edit.params, edit.set, units, size, sel) : undefined;
  return (
    <QuadView
      decimals={editorPrefs.decimals}
      {...quadProps(v)} id="preview3d" model={scene} look={guiding?null:lookOf(material)} frameKey={key} units={units} explode={guiding?0:explode}
      className={guiding?'rib-guide-active':undefined} autoOrbit={!guiding} onPick={guiding?()=>{}:undefined}
      measure={!guiding&&(flat || (explode === 0 && fold === 1))} label="The design in 3D: Top, Front, Left and Perspective views" onSelect={setSel} grips={grips}
    >
      <View3DBarTools v={v} flat={!guiding} explodeLabel={guiding?null:'Explode'}>
        {plan&&<button type="button" aria-pressed={guiding} onClick={()=>{if(!guiding){v.setFlat(false);v.setExplode(0,0);v.setQuad(false);v.setActive('persp');}setGuide(!guiding);}}>Assembly guide</button>}
        {folds && !flat && (
          <label className="v3-explode" title="0 % is flat, 100 % is the assembled target">{edit?.def.id === 'popup' ? 'Open ↔ flat' : 'Fold'}
            <input type="range" min={0} max={1} step={0.01} value={fold} aria-label={edit?.def.id === 'popup' ? 'Open pop-up' : 'Fold'} aria-valuetext={`${Math.round(fold * 100)} %`} onChange={(e) => setFold(parseFloat(e.target.value))} />
          </label>
        )}
      </View3DBarTools>
      {guiding&&plan&&scene&&<RibAssemblyGuide plan={plan} scene={scene as RibAssemblyScene} handle={v.handle} onClose={()=>setGuide(false)}/>}
    </QuadView>
  );
}
