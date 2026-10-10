"use client";

import { useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/site/LogoMark";
import { UserMenu } from "@/components/auth/UserMenu";

export type MenuAction = { label: string; kbd: string; run: () => void; disabled?: boolean };
export type MenuEntry = MenuAction | "-";

export function MenuBar({
  title, kind, menus, onExport,
}: {
  title: string;
  kind: string;
  menus: Record<"file" | "edit" | "view" | "help", MenuEntry[]>;
  onExport: () => void;
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
      <div className="logo">
        <LogoMark />
        HingeLab
      </div>
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
      <div className="doc-title">{title ? <><b>{title}</b> · {kind}</> : null}</div>
      <button className="btn-export" type="button" onClick={onExport}>Export SVG</button>
      <UserMenu />
    </header>
  );
}
