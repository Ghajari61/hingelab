"use client";

import { useMemo, useRef, useState } from "react";
import { Shuffle } from "lucide-react";
import { Sec } from "@/components/editor/PanelDock";
import { fmtLen, type Units } from "@/components/editor/format";
import { LUMBER, RAIL_DEFAULTS, cleanRails } from "@/lib/parametric/backboard";
import { mountEstimate, sheetsLabel } from "@/lib/parametric/mount";
import { PATTERN_SOURCE_DEFAULTS, WALL_STYLES, WAVE_PATTERNS, patternValue, type PatternSource, type WallStyle, type WavePattern } from "@/lib/parametric/source/pattern";
import type { Lumber, ParametricParams, SliceResult } from "@/lib/parametric/types";
import { Slider } from "./StyleSection";

type Edit = (f: (q: ParametricParams) => void, record: boolean) => void;
type Src = PatternSource;

/** A small grey picture of a pattern: light is near (deep), dark is the base. */
function heat(s: Src, cols: number, pic?: boolean): { d: string; fill: string }[] {
  const rows = Math.max(4, Math.round((cols * s.height) / s.width)), out: { d: string; fill: string }[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const v = pic && s.pattern === "image" ? 0.5 : patternValue(s, (i + 0.5) / cols, (j + 0.5) / rows);
    let h = v;
    if (s.style === "shelf") for (const sh of s.shelves) if ((i + 0.5) / cols >= sh.x0 && (i + 0.5) / cols <= sh.x1 && Math.abs((j + 0.5) / rows - sh.y) <= sh.h / 2) h = sh.level;
    const g = Math.round(40 + 190 * h);
    out.push({ d: `M${i} ${j}h1v1h-1z`, fill: `rgb(${g},${Math.round(g * 0.92)},${Math.round(g * 0.8)})` });
  }
  return out;
}

const RECIPES: { id: string; name: string; src: Partial<Src> }[] = [
  { id: "swell", name: "Ocean swell", src: { pattern: "sine", style: "relief", waves: 3, angle: 12, cross: 25 } },
  { id: "dune", name: "Dune ridge", src: { pattern: "ridge", style: "relief", ridgeWidth: 30 } },
  { id: "topo", name: "Topography", src: { pattern: "perlin", style: "relief", scale: 160, octaves: 4 } },
  { id: "pond", name: "Ripple pond", src: { pattern: "ripple", style: "relief", waves: 3 } },
  { id: "range", name: "Mountain range", src: { pattern: "mountain", style: "organic", edge: 20, scale: 180 } },
  { id: "pull", name: "Push and pull", src: { pattern: "attractors", style: "relief", scale: 120 } },
  { id: "shelf", name: "Floating shelf", src: { pattern: "sine", style: "shelf", waves: 2 } },
  { id: "edge", name: "Organic edge", src: { pattern: "sine", style: "organic", waves: 2.5, edge: 30 } },
];

const THICK: { id: string; text: string; T: number; K: number }[] = [
  { id: "birch3", text: "3 mm", T: 3, K: 0.15 }, { id: "birch6", text: "6 mm", T: 6, K: 0.2 }, { id: "birch14", text: "1/4\"", T: 6.35, K: 0.2 },
];

/**
 * Wall art: a guided panel for the pattern source. Style, pattern (with a picture of each), the
 * curve and points drawn on the live preview, size, mounting on rails or a board, and what it takes
 * to make (sheets, lumber, screws).
 */
