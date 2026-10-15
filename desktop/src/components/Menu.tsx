import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export type MenuItem =
  | { label: string; shortcut?: string; disabled?: boolean; onSelect: () => void; icon?: ReactNode }
  | "-";

/** A drop-down menu: arrow keys move, Enter picks, Escape or a click outside closes. */
export function Menu({ label, items, title }: { label: string; items: MenuItem[]; title?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("pointerdown", away);
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    return () => window.removeEventListener("pointerdown", away);
  }, [open]);

  const move = (dir: 1 | -1) => {
    const list = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];
    if (!list.length) return;
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    list[(i + dir + list.length) % list.length].focus();
  };

  return (
    <div className="menu" ref={root}>
      <button
        ref={button} type="button" className="btn ghost menu-btn" aria-haspopup="menu" aria-expanded={open} aria-controls={id} title={title}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); } }}
      >
        {label}<ChevronDown size={13} aria-hidden />
      </button>
      {open && (
        <div
          id={id} className="menu-pop" role="menu" aria-label={label}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
            else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
            else if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); setOpen(false); button.current?.focus(); }
          }}
        >
          {items.map((it, i) => it === "-"
            ? <div key={`sep${i}`} className="menu-sep" role="separator" />
            : (
              <button
                key={it.label} type="button" role="menuitem" className="menu-item" disabled={it.disabled}
                onClick={() => { setOpen(false); button.current?.focus(); it.onSelect(); }}
              >
                <span className="menu-icon" aria-hidden>{it.icon}</span>
                <span className="menu-label">{it.label}</span>
                {it.shortcut && <kbd>{it.shortcut}</kbd>}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
