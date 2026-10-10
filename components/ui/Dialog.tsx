"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Modal dialog: focus moves in and is trapped, Esc and the × close it, focus returns afterwards. */
export function Dialog({ open, title, onClose, children, footer, size, sheet, testId, closeLabel = "Close" }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode;
  size?: "wide" | "narrow"; sheet?: boolean; testId?: string; closeLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>("[autofocus], [data-autofocus]") ?? el?.querySelector<HTMLElement>(".body " + FOCUSABLE) ?? el;
    first?.focus();
    return () => { before?.focus?.(); };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className={`ui-overlay${sheet ? " ui-sheet-overlay" : ""}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={ref}
        className={`ui-dialog${size ? " " + size : ""}${sheet ? " ui-sheet" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
          if (e.key !== "Tab" || !ref.current) return;
          const f = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
          if (!f.length) return;
          const a = f[0], z = f[f.length - 1];
          if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
          else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
        }}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="ui-icon-btn" aria-label={closeLabel} onClick={onClose}><X size={16} /></button>
        </header>
        <div className="body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </div>
    </div>
  );
}

/** A side sheet (upgrade sheet, settings): a dialog that slides in from the right. */
export function Sheet(props: Omit<Parameters<typeof Dialog>[0], "sheet">) {
  return <Dialog {...props} sheet />;
}

/* ---------- Toasts ---------- */

export interface ToastInput { message: string; kind?: "info" | "success" | "danger"; action?: { label: string; run: () => void }; ms?: number }
type ToastItem = ToastInput & { id: number };

const ToastCtx = createContext<(t: ToastInput) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const push = useCallback((t: ToastInput) => {
    const id = ++seq.current;
    setList((l) => [...l.slice(-2), { ...t, id }]);
    setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), t.ms ?? (t.action ? 6000 : 3200));
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="ui-toasts" role="status" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={`ui-toast ${t.kind ?? "info"}`} data-testid="toast">
            <span className="dot" aria-hidden />
            <span>{t.message}</span>
            {t.action && <button type="button" onClick={() => { t.action!.run(); setList((l) => l.filter((x) => x.id !== t.id)); }}>{t.action.label}</button>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
