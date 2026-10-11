"use client";

import { useState, type ReactElement } from "react";
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalDistributeCenter, AlignStartHorizontal,
  AlignStartVertical, AlignVerticalDistributeCenter, ChevronDown, ChevronRight, Eye, EyeOff, FlipHorizontal2, FlipVertical2, Link2, Lock, LockOpen,
  RotateCcw, RotateCw, Unlink2,
} from "lucide-react";
import { MACHINE_PROFILES, MATERIAL_PRESETS } from "@/lib/studio/library";
import { COMMAND_BY_ID } from "@/lib/studio/commands";
import { defaultCutLayer, layerCode } from "@/lib/studio/cutLayers";
import { isEmptyBox, shapeForBox, translate } from "@/lib/studio/geom";
import { findNode, isEditable, locate, moveNode, selectionBox, topLevel } from "@/lib/studio/scene";
import { currentRotation, currentShear, flipAt, moveRefTo, refAt, resizeTo, rotateTo, shearTo } from "@/lib/studio/transform";
import { UNIT_LIST } from "@/lib/studio/units";
import type { CutMode, Document, SceneNode, Units } from "@/lib/studio/types";
import { IconButton, NumberInput, PanelSection, SegmentedControl, Select } from "@/components/ui";
import { nodeLabel } from "./ControlBar";
import { useEditor, useEditorApi } from "./store";
import type { Handler } from "./commandHandlers";

type Toast = (m: string, undo?: boolean) => void;

function useLive() {
  const api = useEditorApi();
  return (label: string, recipe: (d: Document) => void, commit: boolean) => {
    const s = api.getState();
    if (!commit) { s.begin(); s.preview(recipe); return; }
    if (s.base) s.end(label, recipe); else s.edit(label, recipe);
  };
}

const displayColor = (c: string) => (c === "#000000" ? "var(--ink)" : c);

// ---------- Properties ----------

