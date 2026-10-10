"use client";

import { BUNDLED_FONTS } from "@/lib/letters/fonts";
import { decompose, isEmptyBox, rotateAt, scaleAt, shapeForBox, translate } from "@/lib/studio/geom";
import { layerCode } from "@/lib/studio/cutLayers";
import { findNode, isEditable, locate, selectionBox, topLevel, transformNodes } from "@/lib/studio/scene";
import type { CornerType, Document, ShapeKind, ShapeParams, TextNode } from "@/lib/studio/types";
import { NumberInput, SegmentedControl, Select } from "@/components/ui";
import { TOOL_INFO } from "@/lib/studio/commands";
import { DEFAULT_TEXT, useEditor, useEditorApi, type TextDefaults } from "./store";

interface FieldSpec { key: string; label: string; length?: boolean; integer?: boolean; min: number; max: number; step?: number; suffix?: string; def?: number; scale?: number }

const SHAPE_FIELDS: Record<ShapeKind, FieldSpec[]> = {
  rect: [{ key: "w", label: "W", length: true, min: 0.01, max: 1e4 }, { key: "h", label: "H", length: true, min: 0.01, max: 1e4 }, { key: "r", label: "Radius", length: true, min: 0, max: 1e4, def: 0 }],
  ellipse: [{ key: "rx", label: "W", length: true, min: 0.01, max: 1e4, scale: 2 }, { key: "ry", label: "H", length: true, min: 0.01, max: 1e4, scale: 2 }],
  polygon: [{ key: "sides", label: "Sides", integer: true, min: 3, max: 64, def: 6 }, { key: "r", label: "Radius", length: true, min: 0.01, max: 1e4 }, { key: "round", label: "Corners", length: true, min: 0, max: 1e4, def: 0 }],
  star: [{ key: "points", label: "Points", integer: true, min: 3, max: 64, def: 5 }, { key: "r", label: "Radius", length: true, min: 0.01, max: 1e4 }, { key: "inner", label: "Inner", min: 2, max: 98, suffix: "%", def: 50, scale: 100 }, { key: "round", label: "Corners", length: true, min: 0, max: 1e4, def: 0 }],
  arc: [{ key: "r", label: "Radius", length: true, min: 0.01, max: 1e4 }, { key: "start", label: "Start", min: -360, max: 360, suffix: "°", def: -90 }, { key: "sweep", label: "Sweep", min: 1, max: 360, suffix: "°", def: 270 }],
  slot: [{ key: "w", label: "W", length: true, min: 0.01, max: 1e4 }, { key: "h", label: "H", length: true, min: 0.01, max: 1e4 }],
  gear: [{ key: "teeth", label: "Teeth", integer: true, min: 6, max: 200, def: 20 }, { key: "module", label: "Module", length: true, min: 0.1, max: 50, step: 0.1 }, { key: "pressure", label: "Pressure", min: 14.5, max: 30, suffix: "°", def: 20 }, { key: "bore", label: "Bore", length: true, min: 0, max: 1e4 }],
  arrow: [{ key: "w", label: "W", length: true, min: 0.01, max: 1e4 }, { key: "h", label: "H", length: true, min: 0.01, max: 1e4 }, { key: "head", label: "Head", length: true, min: 0.01, max: 1e4 }, { key: "shaft", label: "Shaft", length: true, min: 0.01, max: 1e4 }],
  bubble: [{ key: "w", label: "W", length: true, min: 0.01, max: 1e4 }, { key: "h", label: "H", length: true, min: 0.01, max: 1e4 }, { key: "r", label: "Radius", length: true, min: 0, max: 1e4 }, { key: "tail", label: "Tail", length: true, min: 0, max: 1e4 }],
  heart: [{ key: "w", label: "W", length: true, min: 0.01, max: 1e4 }, { key: "h", label: "H", length: true, min: 0.01, max: 1e4 }],
  grid: [{ key: "w", label: "W", length: true, min: 0.01, max: 1e4 }, { key: "h", label: "H", length: true, min: 0.01, max: 1e4 }, { key: "cols", label: "Columns", integer: true, min: 1, max: 100, def: 4 }, { key: "rows", label: "Rows", integer: true, min: 1, max: 100, def: 3 }],
  spiral: [{ key: "turns", label: "Turns", min: 0.5, max: 50, step: 0.5, def: 4 }, { key: "r", label: "Radius", length: true, min: 0.01, max: 1e4 }, { key: "inner", label: "Inner", length: true, min: 0, max: 1e4, def: 0 }],
};

