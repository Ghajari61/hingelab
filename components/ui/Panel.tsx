"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronsLeft, ChevronsRight, MoreHorizontal } from "lucide-react";
import { MenuButton, type MenuItem } from "./Menu";

/** Dispatched on a section (from a focused element inside it) by Edit → Reset ▸ Section. */
export const RESET_SECTION_EVENT = "hingelab:reset-section";

/** A collapsible panel section with a ⋯ menu (Reset section lives there, spec §10). */
export function PanelSection({ title, meta, children, defaultOpen = true, menu, onReset, testId }: {
  title: string; meta?: ReactNode; children: ReactNode; defaultOpen?: boolean; menu?: MenuItem[]; onReset?: () => void; testId?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef<HTMLElement>(null);
  const resetRef = useRef(onReset);
  resetRef.current = onReset;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = (e: Event) => { if (resetRef.current) { e.stopPropagation(); resetRef.current(); } };
    el.addEventListener(RESET_SECTION_EVENT, on);
    return () => el.removeEventListener(RESET_SECTION_EVENT, on);
  }, []);
  const items: MenuItem[] = [
    ...(onReset ? [{ id: "reset-section", label: "Reset section", run: onReset } as MenuItem] : []),
    ...(menu ?? []),
  ];
  return (
    <section ref={ref} className={`ui-section${open ? "" : " collapsed"}`} data-testid={testId}>
      <header>
        <button type="button" className="toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <ChevronDown size={14} className="chev" aria-hidden />
          {title}
          {meta ? <span className="meta">{meta}</span> : null}
        </button>
        {items.length > 0 && <MenuButton label={`${title} options`} items={items}><MoreHorizontal size={15} /></MenuButton>}
      </header>
      <div className="content">{children}</div>
    </section>
  );
}

export interface DockTab { id: string; label: string; content: ReactNode; icon?: ReactNode }

/**
 * The right-hand dock: tabbed panels; tabs can be dragged to reorder (the order is reported so the
 * workspace can save it). It collapses to a column of panel icons (like Illustrator) and its left
 * edge can be dragged to resize it.
 */
export function Dock({ tabs, active, onActive, onReorder, label = "Panels", width, collapsed = false, onCollapse, onResize, minWidth = 200, maxWidth = 600 }: {
  tabs: DockTab[]; active: string; onActive: (id: string) => void; onReorder?: (ids: string[]) => void; label?: string; width?: number;
  collapsed?: boolean; onCollapse?: (collapsed: boolean) => void; onResize?: (width: number, done: boolean) => void; minWidth?: number; maxWidth?: number;
}) {
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const cur = tabs.find((t) => t.id === active) ?? tabs[0];
  if (collapsed) {
    return (
      <aside className="ui-dock rail" aria-label={label}>
        <div className="ui-dock-rail">
          {onCollapse && <button type="button" className="ui-rail-btn" title="Expand panels" aria-label="Expand panels" onClick={() => onCollapse(false)}><ChevronsLeft size={14} /></button>}
          {tabs.map((t) => (
            <button key={t.id} type="button" className="ui-rail-btn" title={t.label} aria-label={`Open ${t.label} panel`} aria-pressed={t.id === cur?.id}
              onClick={() => { onActive(t.id); onCollapse?.(false); }}>
              {t.icon ?? t.label.slice(0, 2)}
            </button>
          ))}
        </div>
      </aside>
    );
  }
  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onResize || !width) return;
    e.preventDefault();
    const x0 = e.clientX, w0 = width;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const at = (ev: PointerEvent) => Math.max(minWidth, Math.min(maxWidth, Math.round(w0 + x0 - ev.clientX)));
    const move = (ev: PointerEvent) => onResize(at(ev), false);
    const up = (ev: PointerEvent) => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); onResize(at(ev), true); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };
  return (
    <aside className="ui-dock" aria-label={label} style={width ? { width } : undefined}>
      {onResize && <div className="ui-dock-resize" role="separator" aria-orientation="vertical" aria-label="Resize panels" onPointerDown={startResize} />}
      <div className="ui-dock-head">
        <div className="ui-dock-tabs" role="tablist" aria-label={label}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              className={`ui-tab${over === t.id && drag && drag !== t.id ? " drop-before" : ""}`}
              aria-selected={t.id === cur?.id}
              draggable={!!onReorder}
              onClick={() => onActive(t.id)}
              onDragStart={(e) => { setDrag(t.id); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(t.id); } }}
              onDragLeave={() => setOver((o) => (o === t.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                if (drag && drag !== t.id && onReorder) {
                  const ids = tabs.map((x) => x.id).filter((x) => x !== drag);
                  ids.splice(ids.indexOf(t.id), 0, drag);
                  onReorder(ids);
                }
                setDrag(null); setOver(null);
              }}
              onDragEnd={() => { setDrag(null); setOver(null); }}
            >
              {t.label}
            </button>
          ))}
        </div>
        {onCollapse && <button type="button" className="ui-rail-btn" title="Collapse to icons" aria-label="Collapse panels to icons" onClick={() => onCollapse(true)}><ChevronsRight size={14} /></button>}
      </div>
      <div className="ui-dock-body" role="tabpanel" aria-label={cur?.label}>{cur?.content}</div>
    </aside>
  );
}
