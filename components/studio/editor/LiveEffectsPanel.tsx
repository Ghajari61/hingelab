"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, ChevronUp, CopyPlus, Eye, EyeOff, FlipHorizontal2, Flower2, RotateCcw, Rows3, SquareRoundCorner, SquareSquare, Trash2 } from "lucide-react";
import { MATERIALS } from "@/lib/hinge/defaults";
import { newId } from "@/lib/studio/doc";
import { canHaveEffects, EFFECT_KINDS, EFFECTS, effectInput } from "@/lib/studio/effects";
import { boxOf } from "@/lib/studio/effects/copies";
import { livingHingeAnalysis } from "@/lib/studio/effects/livingHinge";
import { addEffect, duplicateEffect, moveEffect, removeEffect, resetEffect, setEffectEnabled, setEffectParams } from "@/lib/studio/effects/ops";
import { isEditable, locate, topLevel } from "@/lib/studio/scene";
import type {
  CornerMode, CornersParams, Document, EffectKind, HatchParams, LiveEffect, LivingHingeParams, Mat, MirrorParams, OffsetParams, RotateCopiesParams, SceneNode, Units,
} from "@/lib/studio/types";
import { IconButton, NumberInput, PanelSection, SegmentedControl, Select } from "@/components/ui";
import { nodeLabel } from "./ControlBar";
import { useEditor, useEditorApi } from "./store";

type Toast = (m: string, undo?: boolean) => void;

const HingeIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden>
    <path d="M5 3v7M5 14v7M9.5 3v2.5M9.5 9.5v5M9.5 18.5V21M14 3v7M14 14v7M18.5 3v2.5M18.5 9.5v5M18.5 18.5V21" />
  </svg>
);

export const EFFECT_ICONS: Record<EffectKind, (size?: number) => ReactNode> = {
  corners: (s = 16) => <SquareRoundCorner size={s} strokeWidth={1.5} />,
  offset: (s = 16) => <SquareSquare size={s} strokeWidth={1.5} />,
  hatches: (s = 16) => <Rows3 size={s} strokeWidth={1.5} />,
  rotateCopies: (s = 16) => <Flower2 size={s} strokeWidth={1.5} />,
  mirror: (s = 16) => <FlipHorizontal2 size={s} strokeWidth={1.5} />,
  livingHinge: (s = 16) => <HingeIcon size={s} />,
};

type Live = (label: string, recipe: (d: Document) => void, commit: boolean) => void;

/** Position fields show page coordinates when the object is only moved, otherwise the object's own. */
function frame(world: Mat) {
  const plain = Math.abs(world[0] - 1) < 1e-9 && Math.abs(world[1]) < 1e-9 && Math.abs(world[2]) < 1e-9 && Math.abs(world[3] - 1) < 1e-9;
  const dx = plain ? world[4] : 0, dy = plain ? world[5] : 0;
  return { plain, x: (v: number) => v + dx, y: (v: number) => v + dy, fromX: (v: number) => v - dx, fromY: (v: number) => v - dy };
}

const CORNER_MODES: { value: CornerMode; label: string }[] = [
  { value: "fillet", label: "Fillet (round)" }, { value: "inverseFillet", label: "Inverse fillet" },
  { value: "chamfer", label: "Chamfer" }, { value: "inverseChamfer", label: "Inverse chamfer (notch)" },
];

