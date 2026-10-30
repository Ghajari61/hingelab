"use client";

import type { ReactNode } from "react";
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignStartHorizontal, AlignStartVertical,
  BringToFront, CircleDot, Diamond, DiamondPlus, Expand, FlipHorizontal2, FlipVertical2, GitCommitHorizontal, Group, Link, Link2, Merge, MoveRight,
  RotateCcw, RotateCw, SendToBack, Shrink, Slash, Spline, SplinePointer, Square, Ungroup, Unlink, Unlink2, Unplug,
} from "lucide-react";
import { BUNDLED_FONTS } from "@/lib/letters/fontList";
import { isEmptyBox, shapeForBox } from "@/lib/studio/geom";
import { layerCode } from "@/lib/studio/cutLayers";
import { setConnectorMode } from "@/lib/studio/connectors";
import { findNode, isEditable, selectionBox, topLevel } from "@/lib/studio/scene";
import { currentRotation, moveRefTo, refAt, resizeTo, rotateTo } from "@/lib/studio/transform";
import type { CornerType, Document, ShapeKind, ShapeParams, TextNode } from "@/lib/studio/types";
import { IconButton, NumberInput, SegmentedControl, Select, Slider } from "@/components/ui";
import { TOOL_INFO } from "@/lib/studio/commands";
import { SHAPE_LIBRARY } from "@/lib/studio/shapeLibrary";
import { DEFAULT_TEXT, useEditor, useEditorApi, type TextDefaults } from "./store";
import type { Handler } from "./commandHandlers";
import { OPTION_TOOLS, ToolOptions } from "./tools/ToolOptions";

const displayColor = (c: string) => (c === "#000000" ? "var(--ink)" : c);

interface FieldSpec { key: string; label: string; length?: boolean; integer?: boolean; min: number; max: number; step?: number; suffix?: string; def?: number; scale?: number }