export function WallArtSection({ params, result, units, onEdit, onPicture, picName }: {
  params: ParametricParams;
  result: SliceResult | null;
  units: Units;
  onEdit: Edit;
  /** Load a picture for the "Your picture" pattern (its brightness becomes depth). */
  onPicture: (f: File) => void;
  /** The picture loaded on this device, if any. */
  picName: string | null;
}) {
  const s = params.source as Src;
  const len = (v: number) => fmtLen(v, units, true);
  const set = (f: (q: Src) => void, record: boolean) => onEdit((q) => { if (q.source.kind === "pattern") f(q.source); }, record);
  const picRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [sel, setSel] = useState(0);
  const drag = useRef<{ kind: "curve" | "point" | "center" | "shelf"; i: number } | null>(null);
  const cols = 64, rows = Math.max(4, Math.round((cols * s.height) / s.width));
  const preview = useMemo(() => heat(s, cols, !picName), [s, cols, picName]);
  const thumbs = useMemo(() => (Object.keys(WAVE_PATTERNS) as WavePattern[]).map((k) => ({ k, cells: heat({ ...PATTERN_SOURCE_DEFAULTS, ...s, pattern: k, style: "relief", width: 300, height: 200 }, 18, k === "image") })), [s]);
  const estimate = mountEstimate(params, result);
  const backboard = params.parallel.backboard, rails = cleanRails(params.parallel.rails);

  const at = (e: React.PointerEvent): [number, number] => {
    const r = svgRef.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  const move = (e: React.PointerEvent, record: boolean) => {
    const d = drag.current;
    if (!d) return;
    const [u, v] = at(e);
    set((q) => {
      if (d.kind === "curve") q.curve = q.curve.map((p, i) => (i === d.i ? [u, v] : p));
      else if (d.kind === "point") q.points = q.points.map((p, i) => (i === d.i ? { ...p, x: u, y: v } : p));
      else if (d.kind === "center") q.center = [u, v];
      else q.shelves = q.shelves.map((sh, i) => { if (i !== d.i) return sh; const w = sh.x1 - sh.x0, x0 = Math.min(1 - w, Math.max(0, u - w / 2)); return { ...sh, x0, x1: x0 + w, y: v }; });
    }, record);
    if (record) drag.current = null;
  };
  const grab = (kind: NonNullable<typeof drag.current>["kind"], i: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { kind, i };
    setSel(i);
  };
  const handle = (x: number, y: number, kind: NonNullable<typeof drag.current>["kind"], i: number, label: string, tone = "var(--accent, #c8743a)") => (
    <circle key={`${kind}${i}`} cx={x * cols} cy={y * rows} r={1.6} fill={tone} stroke="#fff" strokeWidth={0.4} style={{ cursor: "grab" }} onPointerDown={grab(kind, i)} role="slider" aria-label={label} aria-valuetext={`${Math.round(x * 100)} %, ${Math.round(y * 100)} %`} tabIndex={0} />
  );
  const addOnCanvas = (e: React.PointerEvent) => {
    if (drag.current || s.pattern !== "attractors" || s.points.length >= 24) return;
    const [u, v] = at(e);
    set((q) => { q.points = [...q.points, { x: u, y: v, s: 1 }]; }, true);
    setSel(s.points.length);
  };

  return (
    <Sec title="Wall art" meta={`${WAVE_PATTERNS[s.pattern]}, ${WALL_STYLES[s.style].toLowerCase()}`} startOpen>
      <div className="rowlabel">Style</div>
      <div className="iconseg full" role="group" aria-label="Wall art style">
        {(Object.keys(WALL_STYLES) as WallStyle[]).map((v) => (
          <button key={v} type="button" aria-pressed={s.style === v} onClick={() => set((q) => { q.style = v; }, true)}>{WALL_STYLES[v]}</button>
        ))}
      </div>
      <div className="rowlabel">Pattern</div>
      <div className="wa-patterns" role="group" aria-label="Pattern">
        {thumbs.map(({ k, cells }) => (
          <button key={k} type="button" className="wa-thumb" aria-pressed={s.pattern === k} title={WAVE_PATTERNS[k]}
            onClick={() => { if (k === "image" && !picName) { picRef.current?.click(); return; } set((q) => { q.pattern = k; if (k === "image" && picName) q.fileName = picName; }, true); }}>
            <svg viewBox={`0 0 18 ${Math.round((18 * 200) / 300)}`} shapeRendering="crispEdges" aria-hidden>{cells.map((c, i) => <path key={i} d={c.d} fill={c.fill} />)}</svg>
            <span>{WAVE_PATTERNS[k]}</span>
          </button>
        ))}
      </div>
      <input ref={picRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onPicture(f); e.target.value = ""; }} />

      <div className="wa-canvas">
        <svg ref={svgRef} viewBox={`0 0 ${cols} ${rows}`} preserveAspectRatio="none" shapeRendering="crispEdges" style={{ aspectRatio: `${s.width} / ${s.height}` }} role="img" aria-label="The pattern: light is deep. Drag the handles to shape it."
          onPointerMove={(e) => move(e, false)} onPointerUp={(e) => move(e, true)} onPointerDown={addOnCanvas}>
          {preview.map((c, i) => <path key={i} d={c.d} fill={c.fill} />)}
          {s.style === "shelf" && s.shelves.map((sh, i) => <rect key={`r${i}`} x={sh.x0 * cols} y={(sh.y - sh.h / 2) * rows} width={(sh.x1 - sh.x0) * cols} height={sh.h * rows} fill="none" stroke="#fff" strokeWidth={0.35} strokeDasharray="1 0.6" />)}
          {s.pattern === "ridge" && <polyline points={s.curve.map(([u, v]) => `${u * cols},${v * rows}`).join(" ")} fill="none" stroke="#fff" strokeWidth={0.35} />}
          {s.pattern === "ridge" && s.curve.map(([u, v], i) => handle(u, v, "curve", i, `Curve point ${i + 1}`))}
          {s.pattern === "attractors" && s.points.map((p, i) => handle(p.x, p.y, "point", i, `Point ${i + 1}`, p.s >= 0 ? "#d9822b" : "#3a7bd5"))}
          {s.pattern === "ripple" && handle(s.center[0], s.center[1], "center", 0, "Ripple centre")}
          {s.style === "shelf" && s.shelves.map((sh, i) => handle((sh.x0 + sh.x1) / 2, sh.y, "shelf", i, `Shelf ${i + 1}`, "#fff"))}
        </svg>
        <p className="note">
          {s.pattern === "ridge" ? "Drag the points: the crest follows the curve." : s.pattern === "attractors" ? "Click to add a point; drag to move it. Orange pushes out, blue pulls in." : s.pattern === "ripple" ? "Drag the centre of the rings." : s.style === "shelf" ? "Drag a shelf to place it." : "Light is deep, dark is the base."}
        </p>
      </div>
      {s.pattern === "ridge" && (
        <div className="wa-row">
          <button type="button" className="btn-auto" disabled={s.curve.length >= 32} onClick={() => set((q) => {
            let best = 0, bl = -1;
            q.curve.forEach((p, i) => { if (i) { const l = Math.hypot(p[0] - q.curve[i - 1][0], p[1] - q.curve[i - 1][1]); if (l > bl) { bl = l; best = i; } } });
            const a = q.curve[best - 1], b = q.curve[best];
            q.curve = [...q.curve.slice(0, best), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], ...q.curve.slice(best)];
          }, true)}>Add point</button>
          <button type="button" className="btn-auto" disabled={s.curve.length <= 2} onClick={() => set((q) => { q.curve = q.curve.filter((_, i) => i !== Math.min(sel, q.curve.length - 1)); }, true)}>Remove point</button>
        </div>
      )}
      {s.pattern === "attractors" && s.points[sel] && (
        <>
          <Slider label="Push or pull" value={s.points[sel].s} min={-1} max={1} step={0.05} show={(v) => (v >= 0 ? `push ${Math.round(v * 100)} %` : `pull ${Math.round(-v * 100)} %`)} onSet={(v, r) => set((q) => { q.points = q.points.map((p, i) => (i === sel ? { ...p, s: v } : p)); }, r)} />
          <div className="wa-row"><button type="button" className="btn-auto" onClick={() => { set((q) => { q.points = q.points.filter((_, i) => i !== sel); }, true); setSel(0); }}>Remove point</button></div>
        </>
      )}
      {s.style === "shelf" && (
        <>
          {s.shelves[sel] && <Slider label="Shelf width" value={(s.shelves[sel].x1 - s.shelves[sel].x0) * 100} min={5} max={100} step={1} show={(v) => `${Math.round(v)} %`} onSet={(v, r) => set((q) => { q.shelves = q.shelves.map((sh, i) => { if (i !== sel) return sh; const m = (sh.x0 + sh.x1) / 2, w = v / 100, x0 = Math.min(1 - w, Math.max(0, m - w / 2)); return { ...sh, x0, x1: x0 + w }; }); }, r)} />}
          {s.shelves[sel] && <Slider label="Shelf level" value={s.shelves[sel].level * 100} min={0} max={100} step={1} show={(v) => `${Math.round(v)} %`} onSet={(v, r) => set((q) => { q.shelves = q.shelves.map((sh, i) => (i === sel ? { ...sh, level: v / 100 } : sh)); }, r)} />}
          <div className="wa-row">
            <button type="button" className="btn-auto" disabled={s.shelves.length >= 8} onClick={() => { set((q) => { q.shelves = [...q.shelves, { x0: 0.5, x1: 0.85, y: 0.7, h: 0.07, level: 0.8 }]; }, true); setSel(s.shelves.length); }}>Add shelf</button>
            <button type="button" className="btn-auto" disabled={!s.shelves.length} onClick={() => { set((q) => { q.shelves = q.shelves.filter((_, i) => i !== sel); }, true); setSel(0); }}>Remove shelf</button>
          </div>
        </>
      )}

      <div className="rowlabel">Recipes</div>
      <div className="wa-recipes">
        {RECIPES.map((r) => <button key={r.id} type="button" className="btn-auto" onClick={() => set((q) => Object.assign(q, r.src), true)}>{r.name}</button>)}
        <button type="button" className="btn-auto" title="A new variation: new seed, waves and angle" onClick={() => set((q) => {
          q.seed = Math.floor(Math.random() * 99_999);
          q.waves = Math.round((1.5 + Math.random() * 4) * 2) / 2;
          q.angle = Math.round((Math.random() - 0.5) * 60 / 5) * 5;
        }, true)}><Shuffle size={13} aria-hidden /> Shuffle</button>
      </div>

      <div className="rowlabel">Size</div>
      <Slider label="Width" value={s.width} def={PATTERN_SOURCE_DEFAULTS.width} min={150} max={1500} step={10} show={len} onSet={(v, r) => set((q) => { q.width = v; }, r)} />
      <Slider label="Height" value={s.height} def={PATTERN_SOURCE_DEFAULTS.height} min={100} max={1500} step={10} show={len} onSet={(v, r) => set((q) => { q.height = v; }, r)} />
      <Slider label="Depth" value={s.depth} def={PATTERN_SOURCE_DEFAULTS.depth} min={5} max={200} step={1} show={len} onSet={(v, r) => set((q) => { q.depth = v; }, r)} />
      <Slider label="Amplitude" value={s.amplitude} def={PATTERN_SOURCE_DEFAULTS.amplitude} min={10} max={100} step={1} show={(v) => `${Math.round(v)} %`} onSet={(v, r) => set((q) => { q.amplitude = v; }, r)} />
      {(s.pattern === "sine" || s.pattern === "ripple" || s.style === "organic" || s.style === "shelf") && <Slider label="Waves" value={s.waves} def={PATTERN_SOURCE_DEFAULTS.waves} min={0.5} max={12} step={0.5} show={(v) => String(v)} onSet={(v, r) => set((q) => { q.waves = v; }, r)} />}
      {s.pattern === "sine" && <Slider label="Direction" value={s.angle} def={0} min={-90} max={90} step={5} show={(v) => `${Math.round(v)}°`} onSet={(v, r) => set((q) => { q.angle = v; }, r)} />}
      {s.pattern === "sine" && <Slider label="Cross wave" value={s.cross} def={PATTERN_SOURCE_DEFAULTS.cross} min={0} max={100} step={5} show={(v) => `${Math.round(v)} %`} onSet={(v, r) => set((q) => { q.cross = v; }, r)} />}
      {s.pattern === "ridge" && <Slider label="Ridge width" value={s.ridgeWidth} def={PATTERN_SOURCE_DEFAULTS.ridgeWidth} min={5} max={80} step={1} show={(v) => `${Math.round(v)} %`} onSet={(v, r) => set((q) => { q.ridgeWidth = v; }, r)} />}
      {(s.pattern === "perlin" || s.pattern === "mountain" || s.pattern === "attractors") && <Slider label={s.pattern === "attractors" ? "Reach" : "Feature size"} value={s.scale} def={PATTERN_SOURCE_DEFAULTS.scale} min={20} max={600} step={10} show={len} onSet={(v, r) => set((q) => { q.scale = v; }, r)} />}
      {(s.pattern === "perlin" || s.pattern === "mountain") && <Slider label="Detail" value={s.octaves} def={PATTERN_SOURCE_DEFAULTS.octaves} min={1} max={6} step={1} show={(v) => String(Math.round(v))} onSet={(v, r) => set((q) => { q.octaves = Math.round(v); }, r)} />}
      {s.style === "organic" && <Slider label="Edge" value={s.edge} def={PATTERN_SOURCE_DEFAULTS.edge} min={0} max={45} step={1} show={(v) => `${Math.round(v)} %`} onSet={(v, r) => set((q) => { q.edge = v; }, r)} />}
      {s.pattern === "image" && (
        <div className="wa-row">
          <span className="note">{picName ?? "No picture yet"}</span>
          <button type="button" className="btn-auto" onClick={() => picRef.current?.click()}>{picName ? "Replace…" : "Load a picture…"}</button>
          <button type="button" className="btn-auto" aria-pressed={s.invert} onClick={() => set((q) => { q.invert = !q.invert; }, true)}>{s.invert ? "Light is deep" : "Dark is deep"}</button>
        </div>
      )}

      <div className="rowlabel">Mounting</div>
      <div className="iconseg full" role="group" aria-label="Mounting">
        {([["rails", "Rails", "Lumber rails on the wall, notched into every slat"], ["slats", "Slat board", "Slats with tabs into a board of the same size"], ["plate", "Backplate", "A plate shaped like the piece"], ["none", "None", "Glue the slats to your own board"]] as const).map(([v, text, title]) => (
          <button key={v} type="button" title={title} aria-pressed={backboard === v} onClick={() => onEdit((q) => { q.parallel.backboard = v; if (v === "rails" || v === "slats") q.parallel.fillEmptySlots = true; if (v === "rails" && !q.parallel.rails) q.parallel.rails = { ...RAIL_DEFAULTS }; }, true)}>{text}</button>
        ))}
      </div>
      {backboard === "rails" && (
        <>
          <label className="pe-pick">Lumber
            <select className="sel" aria-label="Lumber" value={rails.lumber} onChange={(e) => onEdit((q) => { q.parallel.rails = { ...cleanRails(q.parallel.rails), lumber: e.target.value as Lumber }; }, true)}>
              {(Object.keys(LUMBER) as Lumber[]).map((k) => <option key={k} value={k}>{LUMBER[k].name}</option>)}
            </select>
          </label>
          <div className="iconseg full" role="group" aria-label="Rails">
            {([1, 2] as const).map((n) => <button key={n} type="button" aria-pressed={rails.count === n} onClick={() => onEdit((q) => { q.parallel.rails = { ...cleanRails(q.parallel.rails), count: n }; }, true)}>{n === 1 ? "One rail" : "Two rails"}</button>)}
          </div>
        </>
      )}
      <div className="rowlabel">Thickness</div>
      <div className="iconseg full" role="group" aria-label="Thickness">
        {THICK.map((t) => <button key={t.id} type="button" aria-pressed={params.material.id === t.id} onClick={() => onEdit((q) => { q.material.id = t.id; q.material.T = t.T; q.material.K = t.K; }, true)}>{t.text}</button>)}
        <button type="button" aria-pressed={!THICK.some((t) => t.id === params.material.id)} onClick={() => onEdit((q) => { q.material.id = "custom"; }, true)}>Custom</button>
      </div>
      {result && (
        <p className="note wa-estimate" role="status">
          {sheetsLabel(params, result.stats.sheetCount, units === "in")}{" "}of {fmtLen(params.material.T, units, true)} board
          {estimate ? `; ${estimate.rails} ${estimate.rails === 1 ? "rail" : "rails"} of ${estimate.lumber}, ${len(estimate.railLength)} each; ${estimate.wallScrews} wall screws; ${estimate.pins} pins or dabs of glue.` : "."}
        </p>
      )}
    </Sec>
  );
}
