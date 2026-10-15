"use client";

import { useMemo, useState } from "react";
import type { LayerContent, Layout, Point } from "@/lib/hinge";
import type { LetterModel, LetterParams, LetterPart } from "@/lib/letters";
import { buildLetterScene, WOOD } from "@/lib/letters/scene3d";
import { flatScene, type FlatPart } from "@/lib/three/flat";
import { lookOf } from "@/lib/three/looks";
import { letterGrips } from "@/lib/letters/grips";
import { useEditorPrefs } from "@/lib/prefs/editorStore";
import QuadView from "@/lib/three/QuadView";
import { quadProps, useView3D } from "@/components/shell/view3d";
import { View3DBarTools } from "@/components/shell/View3DTools";
import type { Units } from "@/components/editor/format";

/** Tints that keep base, lid, lip and glued pieces apart once the material look replaces the colours. */
function tintLetters(group: { traverse: (f: (o: { name: string; userData: Record<string, unknown> }) => void) => void }) {
  group.traverse((o) => {
    if (o.name.startsWith("wall ")) o.userData.vertexBase = WOOD.wall;
    else if (/· lid lip/u.test(o.name)) o.userData.tint = 0.86;
    else if (/· lid/u.test(o.name)) o.userData.tint = 1.04;
    else if (/· base/u.test(o.name)) o.userData.tint = 0.93;
  });
}

function flatParts(lay: Layout<LetterPart>): FlatPart[] {
  return lay.items.map(({ pt, ox, oy }) => {
    const sh = (q: Point): Point => [q[0] + ox, q[1] + oy];
    if (pt.kind === "solid") return { name: pt.name, outer: pt.outer.map(sh), holes: pt.holes.map((h) => h.map(sh)) };
    if (pt.kind === "plate") return { name: pt.name, outer: pt.outer.map(sh), holes: [...pt.holes, ...pt.slots].map((h) => h.map(sh)) };
    return { name: pt.name, outer: pt.outline.map(sh), holes: [] };
  });
}

/** The assembled letters (or their parts lying flat) in the shared 3D workspace; with `edit`, a selected part shows handles. */
export default function LetterPreview3D({ model, params, lay, content, units, edit }: {
  model: LetterModel | null; params: LetterParams; lay: Layout<LetterPart> | null; content: LayerContent | null; units: Units;
  edit?: { params: LetterParams; set: (p: LetterParams, record: boolean) => void };
}) {
  const v = useView3D();
  const editorPrefs = useEditorPrefs();
  const { flat, explode } = v;
  const [sel, setSel] = useState<string | null>(null);
  const grips = sel && edit && !flat && !explode ? letterGrips(edit.params, edit.set, units) : undefined;
  const lid = params.mode === "box" && params.lid !== "open";
  const scene = useMemo(() => {
    if (!model) return null;
    if (flat && lay) return flatScene(flatParts(lay), params.T, content && params.mode === "box" && params.wallStyle === "hinge" ? { d: content.hinge, width: lay.width, height: lay.height } : undefined);
    const sc = buildLetterScene(model, params, lid ? explode : 0);
    tintLetters(sc.group as never);
    return sc;
  }, [model, params, explode, flat, lay, content, lid]);
  const key = flat && lay ? `flat|${Math.round(lay.width)}x${Math.round(lay.height)}` : `${params.text}|${params.mode}|${params.fontId}|${Math.round(params.size)}`;
  return (
    <QuadView
      decimals={editorPrefs.decimals}
      {...quadProps(v)} id="preview3d" model={scene} look={lookOf(params.material)} frameKey={key} units={units}
      measure={flat || !lid || explode === 0} label="Assembled letters in 3D: Top, Front, Left and Perspective views"
      onSelect={setSel} grips={grips}
    >
      <View3DBarTools v={v} flat explodeLabel={lid ? "Lift lid" : null} />
    </QuadView>
  );
}
