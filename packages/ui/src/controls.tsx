"use client";

import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";

type ButtonVariant = "default" | "primary" | "brand" | "soft" | "ghost" | "danger" | "cta";

/** A text button in the shared style (`.ui-btn`); `busy` keeps its width and says so to screen readers. */
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "small" | "default" | "lg"; icon?: ReactNode; busy?: boolean }>(
  function Button({ variant = "default", size = "default", icon, busy, className, children, disabled, type = "button", ...rest }, ref) {
    const cls = ["ui-btn", variant !== "default" && variant, size !== "default" && size, busy && "is-busy", className].filter(Boolean).join(" ");
    return (
      <button ref={ref} type={type} className={cls} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
        {busy ? <span className="ui-spinner" aria-hidden /> : icon}
        {children}
      </button>
    );
  },
);

/** A labelled text input with an optional hint and error, wired for screen readers. */
export const Input = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & { label: string; hint?: string; error?: string | null; hideLabel?: boolean }>(
  function Input({ label, hint, error, hideLabel, className, ...rest }, ref) {
    const id = useId();
    const desc = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(" ") || undefined;
    return (
      <div className={`ui-field${error ? " has-error" : ""}`}>
        <label htmlFor={id} className={hideLabel ? "ui-sr" : "ui-label"}>{label}</label>
        <input ref={ref} id={id} className={`ui-text${className ? ` ${className}` : ""}`} aria-invalid={!!error || undefined} aria-describedby={desc} {...rest} />
        {hint && <p id={`${id}-hint`} className="ui-hint">{hint}</p>}
        {error && <p id={`${id}-err`} className="ui-error" role="alert">{error}</p>}
      </div>
    );
  },
);

/**
 * A panel anchored under its trigger: opens on click, closes on Escape, an outside click or the
 * trigger again, and gives focus back to the trigger.
 */
export function Popover({ open, onOpenChange, trigger, label, children, align = "start" }: {
  open: boolean; onOpenChange: (open: boolean) => void; trigger: (props: { "aria-expanded": boolean; "aria-controls": string; onClick: () => void }) => ReactNode;
  label: string; children: ReactNode; align?: "start" | "end";
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = () => {
      onOpenChange(false);
      (root.current?.querySelector("[aria-controls]") as HTMLElement | null)?.focus();
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    const down = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) onOpenChange(false); };
    document.addEventListener("keydown", key, true);
    document.addEventListener("pointerdown", down, true);
    return () => { document.removeEventListener("keydown", key, true); document.removeEventListener("pointerdown", down, true); };
  }, [open, onOpenChange]);
  return (
    <div className="ui-popover-root" ref={root}>
      {trigger({ "aria-expanded": open, "aria-controls": id, onClick: () => onOpenChange(!open) })}
      {open && <div id={id} className={`ui-popover ${align}`} role="dialog" aria-label={label}>{children}</div>}
    </div>
  );
}

/** A placeholder block while content loads (hidden from screen readers; the container says it is busy). */
export function Skeleton({ width = "100%", height = 14, radius, className }: { width?: number | string; height?: number | string; radius?: number; className?: string }) {
  return <span className={`ui-skeleton${className ? ` ${className}` : ""}`} aria-hidden style={{ width, height, borderRadius: radius }} />;
}
