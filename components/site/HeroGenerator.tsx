"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { HERO_HEIGHT, HERO_SHAPES, HERO_WIDTH, type HeroShape } from "@/lib/site/hero";
import type { Sheet } from "@/lib/site/samples";
import { CutSheet } from "./CutSheet";

type Engine = typeof import("./heroEngine");

/**
 * The live mini generator: the same engine as the editor, three controls. The server draws the
 * first box (`scene`, `sheet`, `text`); the engine loads when the demo nears the screen or is
 * touched, so the page itself carries no geometry code.
 */
export function HeroGenerator({ scene, sheet: firstSheet, dims: firstDims, readout: firstReadout }: { scene: string; sheet: ReactNode; dims: string; readout: string }) {
  const [shape, setShape] = useState<HeroShape>("rect");
  const [W, setW] = useState(HERO_WIDTH.start);
  const [H, setH] = useState(HERO_HEIGHT.start);
  const [yaw, setYaw] = useState(-0.6);
  const [first, setFirst] = useState(true);
  const [engine, setEngine] = useState<Engine | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const asked = useRef(false);
  const last = useRef<Sheet | null>(null);
  const drag = useRef<{ x: number; yaw: number } | null>(null);

  const load = useCallback(() => {
    if (asked.current) return;
    asked.current = true;
    void import("./heroEngine").then(setEngine, () => { asked.current = false; });
  }, []);
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") { load(); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { load(); io.disconnect(); } }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [load]);

  const sheet = useMemo(() => {
    if (!engine) return null;
    const s = engine.sheetFor(engine.heroParams(shape, W, H));
    if (s) last.current = s;
    return s ?? last.current;
  }, [engine, shape, W, H]);

  // The laser trace plays once; edits after that redraw at once.
  useEffect(() => {
    const t = window.setTimeout(() => setFirst(false), 3200);
    return () => window.clearTimeout(t);
  }, []);

  // The server's drawing stays until something changes, so the trace is not restarted.
  const live = !!sheet && !!engine && (shape !== "rect" || W !== HERO_WIDTH.start || H !== HERO_HEIGHT.start);
  const text = live ? engine.heroText(sheet, shape, W, H) : { dims: firstDims, readout: firstReadout };
  const sceneHtml = sheet && engine && (live || yaw !== -0.6) ? engine.sceneSVG(sheet.model, sheet.params, yaw, 0.35) : scene;
  const edit = () => { setFirst(false); load(); };

  return (
    <div className="hero-bed" ref={root} onPointerEnter={load} onFocus={load}>
      <div
        className="hero-box"
        role="img"
        aria-label={`Assembled box, ${text.dims}. Drag to turn it.`}
        onPointerDown={(e) => { drag.current = { x: e.clientX, yaw }; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (drag.current) setYaw(drag.current.yaw + (e.clientX - drag.current.x) * 0.012); }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
        dangerouslySetInnerHTML={{ __html: sceneHtml }}
      />
      {live ? <CutSheet sheet={sheet} trace={first} className="hero-sheet" /> : firstSheet}
      <div className="hero-controls">
        <div className="hero-shapes" role="group" aria-label="Shape">
          {HERO_SHAPES.map((s) => (
            <button key={s.v} type="button" aria-pressed={shape === s.v} onClick={() => { setShape(s.v); edit(); }}>{s.label}</button>
          ))}
        </div>
        <label className="hero-range">
          <span>Width <b>{W} mm</b></span>
          <input type="range" min={HERO_WIDTH.min} max={HERO_WIDTH.max} step={5} value={W} onChange={(e) => { setW(Number(e.target.value)); edit(); }} />
        </label>
        <label className="hero-range">
          <span>Height <b>{H} mm</b></span>
          <input type="range" min={HERO_HEIGHT.min} max={HERO_HEIGHT.max} step={5} value={H} onChange={(e) => { setH(Number(e.target.value)); edit(); }} />
        </label>
      </div>
      <p className="hero-readout">{text.readout}</p>
    </div>
  );
}
