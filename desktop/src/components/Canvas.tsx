import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";

/** Pixels per millimetre at 100 %: true size on a standard 96 dpi screen. */
const PX_PER_MM = 96 / 25.4;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 40;
const RULER = 22;
const PAD = 32;

export interface CanvasHandle {
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
  reset(): void;
}

interface Props {
  svg: string | null;
  /** Sheet size in mm. */
  width: number;
  height: number;
  /** Fit again when this changes (a new design). */
  fitKey: string;
  dim?: boolean;
  onZoom?: (z: number) => void;
  children?: React.ReactNode;
}

/** Ruler steps in mm: the first whose labels are at least 56 px apart. */
function stepFor(scale: number): number {
  for (const s of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]) if (s * scale >= 56) return s;
  return 10000;
}

/**
 * The laser bed: the server's SVG drawn as an image (an <img> never runs scripts inside an SVG),
 * at true scale, on a 10 mm grid with millimetre rulers. Ctrl + wheel zooms at the pointer; drag
 * or wheel pans.
 */
export const Canvas = forwardRef<CanvasHandle, Props>(function Canvas({ svg, width, height, fitKey, dim, onZoom, children }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLCanvasElement>(null);
  const left = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState({ zoom: 1, x: PAD, y: PAD });
  const [url, setUrl] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const fitted = useRef("");

  useEffect(() => {
    if (!svg) return;
    const u = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [svg]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = view.zoom * PX_PER_MM;

  const fit = useCallback(() => {
    if (!width || !height) return;
    const aw = Math.max(100, size.w - RULER - PAD * 2);
    const ah = Math.max(100, size.h - RULER - PAD * 2);
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(aw / (width * PX_PER_MM), ah / (height * PX_PER_MM))));
    const s = zoom * PX_PER_MM;
    setView({ zoom, x: RULER + (size.w - RULER - width * s) / 2, y: RULER + (size.h - RULER - height * s) / 2 });
  }, [width, height, size.w, size.h]);

  const zoomAt = useCallback((factor: number, cx = (size.w + RULER) / 2, cy = (size.h + RULER) / 2) => {
    setView((v) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
      const k = zoom / v.zoom;
      return { zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  }, [size.w, size.h]);

  useImperativeHandle(ref, () => ({
    zoomIn: () => zoomAt(1.25),
    zoomOut: () => zoomAt(0.8),
    fit,
    reset: () => setView({ zoom: 1, x: RULER + PAD, y: RULER + PAD }),
  }), [zoomAt, fit]);

  useEffect(() => {
    if (width && height && fitted.current !== fitKey) {
      fitted.current = fitKey;
      fit();
    }
  }, [fitKey, width, height, fit]);

  useEffect(() => onZoom?.(view.zoom), [view.zoom, onZoom]);

  // Rulers.
  useEffect(() => {
    const dpr = window.devicePixelRatio || 1;
    const color = getComputedStyle(document.documentElement);
    const ink = color.getPropertyValue("--ruler-ink").trim() || "#667";
    const bg = color.getPropertyValue("--ruler-bg").trim() || "#eee";
    const step = stepFor(scale);
    const minor = step / (step % 5 === 0 ? 5 : 2);
    for (const [cv, horizontal] of [[top.current, true], [left.current, false]] as const) {
      if (!cv) continue;
      const len = horizontal ? size.w : size.h;
      cv.width = Math.max(1, (horizontal ? len : RULER) * dpr);
      cv.height = Math.max(1, (horizontal ? RULER : len) * dpr);
      const g = cv.getContext("2d")!;
      // The vertical ruler is drawn as a horizontal one, turned a quarter (x along the ruler).
      if (horizontal) g.setTransform(dpr, 0, 0, dpr, 0, 0);
      else g.setTransform(0, dpr, dpr, 0, 0, 0);
      g.fillStyle = bg;
      g.fillRect(0, 0, len, RULER);
      g.strokeStyle = ink;
      g.fillStyle = ink;
      g.lineWidth = 1;
      g.font = "10px 'Segoe UI Variable Text', 'Segoe UI', sans-serif";
      const origin = horizontal ? view.x : view.y;
      const from = Math.floor((RULER - origin) / scale / minor) * minor;
      const to = (len - origin) / scale;
      g.beginPath();
      for (let mm = from; mm <= to; mm += minor) {
        const p = Math.round(origin + mm * scale) + 0.5;
        if (p < RULER) continue;
        const major = Math.abs(mm / step - Math.round(mm / step)) < 1e-6;
        g.moveTo(p, RULER);
        g.lineTo(p, major ? 6 : RULER - 5);
        if (major) {
          const label = String(Math.round(mm));
          if (horizontal) g.fillText(label, p + 3, 11);
          else {
            // Swapped axes mirror text; draw it upright along the ruler instead.
            g.save();
            g.translate(p - 3, 11);
            g.transform(0, 1, 1, 0, 0, 0);
            g.rotate(-Math.PI / 2);
            g.fillText(label, 0, 0);
            g.restore();
          }
        }
      }
      g.stroke();
    }
  }, [view, scale, size.w, size.h]);

  const grid = 10 * scale >= 6 ? 10 * scale : 100 * scale;

  return (
    <div
      ref={box}
      className="bed"
      style={{ ["--grid" as string]: `${grid}px`, ["--gx" as string]: `${view.x}px`, ["--gy" as string]: `${view.y}px` }}
      onWheel={(e) => {
        if (e.ctrlKey) {
          const r = box.current!.getBoundingClientRect();
          zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
        } else {
          const dx = e.shiftKey ? e.deltaY : e.deltaX;
          const dy = e.shiftKey ? 0 : e.deltaY;
          setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
        }
      }}
      onPointerDown={(e) => {
        if (e.button !== 0 && e.button !== 1) return;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (d) setView((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }));
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      {url && width > 0 && (
        <div className={`sheet${dim ? " dim" : ""}`} style={{ left: view.x, top: view.y, width: width * scale, height: height * scale }}>
          <img src={url} alt="Preview of the cut file" draggable={false} />
        </div>
      )}
      <canvas ref={top} className="ruler top" style={{ width: size.w, height: RULER }} aria-hidden />
      <canvas ref={left} className="ruler left" style={{ width: RULER, height: size.h }} aria-hidden />
      <div className="ruler-corner" aria-hidden>mm</div>
      {children}
    </div>
  );
});

export const zoomLabel = (z: number) => `${Math.round(z * 100)}%`;
