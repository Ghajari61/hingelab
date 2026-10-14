"use client";

import type { ReactNode } from "react";
import { MATERIALS, type LayerKey } from "@/lib/hinge";
import { NumberField } from "@/components/editor/NumberField";
import { LockToggle } from "./LockToggle";
import { LayersPanel } from "@/components/editor/LayersPanel";
import { Sec, type SheetProps } from "@/components/editor/PanelDock";
import { SheetSection } from "@/components/shell/SheetSection";
import { FontPicker } from "@/components/letters/FontPicker";
import type { BaseField } from "@/components/editor/fields";
import type { Units } from "@/components/editor/format";
import { cleanFit } from "@/lib/fit/fitToSheets";
import { cleanExtras, cleanJob, GEN_LAYER_NAMES } from "@/lib/generators/output";
import { getPath, setPath } from "@/lib/generators/path";
import { Dices } from "lucide-react";
import { ImagePicker } from "./ImagePicker";
import type { TracedPicture } from "./levelsClient";
import { MAX_BATCH, MAX_BATCH_TEXT, MAX_COPIES, SHEET_EXTRAS, type AnyGenerator, type FieldSpec, type GenBase, type GenOutput, type NumberSpec } from "@/lib/generators/types";

type P = GenBase & Record<string, unknown>;

const UNIT_SUFFIX: Record<string, string> = { deg: " °", "%": " %" };

export function numberField(f: NumberSpec<P>): BaseField {
  return { id: f.key, label: f.label + (UNIT_SUFFIX[f.unit] ?? ""), len: f.unit === "mm", step: f.step, min: f.min, max: f.max, float: !f.int, help: f.help };
}

const MAT_FIELDS: BaseField[] = [
  { id: "T", label: "Thick", len: true, step: 0.1, min: 0.5, max: 30, mat: true },
  { id: "K", label: "Kerf", len: true, step: 0.01, min: 0, max: 1, mat: true },
];
const COPIES_FIELD: BaseField = { id: "sheet.copies", label: "Copies", step: 1, min: 1, max: MAX_COPIES };
const SHEET_FIELDS: BaseField[] = [
  { id: "bedW", label: "Bed W", len: true, step: 10, min: 50 },
  { id: "bedH", label: "Bed H", len: true, step: 10, min: 50 },
  { id: "gap", label: "Spacing", len: true, step: 0.5, min: 0 },
];

