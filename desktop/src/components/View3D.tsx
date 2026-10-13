/**
 * The 3D workspace: the server's model rebuilt here and shown in the shared four-view stage
 * (Top, Front, Left and Perspective, or one of them maximized).
 */
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import type { D3Model } from "../../../lib/desktop/types";
import { lookOf } from "../../../lib/three/looks";
import QuadView, { type PaneId, type QuadViewHandle } from "../../../lib/three/QuadView";
import type { Shade3D as Shade, Units } from "../local";
import { buildModel } from "../scene3d";
import type { CanvasHandle } from "./Canvas";

export type { PaneId };

interface Props {
  model: D3Model | null;
  material: string;
  explode: number;
  shade: Shade;
  quad: boolean;
  active: PaneId;
  onActive: (p: PaneId) => void;
  onQuad: (quad: boolean) => void;
  onShade: (s: Shade) => void;
  /** Overall dimensions on every view (hidden while exploded). */
  dims: boolean;
  units: Units;
  dim?: boolean;
  children?: React.ReactNode;
}

const View3D = forwardRef<CanvasHandle, Props>(function View3D({ model, material, explode, ...rest }, ref) {
  const q = useRef<QuadViewHandle>(null);
  useImperativeHandle(ref, () => ({ zoomIn: () => q.current?.zoomIn(), zoomOut: () => q.current?.zoomOut(), fit: () => q.current?.fit(), reset: () => q.current?.fit() }));
  const built = useMemo(() => (model ? buildModel(model) : null), [model]);
  // A different set of parts frames the views again; new values for the same parts do not.
  const key = useMemo(() => model?.objects.map((o) => o.name).join("|") ?? "", [model]);
  return <QuadView ref={q} model={built} look={lookOf(material)} frameKey={key} explode={explode} measure={explode === 0} {...rest} />;
});

export default View3D;
