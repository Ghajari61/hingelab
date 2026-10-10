"use client";

import { NumberField } from "@/components/editor/NumberField";
import type { BaseField } from "@/components/editor/fields";
import type { Units } from "@/components/editor/format";
import {
  SHAPES, SHAPE_TARGETS, SLIDER_LIMITS, pickShape, recognise, shapeSliders, wavesLabel,
  type ShapeContext, type ShapeSlider, type ShapeSpec, type ShapeTargetId,
} from "@/lib/parametric/shapes";
import { SHAPE_ICONS } from "@/lib/parametric/shapeIcons.generated";

const iconOf = (id: ShapeSpec["shape"], polar: boolean) => SHAPE_ICONS[`${id}:${polar}`];

/**
 * Shape buttons and sliders for one formula field. They write the formula; the formula itself
 * stays under Advanced for anyone who wants to type one.
 */
export function ShapePicker({ target, label, expression, stored, ctx, units, formulaLabel, multiline, note, onShape, onFormula }: {
  target: ShapeTargetId;
  label: string;
  expression: string;
  stored?: ShapeSpec;
  ctx?: ShapeContext;
  units: Units;
  /** Accessible name of the raw formula box. */
  formulaLabel: string;
  multiline?: boolean;
  /** Which variables the formula can use. */
  note: string;
  onShape: (s: ShapeSpec, record: boolean) => void;
  onFormula: (expr: string, record: boolean) => void;
}) {
  const t = SHAPE_TARGETS[target];
  const spec = recognise(target, expression, stored, ctx);
  const fresh = spec ? pickShape(target, spec.shape, null) : null;
  const slug = target.replace(/[^a-z]/gi, "");

  const fieldOf = (k: ShapeSlider): BaseField => {
    if (k === "base") return { id: `${slug}-base`, len: t.len, float: true, ...t.base };
    if (k === "amp") return { id: `${slug}-amp`, len: t.len && !t.polar, float: true, ...t.amp };
    if (k === "waves") return { id: `${slug}-waves`, label: wavesLabel(spec!.shape), ...SLIDER_LIMITS.waves };
    if (k === "phase") return { id: `${slug}-phase`, label: t.polar ? "Turn" : "Phase", float: true, ...SLIDER_LIMITS.phase };
    return { id: `${slug}-ease`, label: spec!.shape === "bulge" ? "Width" : "Ease", float: true, ...SLIDER_LIMITS.ease };
  };

  return (
    <div className="shape-pick" data-target={target}>
      <div className="shape-head">
        <span className="rowlabel">{label}</span>
        {!spec && <span className="shape-custom">Custom formula</span>}
      </div>
      <div className="shape-grid" role="group" aria-label={`${label} shape`}>
        {SHAPES.map((s) => (
          <button
            key={s.id}
            type="button"
            data-v={s.id}
            aria-pressed={spec?.shape === s.id}
            aria-label={s.name}
            title={`${s.name}: ${s.title}`}
            onClick={() => onShape(pickShape(target, s.id, spec), true)}
          >
            <svg viewBox="0 0 24 16" width="24" height="16" aria-hidden><path d={iconOf(s.id, t.polar)} /></svg>
            <span>{s.short ?? s.name}</span>
          </button>
        ))}
      </div>
      {spec && t.dirs && spec.shape !== "constant" && (
        <div className="iconseg full" role="group" aria-label={`${label} direction`}>
          {t.dirs.map((d) => (
            <button key={d.v} type="button" aria-pressed={(spec.dir ?? t.defaults.dir) === d.v} onClick={() => onShape({ ...spec, dir: d.v }, true)}>{d.text}</button>
          ))}
        </div>
      )}
      {spec && (
        <div className="grid2">
          {shapeSliders(spec.shape, target).map((k) => {
            const f = fieldOf(k);
            return (
              <NumberField
                key={f.id}
                field={f}
                value={spec[k]}
                defaultValue={fresh?.[k]}
                units={units}
                label={f.label}
                hidden={false}
                onLive={(v) => onShape({ ...spec, [k]: v }, false)}
                onCommit={(v) => onShape({ ...spec, [k]: v }, true)}
              />
            );
          })}
        </div>
      )}
      <details className="shape-adv" open={spec ? undefined : true}>
        <summary>Advanced: formula</summary>
        {multiline ? (
          <textarea className="textin mono" rows={2} aria-label={formulaLabel} spellCheck={false} value={expression}
            onChange={(e) => onFormula(e.target.value, false)} onBlur={(e) => onFormula(e.target.value, true)} />
        ) : (
          <input className="textin mono" aria-label={formulaLabel} spellCheck={false} value={expression}
            onChange={(e) => onFormula(e.target.value, false)} onBlur={(e) => onFormula(e.target.value, true)} />
        )}
        <p className="note">{note}</p>
      </details>
    </div>
  );
}
