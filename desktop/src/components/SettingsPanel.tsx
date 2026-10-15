import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown, CircleHelp, Dices, Lock, LockOpen, RotateCcw } from "lucide-react";
import type { DField, DForm, DProduct } from "../../../lib/desktop/types";
import { getPath, type Params } from "../design";
import type { Units } from "../local";

const MM_PER_IN = 25.4;

interface Props {
  product: DProduct;
  params: Params;
  form: DForm | null;
  units: Units;
  plan: "free" | "pro";
  onChange: (key: string, value: unknown, immediate: boolean) => void;
  /** Several settings at once, as one undo step (a section reset). */
  onChangeMany?: (values: Params) => void;
  /** Settings Randomise keeps; shown as a lock on every field it may change. */
  locks?: Locks;
}

export interface Locks {
  has: (key: string) => boolean;
  toggle: (key: string) => void;
}

/** A field's default in the type the design keeps it (some choices, such as the wall split, are numbers). */
export function defaultFor(f: DField, current: unknown): unknown {
  if (f.default === undefined) return undefined;
  return f.kind === "choice" && typeof current === "number" ? Number(f.default) : f.default;
}

/** The field differs from its default. */
export function isChanged(f: DField, current: unknown): boolean {
  if (f.default === undefined) return false;
  if (f.kind === "toggle") return (current === true) !== f.default;
  if (f.kind === "number") return typeof current === "number" && Math.abs(current - f.default) > 1e-9;
  return String(current ?? "") !== f.default;
}

/** The defaults of the fields that differ from them. */
export function resetValues(fields: DField[], params: Params): Params {
  const out: Params = {};
  for (const f of fields) {
    const v = getPath(params, f.key);
    if (isChanged(f, v)) out[f.key] = defaultFor(f, v);
  }
  return out;
}

function shownDefault(f: DField, units: Units): string {
  if (f.kind === "toggle") return f.default ? "on" : "off";
  if (f.kind === "choice") return f.options.find((o) => o.v === f.default)?.text ?? String(f.default);
  if (f.kind === "text") return f.default ? `“${String(f.default).slice(0, 24)}”` : "empty";
  const inch = f.unit === "mm" && units === "in";
  const v = inch ? +(Number(f.default) / MM_PER_IN).toFixed(3) : f.default;
  return `${v}${inch ? " in" : f.unit === "deg" ? "°" : f.unit ? ` ${f.unit}` : ""}`;
}

/** The field's name, with a ↺ while it differs from its default. */
function Name({ f, value, units, onChange, locks, children }: { f: DField; value: unknown; units: Units; onChange: Props["onChange"]; locks?: Locks; children: ReactNode }) {
  const on = !!locks?.has(f.key);
  return (
    <span className="field-name">
      {children}
      {locks && f.kind !== "text" && f.shuffle && (
        <button type="button" className={`lock-btn${on ? " on" : ""}`} aria-pressed={on} aria-label={`${on ? "Unlock" : "Lock"} ${f.label}`} title={on ? `${f.label} stays when you randomise. Click to unlock.` : `Lock ${f.label} so Randomise keeps it`} onClick={() => locks.toggle(f.key)}>
          {on ? <Lock size={12} aria-hidden /> : <LockOpen size={12} aria-hidden />}
        </button>
      )}
      {isChanged(f, value) && (
        <button type="button" className="reset-btn" aria-label={`Reset ${f.label}`} title={`Reset to ${shownDefault(f, units)}`} onClick={() => onChange(f.key, defaultFor(f, value), true)}>
          <RotateCcw size={12} aria-hidden />
        </button>
      )}
    </span>
  );
}

