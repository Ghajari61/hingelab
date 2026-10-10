"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
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

export interface DockTab { id: string; label: string; content: ReactNode }

/**
 * The right-hand dock: tabbed panels; tabs can be dragged to reorder (the order is reported so the
 * workspace can save it).
 */
export function Dock({ tabs, active, onActive, onReorder, label = "Panels", width }: {
  tabs: DockTab[]; active: string; onActive: (id: string) => void; onReorder?: (ids: string[]) => void; label?: string; width?: number;
}) {
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const cur = tabs.find((t) => t.id === active) ?? tabs[0];
  return (
    <aside className="ui-dock" aria-label={label} style={width ? { width } : undefined}>
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
      <div className="ui-dock-body" role="tabpanel" aria-label={cur?.label}>{cur?.content}</div>
    </aside>
  );
}