export function PropertiesPanel({ toast, handlers }: { toast: Toast; handlers: Record<string, Handler> }) {
  const api = useEditorApi();
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const rp = useEditor((s) => s.refPoint);
  const lockRatio = useEditor((s) => s.lockRatio);
  const live = useLive();
  const ids = topLevel(doc.root, selection).filter((id) => isEditable(doc.root, id));
  const onResetToast = (m: string) => toast(m, true);
  if (!ids.length) {
    return (
      <>
        <PanelSection title="Selection">
          <p className="pn-empty">Nothing selected. Click an object, or drag a box around several. Draw with the tools on the left.</p>
        </PanelSection>
        <QuickActions handlers={handlers} ids={["edit.selectAll", "edit.paste", "object.showAll", "object.unlockAll", "view.fitArtboard", "file.documentSetup"]} />
      </>
    );
  }
  const box = selectionBox(doc, ids);
  const single = ids.length === 1 ? locate(doc.root, ids[0]) : null;
  const n = single?.node;
  const ref = refAt(box, rp);
  const rot = currentRotation(doc, ids), shear = currentShear(doc, ids);
  const round = (v: number) => Math.round(v * 100) / 100;
  const layer = n?.layer ?? (ids.every((id) => findNode(doc.root, id)?.layer === findNode(doc.root, ids[0])?.layer) ? findNode(doc.root, ids[0])!.layer : -1);
  return (
    <>
      <PanelSection
        title="Transform" meta={n ? nodeLabel(n.type, n.type === "shape" ? n.shape.kind : undefined) : `${ids.length} objects`} testId="props-transform"
        onReset={() => {
          api.getState().edit("Reset Transform", (d) => ids.forEach((id) => {
            const l = locate(d.root, id);
            if (!l || (l.node.type !== "shape" && l.node.type !== "text" && l.node.type !== "group")) return;
            const t = l.node.transform;
            l.node.transform = translate(t[4], t[5]);
          }));
          toast("Reset rotation and scale", true);
        }}
      >
        {!isEmptyBox(box) && (
          <>
            <div className="pn-xform">
              <RefPointGrid value={rp} onChange={(refPoint) => api.getState().set({ refPoint })} />
              <div className="pn-xy">
                <NumberInput label="X" value={ref.x} length units={doc.units} onChange={(v, c) => live("Move", (d) => moveRefTo(d, ids, rp, "x", v), c)} onResetToast={onResetToast} testId="props-x" />
                <NumberInput label="W" value={box.maxX - box.minX} length units={doc.units} min={0.01} onChange={(v, c) => live("Scale", (d) => resizeTo(d, ids, rp, "w", v, lockRatio), c)} testId="props-w" />
                <NumberInput label="Y" value={ref.y} length units={doc.units} onChange={(v, c) => live("Move", (d) => moveRefTo(d, ids, rp, "y", v), c)} onResetToast={onResetToast} testId="props-y" />
                <NumberInput label="H" value={box.maxY - box.minY} length units={doc.units} min={0.01} onChange={(v, c) => live("Scale", (d) => resizeTo(d, ids, rp, "h", v, lockRatio), c)} testId="props-h" />
              </div>
              <IconButton label={lockRatio ? "Constrain proportions: on" : "Constrain proportions: off"} pressed={lockRatio} icon={lockRatio ? <Link2 size={14} /> : <Unlink2 size={14} />}
                onClick={() => api.getState().set({ lockRatio: !lockRatio })} testId="props-ratio" />
            </div>
            <div className="pn-grid">
              <NumberInput label="Rotate" value={round(rot)} suffix="°" defaultValue={single ? 0 : undefined} min={-360} max={360} onResetToast={onResetToast}
                onChange={(v, c) => live("Rotate", (d) => rotateTo(d, ids, rp, v), c)} testId="props-rotate" />
              <NumberInput label="Shear" value={round(shear)} suffix="°" defaultValue={single ? 0 : undefined} min={-80} max={80} onResetToast={onResetToast}
                onChange={(v, c) => live("Shear", (d) => shearTo(d, ids, rp, v), c)} testId="props-shear" />
            </div>
            <div className="pn-btns">
              <IconButton label="Flip horizontal" description="Mirror across the reference point" icon={<FlipHorizontal2 size={15} />} onClick={() => api.getState().edit("Reflect", (d) => flipAt(d, ids, rp, "h"))} />
              <IconButton label="Flip vertical" description="Mirror across the reference point" icon={<FlipVertical2 size={15} />} onClick={() => api.getState().edit("Reflect", (d) => flipAt(d, ids, rp, "v"))} />
              <IconButton label="Rotate 90° counter-clockwise" icon={<RotateCcw size={15} />} onClick={() => api.getState().edit("Rotate", (d) => rotateTo(d, ids, rp, currentRotation(d, ids) - 90))} />
              <IconButton label="Rotate 90° clockwise" icon={<RotateCw size={15} />} onClick={() => api.getState().edit("Rotate", (d) => rotateTo(d, ids, rp, currentRotation(d, ids) + 90))} />
            </div>
          </>
        )}
      </PanelSection>
      <PanelSection title="Appearance" meta={layer >= 0 ? layerCode(layer) : "Mixed"} testId="props-appearance">
        <div className="pn-swatches" role="radiogroup" aria-label="Cut layer">
          {doc.cutLayers.map((l) => (
            <button key={l.index} type="button" role="radio" aria-checked={l.index === layer} className="pn-sw" style={{ background: displayColor(l.color) }}
              title={`${layerCode(l.index)} · ${l.name} (${l.mode})`} aria-label={`${layerCode(l.index)} ${l.name}`}
              onClick={() => { api.getState().edit("Assign Cut Layer", (d) => ids.forEach((id) => { const m = findNode(d.root, id); if (m) m.layer = l.index; })); api.getState().set({ currentLayer: l.index }); }} />
          ))}
        </div>
        {layer >= 0 && (
          <p className="pn-layer-info">
            <span className="sw" style={{ background: displayColor(doc.cutLayers[layer].color) }} />
            <b>{doc.cutLayers[layer].name}</b>
            <span>{doc.cutLayers[layer].mode} · {doc.cutLayers[layer].speed} mm/s · {doc.cutLayers[layer].power}%</span>
          </p>
        )}
      </PanelSection>
      {n?.type === "shape" && (
        <PanelSection
          title="Shape" meta={nodeLabel("shape", n.shape.kind)} testId="props-shape"
          onReset={() => {
            const local = shapeBoxSize(n);
            api.getState().edit("Reset Shape", (d) => { const m = findNode(d.root, n.id); if (m?.type === "shape") m.shape = shapeForBox(m.shape.kind, local.w, local.h); });
            toast(`Reset ${nodeLabel("shape", n.shape.kind)} to its defaults`, true);
          }}
        >
          <p className="pn-empty">Edit the shape in the control bar above the canvas. Reset section restores its default corners, points and sides.</p>
        </PanelSection>
      )}
      {n && (
        <PanelSection title="Object" testId="props-object">
          <RenameField node={n} />
        </PanelSection>
      )}
      {ids.length > 1 && (
        <PanelSection title="Pathfinder" testId="props-pathfinder">
          <ShapeModeButtons handlers={handlers} />
        </PanelSection>
      )}
      <QuickActions handlers={handlers} ids={ids.length > 1
        ? ["object.group", "object.align.left", "object.align.hcenter", "object.align.top", "object.distribute.x", "object.compound.make", "object.clip.make", "edit.duplicate", "object.lock"]
        : n?.type === "group" ? ["object.ungroup", "object.expand", "path.pf.divide", "edit.duplicate", "object.front", "object.back", "object.lock"]
          : n?.type === "text" ? ["type.outlines", "path.offset", "edit.duplicate", "object.front", "object.back", "object.lock", "object.hide"]
            : ["path.offset", "path.roundCorners", "path.simplify", "object.expand", "path.reverse", "path.breakApart", "edit.duplicate", "object.lock"]} />
    </>
  );
}

