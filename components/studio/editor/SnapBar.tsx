"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronUp, Magnet, Minus } from "lucide-react";
import { groupState, SNAP_GROUPS, setSnap, snapValue, type SnapKey } from "@/lib/studio/snap";
import { useEditor, useEditorApi } from "./store";

/** Advanced mode: every toggle, in the order the targets are found. */
const ADVANCED: { title: string; items: { key: SnapKey; label: string; hint?: string; sub?: boolean }[] }[] = [
  { title: "Bounding boxes", items: [
    { key: "bboxEdges", label: "Edges" }, { key: "bboxCorners", label: "Corners" },
    { key: "bboxMidpoints", label: "Edge midpoints" }, { key: "bboxCentres", label: "Centres" },
  ] },
  { title: "Nodes & paths", items: [
    { key: "points", label: "Nodes" }, { key: "nodesCusp", label: "Corner (cusp) nodes", sub: true }, { key: "nodesSmooth", label: "Smooth nodes", sub: true },
    { key: "pathOutline", label: "Paths", hint: "Anywhere along an outline" }, { key: "pathIntersections", label: "Path intersections" },
  ] },
  { title: "Other points", items: [
    { key: "centres", label: "Object & rotation centres" }, { key: "textBaseline", label: "Text baseline" },
  ] },
  { title: "Alignment", items: [
    { key: "pageEdges", label: "Page edges" }, { key: "pageCentre", label: "Page centre" }, { key: "guides", label: "Guides" },
    { key: "grid", label: "Grid" }, { key: "smart", label: "Other objects", hint: "Smart guides: edges, centres and equal spacing" },
  ] },
];

/**
 * Status-bar snapping control: a master switch plus a popover with the per-target toggles (simple: three
 * groups; advanced: every target). Everything is stored in the document's snapping settings.
 */
export function SnapControls({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const api = useEditorApi();
  const snapping = useEditor((s) => s.doc.snapping);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ right: number; bottom: number } | null>(null);
  const enabled = snapping.enabled !== false;
  const mode = snapping.mode ?? "simple";

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    setPos({ right: Math.max(8, window.innerWidth - r.right), bottom: window.innerHeight - r.top + 6 });
  }, [open]);
  useEffect(() => { if (open && pos) pop.current?.querySelector<HTMLElement>("input")?.focus(); }, [open, pos]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!pop.current?.contains(e.target as Node) && !btn.current?.parentElement?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc, true); };
  }, [open, setOpen]);

  const change = (fn: (s: typeof snapping) => void) => api.getState().quiet((d) => fn(d.snapping));
  const toggle = (k: SnapKey) => change((s) => setSnap(s, k, !snapValue(s, k)));
  const setGroup = (keys: SnapKey[], on: boolean) => change((s) => keys.forEach((k) => setSnap(s, k, on)));

  return (
    <span className="st-snap" data-testid="snap-controls">
      <button type="button" className="tg" aria-pressed={enabled} onClick={() => change((s) => { s.enabled = !enabled; })} title="Snapping on / off" data-testid="snap-master">
        <Magnet size={12} aria-hidden /> Snap
      </button>
      <button ref={btn} type="button" aria-expanded={open} aria-haspopup="dialog" aria-label="Snapping options" title="Snapping options" onClick={() => setOpen(!open)} data-testid="snap-options">
        <ChevronUp size={12} aria-hidden />
      </button>
      {open && pos && (
        <div ref={pop} className="st-snap-pop" role="dialog" aria-label="Snapping options" style={{ right: pos.right, bottom: pos.bottom }} data-testid="snap-popover">
          <div className="st-snap-head">
            <label className="st-snap-master">
              <input type="checkbox" checked={enabled} onChange={(e) => change((s) => { s.enabled = e.target.checked; })} data-testid="snap-enabled" /> Snapping
            </label>
            <div className="st-snap-mode" role="radiogroup" aria-label="Detail">
              {(["simple", "advanced"] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => change((s) => { s.mode = m; })} data-testid={`snap-mode-${m}`}>
                  {m === "simple" ? "Simple" : "Advanced"}
                </button>
              ))}
            </div>
          </div>
          <div className={`st-snap-body${enabled ? "" : " off"}`}>
            {mode === "simple"
              ? SNAP_GROUPS.map((g) => {
                const st = groupState(snapping, g.keys);
                return (
                  <button key={g.id} type="button" className="st-snap-row" role="checkbox" aria-checked={st === "mixed" ? "mixed" : st === "on"}
                    onClick={() => setGroup(g.keys, st !== "on")} data-testid={`snap-group-${g.id}`}>
                    <span className="box">{st === "on" ? <Check size={11} /> : st === "mixed" ? <Minus size={11} /> : null}</span>
                    <span>{g.label}</span>
                  </button>
                );
              })
              : ADVANCED.map((sec) => (
                <div key={sec.title} className="st-snap-sec">
                  <div className="st-snap-title">{sec.title}</div>
                  {sec.items.map((it) => {
                    const on = snapValue(snapping, it.key);
                    const muted = it.sub && !snapping.points;
                    return (
                      <button key={it.key} type="button" className={`st-snap-row${it.sub ? " sub" : ""}${muted ? " muted" : ""}`} role="checkbox" aria-checked={on}
                        onClick={() => toggle(it.key)} title={it.hint} data-testid={`snap-${it.key}`}>
                        <span className="box">{on ? <Check size={11} /> : null}</span>
                        <span>{it.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
          </div>
          <p className="st-snap-foot">Hold Ctrl while dragging to move without snapping.</p>
        </div>
      )}
    </span>
  );
}
