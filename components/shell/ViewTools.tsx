"use client";

import { Grid3x3, Hand, Search } from "lucide-react";

/** Hand, zoom tool and grid toggle, placed in the canvas zoom HUD. */
export function ViewTools({ tool, showGrid, onTool, onGrid }: {
  tool: "hand" | "zoom";
  showGrid: boolean;
  onTool: (t: "hand" | "zoom") => void;
  onGrid: () => void;
}) {
  return (
    <>
      <button type="button" className="hud-tool" aria-pressed={tool === "hand"} aria-label="Hand tool" title="Hand (H): drag to pan" onClick={() => onTool("hand")}><Hand size={16} /></button>
      <button type="button" className="hud-tool" aria-pressed={tool === "zoom"} aria-label="Zoom tool" title="Zoom (Z): click to zoom in, Alt-click to zoom out" onClick={() => onTool("zoom")}><Search size={16} /></button>
      <button type="button" className="hud-tool" aria-pressed={showGrid} aria-label="Grid" title="Toggle grid (')" onClick={onGrid}><Grid3x3 size={16} /></button>
    </>
  );
}