/** Illustrator's Properties → Quick Actions: the commands that fit the current selection. */
function QuickActions({ handlers, ids }: { handlers: Record<string, Handler>; ids: string[] }) {
  return (
    <PanelSection title="Quick Actions" testId="props-actions">
      <div className="pn-actions">
        {ids.map((id) => {
          const h = handlers[id];
          return (
            <button key={id} type="button" className="ui-btn small" disabled={!h || h.enabled === false} title={h?.enabled === false ? h.reason : undefined} onClick={h?.run}>
              {COMMAND_BY_ID.get(id)?.label ?? id}
            </button>
          );
        })}
      </div>
    </PanelSection>
  );
}

const REF_POINTS: [number, number][] = [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [0.5, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]];
const REF_NAMES = ["top left", "top", "top right", "left", "centre", "right", "bottom left", "bottom", "bottom right"];

function RefPointGrid({ value, onChange }: { value: [number, number]; onChange: (v: [number, number]) => void }) {
  return (
    <div className="pn-ref" role="radiogroup" aria-label="Reference point" data-testid="ref-point">
      {REF_POINTS.map((p, k) => (
        <button key={k} type="button" role="radio" aria-checked={p[0] === value[0] && p[1] === value[1]} aria-label={`Reference point ${REF_NAMES[k]}`} onClick={() => onChange(p)} />
      ))}
    </div>
  );
}

function shapeBoxSize(n: Extract<SceneNode, { type: "shape" }>): { w: number; h: number } {
  const s = n.shape;
  switch (s.kind) {
    case "ellipse": return { w: s.rx * 2, h: s.ry * 2 };
    case "polygon": case "star": case "arc": case "spiral": return { w: s.r * 2, h: s.r * 2 };
    case "gear": { const d = s.module * (s.teeth + 2); return { w: d, h: d }; }
    default: return { w: s.w, h: s.h };
  }
}