export function GeneratorDock({
  def, params, defaults, out, units, layerKeys, onSet, onApply, onMaterial, onResetSection, sheet, checks, locks,
}: {
  /** Settings Randomise design keeps (by key). */
  locks?: { has: (key: string) => boolean; toggle: (key: string) => void };
  def: AnyGenerator;
  params: P;
  defaults: P;
  out: GenOutput | null;
  units: Units;
  /** Layers the design uses. */
  layerKeys: LayerKey[];
  /** Write one setting (dot path); `record` makes it an undo step. */
  onSet: (key: string, value: unknown, record: boolean, mat?: boolean) => void;
  onApply: (next: P) => void;
  onMaterial: (id: string) => void;
  onResetSection: (title: string, keys: string[]) => void;
  sheet: SheetProps;
  checks: ReactNode;
}) {
  const lockOf = (f: FieldSpec<P>) => ((f.kind === "number" || f.kind === "choice") && f.shuffle && locks
    ? { on: locks.has(f.key), toggle: () => locks.toggle(f.key) } : undefined);
  const num = (f: BaseField, value: number, def: number, hidden = false, lock?: { on: boolean; toggle: () => void }) => (
    <NumberField
      key={f.id} field={f} value={value} defaultValue={def} units={units} label={f.label} hidden={hidden} extra={lock && <LockToggle {...lock} label={f.label} />}
      onLive={(v) => onSet(f.id, v, false, f.mat)}
      onCommit={(v) => onSet(f.id, v, true, f.mat)}
    />
  );

  const field = (f: FieldSpec<P>): ReactNode => {
    const hidden = f.show ? !f.show(params) : false;
    const value = getPath(params, f.key);
    if (f.kind === "number") return num(numberField(f), value as number, getPath(defaults, f.key) as number, hidden, lockOf(f));
    if (hidden) return null;
    if (f.kind === "toggle") {
      return (
        <label className="chk" key={f.key} title={f.help}>
          <input type="checkbox" checked={!!value} onChange={(e) => onSet(f.key, e.target.checked, true)} /> {f.label}
        </label>
      );
    }
    if (f.kind === "choice") {
      const pick = (v: string) => (f.apply ? onApply(f.apply(params, v) as P) : onSet(f.key, v, true));
      const seg = f.options.length <= 4 && f.options.every((o) => o.text.length <= 16);
      const lock = lockOf(f);
      return (
        <div className="gen-choice" key={f.key}>
          <div className="rowlabel" title={f.help}>{f.label}{lock && <LockToggle {...lock} label={f.label} />}</div>
          {seg ? (
            <div className="iconseg full" role="group" aria-label={f.label}>
              {f.options.map((o) => (
                <button key={o.v} type="button" title={o.title} aria-pressed={value === o.v} onClick={() => pick(o.v)}>{o.text}</button>
              ))}
            </div>
          ) : (
            <select className="sel" aria-label={f.label} value={String(value)} onChange={(e) => pick(e.target.value)}>
              {f.options.map((o) => <option key={o.v} value={o.v}>{o.text}</option>)}
            </select>
          )}
        </div>
      );
    }
    if (f.kind === "image") {
      return (
        <ImagePicker
          key={f.key} label={f.label} value={String(value ?? "")} color={f.color}
          onPick={(url, aspect) => onApply(setPath(setPath(params, f.key, url), f.aspectKey, aspect) as P)}
          onClear={() => onApply((f.trace ? setPath(setPath(setPath(params, f.key, ""), f.trace.levels, ""), f.trace.name, "") : setPath(params, f.key, "")) as P)}
          {...(f.trace && {
            name: String(getPath(params, f.trace.name) ?? "") || undefined,
            onTrace: (t: TracedPicture) => onApply(setPath(setPath(setPath(setPath(params, f.key, t.preview), f.aspectKey, t.aspect), f.trace!.levels, t.levels), f.trace!.name, t.name) as P),
          })}
        />
      );
    }
    if (f.kind === "font") {
      return (
        <div className="gen-font" key={f.key}>
          <div className="rowlabel">{f.label}</div>
          <FontPicker fontId={String(value)} text={f.sample?.(params) ?? "Aa"} uploads={[]} onPick={(id) => onSet(f.key, id, true)} onDelete={() => {}} />
        </div>
      );
    }
    return (
      <div className="gen-text" key={f.key}>
        <div className="rowlabel">{f.label}</div>
        {f.multiline ? (
          <textarea
            className="textin" rows={3} aria-label={f.label} placeholder={f.placeholder} spellCheck={false} maxLength={f.maxLength}
            value={String(value ?? "")}
            onChange={(e) => onSet(f.key, e.target.value, false)}
            onBlur={(e) => onSet(f.key, e.target.value, true)}
          />
        ) : (
          <input
            className="textin" type="text" aria-label={f.label} placeholder={f.placeholder} spellCheck={false} maxLength={f.maxLength}
            value={String(value ?? "")}
            onChange={(e) => onSet(f.key, e.target.value, false)}
            onBlur={(e) => onSet(f.key, e.target.value, true)}
          />
        )}
      </div>
    );
  };

  /** Number fields go two to a row; everything else takes the full width. */
  const body = (fields: FieldSpec<P>[]) => {
    const out: ReactNode[] = [];
    let run: ReactNode[] = [];
    const flush = () => { if (run.length) out.push(<div className="grid2" key={`g${out.length}`}>{run}</div>); run = []; };
    for (const f of fields) {
      if (f.kind === "choice" && f.rail) continue;
      if (f.kind === "number") {
        run.push(field(f));
        if (f.random && (!f.show || f.show(params))) {
          run.push(
            <button
              key={`${f.key}-random`} type="button" className="btn-auto gen-random" title={`New ${f.label.toLowerCase()}`}
              onClick={() => onSet(f.key, Math.floor(f.min + Math.random() * (f.max - f.min + 1)), true)}
            >
              <Dices size={15} /> Randomise
            </button>,
          );
        }
      } else { flush(); out.push(field(f)); }
    }
    flush();
    return out;
  };

  const extras = cleanExtras(params.sheet);
  const job = cleanJob(params.job);
  const batchKey = def.batch?.(params as never) ?? null;
  const layerVis = (key: LayerKey) => onSet(`layers.${key}.vis`, !params.layers[key].vis, true);
  const layerExp = (key: LayerKey, exp: boolean) => onSet(`layers.${key}.exp`, exp, true);

  return (
    <aside className="dock" aria-label="Panels">
      {def.sections.map((s) => ((s.show && !s.show(params)) || s.fields.every((f) => f.kind === "choice" && f.rail) ? null : (
        <Sec key={s.id} title={s.title} startOpen={s.open ?? true} onReset={() => onResetSection(s.title, s.fields.map((f) => f.key))}>
          {body(s.fields as FieldSpec<P>[])}
        </Sec>
      )))}
      <Sec title="Material" startOpen onReset={() => onResetSection("Material", ["material", "T", "K"])}>
        <select className="sel" aria-label="Material preset" value={params.material} onChange={(e) => onMaterial(e.target.value)}>
          {Object.entries(MATERIALS).map(([k, m]) => <option key={k} value={k}>{m.name}</option>)}
        </select>
        <div className="grid2">{MAT_FIELDS.map((f) => num(f, params[f.id as "T" | "K"], defaults[f.id as "T" | "K"]))}</div>
      </Sec>
      <Sec title="Checks" startOpen meta={out?.stats.length ? `${out.parts.length} parts` : undefined}>
        {out && out.stats.length > 0 && (
          <dl className="gen-stats">
            {out.stats.map((s) => <div key={s.label}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}
          </dl>
        )}
        {checks}
        {out?.assembly?.length ? (
          <details className="gen-assembly">
            <summary>How to put it together</summary>
            <ol>{out.assembly.map((a, i) => <li key={i}>{a}</li>)}</ol>
          </details>
        ) : null}
      </Sec>
      <Sec title="Layers" startOpen onReset={() => onResetSection("Layers", ["layers"])}>
        <LayersPanel layers={params.layers} labels={false} only={layerKeys} names={GEN_LAYER_NAMES} onVis={layerVis} onExp={layerExp} />
      </Sec>
      <Sec title="Sheet" meta={sheet.meta} onReset={() => onResetSection("Sheet", ["bedW", "bedH", "gap", "fit", "sheet", "job"])}>
        <SheetSection
          bedW={params.bedW} bedH={params.bedH} fit={cleanFit(params.fit)} info={sheet.info} size={sheet.size}
          onSheet={sheet.onSheet} onFit={sheet.onFit}
        >
          <div className="grid2">{SHEET_FIELDS.map((f) => num(f, params[f.id as "bedW"], defaults[f.id as "bedW"]))}</div>
        </SheetSection>
        <div className="grid2">{num(COPIES_FIELD, extras.copies, SHEET_EXTRAS.copies)}</div>
        <div className="gen-choice">
          <div className="rowlabel">Nesting</div>
          <div className="iconseg full" role="group" aria-label="Nesting">
            <button type="button" title="Pack the parts' bounding boxes, parts upright" aria-pressed={extras.nest === "box"} onClick={() => onSet("sheet.nest", "box", true)}>By box</button>
            <button type="button" title="Pack the true shapes, turning parts by quarter turns, so they fill each other's notches and holes" aria-pressed={extras.nest === "outline"} onClick={() => onSet("sheet.nest", "outline", true)}>By outline</button>
          </div>
        </div>
        <label className="chk" title="A scored 100 mm scale and a 10 mm test square along the bottom of every sheet, to check the cut size and the kerf">
          <input type="checkbox" checked={extras.calibration} onChange={(e) => onSet("sheet.calibration", e.target.checked, true)} /> Calibration bar on every sheet
        </label>
        <label className="chk" title="Score each part's name on it, where it fits clear of cuts and engraving">
          <input type="checkbox" checked={extras.labels} onChange={(e) => onSet("sheet.labels", e.target.checked, true)} /> Part labels
        </label>
        <label className="chk" title="Flip every part left to right, so engraving on the back of clear acrylic reads the right way from the front">
          <input type="checkbox" checked={job.mirror} onChange={(e) => onSet("job.mirror", e.target.checked, true)} /> Mirror (engrave the back of clear acrylic)
        </label>
        {batchKey && (
          <div className="gen-text">
            <div className="rowlabel">Names, one per line</div>
            <textarea
              className="textin" rows={4} aria-label="Batch names" spellCheck={false} maxLength={MAX_BATCH_TEXT}
              placeholder={"One set of parts per line,\nwith that line as the text"}
              value={String(getPath(params, "job.names") ?? "")}
              onChange={(e) => onSet("job.names", e.target.value, false)}
              onBlur={(e) => onSet("job.names", e.target.value, true)}
            />
            {job.names.length > 0 && <p className="note">{job.names.length} set{job.names.length > 1 ? "s" : ""}, one per line (up to {MAX_BATCH}).</p>}
          </div>
        )}
        <p className="note">{def.scale ? "Fit to sheets scales the design; holes for hardware keep their size." : "Parts are packed at their real size."}</p>
      </Sec>
    </aside>
  );
}
