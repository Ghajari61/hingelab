"use client";

import { useMemo } from "react";
import { inspectorSVG, type Model, type Params } from "@/lib/hinge";
import { fmtLen, type Units } from "./format";

/** Hinge close-up at true proportions, below the Auto-fit button. */
export function HingeInspector({ model, params, units }: { model: Model | null; params: Params; units: Units }) {
  const view = useMemo(() => inspectorSVG(model, params), [model, params]);
  return (
    <div id="inspector" aria-label="Hinge close-up">
      {view ? (
        <>
          {/* Markup is built from numbers only by lib/hinge/inspector.ts; no user text is included. */}
          <div dangerouslySetInnerHTML={{ __html: view.svg }} />
          <div className="cap"><span>Hinge close-up, true proportions</span><span>{fmtLen(view.width, units, true)} wide</span></div>
        </>
      ) : (
        <div className="cap"><span>No hinge to show</span></div>
      )}
    </div>
  );
}