function RenameField({ node }: { node: SceneNode }) {
  const api = useEditorApi();
  const [v, setV] = useState(node.name ?? "");
  const [for_, setFor] = useState(node.id);
  if (for_ !== node.id) { setFor(node.id); setV(node.name ?? ""); }
  const commit = () => {
    const name = v.trim().slice(0, 80);
    if (name === (node.name ?? "")) return;
    api.getState().edit("Rename", (d) => { const m = findNode(d.root, node.id); if (m) { if (name) m.name = name; else delete m.name; } });
  };
  return (
    <div style={{ display: "grid" }}>
      <label className="ui-label" htmlFor={`nm-${node.id}`}>Name</label>
      <input id={`nm-${node.id}`} className="ui-text" value={v} placeholder={nodeLabel(node.type, node.type === "shape" ? node.shape.kind : undefined)} maxLength={80}
        onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
    </div>
  );
}

// ---------- Layers & Objects ----------

type Drop = { id: string; where: "before" | "after" | "inside" } | null;

export function LayersPanel() {
  const api = useEditorApi();
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop>(null);
  const sel = new Set(selection);

  const toggle = (id: string, key: "hidden" | "locked") => api.getState().edit(key === "hidden" ? "Visibility" : "Lock", (d) => {
    const n = findNode(d.root, id);
    if (n) n[key] = !n[key];
  }, key === "locked" || key === "hidden" ? { select: api.getState().selection.filter((x) => x !== id) } : undefined);

  const onDrop = () => {
    if (!drag || !drop || drag === drop.id) return;
    api.getState().edit("Reorder", (d) => {
      const target = locate(d.root, drop.id);
      if (!target) return;
      if (drop.where === "inside" && target.node.type === "group") { moveNode(d, drag, target.node.id, target.node.children.length); return; }
      const parentId = target.parent === d.root ? "root" : target.parent.id;
      // The list shows the topmost object first, so "before" in the list means above it in the stack.
      moveNode(d, drag, parentId, target.index + (drop.where === "before" ? 1 : 0));
    });
  };

  const rows: ReactElement[] = [];
  const add = (n: SceneNode, depth: number) => {
    const isGroup = n.type === "group";
    const label = n.name ?? nodeLabel(n.type, n.type === "shape" ? n.shape.kind : undefined);
    rows.push(
      <div
        key={n.id} role="treeitem" aria-selected={sel.has(n.id)} aria-level={depth + 1} aria-expanded={isGroup ? !!open[n.id] : undefined}
        className={`pn-row${sel.has(n.id) ? " sel" : ""}${drop?.id === n.id ? ` drop-${drop.where}` : ""}`}
        style={{ paddingInlineStart: 4 + depth * 14 }} draggable={renaming !== n.id} data-node={n.id}
        onClick={(e) => { if (n.locked || n.hidden) return; api.getState().select([n.id], e.shiftKey || e.ctrlKey || e.metaKey ? "toggle" : "set"); }}
        onDoubleClick={() => setRenaming(n.id)}
        onDragStart={(e) => { setDrag(n.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", n.id); }}
        onDragOver={(e) => {
          if (!drag) return;
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect(), y = (e.clientY - r.top) / r.height;
          setDrop({ id: n.id, where: isGroup && y > 0.3 && y < 0.7 ? "inside" : y < 0.5 ? "before" : "after" });
        }}
        onDragLeave={() => setDrop((d) => (d?.id === n.id ? null : d))}
        onDrop={(e) => { e.preventDefault(); onDrop(); setDrag(null); setDrop(null); }}
        onDragEnd={() => { setDrag(null); setDrop(null); }}
      >
        {isGroup
          ? <button type="button" className="tw" aria-label={open[n.id] ? "Collapse" : "Expand"} onClick={(e) => { e.stopPropagation(); setOpen((o) => ({ ...o, [n.id]: !o[n.id] })); }}>{open[n.id] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</button>
          : <span className="tw" />}
        <button type="button" className={`ib${n.hidden ? "" : " on"}`} aria-label={n.hidden ? `Show ${label}` : `Hide ${label}`} aria-pressed={!n.hidden} onClick={(e) => { e.stopPropagation(); toggle(n.id, "hidden"); }}>{n.hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button>
        <button type="button" className={`ib${n.locked ? " on" : ""}`} aria-label={n.locked ? `Unlock ${label}` : `Lock ${label}`} aria-pressed={!!n.locked} onClick={(e) => { e.stopPropagation(); toggle(n.id, "locked"); }}>{n.locked ? <Lock size={12} /> : <LockOpen size={12} />}</button>
        <span className="dot" style={{ background: displayColor(doc.cutLayers[n.layer]?.color ?? "#888") }} title={layerCode(n.layer)} />
        {renaming === n.id ? (
          <input autoFocus defaultValue={n.name ?? ""} placeholder={label} aria-label="Object name" maxLength={80}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => { const v = e.target.value.trim(); setRenaming(null); if (v !== (n.name ?? "")) api.getState().edit("Rename", (d) => { const m = findNode(d.root, n.id); if (m) { if (v) m.name = v; else delete m.name; } }); }}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenaming(null); }} />
        ) : <span className={`nm${n.hidden ? " dim" : ""}`}>{label}</span>}
      </div>,
    );
    if (isGroup && open[n.id]) [...n.children].reverse().forEach((c) => add(c, depth + 1));
  };
  [...doc.root.children].reverse().forEach((c) => add(c, 0));

  return (
    <PanelSection title="Layers & Objects" meta={`${doc.root.children.length}`} testId="layers-panel">
      {rows.length ? <div className="pn-tree" role="tree" aria-label="Objects">{rows}</div> : <p className="pn-empty">No objects yet.</p>}
    </PanelSection>
  );
}

// ---------- Cut Layers ----------

export function CutLayersPanel({ toast }: { toast: Toast }) {
  const api = useEditorApi();
  const doc = useEditor((s) => s.doc);
  const current = useEditor((s) => s.currentLayer);
  const [all, setAll] = useState(false);
  const live = useLive();
  const used = new Set<number>();
  const visit = (n: SceneNode) => { used.add(n.layer); if (n.type === "group") n.children.forEach(visit); };
  doc.root.children.forEach(visit);
  used.add(current);
  const layers = doc.cutLayers.filter((l) => all || used.has(l.index));
  const cur = doc.cutLayers[current];
  const def = defaultCutLayer(current);
  const field = (key: "speed" | "power" | "passes" | "interval" | "kerf", label: string, o: { min: number; max: number; step?: number; suffix?: string; length?: boolean; integer?: boolean }) => (
    <NumberInput label={label} value={cur[key]} defaultValue={def[key]} units={doc.units} onResetToast={(m) => toast(m, true)} {...o}
      onChange={(v, c) => live(`${label}`, (d) => { d.cutLayers[current][key] = v; }, c)} testId={`layer-${key}`} />
  );
  return (
    <>
      <PanelSection title="Cut Layers" meta={`${layers.length}`} testId="cutlayers-panel">
        {layers.map((l) => (
          <div key={l.index} className={`pn-layer${l.index === current ? " cur" : ""}`}>
            <span className="sw" style={{ background: displayColor(l.color) }} />
            <code>{layerCode(l.index)}</code>
            <button type="button" className="nm" onClick={() => api.getState().set({ currentLayer: l.index })} aria-pressed={l.index === current}>{l.name} · {l.mode}</button>
            <span style={{ display: "flex", gap: 2 }}>
              <IconButton label={l.output ? "Output on" : "Output off"} pressed={l.output} icon={<span style={{ fontSize: 10, fontWeight: 700 }}>{l.output ? "ON" : "OFF"}</span>}
                onClick={() => api.getState().edit("Layer Output", (d) => { d.cutLayers[l.index].output = !d.cutLayers[l.index].output; })} />
              <IconButton label={l.show ? "Hide layer" : "Show layer"} pressed={l.show} icon={l.show ? <Eye size={13} /> : <EyeOff size={13} />}
                onClick={() => api.getState().edit("Layer Visibility", (d) => { d.cutLayers[l.index].show = !d.cutLayers[l.index].show; })} />
            </span>
          </div>
        ))}
        <label className="pn-check" style={{ marginTop: 6 }}><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show all 30 layers</label>
      </PanelSection>
      <PanelSection
        title={`${layerCode(current)} settings`} testId="layer-settings"
        onReset={() => { api.getState().edit("Reset Cut Layer", (d) => { d.cutLayers[current] = defaultCutLayer(current); }); toast(`Reset ${layerCode(current)} to its defaults`, true); }}
      >
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "grid" }}>
            <label className="ui-label" htmlFor="layer-name">Name</label>
            <input id="layer-name" key={current} className="ui-text" defaultValue={cur.name} maxLength={40}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== cur.name) api.getState().edit("Rename Layer", (d) => { d.cutLayers[current].name = v; }); }}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
          </div>
          <Select label="Mode" value={cur.mode} options={[{ value: "cut", label: "Cut" }, { value: "score", label: "Score" }, { value: "fill", label: "Engrave fill" }, { value: "image", label: "Engrave image" }]}
            onChange={(mode) => api.getState().edit("Layer Mode", (d) => { d.cutLayers[current].mode = mode as CutMode; })} />
          <div className="pn-grid">
            {field("speed", "Speed", { min: 0.1, max: 2000, suffix: "mm/s" })}
            {field("power", "Power", { min: 0, max: 100, suffix: "%" })}
            {field("passes", "Passes", { min: 1, max: 50, integer: true })}
            {field("interval", "Interval", { min: 0.01, max: 5, step: 0.01, length: true })}
            {field("kerf", "Kerf", { min: 0, max: 2, step: 0.01, length: true })}
          </div>
          <label className="pn-check"><input type="checkbox" checked={cur.air} onChange={() => api.getState().edit("Air Assist", (d) => { d.cutLayers[current].air = !d.cutLayers[current].air; })} /> Air assist</label>
        </div>
      </PanelSection>
    </>
  );
}

