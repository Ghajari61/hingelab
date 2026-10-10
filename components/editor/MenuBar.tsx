"use client";

import { useEffect, useRef, useState } from "react";
import { FolderOpen, Redo2, Save, Undo2 } from "lucide-react";
import { LogoMark } from "@/components/site/LogoMark";
import { UserMenu } from "@/components/auth/UserMenu";
import { ProductTabs, type Product } from "./ControlBar";

export type MenuAction = { label: string; kbd: string; run: () => void; disabled?: boolean };
export type MenuEntry = MenuAction | "-";

/** Header: logo, menus, product switcher, document title, history and file buttons, account. */
export function MenuBar({
  title, kind, menus, product, onProduct, history, onSave, onOpen,
}: {
  title: string;
  kind: string;
  menus: Record<"file" | "edit" | "view" | "help", MenuEntry[]>;
  product: Product;
  onProduct: (p: Product) => void;
  history: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void };
  onSave: () => void;
  onOpen: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [shift, setShift] = useState(0);
  const ddRef = useRef<HTMLDivElement>(null);

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
        {(["file", "edit", "view", "help"] as const).map((id) => (
          <div
            className={`menu${open === id ? " open" : ""}`}
            key={id}
            onMouseEnter={() => { if (open && open !== id) setOpen(id); }}
          >
            <button
              type="button"
              aria-haspopup="true"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(open === id ? null : id);
              }}
            >
              {id[0].toUpperCase() + id.slice(1)}
            </button>
            {open === id && (
              <div className="dropdown" role="menu" ref={ddRef} style={shift ? { left: shift } : undefined}>
                {menus[id].map((item, i) => item === "-" ? <hr key={i} /> : (
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
        <button type="button" className="hdr-btn" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!history.canUndo} onClick={history.undo}><Undo2 size={17} /></button>
        <button type="button" className="hdr-btn" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!history.canRedo} onClick={history.redo}><Redo2 size={17} /></button>
        <span className="hdr-sep" aria-hidden />
        <button type="button" className="hdr-btn" aria-label="Open project" title="Open project (Ctrl+O)" onClick={onOpen}><FolderOpen size={17} /></button>
        <button type="button" className="hdr-btn" aria-label="Save project" title="Save project (Ctrl+S)" onClick={onSave}><Save size={17} /></button>
      </div>
      <UserMenu />
    </header>
  );
}