const SHAPE_FIELDS: Record<ShapeKind, FieldSpec[]> = {
  rect: [{ key: "w", label: "W", length: true, min: 0.01, max: 1e4 }, { key: "h", label: "H", length: true, min: 0.01, max: 1e4 }, { key: "r", label: "Radius", length: true, min: 0, max: 1e4, def: 0 }],
  ellipse: [{ key: "rx", label: "W", length: true, min: 0.01, max: 1e4, scale: 2 }, { key: "ry", label: "H", length: true, min: 0.01, max: 1e4, scale: 2 }],
  polygon: [{ key: "sides", label: "Sides", integer: true, min: 3, max: 64, def: 6 }, { key: "r", label: "Radius", length: true, min: 0.01, max: 1e4 }, { key: "round", label: "Corners", length: true, min: 0, max: 1e4, def: 0 }],
  star: [{ key: "points", label: "Points", integer: true, min: 3, max: 64, def: 5 }, { key: "r", label: "Radius", length: true, min: 0.01, max: 1e4 }, { key: "inner", label: "Inner", min: 2, max: 98, suffix: "%", def: 50, scale: 100 }, { key: "round", label: "Corners", length: true, min: 0, max: 1e4, def: 0 },
    { key: "skip", label: "Cross", integer: true, min: 0, max: 31, def: 0 }],
  arc: [{ key: "r", label: "Radius", length: true, min: 0.01, max: 1e4 }, { key: "start", label: "Start", min: -360, max: 360, suffix: "°", def: -90 }, { key: "sweep", label: "Sweep", min: 1, max: 360, suffix: "°", def: 270 }],
  slot: [{ key: "w", label: "W", length: true, min: 0.01, max: 1e4 }, { key: "h", label: "H", length: true, min: 0.01, max: 1e4 }],
  gear: [{ key: "teeth", label: "Teeth", integer: true, min: 6, max: 200, def: 20 }, { key: "module", label: "Module", length: true, min: 0.1, max: 50, step: 0.1 }, { key: "pressure", label: "Pressure", min: 14.5, max: 30, suffix: "°", def: 20 }, { key: "bore", label: "Bore", length: true, min: 0, max: 1e4 }],
  arrow: [{ key: "w", label: "W", length: true, min: 0.01, max: 1e4 }, { key: "h", label: "H", length: true, min: 0.01, max: 1e4 }, { key: "head", label: "Head", length: true, min: 0.01, max: 1e4 }, { key: "shaft", label: "Shaft", length: true, min: 0.01, max: 1e4 }],
  bubble: [{ key: "w", label: "W", length: true, min: 0.01, max: 1e4 }, { key: "h", label: "H", length: true, min: 0.01, max: 1e4 }, { key: "r", label: "Radius", length: true, min: 0, max: 1e4 }, { key: "tail", label: "Tail", length: true, min: 0, max: 1e4 }],
  heart: [{ key: "w", label: "W", length: true, min: 0.01, max: 1e4 }, { key: "h", label: "H", length: true, min: 0.01, max: 1e4 }],
  grid: [{ key: "w", label: "W", length: true, min: 0.01, max: 1e4 }, { key: "h", label: "H", length: true, min: 0.01, max: 1e4 }, { key: "cols", label: "Columns", integer: true, min: 1, max: 100, def: 4 }, { key: "rows", label: "Rows", integer: true, min: 1, max: 100, def: 3 }],
  library: [{ key: "w", label: "W", length: true, min: 0.01, max: 1e4 }, { key: "h", label: "H", length: true, min: 0.01, max: 1e4 }],
  burst: [{ key: "rays", label: "Rays", integer: true, min: 3, max: 240, def: 36 }, { key: "r", label: "Radius", length: true, min: 0.01, max: 1e4 }, { key: "inner", label: "Inner", length: true, min: 0, max: 1e4 },
    { key: "width", label: "Ray width", min: 5, max: 95, suffix: "%", def: 50, scale: 100 }, { key: "jitter", label: "Variation", min: 0, max: 100, suffix: "%", def: 35, scale: 100 }, { key: "seed", label: "Seed", integer: true, min: 1, max: 9999, def: 1 }],
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

export function ControlBar({ onResetToast, handlers }: { onResetToast: (m: string) => void; handlers: Record<string, Handler> }) {
  const api = useEditorApi();
  const rp = useEditor((s) => s.refPoint);
  const lockRatio = useEditor((s) => s.lockRatio);
  const doc = useEditor((s) => s.base ?? s.doc);
  const liveDoc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const tool = useEditor((s) => s.tool);
  const shapeDefaults = useEditor((s) => s.shapeDefaults);
  const textDefaults = useEditor((s) => s.textDefaults);
  const anchors = useEditor((s) => s.anchors);
  const penMode = useEditor((s) => s.penMode);
  const penShape = useEditor((s) => s.penShape);
  const brushWidth = useEditor((s) => s.brushWidth);
  const pencilSmoothing = useEditor((s) => s.pencilSmoothing);
  const pencilPressure = useEditor((s) => s.pencilPressure);
  const pencilMode = useEditor((s) => s.pencilMode);
  const live = useLive();
  const units = doc.units;
  const ids = topLevel(liveDoc.root, selection).filter((id) => isEditable(liveDoc.root, id));
  const box = selectionBox(liveDoc, ids);
  const single = ids.length === 1 ? findNode(liveDoc.root, ids[0]) : null;
  const common = { units, onResetToast };

  const typeDefaults = tool === "text" && single?.type !== "text";
  const cmd = (id: string, label: string, icon: ReactNode) => {
    const h = handlers[id];
    return <IconButton key={id} label={label} description={h?.enabled === false ? h.reason : undefined} icon={icon} disabled={!h || h.enabled === false}
      pressed={h?.checked} onClick={h?.run} side="bottom" testId={`ctl-${id}`} />;
  };

  if (tool === "direct" && anchors.length) {
    return (
      <div className="st-control" aria-label="Control bar" data-testid="control-bar">
        <div className="grp"><span className="lbl kind" data-testid="nodes-label">Nodes · {anchors.length}</span></div>
        <div className="grp sep icons" data-testid="nodes-bar">
          {cmd("node.insert", "Insert nodes", <DiamondPlus size={15} />)}
          {cmd("node.break", "Break path at nodes", <Unlink size={15} />)}
          {cmd("node.join", "Join end nodes", <Merge size={15} />)}
          {cmd("node.joinSegment", "Join with a segment", <Link size={15} />)}
          {cmd("node.deleteSegment", "Delete segment", <Unplug size={15} />)}
        </div>
        <div className="grp sep icons">
          {cmd("node.corner", "Corner node", <Square size={15} />)}
          {cmd("node.smooth", "Smooth node", <Diamond size={15} />)}
          {cmd("node.symmetric", "Symmetric node", <GitCommitHorizontal size={15} />)}
          {cmd("node.auto", "Auto-smooth node", <CircleDot size={15} />)}
        </div>
        <div className="grp sep icons">
          {cmd("node.straighten", "Make segments lines", <Slash size={15} />)}
          {cmd("node.curve", "Make segments curves", <Spline size={15} />)}
        </div>
        <div className="grp sep icons">
          {cmd("node.scaleDown", "Scale nodes down", <Shrink size={15} />)}
          {cmd("node.scaleUp", "Scale nodes up", <Expand size={15} />)}
          {cmd("node.rotateCCW", "Rotate nodes 15° counter-clockwise", <RotateCcw size={15} />)}
          {cmd("node.rotateCW", "Rotate nodes 15° clockwise", <RotateCw size={15} />)}
        </div>
        <div className="grp sep icons">
          {cmd("view.nodeHandles", "Show handles of all nodes", <SplinePointer size={15} />)}
          {cmd("view.pathDirection", "Show path direction", <MoveRight size={15} />)}
        </div>
      </div>
    );
  }

  if (tool === "pen" || tool === "pencil") {
    const shape = tool === "pen" ? penShape : pencilPressure ? "pressure" : "none";
    return (
      <div className="st-control" aria-label="Control bar" data-testid="control-bar">
        <div className="grp"><span className="lbl kind">{TOOL_INFO[tool].label}</span></div>
        {tool === "pen" ? (
          <div className="grp" data-testid="pen-options">
            <SegmentedControl label="Mode" hideLabel value={penMode} onChange={(v) => api.getState().set({ penMode: v })}
              options={[{ value: "bezier", label: "Bézier", title: "Click for corners, drag for curves" }, { value: "smooth", label: "Smooth", title: "A smooth curve through every click" },
                { value: "bspline", label: "B-Spline", title: "Clicks are control points of a smooth spline" }, { value: "paraxial", label: "Paraxial", title: "Only horizontal and vertical lines" }]} />
            <Select label="Shape" hideLabel value={penShape} onChange={(v) => api.getState().set({ penShape: v })} testId="pen-shape"
              options={[{ value: "none", label: "Line" }, { value: "triangleIn", label: "Triangle in" }, { value: "triangleOut", label: "Triangle out" }, { value: "ellipse", label: "Ellipse" }]} />
          </div>
        ) : (
          <div className="grp" data-testid="pencil-options">
            <div style={{ width: 190 }} data-testid="pencil-smoothing"><Slider label="Smoothing" min={0} max={100} value={pencilSmoothing} onChange={(v) => api.getState().set({ pencilSmoothing: v })} /></div>
            <SegmentedControl label="Curve" hideLabel value={pencilMode} onChange={(v) => api.getState().set({ pencilMode: v })}
              options={[{ value: "bezier", label: "Bézier" }, { value: "smooth", label: "Smooth" }, { value: "bspline", label: "B-Spline" }]} />
            <label className="pn-check"><input type="checkbox" checked={pencilPressure} onChange={(e) => api.getState().set({ pencilPressure: e.target.checked })} data-testid="pencil-pressure" /> Pressure</label>
          </div>
        )}
        {shape !== "none" && (
          <div className="grp sep">
            <NumberInput label="Width" value={brushWidth} length min={0.05} max={100} step={0.1} defaultValue={2} {...common} onChange={(v) => api.getState().set({ brushWidth: v })} testId="brush-width" />
          </div>
        )}
        <div className="grp"><span className="hint">{shape === "none" ? TOOL_INFO[tool].description : "Draws a filled outline — engrave it as an area."}</span></div>
      </div>
    );
  }

  if (OPTION_TOOLS.has(tool)) return <ToolOptions tool={tool} {...common} />;

  if (ids.length && !isEmptyBox(box) && !typeDefaults) {
    const W = box.maxX - box.minX, H = box.maxY - box.minY;
    const ref = refAt(box, rp);
    const rot = currentRotation(liveDoc, ids);
    const layer = single?.layer ?? (ids.every((id) => findNode(liveDoc.root, id)?.layer === findNode(liveDoc.root, ids[0])?.layer) ? findNode(liveDoc.root, ids[0])!.layer : -1);
    const act = (id: string, label: string, icon: ReactNode) => {
      const h = handlers[id];
      return <IconButton key={id} label={label} description={h?.enabled === false ? h.reason : undefined} icon={icon} disabled={!h || h.enabled === false} onClick={h?.run} side="bottom" />;
    };
    return (
      <div className="st-control" aria-label="Control bar" data-testid="control-bar">
        <div className="grp"><span className="lbl kind">{single ? (single.type === "path" && single.connector ? "Connector" : nodeLabel(single.type, single.type === "shape" ? single.shape.kind : undefined)) : `${ids.length} objects`}</span></div>
        <div className="grp">
          <label className="ctl-select">
            <span className="sw" style={{ background: layer >= 0 ? displayColor(doc.cutLayers[layer].color) : "transparent" }} aria-hidden />
            <select className="ui-select" value={layer} aria-label="Cut layer" data-testid="sel-layer"
              onChange={(e) => { const k = Number(e.target.value); api.getState().edit("Assign Cut Layer", (d) => ids.forEach((id) => { const n = findNode(d.root, id); if (n) n.layer = k; })); api.getState().set({ currentLayer: k }); }}>
              {layer < 0 && <option value={-1}>Mixed</option>}
              {doc.cutLayers.map((l) => <option key={l.index} value={l.index}>{layerCode(l.index)} · {l.name}</option>)}
            </select>
          </label>
        </div>
        <div className="grp sep">
          <NumberInput label="X" value={ref.x} length {...common} onChange={(v, c) => live("Move", (d) => moveRefTo(d, ids, rp, "x", v), c)} testId="sel-x" />
          <NumberInput label="Y" value={ref.y} length {...common} onChange={(v, c) => live("Move", (d) => moveRefTo(d, ids, rp, "y", v), c)} testId="sel-y" />
          <NumberInput label="W" value={W} length min={0.01} {...common} onChange={(v, c) => live("Scale", (d) => resizeTo(d, ids, rp, "w", v, lockRatio), c)} testId="sel-w" />
          <IconButton label={lockRatio ? "Constrain proportions: on" : "Constrain proportions: off"} pressed={lockRatio} icon={lockRatio ? <Link2 size={14} /> : <Unlink2 size={14} />} onClick={() => api.getState().set({ lockRatio: !lockRatio })} side="bottom" />
          <NumberInput label="H" value={H} length min={0.01} {...common} onChange={(v, c) => live("Scale", (d) => resizeTo(d, ids, rp, "h", v, lockRatio), c)} testId="sel-h" />
          <NumberInput label="Angle" value={Math.round(rot * 100) / 100} suffix="°" min={-360} max={360} defaultValue={single ? 0 : undefined} {...common}
            onChange={(v, c) => live("Rotate", (d) => rotateTo(d, ids, rp, v), c)} testId="sel-angle" />
        </div>
        <div className="grp sep icons">
          {act("object.reflectH", "Reflect left–right", <FlipHorizontal2 size={15} />)}
          {act("object.reflectV", "Reflect top–bottom", <FlipVertical2 size={15} />)}
          {act("object.rotate-90", "Rotate 90° counter-clockwise", <RotateCcw size={15} />)}
          {act("object.rotate90", "Rotate 90° clockwise", <RotateCw size={15} />)}
        </div>
        <div className="grp sep icons">
          {act("object.align.left", "Align left", <AlignStartVertical size={15} />)}
          {act("object.align.hcenter", "Align horizontal centres", <AlignCenterVertical size={15} />)}
          {act("object.align.right", "Align right", <AlignEndVertical size={15} />)}
          {act("object.align.top", "Align top", <AlignStartHorizontal size={15} />)}
          {act("object.align.vcenter", "Align vertical centres", <AlignCenterHorizontal size={15} />)}
          {act("object.align.bottom", "Align bottom", <AlignEndHorizontal size={15} />)}
        </div>
        <div className="grp sep icons">
          {act("object.front", "Bring to front", <BringToFront size={15} />)}
          {act("object.back", "Send to back", <SendToBack size={15} />)}
          {act(ids.length > 1 ? "object.group" : "object.ungroup", ids.length > 1 ? "Group" : "Ungroup", ids.length > 1 ? <Group size={15} /> : <Ungroup size={15} />)}
        </div>
        {single?.type === "shape" && <ShapeFields shape={single.shape} only="noSize" {...common} onChange={(f, v, c) => live(`Edit ${nodeLabel("shape", single.shape.kind)}`, (d) => { const n = findNode(d.root, single.id); if (n?.type === "shape") writeField(n.shape, f, v); }, c)} onCorner={(corner) => api.getState().edit("Corner Type", (d) => { const n = findNode(d.root, single.id); if (n?.type === "shape" && n.shape.kind === "rect") n.shape.corner = corner; })} onPie={(pie) => api.getState().edit("Arc Type", (d) => { const n = findNode(d.root, single.id); if (n?.type === "shape" && n.shape.kind === "arc") n.shape.pie = pie; })} onLibrary={(id) => api.getState().edit("Library Shape", (d) => { const n = findNode(d.root, single.id); if (n?.type === "shape" && n.shape.kind === "library") n.shape.id = id; })} />}
        {single?.type === "text" && <TextFields t={single} {...common} onChange={(label, patch, c) => live(label, (d) => { const n = findNode(d.root, single.id); if (n?.type === "text") Object.assign(n, patch); }, c)} />}
        {single?.type === "text" && single.onPath && (
          <div className="grp sep" data-testid="path-text-fields">
            <NumberInput label="Start" value={single.pathStart ?? 0} min={-100} max={200} step={1} suffix="%" defaultValue={0} onResetToast={onResetToast}
              onChange={(pathStart, c) => live("Text Start on Path", (d) => { const n = findNode(d.root, single.id); if (n?.type === "text") n.pathStart = pathStart; }, c)} testId="text-path-start" />
            {cmd("type.pathSide", "Text on other side of path", <FlipVertical2 size={15} />)}
          </div>
        )}
        {single?.type === "path" && single.connector && (
          <div className="grp sep" data-testid="connector-fields">
            <SegmentedControl label="Connector routing" hideLabel value={single.connector.mode}
              onChange={(mode) => api.getState().edit("Connector Routing", (d) => { setConnectorMode(d, [single.id], mode); })}
              options={[{ value: "straight", label: "Straight" }, { value: "orthogonal", label: "Right-angled", title: "Horizontal and vertical runs only" }, { value: "rounded", label: "Rounded", title: "Right-angled with rounded bends" }]} />
          </div>
        )}
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
        <ShapeFields shape={p} only="params" {...common} onChange={(f, v) => setP((q) => writeField(q, f, v))} onCorner={(corner) => setP((q) => { if (q.kind === "rect") q.corner = corner; })} onPie={(pie) => setP((q) => { if (q.kind === "arc") q.pie = pie; })} onLibrary={(id) => setP((q) => { if (q.kind === "library") q.id = id; })} />
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

  if (!["select", "direct", "lasso", "magicWand", "hand", "zoom"].includes(tool)) {
    return (
      <div className="st-control" aria-label="Control bar" data-testid="control-bar">
        <div className="grp"><span className="lbl kind">{TOOL_INFO[tool].label}</span></div>
        <div className="grp"><span className="hint">{TOOL_INFO[tool].description}</span></div>
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
  if (type === "shape" && kind) return { rect: "Rectangle", ellipse: "Ellipse", polygon: "Polygon", star: "Star", arc: "Arc", slot: "Slot", gear: "Gear", arrow: "Arrow", bubble: "Speech Bubble", heart: "Heart", grid: "Grid", spiral: "Spiral", library: "Library Shape", burst: "Burst Lines" }[kind] ?? "Shape";
  return { path: "Path", text: "Text", group: "Group", image: "Image", generator: "Generator", dimension: "Dimension", shape: "Shape", clone: "Clone" }[type] ?? type;
}

function ShapeFields({ shape, only, units, onResetToast, onChange, onCorner, onPie, onLibrary }: {
  shape: ShapeParams; only?: "params" | "noSize"; units: Document["units"]; onResetToast: (m: string) => void;
  onChange: (f: FieldSpec, v: number, commit: boolean) => void; onCorner: (c: CornerType) => void; onPie: (pie: boolean) => void; onLibrary: (id: string) => void;
}) {
  const fields = SHAPE_FIELDS[shape.kind].filter((f) =>
    only === "noSize" ? f.label !== "W" && f.label !== "H" : !only || f.def !== undefined || f.key === "module");
  if (!fields.length && shape.kind !== "rect" && shape.kind !== "arc" && shape.kind !== "library") return null;
  return (
    <div className="grp" data-testid="shape-fields">
      {shape.kind === "library" && (
        <Select label="Shape" hideLabel value={shape.id} onChange={onLibrary} testId="library-shape"
          options={SHAPE_LIBRARY.map((s) => ({ value: s.id, label: `${s.group} · ${s.label}` }))} />
      )}
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
      <Select label="Font" hideLabel value={t.font} options={BUNDLED_FONTS.map((f) => ({ value: f.id, label: f.scripts.includes("arabic") ? `${f.name} (Persian)` : f.name }))} onChange={(font) => onChange("Font", { font }, true)} testId="text-font" />
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
