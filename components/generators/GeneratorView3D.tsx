"use client";

import { useMemo, useState } from "react";
import type { Layout } from "@/lib/hinge";
import { flatOf, type CutPart } from "@/lib/generators/output";
import { generatorScene } from "@/lib/generators/scene3d";
import type { GenOutput } from "@/lib/generators/types";
import { flatScene } from "@/lib/three/flat";
import { lookOf } from "@/lib/three/looks";
import Viewport3D from "@/components/shell/Viewport3D";
import { View3DHud } from "@/components/shell/View3DHud";
import type { Units } from "@/components/editor/format";

/** A generator's design assembled in 3D, or its parts lying flat as cut. */
export default function GeneratorView3D({ out, lay, T, material, units, frameKey }: {
  out: GenOutput | null;
  lay: Layout<CutPart> | null;
  T: number;
  material: string;
  units: Units;
  frameKey: string;
}) {
  const [explode, setExplode] = useState(0);
  const [flat, setFlat] = useState(false);
  const scene = useMemo(() => {
    if (!out || out.error) return null;
    if (flat && lay) return flatScene(flatOf(lay), T);
    return generatorScene(out, T, explode);
  }, [out, lay, T, flat, explode]);
  // A different set of parts (another design) reframes; resizing the same parts does not.
  const parts = useMemo(() => out?.parts.map((p) => p.id).join(",") ?? "", [out]);
  const key = flat && lay ? `flat|${Math.round(lay.width)}x${Math.round(lay.height)}` : `${frameKey}|${parts}`;
  return (
    <Viewport3D scene={scene} look={lookOf(material)} frameKey={key} units={units} measure={flat || explode === 0} label="The design in 3D, drag to orbit">
      <View3DHud flat={flat} onFlat={setFlat} explode={explode} onExplode={setExplode} />
    </Viewport3D>
  );
}
