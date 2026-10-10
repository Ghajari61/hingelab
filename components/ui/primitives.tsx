"use client";

import { useId, type ReactNode } from "react";
import { formatShortcut } from "./shortcut";

/** Tooltip: name + shortcut + one-line description (spec §9.4). Shown on hover and keyboard focus. */
export function Tooltip({ label, shortcut, description, side = "bottom", children }: {
  label: string; shortcut?: string; description?: string; side?: "right" | "bottom" | "top"; children: ReactNode;
}) {
  return (
    <span className="ui-tip-wrap">
      {children}
      <span role="tooltip" className={`ui-tip ${side}`}>
        <b>{label}</b>{shortcut ? <kbd>{formatShortcut(shortcut)}</kbd> : null}
        {description ? <span className="d">{description}</span> : null}
      </span>
    </span>
  );
}

export function IconButton({ label, shortcut, description, icon, pressed, disabled, onClick, size, side, flyout, onContextMenu, onPointerDown, onPointerUp, testId }: {
  label: string; shortcut?: string; description?: string; icon: ReactNode; pressed?: boolean; disabled?: boolean;
  onClick?: () => void; size?: "large"; side?: "right" | "bottom" | "top"; flyout?: boolean;
  onContextMenu?: (e: React.MouseEvent) => void; onPointerDown?: (e: React.PointerEvent) => void; onPointerUp?: (e: React.PointerEvent) => void;
  testId?: string;
}) {
  return (
    <Tooltip label={label} shortcut={shortcut} description={description} side={side}>
      <button
        type="button"
        className={`ui-icon-btn${size ? " " + size : ""}`}
        aria-label={label}
        aria-pressed={pressed === undefined ? undefined : pressed}
        aria-keyshortcuts={shortcut}
        disabled={disabled}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        data-testid={testId}
      >
        {icon}
        {flyout ? <span className="ui-flyout-mark" aria-hidden /> : null}
      </button>
    </Tooltip>
  );
}

export function Badge({ kind, children }: { kind: "pro" | "free" | "new"; children?: ReactNode }) {
  return <span className={`ui-badge ${kind}`}>{children ?? kind}</span>;
}

export function SegmentedControl<T extends string>({ label, options, value, onChange, full, hideLabel }: {
  label: string; options: { value: T; label: ReactNode; title?: string }[]; value: T; onChange: (v: T) => void; full?: boolean; hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <div>
      {!hideLabel && <span className="ui-label" id={id}>{label}</span>}
      <div
        className={`ui-seg${full ? " full" : ""}`}
        role="radiogroup"
        aria-labelledby={hideLabel ? undefined : id}
        aria-label={hideLabel ? label : undefined}
        onKeyDown={(e) => {
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          e.preventDefault();
          const i = options.findIndex((o) => o.value === value);
          const n = options[(i + (e.key === "ArrowRight" ? 1 : options.length - 1)) % options.length];
          onChange(n.value);
          (e.currentTarget.querySelectorAll("button")[options.indexOf(n)] as HTMLButtonElement | undefined)?.focus();
        }}
      >
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value} tabIndex={o.value === value ? 0 : -1} title={o.title} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Slider({ label, min, max, step = 1, value, onChange, format }: {
  label: string; min: number; max: number; step?: number; value: number; onChange: (v: number) => void; format?: (v: number) => string;
}) {
  const id = useId();
  return (
    <div className="ui-slider">
      <label htmlFor={id} className="ui-label" style={{ margin: 0 }}>{label}</label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <output htmlFor={id}>{format ? format(value) : value}</output>
    </div>
  );
}

export function Select<T extends string>({ label, value, options, onChange, hideLabel, testId }: {
  label: string; value: T; options: { value: T; label: string; group?: string }[]; onChange: (v: T) => void; hideLabel?: boolean; testId?: string;
}) {
  const id = useId();
  const groups = [...new Set(options.map((o) => o.group ?? ""))];
  return (
    <div style={{ display: "grid" }}>
      {!hideLabel && <label className="ui-label" htmlFor={id}>{label}</label>}
      <select id={id} className="ui-select" value={value} aria-label={hideLabel ? label : undefined} onChange={(e) => onChange(e.target.value as T)} data-testid={testId}>
        {groups.map((g) => g
          ? <optgroup key={g} label={g}>{options.filter((o) => o.group === g).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
          : options.filter((o) => !o.group).map((o) => <option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    </div>
  );
}

export function TextField({ label, value, onChange, placeholder, autoFocus, hideLabel, onEnter, testId, maxLength = 120 }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; hideLabel?: boolean;
  onEnter?: () => void; testId?: string; maxLength?: number;
}) {
  const id = useId();
  return (
    <div style={{ display: "grid" }}>
      {!hideLabel && <label className="ui-label" htmlFor={id}>{label}</label>}
      <input
        id={id} className="ui-text" value={value} placeholder={placeholder} autoFocus={autoFocus} maxLength={maxLength}
        aria-label={hideLabel ? label : undefined} data-testid={testId}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && onEnter) { e.preventDefault(); onEnter(); } }}
      />
    </div>
  );
}

export function ColorSwatch({ color, label, selected, onClick }: { color: string; label: string; selected?: boolean; onClick?: () => void }) {
  return <button type="button" className="ui-swatch" style={{ background: color }} aria-label={label} title={label} aria-pressed={selected} onClick={onClick} />;
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: {
  tabs: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="ui-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id} type="button" role="tab" className="ui-tab" aria-selected={t.id === value} tabIndex={t.id === value ? 0 : -1}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => {
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
            const i = tabs.findIndex((x) => x.id === value);
            onChange(tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length].id);
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value, label }: { value?: number; label: string }) {
  const pct = value === undefined ? undefined : Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className={`ui-progress${pct === undefined ? " indeterminate" : ""}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <span style={pct === undefined ? undefined : { width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ui-empty">
      {icon ? <div className="ic" aria-hidden>{icon}</div> : null}
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}
