import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown, CircleHelp, Dices, ImagePlus, Lock, LockOpen, Plus, RotateCcw, Trash2, X } from "lucide-react";
import type { DField, DForm, DPicture, DProduct } from "../../../lib/desktop/types";
import { getPath, type Params } from "../design";
import { ipc } from "../ipc";
import { MAX_MY_MATERIALS, useMyMaterials, type Units } from "../local";
import { clearedPicture, pictureValues } from "../picture";

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
  /** Settings no field edits (a picked picture), as one undo step. */
  onSetValues?: (values: Params) => void;
}

export interface Locks {
  has: (key: string) => boolean;
  toggle: (key: string) => void;
}

/** A field's default in the type the design keeps it (some choices, such as the wall split, are numbers). */
export function defaultFor(f: DField, current: unknown): unknown {
  if (f.default === undefined) return f.kind === "number" && f.auto ? null : undefined;
  return f.kind === "choice" && typeof current === "number" ? Number(f.default) : f.default;
}

/** The field differs from its default. */
export function isChanged(f: DField, current: unknown): boolean {
  if (f.default === undefined) return f.kind === "number" && !!f.auto && typeof current === "number";
  if (f.kind === "toggle") return (current === true) !== f.default;
  if (f.kind === "number") return typeof current === "number" && Math.abs(current - f.default) > 1e-9;
  return String(current ?? "") !== f.default;
}

/**
 * A field's current value: its path in the settings, or the server's form for a field that has none
 * (an edit not yet built sits at the top level of the settings until the server applies it).
 */
export function valueOf(f: DField, params: Params, form: DForm | null | undefined): unknown {
  const v = getPath(params, f.key);
  return v === undefined && form?.values ? form.values[f.key] : v;
}

/** The defaults of the fields that differ from them. */
export function resetValues(fields: DField[], params: Params, form?: DForm | null): Params {
  const out: Params = {};
  for (const f of fields) {
    const v = valueOf(f, params, form);
    if (isChanged(f, v)) out[f.key] = defaultFor(f, v);
  }
  return out;
}

function shownDefault(f: DField, units: Units): string {
  if (f.kind === "toggle") return f.default ? "on" : "off";
  if (f.kind === "choice") return f.options.find((o) => o.v === f.default)?.text ?? String(f.default);
  if (f.kind === "text") return f.default ? `“${String(f.default).slice(0, 24)}”` : "empty";
  if (f.default === undefined && f.auto) return f.auto.toLowerCase();
  const inch = f.unit === "mm" && units === "in";
  const v = inch ? +(Number(f.default) / MM_PER_IN).toFixed(3) : f.default;
  return `${v}${inch ? " in" : f.unit === "deg" ? "°" : f.unit ? ` ${f.unit}` : ""}`;
}

