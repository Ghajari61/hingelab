"use client";

/**
 * The start-up splash: the 3D reveal (scene.ts) on a transparent layer, or, without WebGL, the same
 * title drawn with CSS (gold "Hinge", graphite "Lab" with gold edges) rising and catching a light
 * sweep. Under "reduce motion" the finished composition simply fades in and out. It never blocks
 * the app: it shows until `ready`, then exits; if the app takes longer than the reveal it holds
 * quietly and shows the app's own startup step (`status`) when there is one.
 */
import { useEffect, useRef, useState } from "react";
import type { SplashScene } from "./scene";
import "./splash.css";

export interface SplashProps {
  /** The app has started (its first screen is drawn). */
  ready: boolean;
  /** The current real startup step, shown only while holding after the reveal. */
  status?: string;
  /** The exit begins: show the app underneath now. */
  onExitStart?: () => void;
  /** Gone: unmount it. */
  onDone: () => void;
  /** Fill a fixed layer over the page (web) or the whole window (desktop splash). */
  variant?: "overlay" | "window";
}

const prefersReducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function Splash({ ready, status, onExitStart, onDone, variant = "overlay" }: SplashProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<SplashScene | null>(null);
  const [mode, setMode] = useState<"3d" | "css" | null>(null);
  const [holding, setHolding] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const cb = useRef({ onExitStart, onDone });
  cb.current = { onExitStart, onDone };
  const readyRef = useRef(ready);
  readyRef.current = ready;

  // Pick the renderer once: 3D when WebGL works, CSS otherwise.
  useEffect(() => {
    let alive = true;
    void import("./scene").then(({ hasWebGL }) => { if (alive) setMode(hasWebGL() ? "3d" : "css"); }).catch(() => alive && setMode("css"));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (mode !== "3d" || !canvas.current) return;
    let disposed = false;
    void import("./scene").then(({ createSplashScene }) => {
      if (disposed || !canvas.current) return;
      try {
        scene.current = createSplashScene(canvas.current, {
          still: prefersReducedMotion(),
          onHold: () => setHolding(true),
          onExitStart: () => { setHolding(false); cb.current.onExitStart?.(); },
          onDone: () => cb.current.onDone(),
        });
      } catch {
        setMode("css");
      }
    });
    return () => { disposed = true; scene.current?.dispose(); scene.current = null; };
  }, [mode]);

  useEffect(() => { if (ready) scene.current?.ready(); }, [ready, mode]);
  // The 3D scene may be created after `ready` arrived.
  useEffect(() => {
    if (mode !== "3d" || !ready) return;
    const id = window.setInterval(() => { if (scene.current) { scene.current.ready(); window.clearInterval(id); } }, 50);
    return () => window.clearInterval(id);
  }, [mode, ready]);

  // CSS fallback: the reveal takes 2.6 s (0.4 s when motion is reduced); then exit once ready.
  useEffect(() => {
    if (mode !== "css") return;
    const reveal = prefersReducedMotion() ? 400 : 2600;
    const shown = performance.now();
    let timer = 0;
    const tick = () => {
      if (performance.now() - shown < reveal) { timer = window.setTimeout(tick, 100); return; }
      if (!readyRef.current) { setHolding(true); timer = window.setTimeout(tick, 100); return; }
      setHolding(false);
      setLeaving(true);
      cb.current.onExitStart?.();
      timer = window.setTimeout(() => cb.current.onDone(), 400);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [mode]);
  return (
    <div className={`hl-splash ${variant}${leaving ? " leaving" : ""}`} aria-hidden={variant === "overlay"} role={variant === "window" ? "status" : undefined} aria-label={variant === "window" ? "HingeLab is starting" : undefined}>
      {mode === "3d" && <canvas ref={canvas} className="hl-splash-canvas" />}
      {mode === "css" && (
        <div className={`hl-splash-css${prefersReducedMotion() ? " still" : ""}`}>
          <span className="hinge">Hinge</span><span className="lab">Lab</span>
        </div>
      )}
      {holding && <div className="hl-splash-status"><span className="bar" />{status || "Starting"}</div>}
    </div>
  );
}