export function LiveEffectsPanel({ toast }: { toast: Toast }) {
  const api = useEditorApi();
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const anchors = useEditor((s) => s.anchors);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const ids = topLevel(doc.root, selection).filter((id) => isEditable(doc.root, id));
  const located = ids.length === 1 ? locate(doc.root, ids[0]) : null;
  const node = located && canHaveEffects(located.node) ? located.node : null;

  const live: Live = (label, recipe, commit) => {
    const s = api.getState();
    if (!commit) { s.begin(); s.preview(recipe); return; }
    if (s.base) s.end(label, recipe); else s.edit(label, recipe);
  };

  if (!node || !located) {
    return (
      <PanelSection title="Live Effects" testId="fx-panel">
        <p className="pn-empty" data-testid="fx-empty">
          {ids.length > 1
            ? "Select one object to edit its effect stack. Path › Live Effects adds an effect to every selected path, shape or text."
            : "Select a path, shape or text to add Live Effects: non-destructive corners, offsets, hatches, copies, mirrors and living hinges."}
        </p>
      </PanelSection>
    );
  }

  const effects = node.effects ?? [];
  const nid = node.id;
  const add = (kind: EffectKind) => {
    const fid = newId();
    api.getState().edit(`Add Live Effect: ${EFFECTS[kind].label}`, (d) => { addEffect(d, [nid], kind, () => fid); });
    setClosed((c) => ({ ...c, [fid]: false }));
  };

  return (
    <>
      <PanelSection title="Live Effects" meta={nodeLabel(node.type, node.type === "shape" ? node.shape.kind : undefined)} testId="fx-panel">
        <div className="fx-add" role="group" aria-label="Add effect">
          {EFFECT_KINDS.map((k) => (
            <button key={k} type="button" title={EFFECTS[k].description} onClick={() => add(k)} data-testid={`fx-add-${k}`}>
              {EFFECT_ICONS[k](18)}
              <span>{EFFECTS[k].label}</span>
            </button>
          ))}
        </div>
        {!effects.length && <p className="pn-empty">No effects yet. Effects apply top to bottom; the original path stays editable with Direct Selection.</p>}
      </PanelSection>
      {effects.length > 0 && (
        <PanelSection title="Stack" meta={`${effects.length}`} testId="fx-stack">
          <ol className="fx-stack" aria-label="Effect stack">
            {effects.map((e, k) => (
              <EffectCard
                key={e.id} node={node} world={located.world} effect={e} index={k} count={effects.length} units={doc.units}
                open={!closed[e.id]} onToggleOpen={() => setClosed((c) => ({ ...c, [e.id]: !c[e.id] }))}
                anchors={anchors.filter((a) => a.id === nid)} live={live} toast={toast}
              />
            ))}
          </ol>
          <p className="fx-note">Expand Live Effects (Path menu) turns the result into a plain path.</p>
        </PanelSection>
      )}
    </>
  );
}

function EffectCard({ node, world, effect, index, count, units, open, onToggleOpen, anchors, live, toast }: {
  node: Extract<SceneNode, { type: "path" | "shape" | "text" | "clone" }>; world: Mat; effect: LiveEffect; index: number; count: number; units: Units;
  open: boolean; onToggleOpen: () => void; anchors: { sub: number; idx: number }[]; live: Live; toast: Toast;
}) {
  const api = useEditorApi();
  const def = EFFECTS[effect.kind];
  const nid = node.id, fid = effect.id;
  const edit = (label: string, recipe: (d: Document) => void) => api.getState().edit(label, recipe);
  const set = <P,>(label: string, patch: Partial<P>) => (commit = true) => live(label, (d) => { setEffectParams(d, nid, fid, patch as never); }, commit);
  const num = (label: string, key: string) => (v: number, c: boolean) => set(label, { [key]: v })(c);
  const presetName = def.presets?.find((p) => Object.entries(p.params).every(([key, v]) => (effect.params as unknown as Record<string, unknown>)[key] === v))?.name ?? "";

  return (
    <li className={`fx-card${effect.enabled ? "" : " fx-off"}`} data-testid={`fx-card-${effect.kind}`}>
      <div className="fx-head">
        <button type="button" className={`ib${effect.enabled ? " on" : ""}`} aria-pressed={effect.enabled} aria-label={effect.enabled ? `Hide ${def.label}` : `Show ${def.label}`}
          onClick={() => edit(effect.enabled ? "Hide Effect" : "Show Effect", (d) => { setEffectEnabled(d, nid, fid, !effect.enabled); })} data-testid="fx-eye">
          {effect.enabled ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
        <button type="button" className="fx-name" aria-expanded={open} onClick={onToggleOpen}>
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {EFFECT_ICONS[effect.kind](15)}
          <span>{def.label}</span>
        </button>
        <div className="fx-tools">
          <IconButton label="Move up (apply earlier)" icon={<ChevronUp size={14} />} disabled={index === 0} onClick={() => edit("Reorder Effects", (d) => { moveEffect(d, nid, fid, -1); })} testId="fx-up" />
          <IconButton label="Move down (apply later)" icon={<ChevronDown size={14} />} disabled={index === count - 1} onClick={() => edit("Reorder Effects", (d) => { moveEffect(d, nid, fid, 1); })} testId="fx-down" />
          <IconButton label="Duplicate effect" icon={<CopyPlus size={14} />} onClick={() => edit("Duplicate Effect", (d) => { duplicateEffect(d, nid, fid); })} testId="fx-dup" />
          <IconButton label="Delete effect" icon={<Trash2 size={14} />} onClick={() => { edit("Delete Effect", (d) => { removeEffect(d, nid, fid); }); toast(`Removed ${def.label}`, true); }} testId="fx-delete" />
        </div>
      </div>
      {open && (
        <div className="fx-body">
          <div className="fx-row">
            {def.presets?.length ? (
              <Select label="Preset" value={presetName} testId="fx-preset"
                options={[{ value: "", label: "Custom" }, ...def.presets.map((p) => ({ value: p.name, label: p.name }))]}
                onChange={(name) => { const p = def.presets!.find((q) => q.name === name); if (p) edit(`Preset: ${p.name}`, (d) => { setEffectParams(d, nid, fid, p.params as never); }); }} />
            ) : <span />}
            <IconButton label="Reset effect" description="Back to the defaults for this object" icon={<RotateCcw size={14} />}
              onClick={() => { edit("Reset Effect", (d) => { resetEffect(d, nid, fid); }); toast(`Reset ${def.label}`, true); }} testId="fx-reset" />
          </div>
          <Params node={node} world={world} effect={effect} index={index} units={units} anchors={anchors} set={set} num={num} />
        </div>
      )}
    </li>
  );
}

type Setter = <P>(label: string, patch: Partial<P>) => (commit?: boolean) => void;
type Num = (label: string, key: string) => (v: number, commit: boolean) => void;

function Check({ label, checked, onChange, disabled, testId }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; testId?: string }) {
  return <label className="pn-check"><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} data-testid={testId} /> {label}</label>;
}

