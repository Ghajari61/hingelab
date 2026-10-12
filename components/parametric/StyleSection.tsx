"use client";

import { useState, type ReactNode } from "react";
import { finSpacingOf } from "@/lib/parametric/defaults";
import type { ParametricParams } from "@/lib/parametric/types";
import { Sec } from "@/components/editor/PanelDock";
import { fmtLen, type Units } from "@/components/editor/format";
import { PARAM_FIELDS } from "./fields";

type Edit = (f: (q: ParametricParams) => void, record: boolean) => void;

const fieldSet = (id: string) => PARAM_FIELDS.find((f) => f.id === id)!.set;

/** A range slider that edits live and records one undo step when it is let go. */
function Slider({ label, value, min, max, step, show, onSet }: {
  label: string; value: number; min: number; max: number; step: number;
  show: (v: number) => string;
  onSet: (v: number, record: boolean) => void;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const v = drag ?? value;
  const commit = () => { if (drag !== null) { onSet(drag, true); setDrag(null); } };
  return (
    <label className="style-slider">
      <span>{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, v))} aria-label={label}
        onChange={(e) => { const x = parseFloat(e.target.value); setDrag(x); onSet(x, false); }}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit}
      />
      <output>{show(v)}</output>
    </label>
  );
}

type Look = { id: string; text: string; title: string; art: ReactNode; on: (p: ParametricParams) => boolean; apply: (q: ParametricParams) => void };

const art = (d: string) => <svg viewBox="0 0 40 24" aria-hidden><path d={d} /></svg>;
const FIN_ART = art("M8 20V8M14 20V4M20 20V6M26 20V3M32 20V9M5 21h30");
const SLAT_ART = art("M5 21V3M10 21V3M15 21V3M20 21V3M25 21V3M30 21V3M35 21V3M15 14V6M20 15V5M25 13V7");
const HORIZ_ART = art("M6 5h22M6 9h28M6 13h25M6 17h30M5 3v18");
const FLOAT_ART = art("M8 20V8M14 20V4M20 20V6M26 20V3M32 20V9");
const WALL_ART = art("M6 19h28M9 15h22M12 11h16M15 7h10");
const UP_ART = art("M10 21h20M12 17h16M11 13h18M13 9h14M16 5h8");
const LAMP_ART = art("M20 3v18M20 12L8 6M20 12l12-6M20 12L8 18M20 12l12 6M8 12h24");
const SUN_ART = art("M20 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M20 2v5M20 17v5M10 12h5M25 12h5M13 5l3 3M27 5l-3 3M13 19l3-3M27 19l-3-3");

const PARALLEL_LOOKS: Look[] = [
  { id: "fins", text: "Fins", title: "Vertical fins on a plate shaped like the model", art: FIN_ART,
    on: (p) => p.parallel.axis === "X" && p.parallel.backboard === "plate", apply: (q) => { q.parallel.axis = "X"; q.parallel.backboard = "plate"; } },
  { id: "slats", text: "Slat wall", title: "Vertical fins on a full board of plain slats", art: SLAT_ART,
    on: (p) => p.parallel.axis === "X" && p.parallel.backboard === "slats" && p.parallel.fillEmptySlots,
    apply: (q) => { q.parallel.axis = "X"; q.parallel.backboard = "slats"; q.parallel.fillEmptySlots = true; q.parallel.slatDepth = Math.min(q.parallel.slatDepth, 8); q.parallel.backboardMargin = Math.min(q.parallel.backboardMargin, 10); } },
  { id: "horizontal", text: "Horizontal", title: "Fins stacked bottom to top", art: HORIZ_ART,
    on: (p) => p.parallel.axis === "Y", apply: (q) => { q.parallel.axis = "Y"; if (q.parallel.backboard === "none") q.parallel.backboard = "plate"; } },
  { id: "floating", text: "No board", title: "Fins only, to glue to a wall or your own board", art: FLOAT_ART,
    on: (p) => p.parallel.backboard === "none", apply: (q) => { q.parallel.backboard = "none"; } },
];

const STACK_LOOKS: Look[] = [
  { id: "wall", text: "From the wall", title: "Layers parallel to the wall, a relief built up from the back", art: WALL_ART, on: (p) => p.stacked.axis === "Z", apply: (q) => { q.stacked.axis = "Z"; } },
  { id: "up", text: "Bottom to top", title: "Horizontal layers, like a topographic model", art: UP_ART, on: (p) => p.stacked.axis === "Y", apply: (q) => { q.stacked.axis = "Y"; } },
];

const RADIAL_LOOKS: Look[] = [
  { id: "sun", text: "On the wall", title: "A sunburst on the wall, one hub ring", art: SUN_ART, on: (p) => p.radial.axis === "Z", apply: (q) => { q.radial.axis = "Z"; q.radial.hubPlates = 1; } },
  { id: "lamp", text: "Upright", title: "A lamp shade or vase standing up, hub rings at both ends", art: LAMP_ART, on: (p) => p.radial.axis === "Y", apply: (q) => { q.radial.axis = "Y"; q.radial.hubPlates = 2; } },
];

