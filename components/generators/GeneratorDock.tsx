"use client";

import type { ReactNode } from "react";
import type { LayerKey } from "@/lib/hinge";
import type { MaterialInfo } from "@/lib/materials/library";
import { MaterialPicker } from "@/components/shell/MaterialPicker";
import { NumberField } from "@/components/editor/NumberField";
import { LockToggle } from "./LockToggle";
import { LayersPanel } from "@/components/editor/LayersPanel";
import { Sec, type SheetProps } from "@/components/editor/PanelDock";
import { SheetSection } from "@/components/shell/SheetSection";
import { FontPicker } from "@/components/letters/FontPicker";
import type { StoredFontMeta } from "@/components/letters/fontStore";
import type { BaseField } from "@/components/editor/fields";
import type { Units } from "@/components/editor/format";
import { cleanFit } from "@/lib/fit/fitToSheets";
import { assemblySteps, cleanExtras, cleanJob, GEN_LAYER_NAMES } from "@/lib/generators/output";
import { getPath, setPath } from "@/lib/generators/path";
import { CheckField, ResetMark } from "@/components/editor/ResetMark";
import { Dices } from "lucide-react";
import { ImagePicker } from "./ImagePicker";
import type { TracedPicture } from "./levelsClient";
import { usePhotoLooks } from "./usePhotoLooks";
import { MAX_BATCH, MAX_BATCH_TEXT, MAX_COPIES, MAX_FEATURE, MAX_KERF, MAX_THICKNESS, SHEET_EXTRAS, type AnyGenerator, type FieldSpec, type GenBase, type GenOutput, type NumberSpec } from "@/lib/generators/types";
import { orderSections } from "@/lib/generators/sectionOrder";
import { genSectionStep, isAdvancedKey } from "@/lib/editor/workflow";

type P = GenBase & Record<string, unknown>;

const UNIT_SUFFIX: Record<string, string> = { deg: " °", "%": " %" };

export function numberField(f: NumberSpec<P>): BaseField {
  return { id: f.key, label: f.label + (UNIT_SUFFIX[f.unit] ?? ""), len: f.unit === "mm", step: f.step, min: f.min, max: f.max, float: !f.int, help: f.help };
}

const MAT_FIELDS: BaseField[] = [
  { id: "T", label: "Thick", len: true, step: 0.05, min: 0.1, max: MAX_THICKNESS, mat: true },
  { id: "K", label: "Kerf", len: true, step: 0.01, min: 0, max: MAX_KERF, mat: true },
];
const KERF_Y_FIELD: BaseField = { id: "sheet.kerfY", advanced: true, label: "Kerf Y", len: true, step: 0.01, min: 0, max: MAX_KERF, mat: true, help: "Kerf across cuts that run left to right, for a machine that cuts wider on one axis." };
const FEATURE_FIELD: BaseField = { id: "sheet.minFeature", advanced: true, label: "Min feature", len: true, step: 0.1, min: 0, max: MAX_FEATURE, mat: true, help: "The narrowest bar or tab your material holds; Checks warns about parts with thinner ones. 0 turns the check off." };
const COPIES_FIELD: BaseField = { id: "sheet.copies", label: "Copies", step: 1, min: 1, max: MAX_COPIES };
const SHEET_FIELDS: BaseField[] = [
  { id: "bedW", label: "Bed W", len: true, step: 10, min: 50 },
  { id: "bedH", label: "Bed H", len: true, step: 10, min: 50 },
  { id: "gap", label: "Spacing", len: true, step: 0.5, min: 0 },
];