const readField = (p: ShapeParams, f: FieldSpec) => {
  const raw = (p as unknown as Record<string, unknown>)[f.key];
  const v = Array.isArray(raw) ? (raw[0] as number) : (raw as number);
  return v * (f.scale ?? 1);
};
const writeField = (p: ShapeParams, f: FieldSpec, v: number) => {
  const rec = p as unknown as Record<string, unknown>;
  const val = v / (f.scale ?? 1);
  if (Array.isArray(rec[f.key])) rec[f.key] = [val, val, val, val];
  else rec[f.key] = val;
};

/** Edits from number fields: scrubbing previews from the drag base, the final value is one undo step. */
function useLive() {
  const api = useEditorApi();
  return (label: string, recipe: (d: Document) => void, commit: boolean) => {
    const s = api.getState();
    if (!commit) { s.begin(); s.preview(recipe); return; }
    if (s.base) s.end(label, recipe); else s.edit(label, recipe);
  };
}

export function ControlBar({ onResetToast }: { onResetToast: (m: string) => void }) {
  const api = useEditorApi();
  const doc = useEditor((s) => s.base ?? s.doc);
  const liveDoc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const tool = useEditor((s) => s.tool);
  const shapeDefaults = useEditor((s) => s.shapeDefaults);
  const textDefaults = useEditor((s) => s.textDefaults);
  const live = useLive();
  const units = doc.units;
  const ids = topLevel(liveDoc.root, selection).filter((id) => isEditable(liveDoc.root, id));
  const box = selectionBox(liveDoc, ids);
  const single = ids.length === 1 ? findNode(liveDoc.root, ids[0]) : null;
  const common = { units, onResetToast };

  const typeDefaults = tool === "text" && single?.type !== "text";

  if (ids.length && !isEmptyBox(box) && !typeDefaults) {
    const W = box.maxX - box.minX, H = box.maxY - box.minY;
    const rot = single ? decompose(locate(liveDoc.root, single.id)!.world).rotation : 0;
    const resize = (axis: "w" | "h", v: number) => (d: Document) => {
      const b = selectionBox(d, ids);
      const cur = axis === "w" ? b.maxX - b.minX : b.maxY - b.minY;
      if (cur < 1e-9) return;
      const f = v / cur;
      transformNodes(d, ids, axis === "w" ? scaleAt(f, 1, b.minX, b.minY) : scaleAt(1, f, b.minX, b.minY));
    };
    const layer = single?.layer ?? (ids.every((id) => findNode(liveDoc.root, id)?.layer === findNode(liveDoc.root, ids[0])?.layer) ? findNode(liveDoc.root, ids[0])!.layer : -1);
    return (
      <div className="st-control" aria-label="Control bar" data-testid="control-bar">
        <div className="grp"><span className="lbl">{single ? nodeLabel(single.type, single.type === "shape" ? single.shape.kind : undefined) : `${ids.length} objects`}</span></div>
        <div className="grp">
          <NumberInput label="X" value={box.minX} length {...common} onChange={(v, c) => live("Move", (d) => { const b = selectionBox(d, ids); transformNodes(d, ids, translate(v - b.minX, 0)); }, c)} testId="sel-x" />
          <NumberInput label="Y" value={box.minY} length {...common} onChange={(v, c) => live("Move", (d) => { const b = selectionBox(d, ids); transformNodes(d, ids, translate(0, v - b.minY)); }, c)} testId="sel-y" />
          <NumberInput label="W" value={W} length min={0.01} {...common} onChange={(v, c) => live("Scale", resize("w", v), c)} testId="sel-w" />
          <NumberInput label="H" value={H} length min={0.01} {...common} onChange={(v, c) => live("Scale", resize("h", v), c)} testId="sel-h" />
          <NumberInput label="Angle" value={Math.round(rot * 100) / 100} suffix="°" min={-360} max={360} defaultValue={single ? 0 : undefined} {...common}
            onChange={(v, c) => live("Rotate", (d) => { const b = selectionBox(d, ids); const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2; const r0 = single ? decompose(locate(d.root, ids[0])!.world).rotation : 0; transformNodes(d, ids, rotateAt(v - r0, cx, cy)); }, c)} testId="sel-angle" />
        </div>
        <div className="grp">
          <label className="ctl-select">
            <span className="lbl">Layer</span>
            <select className="ui-select" value={layer} aria-label="Cut layer" data-testid="sel-layer"
              onChange={(e) => { const k = Number(e.target.value); api.getState().edit("Assign Cut Layer", (d) => ids.forEach((id) => { const n = findNode(d.root, id); if (n) n.layer = k; })); api.getState().set({ currentLayer: k }); }}>
              {layer < 0 && <option value={-1}>Mixed</option>}
              {doc.cutLayers.map((l) => <option key={l.index} value={l.index}>{layerCode(l.index)} · {l.name}</option>)}
            </select>
          </label>
        </div>
        {single?.type === "shape" && <ShapeFields shape={single.shape} only="noSize" {...common} onChange={(f, v, c) => live(`Edit ${nodeLabel("shape", single.shape.kind)}`, (d) => { const n = findNode(d.root, single.id); if (n?.type === "shape") writeField(n.shape, f, v); }, c)} onCorner={(corner) => api.getState().edit("Corner Type", (d) => { const n = findNode(d.root, single.id); if (n?.type === "shape" && n.shape.kind === "rect") n.shape.corner = corner; })} onPie={(pie) => api.getState().edit("Arc Type", (d) => { const n = findNode(d.root, single.id); if (n?.type === "shape" && n.shape.kind === "arc") n.shape.pie = pie; })} />}
        {single?.type === "text" && <TextFields t={single} {...common} onChange={(label, patch, c) => live(label, (d) => { const n = findNode(d.root, single.id); if (n?.type === "text") Object.assign(n, patch); }, c)} />}
      </div>
    );
  }

  const shapeKind = tool as ShapeKind;
  if (SHAPE_FIELDS[shapeKind]) {
    const p = shapeDefaults[shapeKind] ?? shapeForBox(shapeKind, 40, 40);
    const setP = (fn: (q: ShapeParams) => void) => { const q = structuredClone(p); fn(q); api.getState().set({ shapeDefaults: { ...api.getState().shapeDefaults, [shapeKind]: q } }); };
    return (
      <div className="st-control" aria-label="Control bar" data-testid="control-bar">
        <div className="grp"><span className="lbl">{TOOL_INFO[tool].label}</span></div>
        <ShapeFields shape={p} only="params" {...common} onChange={(f, v) => setP((q) => writeField(q, f, v))} onCorner={(corner) => setP((q) => { if (q.kind === "rect") q.corner = corner; })} onPie={(pie) => setP((q) => { if (q.kind === "arc") q.pie = pie; })} />
        <div className="grp"><span className="hint">{TOOL_INFO[tool].description}</span></div>
      </div>
    );
  }

  if (tool === "text") {
    return (
      <div className="st-control" aria-label="Control bar" data-testid="control-bar">
        <div className="grp"><span className="lbl">Type</span></div>
        <TextFields t={textDefaults} {...common} onChange={(_l, patch) => api.getState().set({ textDefaults: { ...api.getState().textDefaults, ...patch } as TextDefaults })} />
        <div className="grp"><span className="hint">{TOOL_INFO.text.description}</span></div>
      </div>
    );
  }

  const sheet = doc.sheets[0];
  return (
    <div className="st-control" aria-label="Control bar" data-testid="control-bar">
      <div className="grp"><span className="lbl">Document</span></div>
      <div className="grp">
        <NumberInput label="W" value={sheet.w} length min={10} max={3000} {...common} onChange={(w, c) => live("Sheet Size", (d) => { if (Math.abs(d.sheets[0].w - w) > 1e-9) { d.sheets[0].w = w; d.sheets[0].name = "Custom size"; } }, c)} testId="sheet-w" />
        <NumberInput label="H" value={sheet.h} length min={10} max={3000} {...common} onChange={(h, c) => live("Sheet Size", (d) => { if (Math.abs(d.sheets[0].h - h) > 1e-9) { d.sheets[0].h = h; d.sheets[0].name = "Custom size"; } }, c)} testId="sheet-h" />
      </div>
      <div className="grp"><span className="hint">{TOOL_INFO[tool].description}</span></div>
    </div>
  );
}

