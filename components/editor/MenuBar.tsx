"use client";

import { lazy, Suspense, useEffect, useRef, useState, type KeyboardEvent as KeyEvent } from "react";
import { FolderOpen, Save } from "lucide-react";
import { LogoMark } from "@/components/site/LogoMark";
import { UserMenu } from "@/components/auth/UserMenu";
import { ProductTabs, type Product } from "./ControlBar";

export type MenuAction = { label: string; kbd: string; run: () => void; disabled?: boolean };
export type MenuEntry = MenuAction | "-";

const MENU_IDS = ["file", "edit", "view", "help"] as const;
const SettingsDialog = lazy(() => import("@/components/shell/SettingsDialog"));

/** Header: logo, menus, product switcher, document title, file buttons, account. */
export function MenuBar({
  title, kind, menus, product, onProduct, onSave, onOpen,
}: {
  title: string;
  kind: string;
  menus: Record<"file" | "edit" | "view" | "help", MenuEntry[]>;
  product: Product;
  onProduct: (p: Product) => void;
  onSave: () => void;
  onOpen: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [shift, setShift] = useState(0);
  const all = { ...menus, edit: [...menus.edit, "-" as const, { label: "Settings…", kbd: "Ctrl+,", run: () => setSettings(true) }] };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === ",") { e.preventDefault(); setSettings(true); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const ddRef = useRef<HTMLDivElement>(null);
  const tops = useRef<Record<string, HTMLButtonElement | null>>({});
  /** The menu was opened from the keyboard: its first item takes the focus. */
  const byKey = useRef(false);

  useEffect(() => {
    if (!open || !byKey.current) return;
    byKey.current = false;
    ddRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
  }, [open]);

  function menuKeys(e: KeyEvent, id: (typeof MENU_IDS)[number]) {
    const list = [...(ddRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    const go = (k: number) => { e.preventDefault(); list[(k + list.length) % list.length]?.focus(); };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(list.length - 1);
    else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const k = MENU_IDS.indexOf(id) + (e.key === "ArrowRight" ? 1 : MENU_IDS.length - 1);
      byKey.current = true;
      setOpen(MENU_IDS[k % MENU_IDS.length]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(null);
      tops.current[id]?.focus();
    } else if (e.key === "Tab") setOpen(null);
  }

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !ddRef.current) return;
    const r = ddRef.current.getBoundingClientRect();
    setShift(r.right > window.innerWidth - 8 ? window.innerWidth - 8 - r.right : 0);
  }, [open]);

  return (
    <header className="menubar">
      <a className="logo" href="/" aria-label="HingeLab home">
        <LogoMark size={26} />
        HingeLab
      </a>
      <nav className="menus" aria-label="Main menu">
        {MENU_IDS.map((id) => (
          <div
            className={`menu${open === id ? " open" : ""}`}
            key={id}
            onMouseEnter={() => { if (open && open !== id) setOpen(id); }}
          >
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={open === id}
              ref={(el) => { tops.current[id] = el; }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") byKey.current = true;
                else if (e.key === "ArrowDown") { e.preventDefault(); byKey.current = true; setOpen(id); }
              }}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(open === id ? null : id);
              }}
            >
              {id[0].toUpperCase() + id.slice(1)}
            </button>
            {open === id && (
              <div className="dropdown" role="menu" aria-label={id[0].toUpperCase() + id.slice(1)} ref={ddRef} style={shift ? { left: shift } : undefined} onKeyDown={(e) => menuKeys(e, id)}>
                {all[id].map((item, i) => item === "-" ? <hr key={i} /> : (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => { setOpen(null); item.run(); }}
                  >
                    <span>{item.label}</span><kbd>{item.kbd}</kbd>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
      <div className="hdr-center"><ProductTabs product={product} onProduct={onProduct} /></div>
      <div className="doc-title">{title ? <><b>{title}</b> · {kind}</> : null}</div>
      <div className="hdr-tools">
        <button type="button" className="hdr-btn" aria-label="Open project" title="Open project (Ctrl+O)" onClick={onOpen}><FolderOpen size={17} /></button>
        <button type="button" className="hdr-btn" aria-label="Save project" title="Save project (Ctrl+S)" onClick={onSave}><Save size={17} /></button>
      </div>
      <UserMenu />
      {settings && <Suspense fallback={null}><SettingsDialog onClose={() => setSettings(false)} /></Suspense>}
    </header>
  );
}