// ---------- Align ----------

export function AlignPanel({ handlers }: { handlers: Record<string, Handler> }) {
  const btn = (id: string, label: string, icon: ReactElement) => {
    const h = handlers[id];
    return <IconButton key={id} label={label} description={h?.enabled === false ? h.reason : undefined} icon={icon} disabled={!h || h.enabled === false} onClick={h?.run} testId={`align-${id}`} />;
  };
  return (
    <>
      <PanelSection title="Align Objects" testId="align-panel">
        <div className="pn-btns">
          {btn("object.align.left", "Align Left", <AlignStartVertical size={16} />)}
          {btn("object.align.hcenter", "Align Horizontal Centres", <AlignCenterVertical size={16} />)}
          {btn("object.align.right", "Align Right", <AlignEndVertical size={16} />)}
          {btn("object.align.top", "Align Top", <AlignStartHorizontal size={16} />)}
          {btn("object.align.vcenter", "Align Vertical Centres", <AlignCenterHorizontal size={16} />)}
          {btn("object.align.bottom", "Align Bottom", <AlignEndHorizontal size={16} />)}
        </div>
        <p className="pn-empty">One object aligns to the sheet; several align to their combined bounds.</p>
      </PanelSection>
      <PanelSection title="Distribute">
        <div className="pn-btns">
          {btn("object.distribute.x", "Distribute Horizontally", <AlignHorizontalDistributeCenter size={16} />)}
          {btn("object.distribute.y", "Distribute Vertically", <AlignVerticalDistributeCenter size={16} />)}
        </div>
      </PanelSection>
    </>
  );
}