export function nodeLabel(type: string, kind?: string): string {
  if (type === "shape" && kind) return { rect: "Rectangle", ellipse: "Ellipse", polygon: "Polygon", star: "Star", arc: "Arc", slot: "Slot", gear: "Gear", arrow: "Arrow", bubble: "Speech Bubble", heart: "Heart", grid: "Grid", spiral: "Spiral" }[kind] ?? "Shape";
  return { path: "Path", text: "Text", group: "Group", image: "Image", generator: "Generator", dimension: "Dimension", shape: "Shape" }[type] ?? type;
}

function ShapeFields({ shape, only, units, onResetToast, onChange, onCorner, onPie }: {
  shape: ShapeParams; only?: "params" | "noSize"; units: Document["units"]; onResetToast: (m: string) => void;
  onChange: (f: FieldSpec, v: number, commit: boolean) => void; onCorner: (c: CornerType) => void; onPie: (pie: boolean) => void;
}) {
  const fields = SHAPE_FIELDS[shape.kind].filter((f) =>
    only === "noSize" ? f.label !== "W" && f.label !== "H" : !only || f.def !== undefined || f.key === "module");
  if (!fields.length && shape.kind !== "rect" && shape.kind !== "arc") return null;
  return (
    <div className="grp" data-testid="shape-fields">
      {fields.map((f) => (
        <NumberInput key={f.key} label={f.label} value={readField(shape, f)} length={f.length} integer={f.integer} min={f.min} max={f.max} step={f.step ?? 1}
          suffix={f.suffix} defaultValue={f.def} units={units} onResetToast={onResetToast} onChange={(v, c) => onChange(f, v, c)} testId={`shape-${f.key}`} />
      ))}
      {shape.kind === "rect" && (
        <SegmentedControl label="Corner" hideLabel value={shape.corner} onChange={onCorner}
          options={[{ value: "round", label: "Round" }, { value: "chamfer", label: "Chamfer" }, { value: "inverted", label: "Inverted" }]} />
      )}
      {shape.kind === "arc" && (
        <SegmentedControl label="Arc type" hideLabel value={shape.pie ? "pie" : "arc"} onChange={(v) => onPie(v === "pie")}
          options={[{ value: "pie", label: "Pie" }, { value: "arc", label: "Open arc" }]} />
      )}
    </div>
  );
}

