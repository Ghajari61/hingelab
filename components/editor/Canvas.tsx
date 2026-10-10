"use client";

import { useEffect, useRef, useState } from "react";
import { clamp, r3, type LayerContent, type LayerKey, type Layers } from "@/lib/hinge";
import type { View } from "@/hooks/useCanvasView";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { fmtLen, type Units } from "./format";

/** The laser bed with the laid-out parts. Products pass ready-made layer content. */
export function Canvas({
  canvasRef, view, viewRef, bedW, bedH, sheets, content, layers, labels, pitch = 0, overlay, error, notice, showGrid, tool, spaceDown, units,
  onCursor, zoomAt, panBy, onZoomCenter, onActual, onFit, tools,
}: {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  view: View;
  viewRef: React.RefObject<View>;
  bedW: number;
  bedH: number;
  /** Several sheets laid out side by side, drawn instead of the single bed. */
  sheets?: { x: number; y: number; w: number; h: number; label: string; warn?: boolean }[] | null;
  content: LayerContent | null;
  layers: Layers;
  labels: boolean;
  /** Hinge spacing, used to fade dense hinge cuts when zoomed out. */
  pitch?: number;
  /** Diagnostic paths drawn over the parts, in sheet coordinates; width in screen pixels. */
  overlay?: { d: string; color: string; width: number }[] | null;
  error: string | null;
  /** Neutral message (for example while a font loads). */
  notice?: string | null;
  showGrid: boolean;
  tool: "hand" | "zoom";
  spaceDown: boolean;
  units: Units;
  onCursor: (x: string, y: string) => void;
  zoomAt: (f: number, cx: number, cy: number) => void;
  panBy: (tx: number, ty: number) => void;
  onZoomCenter: (f: number) => void;
  onActual: () => void;
  onFit: () => void;
  /** View tools (hand, zoom, grid) shown at the start of the zoom HUD. */
  tools?: React.ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const zoomPct = Math.round(view.z / (96 / 25.4) * 100) + "%";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const v = viewRef.current;
      if (!v) return;
      if (e.ctrlKey || e.metaKey || (Math.abs(e.deltaY) > 0 && !e.shiftKey && Math.abs(e.deltaX) < 1)) {
        zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
      } else {
        panBy(v.tx - e.deltaX, v.ty - e.deltaY);
      }
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [canvasRef, viewRef, zoomAt, panBy]);

  const sw = 1.1 / view.z;
  let grid = "";
  if (showGrid && content) {
    const step = 10;
    for (const s of sheets ?? [{ x: 0, y: 0, w: bedW, h: bedH }]) {
      for (let x = step; x < s.w; x += step) grid += `M${s.x + x},${s.y}V${s.y + s.h}`;
      for (let y = step; y < s.h; y += step) grid += `M${s.x},${s.y + y}H${s.x + s.w}`;
    }
  }
  const vis = (k: LayerKey) => layers[k].vis;

  return (
    <div
      className={`canvas${dragging ? " dragging" : ""}${tool === "zoom" && !spaceDown ? " zoom-in" : ""}`}
      ref={canvasRef}
      onPointerDown={(e) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const r = canvas.getBoundingClientRect();
        const cx = e.clientX - r.left, cy = e.clientY - r.top;
        if (tool === "zoom" && !spaceDown && e.button === 0) {
          zoomAt(e.altKey ? 1 / 1.6 : 1.6, cx, cy);
          return;
        }
        const v = viewRef.current;
        if (!v) return;
        drag.current = { x: e.clientX, y: e.clientY, tx: v.tx, ty: v.ty };
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      }}
      onPointerMove={(e) => {
        const canvas = canvasRef.current;
        const v = viewRef.current;
        if (!canvas || !v) return;
        const r = canvas.getBoundingClientRect();
        const mx = (e.clientX - r.left - v.tx) / v.z;
        const my = (e.clientY - r.top - v.ty) / v.z;
        onCursor(fmtLen(mx, units, true), fmtLen(my, units, true));
        if (!drag.current) return;
        panBy(drag.current.tx + e.clientX - drag.current.x, drag.current.ty + e.clientY - drag.current.y);
      }}
      onPointerUp={() => { drag.current = null; setDragging(false); }}
      onPointerCancel={() => { drag.current = null; setDragging(false); }}
    >
      <svg id="stage" xmlns="http://www.w3.org/2000/svg">
        <g id="world" transform={`translate(${view.tx},${view.ty}) scale(${view.z})`}>
          {content && (
            <>
              {sheets ? sheets.map((s, i) => (
                <g key={`s${i}`}>
                  <rect x={s.x} y={s.y} width={s.w} height={s.h} fill="var(--sheet)" stroke={s.warn ? "var(--warn, #E8A33D)" : "var(--sheet-edge)"} strokeWidth={sw} className="sheet-rect" />
                  <text x={s.x} y={s.y - 6 / view.z} fontFamily="Source Sans 3, sans-serif" fontSize={11 / view.z} fill={s.warn ? "var(--warn, #E8A33D)" : "var(--fg-faint)"}>{s.label}</text>
                </g>
              )) : (
                <>
                  <rect x={0} y={0} width={bedW} height={bedH} fill="var(--sheet)" stroke="var(--sheet-edge)" strokeWidth={sw} className="sheet-rect" />
                  <text x={0} y={-6 / view.z} fontFamily="Source Sans 3, sans-serif" fontSize={11 / view.z} fill="var(--fg-faint)">
                    {`Laser bed ${fmtLen(bedW, units)} × ${fmtLen(bedH, units)}`}
                  </text>
                </>
              )}
              {showGrid && <path d={grid} stroke="var(--canvas-grid)" strokeWidth={sw * 0.8} fill="none" />}
              {content.fills.map((d, i) => <path key={`f${i}`} d={d} fill="var(--wood)" fillOpacity={0.13} fillRule="evenodd" stroke="none" />)}
              {/* hairline hinge: thin enough that individual cuts stay readable when zoomed out */}
              {vis("hinge") && content.hinge.length > 0 && (
                <path
                  d={content.hinge.join(" ")}
                  fill="none"
                  stroke="var(--l-hinge)"
                  strokeWidth={0.6 / view.z}
                  strokeLinecap="butt"
                  strokeOpacity={r3(clamp(pitch * view.z / 7, 0.45, 1))}
                  vectorEffect="non-scaling-stroke"
                  style={{ strokeWidth: `${pitch * view.z > 6 ? 1 : 0.6}px` }}
                />
              )}
              {vis("slots") && <path d={content.slots.join(" ")} fill="none" stroke="var(--l-slots)" strokeWidth={sw} />}
              {vis("outline") && <path d={content.outline.join(" ")} fill="none" stroke="var(--l-outline)" strokeWidth={sw * 1.2} strokeLinejoin="round" />}
              {vis("labels") && labels && content.labels.map((lb, i) => (
                <text key={`l${i}`} x={r3(lb.x)} y={r3(lb.y)} fontFamily="Source Sans 3, sans-serif" fontWeight={600} fontSize={r3(lb.size)} fill="var(--l-labels)" fillOpacity={0.8} textAnchor="middle" dominantBaseline="middle" transform={lb.rot ? `rotate(${lb.rot} ${r3(lb.x)} ${r3(lb.y)})` : undefined}>{lb.text}</text>
              ))}
              {overlay?.map((o, i) => (
                <path key={`o${i}`} d={o.d} fill="none" stroke={o.color} strokeWidth={o.width} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              ))}
            </>
          )}
        </g>
      </svg>
      {error && <div className="canvas-error">{error}</div>}
      {!error && notice && <div className="canvas-error notice">{notice}</div>}
      <div className="canvas-hud">
        {tools}
        {tools ? <span className="hud-sep" aria-hidden /> : null}
        <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => onZoomCenter(0.8)}><ZoomOut size={16} /></button>
        <button type="button" title="Actual size" className="hud-pct" onClick={onActual}>{zoomPct}</button>
        <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => onZoomCenter(1.25)}><ZoomIn size={16} /></button>
        <button type="button" title="Fit sheet" aria-label="Fit sheet" onClick={onFit}><Maximize size={15} /></button>
      </div>
    </div>
  );
}
