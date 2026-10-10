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

/** A generator's design assembled in 3D, or its parts lying flat as cut. */
export default function GeneratorView3D({ out, lay, T, material, frameKey }: {
  out: GenOutput | null;
  lay: Layout<CutPart> | null;
  T: number;
  material: string;
  frameKey: string;
}) {
  const [explode, setExplode] = useState(0);
  const [flat, setFlat] = useState(false);
  const scene = useMemo(() => {
    if (!out || out.error) return null;
    if (flat && lay) return flatScene(flatOf(lay), T);
    return generatorScene(out, T, explode);
  }, [out, lay, T, flat, explode]);
  const key = flat && lay ? `flat|${Math.round(lay.width)}x${Math.round(lay.height)}` : frameKey;
  return (
    <Viewport3D scene={scene} look={lookOf(material)} frameKey={key} label="The design in 3D, drag to orbit">
      <View3DHud flat={flat} onFlat={setFlat} explode={explode} onExplode={setExplode} />
    </Viewport3D>
  );
}