// ---------- Pathfinder ----------

/** Two overlapping squares: back (2,2)–(13,13), front (7,7)–(18,18). */
const PF_BACK = "M2 2h11v11H2z", PF_FRONT = "M7 7h11v11H7z";
const PF_ICONS: Record<string, ReactElement> = {
  unite: <path d="M2 2h11v5h5v11H7v-5H2z" fill="currentColor" />,
  minusFront: <><path d="M2 2h11v5H7v6H2z" fill="currentColor" /><path d={PF_FRONT} fill="none" stroke="currentColor" strokeDasharray="1.5 1.5" opacity={0.6} /></>,
  minusBack: <><path d="M13 7h5v11H7v-5h6z" fill="currentColor" /><path d={PF_BACK} fill="none" stroke="currentColor" strokeDasharray="1.5 1.5" opacity={0.6} /></>,
  intersect: <><path d={`${PF_BACK}${PF_FRONT}`} fill="none" stroke="currentColor" opacity={0.5} /><path d="M7 7h6v6H7z" fill="currentColor" /></>,
  exclude: <path d={`${PF_BACK}${PF_FRONT}`} fill="currentColor" fillRule="evenodd" />,
  divide: <><path d="M2 2h11v5H7v6H2z" fill="currentColor" /><path d="M7.8 7.8h4.4v4.4H7.8z" fill="currentColor" opacity={0.55} /><path d="M13 7h5v11H7v-5h6z" fill="currentColor" /><path d="M7 7h6v6H7z" fill="none" stroke="var(--surface-panel, #2d2d2d)" strokeWidth={1.2} /></>,
  trim: <><path d="M2 2h11v5H7v6H2z" fill="currentColor" opacity={0.55} /><path d={PF_FRONT} fill="currentColor" /></>,
  crop: <><path d={PF_FRONT} fill="none" stroke="currentColor" strokeDasharray="1.5 1.5" opacity={0.6} /><path d="M7 7h6v6H7z" fill="currentColor" /><path d={PF_BACK} fill="none" stroke="currentColor" opacity={0.35} /></>,
};
const pfIcon = (op: string) => <svg width={20} height={20} viewBox="0 0 20 20" aria-hidden>{PF_ICONS[op]}</svg>;

