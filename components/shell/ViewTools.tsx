"use client";

import { Grid3x3, Hand, Search } from "lucide-react";

/** Hand, zoom tool and grid toggle, placed in the canvas zoom HUD. */
export function ViewTools({ tool, showGrid, onTool, onGrid, nominal }: {
  tool: "hand" | "zoom";
  showGrid: boolean;
  onTool: (t: "hand" | "zoom") => void;
  onGrid: () => void;
  /** Toolpath (kerf-compensated, as cut) or Nominal (the design's size) view. */
  nominal?: { on: boolean; toggle: () => void };
}) {
  return (
    <>
      {nominal && (
        <button type="button" className="hud-tool hud-text" aria-pressed={nominal.on} title={nominal.on ? "Showing the nominal design (before kerf). Click to show the toolpaths as they are cut." : "Showing the toolpaths (kerf compensated, as cut). Click to show the nominal design."} onClick={nominal.toggle}>{nominal.on ? "Nominal" : "Toolpath"}</button>
      )}
      <button type="button" className="hud-tool" aria-pressed={tool === "hand"} aria-label="Hand tool" title="Hand (H): drag to pan" onClick={() => onTool("hand")}><Hand size={16} /></button>
      <button type="button" className="hud-tool" aria-pressed={tool === "zoom"} aria-label="Zoom tool" title="Zoom (Z): click to zoom in, Alt-click to zoom out" onClick={() => onTool("zoom")}><Search size={16} /></button>
      <button type="button" className="hud-tool" aria-pressed={showGrid} aria-label="Grid" title="Toggle grid (')" onClick={onGrid}><Grid3x3 size={16} /></button>
    </>
  );
}
