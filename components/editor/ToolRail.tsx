"use client";

export function ToolRail({
  tool, showGrid, onTool, onFit, onGrid, onSave, onOpen,
}: {
  tool: "hand" | "zoom";
  showGrid: boolean;
  onTool: (t: "hand" | "zoom") => void;
  onFit: () => void;
  onGrid: () => void;
  onSave: () => void;
  onOpen: () => void;
}) {
  return (
    <aside className="toolrail" aria-label="Tools">
      <button className="tool" type="button" aria-pressed={tool === "hand"} onClick={() => onTool("hand")}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round"><path d="M6 9V4.2a1.2 1.2 0 012.4 0V8M8.4 8V3a1.2 1.2 0 012.4 0v5M10.8 8V4a1.2 1.2 0 012.4 0v6.5c0 3-2 5.5-5 5.5-2.2 0-3.3-1-4.5-3L3 10.2a1.2 1.2 0 012-1.3L6 10" /></svg>
        <span className="tip">Hand (H) — drag to pan</span>
      </button>
      <button className="tool" type="button" aria-pressed={tool === "zoom"} onClick={() => onTool("zoom")}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="7.5" cy="7.5" r="5" /><path d="M11.2 11.2L16 16M5.5 7.5h4M7.5 5.5v4" /></svg>
        <span className="tip">Zoom (Z) — click to zoom, Alt-click out</span>
      </button>
      <div className="rail-sep" />
      <button className="tool" type="button" onClick={onFit}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 6V2h4M12 2h4v4M16 12v4h-4M6 16H2v-4" /></svg>
        <span className="tip">Fit sheet (Ctrl+0)</span>
      </button>
      <button className="tool" type="button" aria-pressed={showGrid} onClick={onGrid}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M2 6h14M2 12h14M6 2v14M12 2v14" /></svg>
        <span className="tip">Toggle grid (&apos;)</span>
      </button>
      <div className="rail-sep" />
      <button className="tool" type="button" onClick={onSave}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"><path d="M3 2.5h9.5l2.5 2.5v10.5H3z" /><path d="M6 2.5v4h6v-4M5.5 15.5v-5h7v5" /></svg>
        <span className="tip">Save project (Ctrl+S)</span>
      </button>
      <button className="tool" type="button" onClick={onOpen}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"><path d="M2 14.5V3.5h5l1.5 2H15v2.5" /><path d="M2 14.5l2.5-6.5H17l-2.5 6.5z" /></svg>
        <span className="tip">Open project (Ctrl+O)</span>
      </button>
    </aside>
  );
}
