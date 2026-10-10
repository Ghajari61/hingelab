"use client";

import { useMemo, useState } from "react";
import type { LayerContent, Layout, Model, Params } from "@/lib/hinge";
import { buildHingeScene, hingeFlatScene } from "@/lib/hinge3d/scene";
import { lookOf } from "@/lib/three/looks";
import Viewport3D from "@/components/shell/Viewport3D";
import { View3DHud } from "@/components/shell/View3DHud";

/** Hinge Box in the shared 3D stage: the assembled box (explodable) or its parts lying flat. */
export default function HingeView3D({ model, params, lay, content }: { model: Model | null; params: Params; lay: Layout | null; content: LayerContent | null }) {
  const [explode, setExplode] = useState(0);
  const [flat, setFlat] = useState(false);
  const scene = useMemo(() => {
    if (!model) return null;
    return flat && lay ? hingeFlatScene(lay, content, params) : buildHingeScene(model, params, explode);
  }, [model, params, explode, flat, lay, content]);
  const size = flat && lay ? `${Math.round(lay.width)}x${Math.round(lay.height)}` : `${params.shape}|${Math.round(params.W)}|${Math.round(params.D)}|${Math.round(params.H)}|${Math.round(params.dia)}`;
  return (
    <Viewport3D scene={scene} look={lookOf(params.material)} frameKey={`${flat ? "flat" : "box"}|${size}`} label="Hinge Box in 3D, drag to orbit">
      <View3DHud flat={flat} onFlat={setFlat} explode={explode} onExplode={setExplode} />
    </Viewport3D>
  );
}