function Params({ node, world, effect, index, units, anchors, set, num }: {
  node: Extract<SceneNode, { type: "path" | "shape" | "text" | "clone" }>; world: Mat; effect: LiveEffect; index: number; units: Units;
  anchors: { sub: number; idx: number }[]; set: Setter; num: Num;
}) {
  const f = frame(world);
  const input = () => effectInput(node, index);
  switch (effect.kind) {
    case "corners": {
      const p = effect.params as CornersParams;
      const picked = p.nodes ? p.nodes.reduce((a, l) => a + (l?.length ?? 0), 0) : null;
      const useSelected = () => {
        const byS: number[][] = [];
        for (const a of anchors) (byS[a.sub] ??= []).push(a.idx);
        set<CornersParams>("Corners: Selected Nodes", { nodes: Array.from({ length: byS.length }, (_, k) => [...new Set(byS[k] ?? [])].sort((x, y) => x - y)) })();
      };
      return (
        <>
          <Select label="Corner" value={p.mode} options={CORNER_MODES} onChange={(mode) => set<CornersParams>("Corner Type", { mode })()} testId="fx-corners-mode" />
          <NumberInput label="Radius" value={p.radius} length units={units} min={0} max={1000} defaultValue={2} onChange={num("Corner Radius", "radius")} testId="fx-corners-radius" />
          <p className="fx-note">{picked === null ? "All sharp corners between straight segments." : `${picked} picked corner${picked === 1 ? "" : "s"}.`}{index > 0 ? " Nodes refer to this effect's input." : ""}</p>
          <div className="pn-btns">
            <button type="button" className="ui-btn" disabled={!anchors.length} onClick={useSelected} title="Pick the nodes selected with Direct Selection" data-testid="fx-corners-use-nodes">Use selected nodes</button>
            <button type="button" className="ui-btn" disabled={picked === null} onClick={() => set<CornersParams>("Corners: All Nodes", { nodes: undefined })()}>All corners</button>
          </div>
        </>
      );
    }
    case "offset": {
      const p = effect.params as OffsetParams;
      return (
        <>
          <NumberInput label="Distance" value={p.distance} length units={units} min={-1000} max={1000} defaultValue={1} onChange={num("Offset Distance", "distance")} testId="fx-offset-distance" />
          <SegmentedControl label="Corners" value={p.join} full onChange={(join) => set<OffsetParams>("Offset Corners", { join })()}
            options={[{ value: "round", label: "Round" }, { value: "miter", label: "Miter" }, { value: "bevel", label: "Bevel" }]} />
          {p.join === "miter" && <NumberInput label="Miter limit" value={p.miterLimit} min={1} max={100} step={0.5} defaultValue={4} onChange={num("Miter Limit", "miterLimit")} />}
        </>
      );
    }
    case "hatches": {
      const p = effect.params as HatchParams;
      return (
        <>
          <div className="pn-grid">
            <NumberInput label="Angle" value={p.angle} suffix="°" min={-360} max={360} defaultValue={45} onChange={num("Hatch Angle", "angle")} testId="fx-hatch-angle" />
            <NumberInput label="Spacing" value={p.spacing} length units={units} min={0.05} max={1000} step={0.1} defaultValue={1} onChange={num("Hatch Spacing", "spacing")} testId="fx-hatch-spacing" />
            <NumberInput label="Shift" value={p.phase} length units={units} min={-1000} max={1000} step={0.1} defaultValue={0} onChange={num("Hatch Shift", "phase")} />
            <NumberInput label="Inset" value={p.inset} length units={units} min={0} max={1000} step={0.1} defaultValue={0} onChange={num("Hatch Inset", "inset")} />
          </div>
          <Check label="Crosshatch (second set at 90°)" checked={p.cross} onChange={(cross) => set<HatchParams>("Crosshatch", { cross })()} testId="fx-hatch-cross" />
          <Check label="Keep outline" checked={p.keepOutline} onChange={(keepOutline) => set<HatchParams>("Keep Outline", { keepOutline })()} />
        </>
      );
    }
    case "rotateCopies": {
      const p = effect.params as RotateCopiesParams;
      const centre = () => { const b = boxOf(input()); set<RotateCopiesParams>("Centre on Object", { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2 })(); };
      return (
        <>
          <div className="pn-grid">
            <NumberInput label="Copies" value={p.count} integer min={1} max={360} defaultValue={6} onChange={num("Copies", "count")} testId="fx-rotate-count" />
            <NumberInput label="Start" value={p.start} suffix="°" min={-360} max={360} defaultValue={0} onChange={num("Start Angle", "start")} />
          </div>
          <NumberInput label="Centre X" value={f.x(p.cx)} length units={units} onChange={(v, c) => set<RotateCopiesParams>("Centre", { cx: f.fromX(v) })(c)} />
          <NumberInput label="Centre Y" value={f.y(p.cy)} length units={units} onChange={(v, c) => set<RotateCopiesParams>("Centre", { cy: f.fromY(v) })(c)} />
          {!f.plain && <p className="fx-note">The object is rotated or scaled: the centre is in its own coordinates.</p>}
          <div className="pn-btns"><button type="button" className="ui-btn" onClick={centre} data-testid="fx-rotate-centre">Centre on object</button></div>
          <Check label="Fuse copies into one shape" checked={p.fuse} onChange={(fuse) => set<RotateCopiesParams>("Fuse Copies", { fuse })()} testId="fx-rotate-fuse" />
        </>
      );
    }
    case "mirror": {
      const p = effect.params as MirrorParams;
      const centre = () => {
        const b = boxOf(input()), cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
        set<MirrorParams>("Axis on Centre", { x: cx, y: cy, x1: cx, y1: b.minY, x2: cx, y2: b.maxY })();
      };
      return (
        <>
          <SegmentedControl label="Axis" value={p.axis} full onChange={(axis) => set<MirrorParams>("Mirror Axis", { axis })()}
            options={[{ value: "vertical", label: "Vertical" }, { value: "horizontal", label: "Horizontal" }, { value: "line", label: "Two points" }]} />
          {p.axis === "vertical" && <NumberInput label="Axis X" value={f.x(p.x)} length units={units} onChange={(v, c) => set<MirrorParams>("Mirror Axis", { x: f.fromX(v) })(c)} testId="fx-mirror-x" />}
          {p.axis === "horizontal" && <NumberInput label="Axis Y" value={f.y(p.y)} length units={units} onChange={(v, c) => set<MirrorParams>("Mirror Axis", { y: f.fromY(v) })(c)} />}
          {p.axis === "line" && (
            <div className="pn-grid">
              <NumberInput label="X1" value={f.x(p.x1)} length units={units} onChange={(v, c) => set<MirrorParams>("Mirror Axis", { x1: f.fromX(v) })(c)} />
              <NumberInput label="Y1" value={f.y(p.y1)} length units={units} onChange={(v, c) => set<MirrorParams>("Mirror Axis", { y1: f.fromY(v) })(c)} />
              <NumberInput label="X2" value={f.x(p.x2)} length units={units} onChange={(v, c) => set<MirrorParams>("Mirror Axis", { x2: f.fromX(v) })(c)} />
              <NumberInput label="Y2" value={f.y(p.y2)} length units={units} onChange={(v, c) => set<MirrorParams>("Mirror Axis", { y2: f.fromY(v) })(c)} />
            </div>
          )}
          {!f.plain && <p className="fx-note">The object is rotated or scaled: the axis is in its own coordinates.</p>}
          <div className="pn-btns"><button type="button" className="ui-btn" onClick={centre}>Axis through centre</button></div>
          <Check label="Keep original" checked={p.keepOriginal} onChange={(keepOriginal) => set<MirrorParams>("Keep Original", { keepOriginal })()} />
          <Check label="Fuse with original" checked={p.fuse} disabled={!p.keepOriginal} onChange={(fuse) => set<MirrorParams>("Fuse Mirror", { fuse })()} testId="fx-mirror-fuse" />
        </>
      );
    }
    case "livingHinge": {
      const p = effect.params as LivingHingeParams;
      const a = livingHingeAnalysis(input(), p);
      return (
        <>
          <Select label="Pattern" value={p.pattern} onChange={(pattern) => set<LivingHingeParams>("Hinge Pattern", { pattern })()} testId="fx-hinge-pattern"
            options={[{ value: "straight", label: "Straight" }, { value: "wave", label: "Wave" }, { value: "relief", label: "Relief" }, { value: "serpentine", label: "Serpentine" }]} />
          <SegmentedControl label="Cut style" value={p.cutStyle} full onChange={(cutStyle) => set<LivingHingeParams>("Hinge Cut Style", { cutStyle })()}
            options={[{ value: "slot", label: "Slots" }, { value: "line", label: "Single line" }]} />
          <SegmentedControl label="Cuts run" value={p.angle === 90 ? "90" : "0"} full onChange={(v) => set<LivingHingeParams>("Hinge Direction", { angle: v === "90" ? 90 : 0 })()}
            options={[{ value: "0", label: "Up–down", title: "Bends left–right" }, { value: "90", label: "Across", title: "Bends up–down" }]} />
          <div className="pn-grid">
            <NumberInput label="Length" value={p.slit} length units={units} min={2} max={1000} defaultValue={28} onChange={num("Hinge Cut Length", "slit")} testId="fx-hinge-slit" />
            <NumberInput label="Bridge" value={p.bridge} length units={units} min={0.5} max={100} step={0.1} defaultValue={3} onChange={num("Hinge Bridge", "bridge")} />
            <NumberInput label="Spacing" value={p.pitch} length units={units} min={0.5} max={100} step={0.1} defaultValue={2.5} onChange={num("Hinge Spacing", "pitch")} />
            {p.cutStyle === "slot"
              ? <NumberInput label="Slot" value={p.slotW} length units={units} min={0.2} max={10} step={0.1} defaultValue={0.8} onChange={num("Hinge Slot Width", "slotW")} />
              : <span />}
            <NumberInput label="Margin" value={p.margin} length units={units} min={0} max={1000} step={0.5} defaultValue={0} onChange={num("Hinge Margin", "margin")} />
            <NumberInput label="Kerf" value={p.kerf} length units={units} min={0} max={2} step={0.01} defaultValue={0.15} onChange={num("Kerf", "kerf")} />
          </div>
          <Select label="Material" value={p.material} testId="fx-hinge-material"
            options={Object.entries(MATERIALS).map(([value, m]) => ({ value, label: m.name }))}
            onChange={(material) => { const m = MATERIALS[material]; set<LivingHingeParams>("Hinge Material", { material, ...(m?.T ? { thickness: m.T } : {}), ...(m?.K ? { kerf: m.K } : {}) })(); }} />
          <NumberInput label="Thickness" value={p.thickness} length units={units} min={0.5} max={30} step={0.1} defaultValue={3} onChange={num("Material Thickness", "thickness")} />
          <Check label="Keep outline" checked={p.keepOutline} onChange={(keepOutline) => set<LivingHingeParams>("Keep Outline", { keepOutline })()} />
          {a ? (
            <dl className="fx-analysis" data-testid="fx-hinge-analysis">
              <dt>Smallest bend radius</dt><dd>≈ {a.rMin.toFixed(1)} mm</dd>
              <dt>Torsion bars</dt><dd>{a.barW.toFixed(2)} × {a.barLen.toFixed(1)} mm</dd>
              <dt>Columns × height</dt><dd>{a.columns} × {a.height.toFixed(1)} mm</dd>
            </dl>
          ) : <p className="fx-note">Living Hinge needs a closed shape.</p>}
        </>
      );
    }
  }
}
