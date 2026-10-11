"use client";

import { useState } from "react";
import { ContextMenu, type MenuItem } from "@/components/ui";
import { layerCode } from "@/lib/studio/cutLayers";
import { findNode, isEditable, topLevel } from "@/lib/studio/scene";
import { objectsOnLayer } from "@/lib/studio/selectTools";
import { useEditor, useEditorApi } from "./store";
import type { Handler } from "./commandHandlers";

const displayColor = (c: string) => (c === "#000000" ? "var(--ink)" : c);

/**
 * Cut-layer swatches under the canvas, one per layer C00–C29. Click assigns the selection to the layer
 * (and makes it the layer for new objects); Shift+click selects everything on it; right-click opens the
 * layer's options. Layers hidden on the canvas are dimmed.
 */
export function SwatchBar({ handlers, onEditLayer, toast }: {
  handlers: Record<string, Handler>;
  onEditLayer: (k: number) => void;
  toast: (message: string) => void;
}) {
  const api = useEditorApi();
  const layers = useEditor((s) => s.doc.cutLayers);
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const current = useEditor((s) => s.currentLayer);
  const [menu, setMenu] = useState<{ x: number; y: number; k: number } | null>(null);

  const ids = topLevel(doc.root, selection).filter((id) => isEditable(doc.root, id));
  const used = new Set(ids.map((id) => findNode(doc.root, id)?.layer));
  const active = ids.length ? (used.size === 1 ? [...used][0] : -1) : current;

  const selectLayer = (k: number) => {
    const on = objectsOnLayer(api.getState().doc, k);
    api.getState().select(on);
    toast(on.length ? `${on.length} object${on.length === 1 ? "" : "s"} on ${layerCode(k)} · ${layers[k]?.name ?? ""}` : `Nothing on ${layerCode(k)} yet`);
  };

  const menuItems = (k: number): MenuItem[] => {
    const l = layers[k];
    return [
      { id: "sw-assign", label: ids.length ? "Assign Selection to This Layer" : "Use for New Objects", run: () => handlers[`laser.assign.${k}`]?.run() },
      { id: "sw-select", label: "Select Objects on This Layer", run: () => selectLayer(k) },
      "-",
      { id: "sw-show", label: "Show on Canvas", checked: l.show, run: () => api.getState().edit("Layer Visibility", (d) => { d.cutLayers[k].show = !d.cutLayers[k].show; }) },
      { id: "sw-output", label: "Output to Laser", checked: l.output, run: () => api.getState().edit("Layer Output", (d) => { d.cutLayers[k].output = !d.cutLayers[k].output; }) },
      "-",
      { id: "sw-edit", label: "Edit Layer…", run: () => onEditLayer(k) },
    ];
  };

  return (
    <div className="st-swatches" role="toolbar" aria-label="Cut layer swatches" data-testid="swatch-bar">
      {layers.map((l) => (
        <button
          key={l.index} type="button" className="sw" style={{ background: displayColor(l.color) }}
          aria-pressed={active === l.index} data-hidden={!l.show || undefined} data-off={!l.output || undefined}
          aria-label={`${layerCode(l.index)} ${l.name}`} data-testid={`swatch-${l.index}`}
          title={`${layerCode(l.index)} · ${l.name} (${l.mode}${l.show ? "" : ", hidden"}${l.output ? "" : ", output off"})\nClick: assign · Shift+click: select all on it · Right-click: options`}
          onClick={(e) => { if (e.shiftKey) selectLayer(l.index); else handlers[`laser.assign.${l.index}`]?.run(); }}
          onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, k: l.index }); }}
        >
          <span>{String(l.index).padStart(2, "0")}</span>
        </button>
      ))}
      <span className="st-swatches-hint">Click assigns · Shift+click selects · Right-click for options</span>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.k)} label={`Cut layer ${layerCode(menu.k)}`} onClose={() => setMenu(null)} />}
    </div>
  );
}