function TextFields({ t, units, onResetToast, onChange }: {
  t: Pick<TextNode, "font" | "size" | "tracking" | "lineHeight" | "align" | "direction">; units: Document["units"]; onResetToast: (m: string) => void;
  onChange: (label: string, patch: Partial<TextNode>, commit: boolean) => void;
}) {
  return (
    <div className="grp" data-testid="text-fields">
      <Select label="Font" hideLabel value={t.font} options={BUNDLED_FONTS.map((f) => ({ value: f.id, label: f.name }))} onChange={(font) => onChange("Font", { font }, true)} testId="text-font" />
      <NumberInput label="Size" value={t.size} length min={0.5} max={2000} defaultValue={DEFAULT_TEXT.size} units={units} onResetToast={onResetToast} onChange={(size, c) => onChange("Font Size", { size }, c)} testId="text-size" />
      <NumberInput label="Tracking" value={t.tracking} min={-500} max={2000} step={10} defaultValue={0} onResetToast={onResetToast} onChange={(tracking, c) => onChange("Tracking", { tracking }, c)} testId="text-tracking" />
      <NumberInput label="Leading" value={t.lineHeight} min={0.5} max={5} step={0.05} defaultValue={DEFAULT_TEXT.lineHeight} suffix="×" onResetToast={onResetToast} onChange={(lineHeight, c) => onChange("Leading", { lineHeight }, c)} testId="text-leading" />
      <SegmentedControl label="Align" hideLabel value={t.align} onChange={(align) => onChange("Align Text", { align }, true)}
        options={[{ value: "start", label: "Start" }, { value: "center", label: "Centre" }, { value: "end", label: "End" }]} />
      <SegmentedControl label="Direction" hideLabel value={t.direction} onChange={(direction) => onChange("Direction", { direction }, true)}
        options={[{ value: "auto", label: "Auto" }, { value: "ltr", label: "LTR" }, { value: "rtl", label: "RTL" }]} />
    </div>
  );
}