function OpButtons({ handlers, ops }: { handlers: Record<string, Handler>; ops: string[] }) {
  return (
    <div className="pn-btns pn-pf">
      {ops.map((op) => {
        const id = `path.pf.${op}`, h = handlers[id], def = COMMAND_BY_ID.get(id);
        return <IconButton key={op} label={def?.label ?? op} description={h?.enabled === false ? h.reason : def?.description} icon={pfIcon(op)} disabled={!h || h.enabled === false} onClick={h?.run} testId={`pf-${op}`} />;
      })}
    </div>
  );
}

const ShapeModeButtons = ({ handlers }: { handlers: Record<string, Handler> }) => <OpButtons handlers={handlers} ops={["unite", "minusFront", "minusBack", "intersect", "exclude"]} />;

export function PathfinderPanel({ handlers }: { handlers: Record<string, Handler> }) {
  const action = (id: string) => {
    const h = handlers[id];
    return (
      <button key={id} type="button" className="ui-btn small" disabled={!h || h.enabled === false} title={h?.enabled === false ? h.reason : COMMAND_BY_ID.get(id)?.description} onClick={h?.run} data-testid={`pf-${id}`}>
        {COMMAND_BY_ID.get(id)?.label ?? id}
      </button>
    );
  };
  return (
    <>
      <PanelSection title="Shape Modes" testId="pathfinder-panel">
        <ShapeModeButtons handlers={handlers} />
      </PanelSection>
      <PanelSection title="Pathfinders">
        <OpButtons handlers={handlers} ops={["divide", "trim", "crop"]} />
        <p className="pn-empty">Results are plain paths that keep their cut layers. Divide and Trim also work on a single group.</p>
      </PanelSection>
      <PanelSection title="Path">
        <div className="pn-actions">{["path.offset", "path.roundCorners", "path.simplify", "path.smooth", "path.join", "path.close", "path.breakApart", "path.reverse"].map(action)}</div>
      </PanelSection>
      <PanelSection title="Laser Ready">
        <div className="pn-actions">{action("path.cleanup")}</div>
        <p className="pn-empty">Closes near-closed paths, removes stray points, empty paths and double cuts on the same layer. Works on the selection, or the whole document when nothing is selected.</p>
      </PanelSection>
    </>
  );
}

// ---------- History ----------

