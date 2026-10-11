"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  AudioWaveform, Blend, Brush, ChevronDown, ChevronRight, ChevronUp, CopyPlus, Dices, Eye, EyeOff, Feather, FlipHorizontal2, Flower2, Grid2x2, Link2, Plus, RotateCcw, Route,
  Rows3, RulerDimensionLine, Spline, SquareRoundCorner, SquareSquare, SquaresUnite, Trash2, Unlink, X,
} from "lucide-react";
import { MATERIALS } from "@/lib/hinge/defaults";
import { loadClip } from "@/lib/studio/clipboard";
import { newId } from "@/lib/studio/doc";
import { canHaveEffects, EFFECT_KINDS, EFFECTS, effectHasHandles, effectInput } from "@/lib/studio/effects";
import { boxOf } from "@/lib/studio/effects/copies";
import { LIVE_BOOLEAN_LABELS } from "@/lib/studio/effects/liveBoolean";
import { livingHingeAnalysis } from "@/lib/studio/effects/livingHinge";
import { LINK_SPACE } from "@/lib/studio/effects/meta";
import {
  addEffect, addLinkedEffect, duplicateEffect, linkEffect, moveEffect, removeEffect, resetEffect, setEffectEnabled, setEffectParams, stackOrder, unlinkEffect,
} from "@/lib/studio/effects/ops";
import { bendGuide, envelopeCorners } from "@/lib/studio/effects/warp";
import { findNode, isEditable, locate, topLevel } from "@/lib/studio/scene";
import type {
  BendParams, CornerMode, CornersParams, Document, EffectKind, EnvelopeParams, HatchParams, InterpolateParams, LinkedParams, LiveBooleanOp, LiveBooleanParams, LiveEffect,
  LivingHingeParams, Mat, MeasureSegmentsParams, MirrorParams, OffsetParams, PatternAlongPathParams, PatternMode, PowerStrokeParams, RotateCopiesParams, RoughenParams,
  SceneNode, TaperStrokeParams, Units, Vec,
} from "@/lib/studio/types";
import { IconButton, NumberInput, PanelSection, SegmentedControl, Select, TextField } from "@/components/ui";
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
  patternAlongPath: (s = 16) => <Route size={s} strokeWidth={1.5} />,
  bend: (s = 16) => <Spline size={s} strokeWidth={1.5} />,
  envelope: (s = 16) => <Grid2x2 size={s} strokeWidth={1.5} />,
  roughen: (s = 16) => <AudioWaveform size={s} strokeWidth={1.5} />,
  interpolate: (s = 16) => <Blend size={s} strokeWidth={1.5} />,
  taperStroke: (s = 16) => <Feather size={s} strokeWidth={1.5} />,
  powerStroke: (s = 16) => <Brush size={s} strokeWidth={1.5} />,
  measureSegments: (s = 16) => <RulerDimensionLine size={s} strokeWidth={1.5} />,
  liveBoolean: (s = 16) => <SquaresUnite size={s} strokeWidth={1.5} />,
};

const PATTERN_MODES: { value: PatternMode; label: string }[] = [
  { value: "single", label: "One copy" }, { value: "singleStretched", label: "One copy, stretched" },
  { value: "repeated", label: "Repeated" }, { value: "repeatedStretched", label: "Repeated, stretched to fit" },
];

