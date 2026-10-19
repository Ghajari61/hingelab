"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { formatShortcut } from "./shortcut";

/** One entry of a menu. The command registry turns commands into these (spec §9). */
export type MenuItem =
  | "-"
  | {
      id: string;
      label: string;
      shortcut?: string;
      disabled?: boolean;
      /** Why it is disabled, shown under the label (spec §20.6: "visibly disabled with a reason"). */
      reason?: string;
      checked?: boolean;
      run?: () => void;
      items?: MenuItem[];
    };

type Entry = Exclude<MenuItem, "-">;

/** How long the pointer may cross other items on its way into an open submenu before it closes. */
const SUBMENU_GRACE_MS = 250;

function MenuList({ items, onClose, label, style, className = "", autoFocus = true, onLeft, onRight, submenu = false }: {
  items: MenuItem[]; onClose: () => void; label: string; style?: React.CSSProperties; className?: string; autoFocus?: boolean;
  onLeft?: () => void; onRight?: () => void;
  /** Placed with fixed coordinates beside its parent item, so a scrolling parent menu cannot clip it. */
  submenu?: boolean;
}) {
  const [active, setActive] = useState(-1);
  const [sub, setSub] = useState<number | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const subTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entries = items.map((it, i) => ({ it, i })).filter((x): x is { it: Entry; i: number } => x.it !== "-");

  useEffect(() => { if (autoFocus) ref.current?.focus({ preventScroll: true }); }, [autoFocus]);
  useEffect(() => () => { if (subTimer.current) clearTimeout(subTimer.current); }, []);

  useLayoutEffect(() => {
    if (!submenu) return;
    const el = ref.current, anchor = el?.parentElement;
    if (!el || !anchor) return;
    const a = anchor.getBoundingClientRect(), r = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = a.right + 2;
    if (left + r.width > vw - 4) left = Math.max(4, a.left - r.width - 2);
    const top = Math.max(4, Math.min(a.top - 5, vh - r.height - 4));
    setPos({ left, top });
  }, [submenu]);

  useEffect(() => {
    if (!submenu) return;
    const parent = ref.current?.parentElement?.closest(".ui-menu");
    if (!parent) return;
    const close = () => onLeft?.();
    parent.addEventListener("scroll", close);
    return () => parent.removeEventListener("scroll", close);
  }, [submenu, onLeft]);

  const hover = (i: number, it: Entry) => {
    if (subTimer.current) { clearTimeout(subTimer.current); subTimer.current = null; }
    setActive(i);
    const next = it.items && !it.disabled ? i : null;
    if (sub === null || sub === i || next === sub) { setSub(next); return; }
    subTimer.current = setTimeout(() => { subTimer.current = null; setSub(next); }, SUBMENU_GRACE_MS);
  };
  const closeSub = useCallback(() => { setSub(null); ref.current?.focus(); }, []);

  const move = (dir: 1 | -1) => {
    if (!entries.length) return;
    const pos = entries.findIndex((e) => e.i === active);
    const next = entries[(pos + dir + entries.length) % entries.length];
    setActive(next.i);
    setSub(null);
  };
  const activate = (i: number) => {
    const it = items[i] as Entry;
    if (it.disabled) return;
    if (it.items) { setSub(i); return; }
    onClose();
    it.run?.();
  };

  return (
    <div
      ref={ref}
      className={`ui-menu ${className}`}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      style={submenu ? { ...style, left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? undefined : "hidden" } : style}
      onKeyDown={(e) => {
        if (sub !== null) return;
        if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); move(1); }
        else if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); move(-1); }
        else if (e.key === "ArrowRight") {
          e.preventDefault(); e.stopPropagation();
          const it = items[active] as Entry | undefined;
          if (it && it !== undefined && (it as Entry).items && !(it as Entry).disabled) setSub(active); else onRight?.();
        } else if (e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); onLeft?.(); }
        else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); if (active >= 0) activate(active); }
        else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
      }}
    >
      {items.map((it, i) => it === "-" ? <hr key={`sep-${i}`} /> : (
        <div
          key={it.id}
          role={it.checked !== undefined ? "menuitemcheckbox" : "menuitem"}
          aria-checked={it.checked}
          aria-disabled={it.disabled || undefined}
          aria-haspopup={it.items ? "menu" : undefined}
          aria-expanded={it.items ? sub === i : undefined}
          aria-keyshortcuts={it.shortcut}
          className={active === i ? "active" : undefined}
          data-command={it.id}
          onMouseEnter={() => hover(i, it)}
          onClick={(e) => { e.stopPropagation(); activate(i); }}
        >
          <span aria-hidden>{it.checked ? <Check size={13} /> : null}</span>
          <span>{it.label}</span>
          <kbd>{it.shortcut ? formatShortcut(it.shortcut) : ""}</kbd>
          <span className="sub-arrow" aria-hidden>{it.items ? "▶" : ""}</span>
          {it.disabled && it.reason ? <span className="why">{it.reason}</span> : null}
          {it.items && sub === i && (
            <MenuList items={it.items} onClose={onClose} label={it.label} submenu onLeft={closeSub} />
          )}
        </div>
      ))}
    </div>
  );
}

/** Application menu bar: File, Edit, Object… Each top menu is a list of MenuItems. */
export function MenuBar({ menus, label = "Main menu" }: { menus: { id: string; label: string; items: MenuItem[] }[]; label?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const barRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!barRef.current?.contains(e.target as Node)) setOpen(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const step = (dir: 1 | -1) => {
    const i = menus.findIndex((m) => m.id === open);
    setOpen(menus[(i + dir + menus.length) % menus.length].id);
  };

  return (
    <nav className="ui-menubar" aria-label={label} ref={barRef}>
      {menus.map((m) => (
        <div key={m.id} className={`ui-menu-root${open === m.id ? " open" : ""}`} onMouseEnter={() => { if (open && open !== m.id) setOpen(m.id); }}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open === m.id}
            data-menu={m.id}
            onClick={() => setOpen(open === m.id ? null : m.id)}
            onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setOpen(m.id); } }}
          >
            {m.label}
          </button>
          {open === m.id && (
            <MenuList items={m.items} label={m.label} style={{ top: "calc(100% + 4px)", left: 0 }} onClose={() => setOpen(null)} onLeft={() => step(-1)} onRight={() => step(1)} />
          )}
        </div>
      ))}
    </nav>
  );
}

/** Right-click menu at a screen position, kept inside the window. */
export function ContextMenu({ x, y, items, onClose, label }: { x: number; y: number; items: MenuItem[]; onClose: () => void; label: string }) {
  const [pos, setPos] = useState({ left: x, top: y });
  const holder = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = holder.current?.firstElementChild as HTMLElement | null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)), top: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) });
  }, [x, y]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!holder.current?.contains(e.target as Node)) onClose(); };
    const t = setTimeout(() => document.addEventListener("mousedown", close), 0);
    window.addEventListener("blur", onClose);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", close); window.removeEventListener("blur", onClose); };
  }, [onClose]);

  return (
    <div ref={holder}>
      <MenuList items={items} label={label} onClose={onClose} className="fixed" style={{ left: pos.left, top: pos.top }} />
    </div>
  );
}

/** A button that opens a menu below it (⋯ section menus, account menu). */
export function MenuButton({ label, items, children, className = "ui-icon-btn" }: { label: string; items: MenuItem[]; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={!!open}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setOpen(open ? null : { x: r.left, y: r.bottom + 4 });
        }}
      >
        {children}
      </button>
      {open && <ContextMenu x={open.x} y={open.y} items={items} label={label} onClose={() => setOpen(null)} />}
    </>
  );
}