export function GeneratorDock({
  def, params, defaults, out, units, layerKeys, onSet: setRaw, onApply, onMaterial, onResetSection, sheet, checks, locks, fonts, onBatch, simple,
}: {
  /** Only the text, font and picture fields (the phone flow). */
  simple?: boolean;
  /** Opens batch personalisation (a ZIP with files per name). */
  onBatch?: () => void;
  /** Fonts uploaded on this device. */
  fonts?: { uploads: StoredFontMeta[]; onUpload: (key: string, file: File) => void; onDelete: (id: string) => void };
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
  onMaterial: (id: string, info: MaterialInfo | null) => void;
  onResetSection: (title: string, keys: string[]) => void;
  sheet: SheetProps;
  checks: ReactNode;
}) {
  const photo = usePhotoLooks(def.sections.flatMap((s) => s.fields) as FieldSpec<P>[], params, setRaw, onApply);
  const onSet = photo.set;
  const lockOf = (f: FieldSpec<P>) => ((f.kind === "number" || f.kind === "choice" || f.kind === "toggle" || f.kind === "font") && f.shuffle && locks
    ? { on: locks.has(f.key), toggle: () => locks.toggle(f.key) } : undefined);
  const num = (f: BaseField, value: number, def: number, hidden = false, lock?: { on: boolean; toggle: () => void }) => (
    <NumberField
      // one setting can have a field per design (shown one at a time), so the label is part of the key
      key={`${f.id}:${f.label}`} field={f} value={value} defaultValue={def} units={units} label={f.label} hidden={hidden} extra={lock && <LockToggle {...lock} label={f.label} />}
      onLive={(v) => onSet(f.id, v, false, f.mat)}
      onCommit={(v) => onSet(f.id, v, true, f.mat)}
    />
  );

  const field = (f: FieldSpec<P>): ReactNode => {
    const node = fieldNode(f);
    return node && f.kind !== "number" && isAdvancedKey(def.id, f.key, f.advanced) ? <div className="adv" data-advanced key={f.key}>{node}</div> : node;
  };
  const fieldNode = (f: FieldSpec<P>): ReactNode => {
    const hidden = f.show ? !f.show(params) : false;
    const value = getPath(params, f.key);
    const dflt = getPath(defaults, f.key);
    if (f.kind === "number") return num({ ...numberField(f), advanced: isAdvancedKey(def.id, f.key, f.advanced) }, value as number, dflt as number, hidden, lockOf(f));
    if (hidden) return null;
    if (f.kind === "toggle") {
      const lock = lockOf(f);
      return <CheckField key={f.key} label={f.label} title={f.help} checked={!!value} def={dflt === undefined ? undefined : !!dflt} onChange={(on) => onSet(f.key, on, true)} extra={lock && <LockToggle {...lock} label={f.label} />} />;
    }
    if (f.kind === "choice") {
      const pick = (v: string) => (f.apply ? onApply(f.apply(params, v) as P) : onSet(f.key, v, true));
      const seg = f.options.length <= 4 && f.options.every((o) => o.text.length <= 16);
      const lock = lockOf(f);
      const home = f.options.find((o) => o.v === dflt);
      return (
        <div className="gen-choice" key={f.key}>
          <div className="rowlabel" title={f.help}>
            {f.label}{lock && <LockToggle {...lock} label={f.label} />}
            <ResetMark label={f.label} show={!!home && value !== dflt} to={home?.text} onReset={() => pick(String(dflt))} />
          </div>
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
    if (f.kind === "image" && f.look) {
      const look = f.look, st = photo.stateOf(f.key), has = !!value;
      return (
        <ImagePicker
          key={f.key} label={f.label} value={String(value ?? "")} color={f.color}
          name={String(getPath(params, look.name) ?? "") || undefined}
          working={st.working}
          onPick={() => {}}
          onFile={(file) => photo.pick({ ...f, look }, file)}
          onClear={() => photo.clear({ ...f, look })}
        >
          {has && (look.centre || look.paper) && (
            <div className="gen-photo-acts">
              {look.centre && <button type="button" className="btn-auto" disabled={!!st.working} onClick={() => void photo.centre({ ...f, look })}>Centre on the subject</button>}
              {look.paper && <button type="button" className="btn-auto" disabled={!!st.working} onClick={() => void photo.print({ ...f, look }, out, def.fileName(params as never))}>Print photo (PDF)</button>}
            </div>
          )}
          {has && st.note && <p className="note" role="status">{st.note}</p>}
          {has && st.err && <p className="note err" role="alert">{st.err}</p>}
        </ImagePicker>
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
          <div className="rowlabel">
            {f.label}{lockOf(f) && <LockToggle {...lockOf(f)!} label={f.label} />}
            <ResetMark label={f.label} show={typeof dflt === "string" && value !== dflt} onReset={() => onSet(f.key, dflt, true)} />
          </div>
          <FontPicker
            compact fontId={String(value)} text={f.sample?.(params) ?? "Aa"} uploads={fonts?.uploads ?? []} onPick={(id) => onSet(f.key, id, true)}
            onUpload={fonts && ((file) => fonts.onUpload(f.key, file))} onDelete={(id) => fonts?.onDelete(id)}
          />
        </div>
      );
    }
    return (
      <div className="gen-text" key={f.key}>
        <div className="rowlabel">
          {f.label}
          <ResetMark
            label={f.label} show={typeof dflt === "string" && value !== dflt} to={dflt ? `“${String(dflt).slice(0, 24)}”` : "empty"}
            onReset={() => onSet(f.key, dflt, true)}
          />
        </div>
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

  /**
   * Number fields go two to a row; everything else takes the full width. A picture choice also sits
   * in the left rail as cards, and its section keeps it as a list too: skipping it left sections whose
   * other settings wait on that choice (a cut-out pattern still at "None", a puzzle frame, a motif)
   * open but empty.
   */
  const body = (fields: FieldSpec<P>[]) => {
    const out: ReactNode[] = [];
    let run: ReactNode[] = [], shown = false;
    // a row whose number fields are all hidden is hidden too, or its margin leaves a gap
    const flush = () => { if (run.length) out.push(<div className="grid2" key={`g${out.length}`} hidden={!shown}>{run}</div>); run = []; shown = false; };
    for (const f of fields) {
      if (f.kind === "number") {
        run.push(field(f));
        if (!f.show || f.show(params)) shown = true;
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

  if (simple) {
    const personal = def.sections.filter((s) => !s.show || s.show(params)).flatMap((s) => s.fields as FieldSpec<P>[]).filter((f) => f.kind === "text" || f.kind === "font" || f.kind === "image");
    return (
      <div className="phone-fields">
        {personal.length ? personal.map(field) : <p className="note">This design has no text or picture to change. Sizes and the rest are in the full editor.</p>}
      </div>
    );
  }

  const extras = cleanExtras(params.sheet);
  const homeExtras = cleanExtras(defaults.sheet);
  const job = cleanJob(params.job);
  const batchKey = def.batch?.(params as never) ?? null;
  const layerVis = (key: LayerKey) => onSet(`layers.${key}.vis`, !params.layers[key].vis, true);
  const layerExp = (key: LayerKey, exp: boolean) => onSet(`layers.${key}.exp`, exp, true);

  return (
    <aside className="dock" aria-label="Panels">
      {orderSections(def.id, def.sections).map((s) => ((s.show && !s.show(params)) || s.fields.every((f) => f.kind === "choice" && f.rail) ? null : (
        <Sec key={s.id} step={genSectionStep(def.id, s.id, s.step)} title={s.title} startOpen={s.open ?? true} onReset={() => onResetSection(s.title, s.fields.map((f) => f.key))}>
          {body(s.fields as FieldSpec<P>[])}
        </Sec>
      )))}
      <Sec step="material" title="Material" startOpen onReset={() => onResetSection("Material", ["material", "T", "K", "sheet.kerfXY", "sheet.kerfY", "sheet.minFeature"])}>
        <MaterialPicker
          value={params.material} units={units} onPick={onMaterial}
          current={{ T: params.T, kx: params.K, ky: extras.kerfXY ? extras.kerfY ?? params.K : params.K, minFeature: extras.minFeature ?? 0 }}
        />
        <div className="grid2">
          {MAT_FIELDS.map((f) => num(f.id === "K" && extras.kerfXY ? { ...f, label: "Kerf X" } : f, params[f.id as "T" | "K"], defaults[f.id as "T" | "K"]))}
          {extras.kerfXY && num(KERF_Y_FIELD, extras.kerfY ?? params.K, params.K)}
          {num(FEATURE_FIELD, extras.minFeature ?? 0, 0)}
        </div>
        <div className="adv" data-advanced><CheckField
          label="Separate X and Y kerf" title="For a machine that cuts wider along one axis: cut a 20 mm square and measure it across both ways"
          checked={!!extras.kerfXY} def={!!homeExtras.kerfXY}
          onChange={(on) => onApply(setPath(setPath(params, "sheet.kerfXY", on), "sheet.kerfY", extras.kerfY ?? params.K) as P)}
        /></div>
      </Sec>
      <Sec step="validation" title="Checks" startOpen meta={out?.stats.length ? `${out.parts.length} parts` : undefined}>
        {out && out.stats.length > 0 && (
          <dl className="gen-stats">
            {out.stats.map((s) => <div key={s.label}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}
          </dl>
        )}
        {checks}
        {out && assemblySteps(out.assembly, params.gap).length ? (
          <details className="gen-assembly">
            <summary>How to put it together</summary>
            <ol>{assemblySteps(out.assembly, params.gap).map((a, i) => <li key={i}>{a}</li>)}</ol>
          </details>
        ) : null}
      </Sec>
      <Sec step="export" title="Layers" startOpen onReset={() => onResetSection("Layers", ["layers"])}>
        <LayersPanel layers={params.layers} labels={false} only={layerKeys} names={GEN_LAYER_NAMES} onVis={layerVis} onExp={layerExp} />
      </Sec>
      <Sec step="layout" title="Sheet" meta={sheet.meta} onReset={() => onResetSection("Sheet", ["bedW", "bedH", "gap", "fit", "sheet", "job"])}>
        <SheetSection
          bedW={params.bedW} bedH={params.bedH} fit={cleanFit(params.fit)} info={sheet.info} size={sheet.size} original={sheet.original} preview={sheet.preview}
          onSheet={sheet.onSheet} onFit={sheet.onFit}
        >
          <div className="grid2">{SHEET_FIELDS.map((f) => num(f, params[f.id as "bedW"], defaults[f.id as "bedW"]))}</div>
        </SheetSection>
        <div className="grid2">{num(COPIES_FIELD, extras.copies, SHEET_EXTRAS.copies)}</div>
        <div className="gen-choice">
          <div className="rowlabel">
            Nesting
            <ResetMark label="Nesting" show={extras.nest !== homeExtras.nest} to={homeExtras.nest === "box" ? "By box" : "By outline"} onReset={() => onSet("sheet.nest", homeExtras.nest, true)} />
          </div>
          <div className="iconseg full" role="group" aria-label="Nesting">
            <button type="button" title="Pack the parts' bounding boxes, parts upright" aria-pressed={extras.nest === "box"} onClick={() => onSet("sheet.nest", "box", true)}>By box</button>
            <button type="button" title="Pack the true shapes, turning parts by quarter turns, so they fill each other's notches and holes" aria-pressed={extras.nest === "outline"} onClick={() => onSet("sheet.nest", "outline", true)}>By outline</button>
          </div>
        </div>
        <CheckField
          label="Calibration bar on every sheet" title="A scored 100 mm scale and a 10 mm test square along the bottom of every sheet, to check the cut size and the kerf"
          checked={extras.calibration} def={homeExtras.calibration} onChange={(on) => onSet("sheet.calibration", on, true)}
        />
        <CheckField
          label="Part labels" title="Score each part's name on it, where it fits clear of cuts and engraving"
          checked={extras.labels} def={homeExtras.labels} onChange={(on) => onSet("sheet.labels", on, true)}
        />
        <CheckField
          label="Mirror (engrave the back of clear acrylic)" title="Flip every part left to right, so engraving on the back of clear acrylic reads the right way from the front"
          checked={job.mirror} def={cleanJob(defaults.job).mirror} onChange={(on) => onSet("job.mirror", on, true)}
        />
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
            {onBatch && (
              <button type="button" className="btn-auto" onClick={onBatch} title="One set of files per name (with optional dates and photos), downloaded as a ZIP">
                Batch files (ZIP)…
              </button>
            )}
          </div>
        )}
        <p className="note">{def.scale ? "Fit to sheets scales the design; holes for hardware keep their size." : "Parts are packed at their real size."}</p>
      </Sec>
    </aside>
  );
}
