"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, Maximize2, ScanLine } from "lucide-react";
import { IconButton } from "@/components/ui";
import { layerCode } from "@/lib/studio/cutLayers";
import { findNode, isEditable, topLevel } from "@/lib/studio/scene";
import { useEditor, useEditorApi } from "./store";
import type { Handler } from "./commandHandlers";

const displayColor = (c: string) => (c === "#000000" ? "var(--ink)" : c);

/**
 * Bottom of the toolbar, like Illustrator's fill/stroke wells: the cut layer for new objects (and for the
 * selection), plus the preview/outline and presentation screen modes.
 */
export function ToolFooter({ handlers }: { handlers: Record<string, Handler> }) {
  const api = useEditorApi();
  const doc = useEditor((s) => s.doc);
  const current = useEditor((s) => s.currentLayer);
  const selection = useEditor((s) => s.selection);
  const outline = useEditor((s) => s.ui.outline);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const ids = topLevel(doc.root, selection).filter((id) => isEditable(doc.root, id));
  const layers = new Set(ids.map((id) => findNode(doc.root, id)?.layer));
  const shown = ids.length && layers.size === 1 ? [...layers][0]! : current;
  const l = doc.cutLayers[shown];
  const pick = (k: number) => {
    if (ids.length) api.getState().edit("Assign Cut Layer", (d) => ids.forEach((id) => { const n = findNode(d.root, id); if (n) n.layer = k; }));
    api.getState().set({ currentLayer: k });
    setOpen(false);
  };
  return (
    <>
      <div className="tf-well" ref={ref}>
        <button type="button" className="tf-swatch" style={{ background: displayColor(l.color) }} aria-expanded={open} aria-haspopup="dialog"
          aria-label={`Cut layer ${layerCode(shown)} ${l.name}${ids.length && layers.size > 1 ? " (mixed)" : ""}`} title={`${layerCode(shown)} · ${l.name} — click to change`}
          onClick={() => setOpen(!open)} data-testid="layer-well">
          <span>{ids.length && layers.size > 1 ? "?" : String(shown).padStart(2, "0")}</span>
        </button>
        <span className="tf-mode">{l.mode}</span>
        {open && (
          <div className="tf-pop" role="dialog" aria-label="Cut layers">
            <div className="tf-pop-head">{ids.length ? "Assign cut layer" : "Layer for new objects"}</div>
            <div className="tf-grid">
              {doc.cutLayers.map((c) => (
                <button key={c.index} type="button" className="tf-cell" aria-pressed={c.index === shown} style={{ background: displayColor(c.color) }}
                  title={`${layerCode(c.index)} · ${c.name} (${c.mode})`} aria-label={`${layerCode(c.index)} ${c.name}`} onClick={() => pick(c.index)} />
              ))}
            </div>
            <div className="tf-pop-foot"><code>{layerCode(shown)}</code> {l.name} · {l.speed} mm/s · {l.power}%</div>
          </div>
        )}
      </div>
      <div className="tf-modes">
        <IconButton label={outline ? "Preview mode" : "Outline mode"} shortcut="Ctrl+Y" icon={outline ? <Eye size={15} /> : <ScanLine size={15} />} onClick={handlers["view.outline"]?.run} side="right" />
        <IconButton label="Presentation mode" shortcut="F" icon={<Maximize2 size={15} />} onClick={handlers["view.presentation"]?.run} side="right" />
      </div>
    </>
  );
}