const objectName = (n: SceneNode) => n.name ?? nodeLabel(n.type, n.type === "shape" ? n.shape.kind : undefined);

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
  // Two objects: the stack of the bottom one; the top one can be linked (pattern, blend end, operand).
  const order = ids.length === 2 ? stackOrder(doc, ids) : ids;
  const located = ids.length === 1 || ids.length === 2 ? locate(doc.root, order[0]) : null;
  const node = located && canHaveEffects(located.node) ? located.node : null;
  const other = ids.length === 2 && node ? order[1] : null;
  const otherNode = other ? findNode(doc.root, other) : null;

  const handleKey = node ? (node.effects ?? []).filter((e) => e.enabled && !closed[e.id] && effectHasHandles(e.kind)).map((e) => e.id).join(",") : "";
  const nodeId = node?.id ?? null;
  useEffect(() => {
    const want = nodeId && handleKey ? { node: nodeId, effects: handleKey.split(",") } : null;
    const cur = api.getState().fxHandles;
    if ((cur?.node ?? null) !== (want?.node ?? null) || (cur?.effects.join(",") ?? "") !== (want?.effects.join(",") ?? "")) api.getState().set({ fxHandles: want });
  }, [api, nodeId, handleKey]);
  useEffect(() => () => api.getState().set({ fxHandles: null }), [api]);

  const live: Live = (label, recipe, commit) => {
    const s = api.getState();
    if (!commit) { s.begin(); s.preview(recipe); return; }
    if (s.base) s.end(label, recipe); else s.edit(label, recipe);
  };

  if (!node || !located) {
    return (
      <PanelSection title="Live Effects" testId="fx-panel">
        <p className="pn-empty" data-testid="fx-empty">
          {ids.length > 2
            ? "Select one object to edit its effect stack (or two: the top one can be linked as a pattern, blend end or operand). Path › Live Effects adds an effect to every selected path, shape or text."
            : ids.length === 2
              ? "The bottom object of the two can't take Live Effects. Put a path, shape or text at the bottom."
              : "Select a path, shape or text to add Live Effects: non-destructive corners, offsets, hatches, copies, mirrors, living hinges, warps, strokes, blends and live booleans."}
        </p>
      </PanelSection>
    );
  }

  const effects = node.effects ?? [];
  const nid = node.id;
  const add = (kind: EffectKind) => {
    const fid = newId();
    const link = other && LINK_SPACE[kind] ? other : null;
    api.getState().edit(`Add Live Effect: ${EFFECTS[kind].label}`, (d) => {
      if (link) addLinkedEffect(d, nid, link, kind, () => fid); else addEffect(d, [nid], kind, () => fid);
    }, link ? { select: [nid] } : undefined);
    setClosed((c) => ({ ...c, [fid]: false }));
  };

  return (
    <>
      <PanelSection title="Live Effects" meta={nodeLabel(node.type, node.type === "shape" ? node.shape.kind : undefined)} testId="fx-panel">
        {otherNode && (
          <p className="fx-note" data-testid="fx-two">
            Effects go on the bottom object. The top one ({objectName(otherNode)}) becomes the pattern, blend end or operand of Pattern Along Path, Interpolate and Live Boolean.
          </p>
        )}
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
                anchors={anchors.filter((a) => a.id === nid)} live={live} toast={toast} doc={doc} other={other}
              />
            ))}
          </ol>
          <p className="fx-note">Expand Live Effects (Path menu) turns the result into a plain path.</p>
        </PanelSection>
      )}
    </>
  );
}

