"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { sceneSVG } from "@/components/editor/scene3d";
import { HERO_HEIGHT, HERO_SHAPES, HERO_WIDTH, heroParams, sheetFor, type HeroShape, type Sheet } from "@/lib/site/samples";
import { CutSheet } from "./CutSheet";

/** The hero's live mini generator: the same engine as the editor, three controls. */
export function HeroGenerator() {
  const [shape, setShape] = useState<HeroShape>("rect");
  const [W, setW] = useState(HERO_WIDTH.start);
  const [H, setH] = useState(HERO_HEIGHT.start);
  const [yaw, setYaw] = useState(-0.6);
  const [first, setFirst] = useState(true);
  const last = useRef<Sheet | null>(null);
  const drag = useRef<{ x: number; yaw: number } | null>(null);

  const sheet = useMemo(() => {
    const s = sheetFor(heroParams(shape, W, H));
    if (s) last.current = s;
    return s ?? last.current;
  }, [shape, W, H]);

  // The laser trace plays once; edits after that redraw at once.
  useEffect(() => {
    const t = window.setTimeout(() => setFirst(false), 3200);
    return () => window.clearTimeout(t);
  }, []);

  if (!sheet) return null;
  const dims = shape === "cyl"
    ? `Ø${sheet.params.dia} × ${H} mm`
    : `${W} × ${shape === "poly" ? `${W} across flats` : sheet.params.D} × ${H} mm`;

  return (
    <div className="hero-bed">
      <div
        className="hero-box"
        role="img"
        aria-label={`Assembled box, ${dims}. Drag to turn it.`}
        onPointerDown={(e) => { drag.current = { x: e.clientX, yaw }; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (drag.current) setYaw(drag.current.yaw + (e.clientX - drag.current.x) * 0.012); }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
        dangerouslySetInnerHTML={{ __html: sceneSVG(sheet.model, sheet.params, yaw, 0.35) }}
      />
      <CutSheet sheet={sheet} trace={first} className="hero-sheet" />
      <div className="hero-controls">
        <div className="hero-shapes" role="group" aria-label="Shape">
          {HERO_SHAPES.map((s) => (
            <button key={s.v} type="button" aria-pressed={shape === s.v} onClick={() => { setShape(s.v); setFirst(false); }}>{s.label}</button>
          ))}
        </div>
        <label className="hero-range">
          <span>Width <b>{W} mm</b></span>
          <input type="range" min={HERO_WIDTH.min} max={HERO_WIDTH.max} step={5} value={W} onChange={(e) => { setW(Number(e.target.value)); setFirst(false); }} />
        </label>
        <label className="hero-range">
          <span>Height <b>{H} mm</b></span>
          <input type="range" min={HERO_HEIGHT.min} max={HERO_HEIGHT.max} step={5} value={H} onChange={(e) => { setH(Number(e.target.value)); setFirst(false); }} />
        </label>
      </div>
      <p className="hero-readout">
        {dims}, {sheet.content.outline.length} parts on a {Math.round(sheet.width)} × {Math.round(sheet.height)} mm sheet of 3 mm birch.
      </p>
    </div>
  );
}