export function HistoryPanel() {
  const api = useEditorApi();
  const history = useEditor((s) => s.history);
  const all = [...history.past, ...history.future];
  const at = history.past.length;
  return (
    <PanelSection title="History" meta={`${at} / 200`} testId="history-panel">
      <div className="pn-hist" role="listbox" aria-label="History states">
        <button type="button" role="option" aria-selected={at === 0} className={at === 0 ? "cur" : ""} onClick={() => api.getState().jump(0)}>Open</button>
        {all.map((e, k) => (
          <button key={k} type="button" role="option" aria-selected={k + 1 === at} className={k + 1 === at ? "cur" : k + 1 > at ? "future" : ""} onClick={() => api.getState().jump(k + 1)}>{e.label}</button>
        ))}
      </div>
    </PanelSection>
  );
}

// ---------- Document ----------

export function DocumentPanel({ toast }: { toast: Toast }) {
  const api = useEditorApi();
  const doc = useEditor((s) => s.doc);
  const live = useLive();
  const sheet = doc.sheets[0];
  return (
    <>
      <PanelSection title="Sheet" meta={doc.sheets.length > 1 ? `${doc.sheets.length} sheets` : undefined} testId="doc-sheet">
        <div className="pn-grid">
          <NumberInput label="Width" value={sheet.w} length units={doc.units} min={10} max={3000} onChange={(w, c) => live("Sheet Size", (d) => { d.sheets[0].w = w; d.sheets[0].name = "Custom size"; }, c)} />
          <NumberInput label="Height" value={sheet.h} length units={doc.units} min={10} max={3000} onChange={(h, c) => live("Sheet Size", (d) => { d.sheets[0].h = h; d.sheets[0].name = "Custom size"; }, c)} />
        </div>
        <Select label="Material" value={sheet.materialId} options={MATERIAL_PRESETS.map((m) => ({ value: m.id, label: m.name }))} onChange={(materialId) => api.getState().edit("Material", (d) => { d.sheets[0].materialId = materialId; })} />
        <Select label="Machine" value={sheet.machineId} options={MACHINE_PROFILES.map((m) => ({ value: m.id, label: m.name }))} onChange={(machineId) => api.getState().edit("Machine", (d) => { d.sheets[0].machineId = machineId; })} />
      </PanelSection>
      <PanelSection
        title="Grid & Snapping" testId="doc-grid"
        onReset={() => { api.getState().edit("Reset Grid", (d) => { d.grid = { size: 10, subdivisions: 5, show: d.grid.show }; d.snapping = { grid: false, points: true, guides: true, smart: true }; }); toast("Reset grid and snapping", true); }}
      >
        <div className="pn-grid">
          <NumberInput label="Grid" value={doc.grid.size} length units={doc.units} min={0.5} max={500} defaultValue={10} onResetToast={(m) => toast(m, true)} onChange={(size, c) => live("Grid Size", (d) => { d.grid.size = size; }, c)} />
          <NumberInput label="Subdivisions" value={doc.grid.subdivisions} integer min={1} max={20} defaultValue={5} onResetToast={(m) => toast(m, true)} onChange={(v, c) => live("Grid Subdivisions", (d) => { d.grid.subdivisions = v; }, c)} />
        </div>
        {(["grid", "points", "guides", "smart"] as const).map((k) => (
          <label key={k} className="pn-check">
            <input type="checkbox" checked={doc.snapping[k]} onChange={() => api.getState().quiet((d) => { d.snapping[k] = !d.snapping[k]; })} />
            {k === "grid" ? "Snap to grid" : k === "points" ? "Snap to points" : k === "guides" ? "Snap to guides" : "Smart guides"}
          </label>
        ))}
      </PanelSection>
      <PanelSection title="Units">
        <SegmentedControl label="Units" hideLabel value={doc.units} onChange={(u) => api.getState().edit("Units", (d) => { d.units = u as Units; })} options={UNIT_LIST.map((u) => ({ value: u, label: u }))} />
      </PanelSection>
    </>
  );
}