/** The field's name, its help button, and a ↺ while it differs from its default. */
function Name({ f, value, units, onChange, locks, help, children }: { f: DField; value: unknown; units: Units; onChange: Props["onChange"]; locks?: Locks; help?: ReactNode; children: ReactNode }) {
  const on = !!locks?.has(f.key);
  return (
    <span className="field-name">
      {children}
      {help}
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
export function SettingsPanel({ product, params, form, units, plan, onChange, onChangeMany, locks, onSetValues }: Props) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const hidden = new Set(form?.hidden ?? []);
  const hiddenSections = new Set(form?.hiddenSections ?? []);
  return (
    <div className="settings" aria-label="Design settings">
      {product.sections.filter((s) => !hiddenSections.has(s.id)).map((s) => {
        const fields = s.fields.filter((f) => !hidden.has(f.key)).map((f) => (f.kind === "choice" && f.pictureOptions && onSetValues ? { ...f, options: [...f.options, ...f.pictureOptions] } : f));
        const pictures = onSetValues ? (s.pictures ?? []).filter((f) => !hidden.has(f.key)) : [];
        if (!fields.length && !pictures.length) return null;
        const material = onChangeMany ? fields.find((f) => f.key === "material" || f.key === "material.id") : undefined;
        const open = !closed[s.id];
        const back = onChangeMany ? resetValues(fields, params, form) : {};
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
                {pictures.map((f) => <PictureField key={f.key} f={f} params={params} onSetValues={onSetValues!} />)}
                {fields.map((f) => <Field key={f.key} f={f} label={form?.labels[f.key] ?? f.label} value={valueOf(f, params, form)} units={units} plan={plan} onChange={onChange} locks={locks} />)}
                {material && <MyMaterials prefix={material.key === "material.id" ? "material." : ""} params={params} units={units} onChangeMany={onChangeMany!} />}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** A picture setting: the picture (or its traced preview), Choose and Remove. */
function PictureField({ f, params, onSetValues }: { f: DPicture; params: Params; onSetValues: (values: Params) => void }) {
  const id = useId();
  const [helpBtn, helpText] = useHelp(f.help, `${id}-h`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = getPath(params, f.key);
  const shown = typeof value === "string" && value.startsWith("data:image/") ? value : "";
  const name = f.name ? String(getPath(params, f.name) ?? "") : "";
  const has = !!shown || (!!f.levels && !!getPath(params, f.levels));
  const choose = async () => {
    setError(null);
    try {
      const picked = await ipc.pickPicture();
      if (!picked) return;
      setBusy(true);
      onSetValues(await pictureValues(f, picked));
    } catch (e) {
      setError(e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "The picture could not be used.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="field picture">
      <span className="field-name"><span className="label" id={`${id}-l`}>{f.label}</span>{helpBtn}</span>
      {helpText}
      <div className="picture-row" aria-labelledby={`${id}-l`}>
        {shown ? <img src={shown} alt={name || f.label} /> : <span className="picture-empty" aria-hidden><ImagePlus size={18} /></span>}
        <span className="picture-name">{busy ? (f.mode === "trace" ? "Tracing…" : "Reading…") : name || (has ? "Picture chosen" : "No picture yet")}</span>
        <button type="button" className="btn small" disabled={busy} onClick={() => void choose()}>{has ? "Change…" : "Choose…"}</button>
        {has && (
          <button type="button" className="icon-btn" aria-label={`Remove ${f.label}`} title="Remove the picture" disabled={busy} onClick={() => onSetValues(clearedPicture(f))}>
            <X size={14} aria-hidden />
          </button>
        )}
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}

/** Sheets the user cuts often (kept on this computer): choosing one sets the thickness and kerf. */
function MyMaterials({ prefix, params, units, onChangeMany }: { prefix: string; params: Params; units: Units; onChangeMany: (values: Params) => void }) {
  const id = useId();
  const [helpBtn, helpText] = useHelp("Sheets you cut often, kept on this computer. Choosing one sets the thickness and kerf; + saves the ones you have now.", `${id}-h`);
  const [list, setList] = useMyMaterials();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const T = getPath(params, `${prefix}T`), K = getPath(params, `${prefix}K`);
  const valid = typeof T === "number" && typeof K === "number";
  const current = valid ? list.find((m) => Math.abs(m.T - T) < 1e-9 && Math.abs(m.K - K) < 1e-9) : undefined;
  const size = (v: number) => (units === "in" ? `${+(v / MM_PER_IN).toFixed(3)} in` : `${v} mm`);
  const save = () => {
    const n = name.trim().slice(0, 40);
    if (!n || !valid) return;
    setList((old) => [{ id: crypto.randomUUID(), name: n, T, K }, ...old.filter((m) => m.name !== n)].slice(0, MAX_MY_MATERIALS));
    setNaming(false);
  };
  return (
    <div className="field select my-materials">
      <span className="field-name"><label htmlFor={id}>My materials</label>{helpBtn}</span>
      {helpText}
      {naming ? (
        <form className="my-mat-row" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <input id={id} type="text" value={name} maxLength={40} placeholder="Name, for example Birch 3 mm" autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setNaming(false); }} />
          <button type="submit" className="btn small" disabled={!name.trim()}>Save</button>
          <button type="button" className="icon-btn" aria-label="Cancel" onClick={() => setNaming(false)}><X size={14} aria-hidden /></button>
        </form>
      ) : (
        <div className="my-mat-row">
          <select id={id} value={current?.id ?? ""} onChange={(e) => { const m = list.find((x) => x.id === e.target.value); if (m) onChangeMany({ [`${prefix}T`]: m.T, [`${prefix}K`]: m.K }); }}>
            <option value="" disabled>{list.length ? "Choose a material" : "None saved yet"}</option>
            {list.map((m) => <option key={m.id} value={m.id}>{m.name} ({size(m.T)}, kerf {size(m.K)})</option>)}
          </select>
          <button type="button" className="icon-btn" aria-label="Save this thickness and kerf as my material" title="Save this thickness and kerf as my material" disabled={!valid || list.length >= MAX_MY_MATERIALS} onClick={() => { setName(""); setNaming(true); }}>
            <Plus size={14} aria-hidden />
          </button>
          {current && (
            <button type="button" className="icon-btn" aria-label={`Remove ${current.name} from my materials`} title={`Remove ${current.name}`} onClick={() => setList((old) => old.filter((m) => m.id !== current.id))}>
              <Trash2 size={14} aria-hidden />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** The ? button that goes in a field's name, and the help text it opens on a row of its own. */
function useHelp(text: string | undefined, id: string): [ReactNode, ReactNode] {
  const [open, setOpen] = useState(false);
  if (!text) return [null, null];
  return [
    <button key="help" type="button" className="help-btn" aria-label="What is this?" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      <CircleHelp size={13} aria-hidden />
    </button>,
    open ? <p className="field-help" id={id}>{text}</p> : null,
  ];
}

function Field({ f, label, value, units, plan, onChange, locks }: { f: DField; label: string; value: unknown; units: Units; plan: "free" | "pro"; onChange: Props["onChange"]; locks?: Locks }) {
  const id = useId();
  const [helpBtn, helpText] = useHelp(f.help, `${id}-h`);
  if (f.kind === "number") return <NumberField f={f} label={label} value={value} units={units} onChange={onChange} locks={locks} />;
  if (f.kind === "toggle") {
    return (
      <div className="field toggle">
        <Name f={f} value={value} units={units} onChange={onChange} locks={locks} help={helpBtn}><label htmlFor={id} title={label}>{label}</label></Name>
        <button id={id} type="button" role="switch" aria-checked={!!value} className="switch" onClick={() => onChange(f.key, !value, true)}><span /></button>
        {helpText}
      </div>
    );
  }
  if (f.kind === "text") {
    return (
      <div className="field text">
        <Name f={f} value={value} units={units} onChange={onChange} locks={locks} help={helpBtn}><label htmlFor={id} title={label}>{label}</label></Name>
        {helpText}
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
        <Name f={f} value={value} units={units} onChange={onChange} locks={locks} help={helpBtn}><span className="label" id={`${id}-l`} title={label}>{label}</span></Name>
        {helpText}
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
      <Name f={f} value={value} units={units} onChange={onChange} locks={locks} help={helpBtn}><label htmlFor={id} title={label}>{label}</label></Name>
      {helpText}
      <select id={id} value={current} onChange={(e) => onChange(f.key, e.target.value, true)}>
        {f.options.map((o) => <option key={o.v} value={o.v} title={o.title}>{o.text}{locked(o.v) ? " (Pro)" : ""}</option>)}
      </select>
    </div>
  );
}

function NumberField({ f, label, value, units, onChange, locks }: { f: Extract<DField, { kind: "number" }>; label: string; value: unknown; units: Units; onChange: Props["onChange"]; locks?: Locks }) {
  const id = useId();
  const [helpBtn, helpText] = useHelp(f.help, `${id}-h`);
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
  const empty = text.trim() === "";
  const error = empty && f.auto ? null : empty || !Number.isFinite(parsed) ? "Enter a number." : parsed < lo || parsed > hi ? `Between ${lo} and ${hi}${unit ? ` ${unit}` : ""}.` : null;

  const commit = (t: string, immediate: boolean) => {
    const n = Number(t.replace(",", "."));
    if (t.trim() === "" && f.auto) {
      if (value !== null && value !== "auto") onChange(f.key, null, immediate);
      return;
    }
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

  const slide = typeof value === "number" && Number.isFinite(value) && f.max > f.min ? Math.min(f.max, Math.max(f.min, value)) : null;

  return (
    <div className={`field number${error ? " invalid" : ""}`}>
      <Name f={f} value={value} units={units} onChange={onChange} locks={locks} help={helpBtn}><label htmlFor={id} title={label}>{label}</label></Name>
      {helpText}
      <div className="num">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={text}
          placeholder={f.auto}
          title={f.auto ? `Leave empty for ${f.auto.toLowerCase()}` : undefined}
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
      {slide !== null && (
        <input
          type="range" className="num-slider" tabIndex={-1} aria-hidden min={f.min} max={f.max} step={f.step} value={slide}
          style={{ "--pct": `${((slide - f.min) / (f.max - f.min)) * 100}%` } as CSSProperties}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange(f.key, f.int ? Math.round(v) : +v.toFixed(6), false);
          }}
        />
      )}
      {error && focused && <p className="field-error" id={`${id}-e`} role="alert">{error}</p>}
    </div>
  );
}
