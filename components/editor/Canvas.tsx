"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { clamp, r3, type LayerContent, type LayerKey, type Layers } from "@/lib/hinge";
import { GRID_GAP, sheetGrid, sheetLabel } from "@/lib/fit/grid";
import type { View } from "@/hooks/useCanvasView";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { fmtLen, type Units } from "./format";

/** The laser bed with the laid-out parts. Products pass ready-made layer content. */
export function Canvas({
  canvasRef, view, viewRef, bedW, bedH, sheets, content, stale, engrave, images, layers, labels, pitch = 0, overlay, error, notice, showGrid, tool, spaceDown, units,
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
  /** `content` is the last design that built, drawn dimmed under the error. */
  stale?: boolean;
  /** Engraved areas (filled, even-odd), on the labels layer. */
  engrave?: string[];
  /** Engraved pictures (sheet coordinates), clipped to `clip`, on the labels layer. */
  images?: { href: string; x: number; y: number; w: number; h: number; clip?: string; flip?: boolean }[];
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

  const [aspect, setAspect] = useState(1.6);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { if (el.clientWidth && el.clientHeight) setAspect(el.clientWidth / el.clientHeight); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [canvasRef]);
  const multi = !!sheets && sheets.length > 1;
  const at = useMemo(() => (multi && sheets ? sheetGrid(sheets, aspect).at : null), [multi, sheets, aspect]);
  /** Sheets where the view shows them (the layout keeps them stacked). */
  const shown = sheets?.map((s, i) => (at ? { ...s, x: at[i].x, y: at[i].y } : s));

  const sw = 1.1 / view.z;
  let grid = "";
  if (showGrid && content) {
    const step = 10;
    for (const s of shown ?? [{ x: 0, y: 0, w: bedW, h: bedH }]) {
      for (let x = step; x < s.w; x += step) grid += `M${s.x + x},${s.y}V${s.y + s.h}`;
      for (let y = step; y < s.h; y += step) grid += `M${s.x},${s.y + y}H${s.x + s.w}`;
    }
  }
  const vis = (k: LayerKey) => layers[k].vis;
  /** "Sheet N of M" sized to fit the gap above the sheet and the sheet's width; hidden when unreadable. */
  const labelOf = (s: { x: number; y: number; w: number; label: string; warn?: boolean }) => {
    const { size, lift } = sheetLabel(view.z, s.w, s.label.length);
    return size ? <text x={s.x} y={s.y - lift} fontFamily="Source Sans 3, sans-serif" fontSize={size} fill={s.warn ? "var(--warn, #E8A33D)" : "var(--fg-faint)"}>{s.label}</text> : null;
  };

  const art = content && (
    <>
      {content.fills.map((d, i) => <path key={`f${i}`} d={d} fill="var(--wood)" fillOpacity={0.13} fillRule="evenodd" stroke="none" />)}
      {vis("labels") && images?.map((im, i) => (
        <g key={`im${i}`}>
          {im.clip && <clipPath id={`gen-clip-${i}`}><path d={im.clip} /></clipPath>}
          <g clipPath={im.clip ? `url(#gen-clip-${i})` : undefined}>
            <image href={im.href} x={im.x} y={im.y} width={im.w} height={im.h} preserveAspectRatio="none" opacity={0.85} transform={im.flip ? `translate(${2 * im.x + im.w} 0) scale(-1 1)` : undefined} className="engrave-image" />
          </g>
        </g>
      ))}
      {vis("labels") && engrave?.map((d, i) => <path key={`e${i}`} d={d} fill="var(--l-labels)" fillOpacity={0.72} fillRule="evenodd" stroke="none" className="engrave" />)}
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
  );

  return (
    <div
      className={`canvas${dragging ? " dragging" : ""}${tool === "zoom" && !spaceDown ? " zoom-in" : ""}${stale ? " stale" : ""}`}
      ref={canvasRef}
      onPointerDown={(e) => {
        const canvas = canvasRef.current;
        // Capturing the pointer for a HUD press would retarget its click to the canvas.
        if (!canvas || (e.target as Element).closest(".canvas-hud")) return;
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
        let mx = (e.clientX - r.left - v.tx) / v.z;
        let my = (e.clientY - r.top - v.ty) / v.z;
        const on = at && shown?.find((s) => mx >= s.x && mx <= s.x + s.w && my >= s.y && my <= s.y + s.h);
        if (on) { mx -= on.x; my -= on.y; }
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
              {shown ? shown.map((s, i) => (
                <g key={`s${i}`}>
                  <title>{s.label}</title>
                  <rect x={s.x} y={s.y} width={s.w} height={s.h} fill="var(--sheet)" stroke={s.warn ? "var(--warn, #E8A33D)" : "var(--sheet-edge)"} strokeWidth={sw} className="sheet-rect" />
                  {labelOf(s)}
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
              {at && sheets ? (
                <>
                  <defs>
                    {sheets.map((s, i) => (
                      <clipPath key={i} id={`sheet-clip-${i}`}><rect x={s.x - GRID_GAP / 2} y={s.y - GRID_GAP / 2} width={s.w + GRID_GAP} height={s.h + GRID_GAP} /></clipPath>
                    ))}
                  </defs>
                  {sheets.map((s, i) => {
                    const move = { clipPath: `url(#sheet-clip-${i})`, transform: `translate(${r3(at[i].x - s.x)} ${r3(at[i].y - s.y)})` };
                    return i === 0 ? <g key={i} {...move}><g id="sheet-art">{art}</g></g> : <use key={i} href="#sheet-art" {...move} />;
                  })}
                </>
              ) : art}
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