/** The few settings that change a design's look the most, for the current method. */
export function StyleSection({ params, units, onEdit, onBrowse }: { params: ParametricParams; units: Units; onEdit: Edit; onBrowse?: () => void }) {
  const p = params, T = p.material.T;
  const len = (v: number) => fmtLen(v, units, true);
  const scaled = !p.sourceSettings.targetSize;
  const sizeSlider = p.method === "curveNormal" || p.method === "folded" ? null : scaled ? (
    <Slider label="Size" value={p.sourceSettings.transform.uniformScale} min={0.4} max={2.5} step={0.05} show={(v) => `${Math.round(v * 100)}%`}
      onSet={(v, r) => onEdit((q) => fieldSet("uniformScale")(q, v), r)} />
  ) : (
    <Slider label="Size" value={p.sourceSettings.targetSize!.value} min={50} max={1500} step={5} show={len}
      onSet={(v, r) => onEdit((q) => fieldSet("targetSize")(q, v), r)} />
  );
  const looks = p.method === "parallel" ? PARALLEL_LOOKS : p.method === "stacked" ? STACK_LOOKS
    : p.method === "radial" && p.radial.profileSource === "mesh" ? RADIAL_LOOKS : [];

  let sliders: ReactNode = null;
  if (p.method === "parallel") {
    sliders = (
      <>
        <Slider label="Fin spacing" value={finSpacingOf(p)} min={Math.max(1, Math.ceil(T * 1.5 * 2) / 2)} max={Math.max(30, T * 10)} step={0.5} show={len}
          onSet={(v, r) => onEdit((q) => fieldSet("spacing")(q, v), r)} />
        {sizeSlider}
        {p.parallel.backboard === "slats" && (
          <Slider label="Slat depth" value={p.parallel.slatDepth} min={2} max={40} step={1} show={len} onSet={(v, r) => onEdit((q) => fieldSet("slatDepth")(q, v), r)} />
        )}
        {p.parallel.backboard !== "none" && (
          <Slider label="Board margin" value={p.parallel.backboardMargin} min={0} max={80} step={1} show={len} onSet={(v, r) => onEdit((q) => fieldSet("backboardMargin")(q, v), r)} />
        )}
      </>
    );
  } else if (p.method === "radial") {
    sliders = (
      <>
        <Slider label="Fins" value={p.radial.count} min={4} max={96} step={1} show={(v) => String(Math.round(v))} onSet={(v, r) => onEdit((q) => fieldSet("radialCount")(q, v), r)} />
        <Slider label="Hub radius" value={p.radial.innerRadius} min={4} max={120} step={1} show={len} onSet={(v, r) => onEdit((q) => fieldSet("innerRadius")(q, v), r)} />
        {p.radial.profileSource === "mesh" && sizeSlider}
      </>
    );
  } else if (p.method === "stacked") {
    sliders = (
      <>
        {sizeSlider}
        <label className="chk"><input type="checkbox" checked={p.stacked.hollow} onChange={(e) => onEdit((q) => { q.stacked.hollow = e.target.checked; }, true)} /> Hollow layers</label>
        {p.stacked.hollow && <Slider label="Wall" value={p.stacked.shell} min={2} max={40} step={1} show={len} onSet={(v, r) => onEdit((q) => fieldSet("shell")(q, v), r)} />}
      </>
    );
  } else if (p.method === "waffle") {
    sliders = (
      <>
        <Slider label="Rib spacing" value={p.waffle.spacingA} min={8} max={100} step={1} show={len}
          onSet={(v, r) => onEdit((q) => { fieldSet("spacingA")(q, v); fieldSet("spacingB")(q, v); }, r)} />
        {sizeSlider}
      </>
    );
  } else if (p.method === "curveNormal") {
    const g = p.curveNormal.guide, gw = g.kind === "ellipse" ? g.w : g.d;
    sliders = (
      <>
        {p.curveNormal.count !== null && (
          <Slider label="Fins" value={p.curveNormal.count} min={12} max={150} step={1} show={(v) => String(Math.round(v))} onSet={(v, r) => onEdit((q) => fieldSet("curveCount")(q, v), r)} />
        )}
        <Slider label="Ring width" value={gw} min={60} max={320} step={5} show={len} onSet={(v, r) => onEdit((q) => {
          const c = q.curveNormal.guide;
          if (c.kind === "ellipse") { const k = c.h / c.w; c.w = v; c.h = Math.max(10, Math.round(v * k)); } else c.d = v;
        }, r)} />
      </>
    );
  } else if (p.method === "folded") {
    sliders = <Slider label="Faces" value={p.folded.faces} min={20} max={400} step={10} show={(v) => String(Math.round(v))} onSet={(v, r) => onEdit((q) => fieldSet("foldFaces")(q, v), r)} />;
  }

  const current = looks.find((l) => l.on(p));
  return (
    <Sec title="Style" meta={current?.text} startOpen>
      {looks.length > 0 && (
        <div className="style-looks" role="group" aria-label="Quick looks">
          {looks.map((l) => (
            <button key={l.id} type="button" data-look={l.id} title={l.title} aria-pressed={l.on(p)} onClick={() => onEdit(l.apply, true)}>{l.art}{l.text}</button>
          ))}
        </div>
      )}
      {sliders}
      {onBrowse && <button type="button" className="btn-auto" onClick={onBrowse}>Browse ready designs…</button>}
    </Sec>
  );
}