/** Settings grouped as the server describes them; hidden fields follow the server's form state. */
export function SettingsPanel({ product, params, form, units, plan, onChange, onChangeMany, locks }: Props) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const hidden = new Set(form?.hidden ?? []);
  const hiddenSections = new Set(form?.hiddenSections ?? []);
  return (
    <div className="settings" aria-label="Design settings">
      {product.sections.filter((s) => !hiddenSections.has(s.id)).map((s) => {
        const fields = s.fields.filter((f) => !hidden.has(f.key));
        if (!fields.length) return null;
        const open = !closed[s.id];
        const back = onChangeMany ? resetValues(fields, params) : {};
        const changed = Object.keys(back).length > 0;
        return (
          <section key={s.id} className="group">
            <h3>
              <button type="button" aria-expanded={open} onClick={() => setClosed((c) => ({ ...c, [s.id]: open }))}>
                <ChevronDown size={14} className="chev" aria-hidden />
                {s.title}
              </button>
              {changed && (
                <button type="button" className="reset-btn sec-reset" aria-label={`Reset ${s.title}`} title={`Reset ${s.title} to the defaults`} onClick={() => onChangeMany?.(back)}>
                  <RotateCcw size={13} aria-hidden />
                </button>
              )}
            </h3>
            {open && (
              <div className="fields">
                {fields.map((f) => <Field key={f.key} f={f} label={form?.labels[f.key] ?? f.label} value={getPath(params, f.key)} units={units} plan={plan} onChange={onChange} locks={locks} />)}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Help({ text, id }: { text?: string; id: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <>
      <button type="button" className="help-btn" aria-label="What is this?" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <CircleHelp size={13} aria-hidden />
      </button>
      {open && <p className="field-help" id={id}>{text}</p>}
    </>
  );
}

function Field({ f, label, value, units, plan, onChange, locks }: { f: DField; label: string; value: unknown; units: Units; plan: "free" | "pro"; onChange: Props["onChange"]; locks?: Locks }) {
  const id = useId();
  if (f.kind === "number") return <NumberField f={f} label={label} value={value} units={units} onChange={onChange} locks={locks} />;
  if (f.kind === "toggle") {
    return (
      <div className="field toggle">
        <Name f={f} value={value} units={units} onChange={onChange} locks={locks}><label htmlFor={id}>{label}</label></Name>
        <Help text={f.help} id={`${id}-h`} />
        <button id={id} type="button" role="switch" aria-checked={!!value} className="switch" onClick={() => onChange(f.key, !value, true)}><span /></button>
      </div>
    );
  }
  if (f.kind === "text") {
    return (
      <div className="field text">
        <Name f={f} value={value} units={units} onChange={onChange} locks={locks}><label htmlFor={id}>{label}</label></Name>
        <Help text={f.help} id={`${id}-h`} />
        {f.multiline
          ? <textarea id={id} value={String(value ?? "")} maxLength={f.maxLength} placeholder={f.placeholder} rows={3} onChange={(e) => onChange(f.key, e.target.value, false)} />
          : <input id={id} type="text" value={String(value ?? "")} maxLength={f.maxLength} placeholder={f.placeholder} onChange={(e) => onChange(f.key, e.target.value, false)} />}
      </div>
    );
  }
  const current = String(value ?? "");
  const short = f.options.length <= 4 && f.options.every((o) => o.text.length <= 14);
  const locked = (v: string) => plan !== "pro" && f.options.some((o) => o.v === v && o.pro);
  if (short) {
    return (
      <div className="field choice">
        <Name f={f} value={value} units={units} onChange={onChange} locks={locks}><span className="label" id={`${id}-l`}>{label}</span></Name>
        <Help text={f.help} id={`${id}-h`} />
        <div className="segmented" role="radiogroup" aria-labelledby={`${id}-l`}>
          {f.options.map((o) => (
            <button key={o.v} type="button" role="radio" aria-checked={current === o.v} title={o.title} onClick={() => onChange(f.key, o.v, true)}>
              {o.text}{locked(o.v) && <Lock size={10} className="pro-lock" aria-label="Pro" />}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="field select">
      <Name f={f} value={value} units={units} onChange={onChange} locks={locks}><label htmlFor={id}>{label}</label></Name>
      <Help text={f.help} id={`${id}-h`} />
      <select id={id} value={current} onChange={(e) => onChange(f.key, e.target.value, true)}>
        {f.options.map((o) => <option key={o.v} value={o.v} title={o.title}>{o.text}{locked(o.v) ? " (Pro)" : ""}</option>)}
      </select>
    </div>
  );
}

function NumberField({ f, label, value, units, onChange, locks }: { f: Extract<DField, { kind: "number" }>; label: string; value: unknown; units: Units; onChange: Props["onChange"]; locks?: Locks }) {
  const id = useId();
  const inch = f.unit === "mm" && units === "in";
  const k = inch ? 1 / MM_PER_IN : 1;
  const digits = inch ? 3 : f.int ? 0 : 2;
  const show = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? String(+(v * k).toFixed(digits)) : "");
  const [text, setText] = useState(show(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused, inch]);

  const unit = inch ? "in" : f.unit === "deg" ? "°" : f.unit;
  const lo = +(f.min * k).toFixed(digits);
  const hi = +(f.max * k).toFixed(digits);
  const parsed = Number(text.replace(",", "."));
  const error = text.trim() === "" || !Number.isFinite(parsed) ? "Enter a number." : parsed < lo || parsed > hi ? `Between ${lo} and ${hi}${unit ? ` ${unit}` : ""}.` : null;

  const commit = (t: string, immediate: boolean) => {
    const n = Number(t.replace(",", "."));
    if (t.trim() === "" || !Number.isFinite(n)) return;
    let mm = n / k;
    if (mm < f.min || mm > f.max) return;
    if (f.int) mm = Math.round(mm);
    onChange(f.key, +mm.toFixed(6), immediate);
  };
  const stepBy = (dir: 1 | -1) => {
    const cur = typeof value === "number" ? value : f.min;
    const next = Math.min(f.max, Math.max(f.min, +(cur + dir * f.step).toFixed(6)));
    setText(show(next));
    onChange(f.key, next, false);
  };

  return (
    <div className={`field number${error ? " invalid" : ""}`}>
      <Name f={f} value={value} units={units} onChange={onChange} locks={locks}><label htmlFor={id}>{label}</label></Name>
      <Help text={f.help} id={`${id}-h`} />
      <div className="num">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={text}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-e` : undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (error) setText(show(value));
          }}
          onChange={(e) => {
            setText(e.target.value);
            commit(e.target.value, false);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              stepBy(e.key === "ArrowUp" ? 1 : -1);
            } else if (e.key === "Enter") commit(text, true);
          }}
        />
        {unit && <span className="unit">{unit}</span>}
        {f.random && (
          <button type="button" className="icon-btn dice-btn" aria-label={`New ${f.label.toLowerCase()}`} title={`A new random ${f.label.toLowerCase()}`} onClick={() => onChange(f.key, Math.floor(f.min + Math.random() * (f.max - f.min + 1)), true)}>
            <Dices size={14} aria-hidden />
          </button>
        )}
      </div>
      {error && focused && <p className="field-error" id={`${id}-e`} role="alert">{error}</p>}
    </div>
  );
}
