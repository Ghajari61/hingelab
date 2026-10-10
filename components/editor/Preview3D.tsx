"use client";

import { useRef, useState } from "react";
import type { Model, Params } from "@/lib/hinge";
import { sceneSVG } from "./scene3d";

export function Preview3D({ model, params, explode }: { model: Model | null; params: Params; explode: number }) {
  const [yaw, setYaw] = useState(-0.6);
  const drag = useRef<{ x: number; yaw: number } | null>(null);
  const svg = model ? sceneSVG(model, params, yaw, explode) : "";
  return (
    <div
      id="preview3d"
      aria-label="Assembled box preview, drag to rotate"
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, yaw };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        setYaw(drag.current.yaw + (e.clientX - drag.current.x) * 0.012);
      }}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
      dangerouslySetInnerHTML={{ __html: `${svg}<span class="hint3d">Drag to rotate</span>` }}
    />
  );
}