function EffectCard({ node, world, effect, index, count, units, open, onToggleOpen, anchors, live, toast, doc, other }: {
  node: Extract<SceneNode, { type: "path" | "shape" | "text" | "clone" }>; world: Mat; effect: LiveEffect; index: number; count: number; units: Units;
  open: boolean; onToggleOpen: () => void; anchors: { sub: number; idx: number }[]; live: Live; toast: Toast; doc: Document; other: string | null;
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
          <Params node={node} world={world} effect={effect} index={index} units={units} anchors={anchors} set={set} num={num} doc={doc} other={other} toast={toast} />
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

const LINK_ERRORS: Record<NonNullable<LinkedParams["linkError"]>, string> = {
  missing: "The linked object was deleted, so this effect is off. Link another object.",
  cycle: "The linked object depends on this one, so the link is off.",
};

function LinkRow({ doc, node, effect, other, noun, hide, toast }: {
  doc: Document; node: SceneNode; effect: LiveEffect; other: string | null; noun: string; hide?: boolean; toast: Toast;
}) {
  const api = useEditorApi();
  const p = effect.params as LinkedParams;
  const src = p.link ? findNode(doc.root, p.link) : null;
  const nid = node.id, fid = effect.id;
  const use = (sid: string, how: string) => {
    let ok = false;
    api.getState().edit(`Link ${noun}`, (d) => { ok = linkEffect(d, nid, fid, sid, hide); });
    if (!ok) toast(`Can't use ${how} object: it is this object, or it depends on it.`);
  };
  const useCopied = () => {
    const ids = (loadClip()?.nodes ?? []).map((n) => n.id).filter((id) => id !== nid && findNode(doc.root, id));
    if (!ids.length) { toast(`Copy the ${noun} object first (Ctrl+C), then use it here.`); return; }
    use(ids[ids.length - 1], "the copied");
  };
  return (
    <>
      <p className={`fx-note fx-link${p.linkError ? " fx-warn" : ""}`} data-testid="fx-link-status">
        <Link2 size={12} aria-hidden />{" "}
        {src && !p.linkError ? `${noun[0].toUpperCase()}${noun.slice(1)}: ${objectName(src)}` : p.linkError ? LINK_ERRORS[p.linkError] : `No ${noun} linked yet.`}
      </p>
      <div className="pn-btns">
        <button type="button" className="ui-btn" disabled={!other} onClick={() => other && use(other, "the selected")}
          title={other ? `Link the top selected object as the ${noun}` : "Select this object and the other one together"} data-testid="fx-link-selected">Use selected object</button>
        <button type="button" className="ui-btn" onClick={useCopied} title={`Link the object on the clipboard as the ${noun}`} data-testid="fx-link-copied">Use copied object</button>
        <IconButton label="Unlink" description="Keep the effect without a linked object" icon={<Unlink size={14} />} disabled={!p.link}
          onClick={() => api.getState().edit(`Unlink ${noun}`, (d) => { unlinkEffect(d, nid, fid); })} testId="fx-unlink" />
      </div>
      {hide && src && (
        <Check label="Hide operand (not drawn, cut or exported)" checked={!!src.hidden} testId="fx-hide-operand"
          onChange={(v) => api.getState().edit(v ? "Hide Operand" : "Show Operand", (d) => { const s = findNode(d.root, src.id); if (s) { if (v) s.hidden = true; else delete s.hidden; } })} />
      )}
    </>
  );
}

function Params({ node, world, effect, index, units, anchors, set, num, doc, other, toast }: {
  node: Extract<SceneNode, { type: "path" | "shape" | "text" | "clone" }>; world: Mat; effect: LiveEffect; index: number; units: Units;
  anchors: { sub: number; idx: number }[]; set: Setter; num: Num; doc: Document; other: string | null; toast: Toast;
}) {
  const api = useEditorApi();
  const f = frame(world);
  const input = () => effectInput(node, index);
  const text = (label: string, key: string) => (v: string) =>
    api.getState().edit(label, (d) => { setEffectParams(d, node.id, effect.id, { [key]: v } as never); }, { mergeKey: `fx:${effect.id}:${key}` });
  const link = (noun: string, hide?: boolean) => <LinkRow doc={doc} node={node} effect={effect} other={other} noun={noun} hide={hide} toast={toast} />;
  switch (effect.kind) {
    case "patternAlongPath": {
      const p = effect.params as PatternAlongPathParams;
      return (
        <>
          {link("pattern")}
          <Select label="Copies" value={p.mode} options={PATTERN_MODES} onChange={(mode) => set<PatternAlongPathParams>("Pattern Copies", { mode })()} testId="fx-pattern-mode" />
          <div className="pn-grid">
            <NumberInput label="Spacing" value={p.spacing} length units={units} min={-1000} max={1000} step={0.5} defaultValue={0} onChange={num("Pattern Spacing", "spacing")} testId="fx-pattern-spacing" />
            <NumberInput label="Offset" value={p.normalOffset} length units={units} min={-1000} max={1000} step={0.5} defaultValue={0} onChange={num("Pattern Offset", "normalOffset")} />
            <NumberInput label="Width" value={p.widthScale * 100} suffix="%" min={1} max={1000} defaultValue={100} onChange={(v, c) => set<PatternAlongPathParams>("Pattern Width", { widthScale: v / 100 })(c)} />
          </div>
          <Check label="Rotate pattern 90°" checked={p.rotate90} onChange={(rotate90) => set<PatternAlongPathParams>("Rotate Pattern", { rotate90 })()} />
          <p className="fx-note">The pattern follows this path from its start, as it sits on the page (rotating or scaling it counts).</p>
        </>
      );
    }
    case "bend": {
      const p = effect.params as BendParams;
      return (
        <>
          <NumberInput label="Width" value={p.widthScale * 100} suffix="%" min={1} max={1000} defaultValue={100} onChange={(v, c) => set<BendParams>("Bend Width", { widthScale: v / 100 })(c)} testId="fx-bend-width" />
          <Check label="Width grows with the guide's length" checked={p.widthInLength} onChange={(widthInLength) => set<BendParams>("Bend Width Mode", { widthInLength })()} />
          <Check label="Artwork runs top to bottom" checked={p.vertical} testId="fx-bend-vertical"
            onChange={(vertical) => set<BendParams>("Bend Direction", { vertical, guide: bendGuide(input(), vertical) })()} />
          <div className="pn-btns"><button type="button" className="ui-btn" onClick={() => set<BendParams>("Straighten Guide", { guide: bendGuide(input(), p.vertical) })()} data-testid="fx-bend-straighten">Straighten guide</button></div>
          <p className="fx-note">Drag the pink handles on the canvas to bend the guide.</p>
        </>
      );
    }
    case "envelope": {
      const p = effect.params as EnvelopeParams;
      const box = envelopeCorners(input());
      const corner = (k: "tl" | "tr" | "br" | "bl", name: string) => (
        <>
          <NumberInput label={`${name} X`} value={f.x(p[k].x)} length units={units} defaultValue={f.x(box[k].x)}
            onChange={(v, c) => set<EnvelopeParams>("Envelope Corner", { [k]: { x: f.fromX(v), y: p[k].y } } as Partial<EnvelopeParams>)(c)} testId={`fx-env-${k}-x`} />
          <NumberInput label={`${name} Y`} value={f.y(p[k].y)} length units={units} defaultValue={f.y(box[k].y)}
            onChange={(v, c) => set<EnvelopeParams>("Envelope Corner", { [k]: { x: p[k].x, y: f.fromY(v) } } as Partial<EnvelopeParams>)(c)} />
        </>
      );
      return (
        <>
          <SegmentedControl label="Mode" value={p.mode} full onChange={(mode) => set<EnvelopeParams>("Envelope Mode", { mode })()}
            options={[{ value: "perspective", label: "Perspective", title: "Straight lines stay straight" }, { value: "bilinear", label: "Envelope", title: "Stretch between the four corners" }]} />
          <div className="pn-grid">
            {corner("tl", "Top left")}{corner("tr", "Top right")}{corner("bl", "Bottom left")}{corner("br", "Bottom right")}
          </div>
          {!f.plain && <p className="fx-note">The object is rotated or scaled: corners are in its own coordinates.</p>}
          <div className="pn-btns"><button type="button" className="ui-btn" onClick={() => set<EnvelopeParams>("Reset Corners", box)()} data-testid="fx-env-reset">Corners to bounding box</button></div>
          <p className="fx-note">Drag the four pink corner handles on the canvas.</p>
        </>
      );
    }
    case "roughen": {
      const p = effect.params as RoughenParams;
      return (
        <>
          <SegmentedControl label="Split segments" value={p.subdivide} full onChange={(subdivide) => set<RoughenParams>("Roughen Split", { subdivide })()}
            options={[{ value: "length", label: "By length" }, { value: "count", label: "By count" }]} />
          {p.subdivide === "length"
            ? <NumberInput label="Max piece" value={p.maxSegment} length units={units} min={0.05} max={1000} step={0.5} defaultValue={2} onChange={num("Roughen Piece Length", "maxSegment")} testId="fx-roughen-length" />
            : <NumberInput label="Pieces per segment" value={p.segments} integer min={1} max={1000} defaultValue={3} onChange={num("Roughen Pieces", "segments")} testId="fx-roughen-count" />}
          <SegmentedControl label="Move nodes" value={p.direction} full onChange={(direction) => set<RoughenParams>("Roughen Direction", { direction })()}
            options={[{ value: "xy", label: "Along X and Y" }, { value: "normal", label: "Across the path" }]} />
          {p.direction === "xy" ? (
            <div className="pn-grid">
              <NumberInput label="Max X" value={p.maxX} length units={units} min={0} max={1000} step={0.1} defaultValue={0.5} onChange={num("Roughen X", "maxX")} testId="fx-roughen-x" />
              <NumberInput label="Max Y" value={p.maxY} length units={units} min={0} max={1000} step={0.1} defaultValue={0.5} onChange={num("Roughen Y", "maxY")} />
            </div>
          ) : <NumberInput label="Max distance" value={p.maxNormal} length units={units} min={0} max={1000} step={0.1} defaultValue={0.5} onChange={num("Roughen Distance", "maxNormal")} testId="fx-roughen-normal" />}
          <Check label="Smooth (curves through the moved nodes)" checked={p.smooth} onChange={(smooth) => set<RoughenParams>("Roughen Smooth", { smooth })()} testId="fx-roughen-smooth" />
          <div className="fx-row">
            <NumberInput label="Seed" value={p.seed} integer min={0} max={999999} defaultValue={1} onChange={num("Roughen Seed", "seed")} testId="fx-roughen-seed" />
            <IconButton label="New seed" description="Another random roughness" icon={<Dices size={14} />} testId="fx-roughen-reseed"
              onClick={() => set<RoughenParams>("New Seed", { seed: 1 + Math.floor(Math.random() * 999998) })()} />
          </div>
        </>
      );
    }
    case "interpolate": {
      const p = effect.params as InterpolateParams;
      return (
        <>
          {link("end shape")}
          {!p.link && <p className="fx-note">Without a linked end shape, the first two subpaths of this object are blended.</p>}
          <NumberInput label="Steps" value={p.steps} integer min={1} max={500} defaultValue={5} onChange={num("Interpolate Steps", "steps")} testId="fx-interp-steps" />
          <SegmentedControl label="Spacing" value={p.spacing} full onChange={(spacing) => set<InterpolateParams>("Interpolate Spacing", { spacing })()}
            options={[{ value: "time", label: "Even steps" }, { value: "size", label: "Even area" }]} />
        </>
      );
    }
    case "taperStroke": {
      const p = effect.params as TaperStrokeParams;
      return (
        <>
          <NumberInput label="Width" value={p.width} length units={units} min={0.01} max={1000} step={0.1} defaultValue={2} onChange={num("Stroke Width", "width")} testId="fx-taper-width" />
          <div className="pn-grid">
            <NumberInput label="Start taper" value={p.start} suffix="%" min={0} max={100} defaultValue={20} onChange={num("Start Taper", "start")} testId="fx-taper-start" />
            <NumberInput label="End taper" value={p.end} suffix="%" min={0} max={100} defaultValue={20} onChange={num("End Taper", "end")} />
          </div>
          <NumberInput label="Smoothing" value={p.smoothing * 100} suffix="%" min={0} max={100} defaultValue={50} onChange={(v, c) => set<TaperStrokeParams>("Taper Smoothing", { smoothing: v / 100 })(c)} />
          <p className="fx-note">The result is a filled outline: it engraves or cuts as a shape, not a line.</p>
        </>
      );
    }
    case "powerStroke": {
      const p = effect.params as PowerStrokeParams;
      const pts = p.points;
      const put = (k: number, key: "t" | "w") => (v: number, c: boolean) => {
        const next = pts.map((q, j) => (j === k ? { ...q, [key]: key === "t" ? v / 100 : v } : q)).sort((a, b) => a.t - b.t);
        set<PowerStrokeParams>("Stroke Width Point", { points: next })(c);
      };
      const addPoint = () => {
        const s = [...pts].sort((a, b) => a.t - b.t), ends = [{ t: 0, w: s[0]?.w ?? 2 }, ...s, { t: 1, w: s[s.length - 1]?.w ?? 2 }];
        let k = 0;
        for (let j = 1; j < ends.length - 1; j++) if (ends[j + 1].t - ends[j].t > ends[k + 1].t - ends[k].t) k = j;
        const t = (ends[k].t + ends[k + 1].t) / 2;
        set<PowerStrokeParams>("Add Width Point", { points: [...s, { t, w: (ends[k].w + ends[k + 1].w) / 2 }].sort((a, b) => a.t - b.t) })();
      };
      return (
        <>
          <SegmentedControl label="Between points" value={p.interpolation} full onChange={(interpolation) => set<PowerStrokeParams>("Width Interpolation", { interpolation })()}
            options={[{ value: "smooth", label: "Smooth" }, { value: "linear", label: "Straight" }]} />
          <ol className="fx-points" aria-label="Width points" data-testid="fx-power-points">
            {pts.map((q, k) => (
              <li key={k} className="fx-row">
                <NumberInput label="Position" value={Math.round(q.t * 1000) / 10} suffix="%" min={0} max={100} step={1} defaultValue={k === 0 ? 0 : k === pts.length - 1 ? 100 : 50} onChange={put(k, "t")} />
                <NumberInput label="Width" value={q.w} length units={units} min={0} max={1000} step={0.1} defaultValue={2} onChange={put(k, "w")} />
                <IconButton label="Remove point" icon={<X size={14} />} disabled={pts.length <= 1}
                  onClick={() => set<PowerStrokeParams>("Remove Width Point", { points: pts.filter((_, j) => j !== k) })()} />
              </li>
            ))}
          </ol>
          <div className="pn-btns"><button type="button" className="ui-btn" onClick={addPoint} disabled={pts.length >= 32} data-testid="fx-power-add"><Plus size={13} /> Add point</button></div>
          <p className="fx-note">Drag the pink handles on the canvas: along the path to move a point, sideways to change its width.</p>
        </>
      );
    }
    case "measureSegments": {
      const p = effect.params as MeasureSegmentsParams;
      const clear = (key: "prefix" | "suffix", label: string) => (
        <IconButton label={`Clear ${key}`} icon={<X size={14} />} disabled={!p[key]} onClick={() => api.getState().edit(label, (d) => { setEffectParams(d, node.id, effect.id, { [key]: "" } as never); })} />
      );
      return (
        <>
          <div className="pn-grid">
            <NumberInput label="Decimals" value={p.decimals} integer min={0} max={6} defaultValue={2} onChange={num("Measure Decimals", "decimals")} testId="fx-measure-decimals" />
            <NumberInput label="Font size" value={p.fontSize} length units={units} min={0.5} max={100} step={0.5} defaultValue={3} onChange={num("Measure Font Size", "fontSize")} />
            <NumberInput label="Offset" value={p.offset} length units={units} min={-1000} max={1000} step={0.5} defaultValue={3} onChange={num("Measure Offset", "offset")} />
          </div>
          <div className="fx-row"><TextField label="Prefix" value={p.prefix} maxLength={24} onChange={text("Measure Prefix", "prefix")} testId="fx-measure-prefix" />{clear("prefix", "Clear Measure Prefix")}</div>
          <div className="fx-row"><TextField label="Suffix" value={p.suffix} maxLength={24} onChange={text("Measure Suffix", "suffix")} />{clear("suffix", "Clear Measure Suffix")}</div>
          <Check label={`Show unit (${units})`} checked={p.showUnit} onChange={(showUnit) => set<MeasureSegmentsParams>("Measure Unit", { showUnit })()} />
          <SegmentedControl label="Ends" value={p.ends} full onChange={(ends) => set<MeasureSegmentsParams>("Measure Ends", { ends })()}
            options={[{ value: "arrows", label: "Arrows" }, { value: "ticks", label: "Ticks" }, { value: "none", label: "None" }]} />
          <p className="fx-note">Labels are guides: shown on the canvas only, never cut, engraved or exported. Expand keeps the path and drops them.</p>
        </>
      );
    }
    case "liveBoolean": {
      const p = effect.params as LiveBooleanParams;
      return (
        <>
          <Select label="Operation" value={p.op} testId="fx-bool-op" onChange={(op) => set<LiveBooleanParams>("Live Boolean Operation", { op: op as LiveBooleanOp })()}
            options={(Object.keys(LIVE_BOOLEAN_LABELS) as LiveBooleanOp[]).map((value) => ({ value, label: LIVE_BOOLEAN_LABELS[value] }))} />
          {link("operand", true)}
          <p className="fx-note">The operand stays a separate, editable object; this shape updates whenever it changes.</p>
        </>
      );
    }
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
