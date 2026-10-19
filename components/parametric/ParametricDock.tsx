"use client";

import { useRef } from "react";
import { MATERIALS, polyD, r3, type LayerKey } from "@/lib/hinge";
import {
  CLOCK_INSERTS, FORMULA_DEFAULTS, IMAGE_DEFAULTS, LEAF_CLOCK, PARAMETRIC_DEFAULTS, TEXT_DEFAULTS, finSpacingOf, mergeParametricParams,
} from "@/lib/parametric/defaults";
import { cutSpeedOf, fmtMinutes } from "@/lib/parametric/cutTime";
import { LIBRARY } from "@/lib/parametric/source/library";
import type { CurveNormalParams, FormulaSpec, LibraryId, ModelUnits, ParametricParams, Part, SliceResult, WarningCode } from "@/lib/parametric/types";
import { SHAPE_TARGETS, applyShape, contextOf } from "@/lib/parametric/shapes";
import { BUNDLED_FONTS, fontInfo } from "@/lib/letters/fontList";
import { ShapePicker } from "./ShapePicker";
import { StyleSection } from "./StyleSection";
import { RELIEF_LIBRARY } from "@/lib/parametric/source/reliefs";
import { NumberField } from "@/components/editor/NumberField";
import { LayersPanel } from "@/components/editor/LayersPanel";
import { Sec } from "@/components/editor/PanelDock";
import { CheckField, ResetMark } from "@/components/editor/ResetMark";
import { fmtLen, type Units } from "@/components/editor/format";
import { PARAM_FIELDS, hasTabs, type ParamField, type ParamSection } from "./fields";
import type { StoredModel } from "./modelStore";
import { LockIcon } from "@/components/billing/Lock";
import { IssueList } from "@/components/shell/IssueList";
import { applySafeFixes, type Fix } from "@/lib/issues";
import { SERIOUS, parametricIssues } from "@/lib/issues/parametric";
import { FREE_PARAMETRIC_PARTS, parametricLocks, type Plan } from "@/lib/plans";

type Edit = (f: (q: ParametricParams) => void, record: boolean) => void;

function Choice<T extends string>({ label, value, def, options, onPick }: {
  label: string;
  value: T;
  /** The default; a ↺ picks it while another option is chosen. */
  def?: T;
  /** `locked`: a Pro feature this plan can preview but not export. */
  options: { v: T; text: string; title?: string; disabled?: boolean; locked?: boolean }[];
  onPick: (v: T) => void;
}) {
  const home = def === undefined ? undefined : options.find((o) => o.v === def);
  return (
    <>
      <div className="rowlabel">{label}<ResetMark label={label} show={!!home && value !== def} to={home?.text} onReset={() => onPick(def!)} /></div>
      <div className="iconseg full" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.v} type="button" data-v={o.v} title={o.locked ? `${o.title ?? o.text} (Pro)` : o.title} disabled={o.disabled} aria-pressed={value === o.v} className={o.locked ? "locked" : undefined} onClick={() => onPick(o.v)}>{o.text}{o.locked && <LockIcon />}</button>
        ))}
      </div>
    </>
  );
}

const FACES = RELIEF_LIBRARY.filter((r) => r.id.endsWith("face-cc0")).map((r) => r.id);
const LIBRARY_GROUPS: [string, string[]][] = [
  ["Shapes", ["sphere", "torus", "abstract-head-cc0", "wave-panel", "ripple", "vase"]],
  ["Faces", FACES],
  ["Wall reliefs", RELIEF_LIBRARY.filter((r) => r.wall && !FACES.includes(r.id)).map((r) => r.id)],
  ["Lamps & vessels", RELIEF_LIBRARY.filter((r) => !r.wall).map((r) => r.id)],
];

const KIND_NAMES: Partial<Record<Part["kind"], string>> = {
  backboard: "Backboard", slat: "Slat", fin: "Fin", layer: "Layer", "rib-x": "Rib (A)", "rib-y": "Rib (B)", "radial-fin": "Radial fin", hub: "Hub ring", net: "Net",
};

const axisName = (n: readonly number[]) => (Math.abs(n[0]) > 0.5 ? "X" : Math.abs(n[1]) > 0.5 ? "Y" : "Z");
const onAxis = (n: readonly number[]) => Math.max(...n.map(Math.abs)) > 0.999;
/** Fins turned round an axis or a curve: their plane offset means nothing to the user. */
const fannedPart = (r: SliceResult, q: Part) => (r.method === "radial" || r.method === "curveNormal") && (q.kind === "radial-fin" || q.kind === "fin");

function guideText(g: CurveNormalParams["guide"], units: Units) {
  return g.kind === "circle" ? `a ${fmtLen(g.d, units, true)} circle` : `a ${fmtLen(g.w, units)} × ${fmtLen(g.h, units, true)} oval`;
}

function methodMeta(p: ParametricParams, units: Units, result: SliceResult | null) {
  if (p.method === "stacked") return `Layers along ${p.stacked.axis}, ${fmtLen(p.material.T, units, true)} each`;
  if (p.method === "waffle") return `Waffle ${p.waffle.familyAxes.join(" × ")}, ${fmtLen(p.waffle.spacingA, units, true)} / ${fmtLen(p.waffle.spacingB, units, true)}`;
  if (p.method === "radial") return `${p.radial.count} fins round ${p.radial.axis}`;
  if (p.method === "curveNormal") {
    const n = p.curveNormal.count ?? result?.parts.filter((q) => q.kind === "fin").length;
    return `${n ?? "Auto"} fins round ${guideText(p.curveNormal.guide, units)}`;
  }
  if (p.method === "folded") return `About ${p.folded.faces} faces${result ? ` in ${result.parts.length} net${result.parts.length === 1 ? "" : "s"}` : ""}`;
  return `Parallel fins every ${fmtLen(finSpacingOf(p), units, true)}`;
}

const FORMULA_NOTES: Record<FormulaSpec["type"], string> = {
  heightfield: "Use x and y in mm",
  revolution: "Use h in mm",
  "radial-profile": "Use theta (radians round the centre) and s (mm out from the inner radius)",
};

type Ring = readonly (readonly [number, number])[];
const ringArea = (c: Ring) => {
  let a = 0;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) a += c[j][0] * c[i][1] - c[i][0] * c[j][1];
  return Math.abs(a) / 2;
};
const ringLength = (c: Ring) => {
  let l = 0;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) l += Math.hypot(c[i][0] - c[j][0], c[i][1] - c[j][1]);
  return l;
};
/** Material area, mm²: the outline less its holes and inner cuts. */
const partArea = (q: Part) => ringArea(q.shape.outer) - [...q.shape.holes, ...q.innerCuts].reduce((s, c) => s + ringArea(c), 0);
/** Everything the laser cuts on this part, mm. */
const partCut = (q: Part) => [q.shape.outer, ...q.shape.holes, ...q.innerCuts].reduce((s, c) => s + ringLength(c), 0);

/** The part as it will be cut (sheet orientation), with its inner cuts and engraving. */
function PartDrawing({ part }: { part: Part }) {
  const { x0, y0, x1, y1 } = part.shape.bbox;
  const m = Math.max(2, (x1 - x0) * 0.03);
  return (
    <svg className="pe-part" viewBox={`${r3(x0 - m)} ${r3(y0 - m)} ${r3(x1 - x0 + 2 * m)} ${r3(y1 - y0 + 2 * m)}`} xmlns="http://www.w3.org/2000/svg" role="img" aria-label={`Outline of ${part.id}`}>
      <path d={[part.shape.outer, ...part.shape.holes].map(c => polyD(c, 0, 0)).join(" ")} fill="rgba(201,163,106,.22)" fillRule="evenodd" stroke="var(--l-outline)" vectorEffect="non-scaling-stroke" />
      {part.innerCuts.map((c, i) => <path key={i} d={polyD(c, 0, 0)} fill="none" stroke="var(--l-slots)" vectorEffect="non-scaling-stroke" />)}
      {part.engrave.map((c, i) => <path key={`e${i}`} d={`M${c.map(([x, y]) => `${r3(x)} ${r3(y)}`).join("L")}`} fill="none" stroke="var(--l-labels)" vectorEffect="non-scaling-stroke" />)}
    </svg>
  );
}

export function ParametricDock({
  params, result, error, busy, units, selected, fileName, photo, depthBusy, plan, locks, askUnits, textMissing = [], onEdit, onSelect, onImport, onImportPhoto, onUpgrade, onExportAll, onExportDXF, onExportSheet, onExportZip, onGuide, onResetSection, onBrowse,
}: {
  /** Opens the design gallery. */
  onBrowse?: () => void;
  /** Characters of a Text source that its font does not have. */
  textMissing?: string[];
  plan: Plan;
  /** Pro features this design uses that the plan does not include (preview only). */
  locks: string[];
  onUpgrade: () => void;
  params: ParametricParams;
  result: SliceResult | null;
  error: string | null;
  busy: boolean;
  units: Units;
  selected: string[];
  fileName: string | null;
  /** The photo on this device, with its depth map. */
  photo: StoredModel | null;
  depthBusy: boolean;
  /** The imported model's size looks wrong in millimetres. */
  askUnits: boolean;
  onEdit: Edit;
  onSelect: (ids: string[]) => void;
  onImport: (f: File) => void;
  onImportPhoto: (f: File) => void;
  onExportAll: () => void;
  onExportDXF: () => void;
  onExportSheet: () => void;
  onExportZip: () => void;
  onGuide: () => void;
  onResetSection: (title: string, keys: (keyof ParametricParams)[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const defaults = mergeParametricParams({
    source: params.source.kind === "formula" ? FORMULA_DEFAULTS[params.source.type]
      : params.source.kind === "image" ? { ...IMAGE_DEFAULTS, fileName: params.source.fileName }
      : params.source.kind === "text" ? TEXT_DEFAULTS : PARAMETRIC_DEFAULTS.source,
  });
  const defaultOf = (f: ParamField) => { try { return f.get(defaults); } catch { return undefined; } };
  const field = (f: ParamField) => (
    <NumberField
      key={f.id}
      field={f}
      value={f.get(params)}
      defaultValue={defaultOf(f)}
      units={units}
      label={f.label}
      hidden={f.show ? !f.show(params) : false}
      onLive={(v) => onEdit((q) => { f.set(q, v); if (f.mat) q.material.id = "custom"; }, false)}
      onCommit={(v) => onEdit((q) => { f.set(q, v); if (f.mat) q.material.id = "custom"; }, true)}
    />
  );
  const fields = (sec: ParamSection) => PARAM_FIELDS.filter((f) => f.sec === sec).map(field);
  const src = params.source;
  const kind = src.kind;
  const formula = kind === "formula" ? src : null;

  const parts = result?.parts ?? [];
  const selIdx = Math.max(0, parts.findIndex((q) => q.id === selected[0]));
  const part = parts.length ? parts[Math.min(selIdx, parts.length - 1)] : null;
  const partWarnings = part ? (result?.warnings ?? []).filter((w) => w.partIds?.includes(part.id)) : [];
  const sheetOf = part && result ? result.sheets.findIndex((s) => s.items.some((it) => it.partId === part.id)) : -1;
  const step = (d: number) => {
    if (!parts.length) return;
    const i = Math.min(parts.length - 1, Math.max(0, d === -Infinity ? 0 : d === Infinity ? parts.length - 1 : selIdx + d));
    onSelect([parts[i].id]);
  };

  const issues = parametricIssues(params, result);
  const serious = issues.some((i) => SERIOUS.includes(i.code as WarningCode));
  const applyFix = (fix: Fix<ParametricParams>) => onEdit((q) => { Object.assign(q, fix.apply(params)); }, true);
  const layerVis = (key: LayerKey) => onEdit((q) => { q.layers[key].vis = !q.layers[key].vis; }, true);
  const layerExp = (key: LayerKey, exp: boolean) => onEdit((q) => { q.layers[key].exp = exp; }, true);
  const sourceMeta = kind === "library" ? LIBRARY.find((l) => l.id === src.id)?.name : kind === "mesh" || kind === "image" ? src.fileName : kind === "text" ? `“${src.text}”` : formula?.type === "revolution" ? "Turned formula" : formula?.type === "radial-profile" ? "Radial profile formula" : "Surface formula";
  const sourceLocked = (k: string) => parametricLocks(plan, { source: { kind: k }, method: "parallel" }).length > 0;
  const speed = cutSpeedOf(params.material.id, params.material.T);
  const hubCrowd = result?.warnings.find((w) => w.code === "FINS_COLLIDE_AT_HUB")?.data;
  const cn = params.curveNormal;
  const editCurve = (f: (c: CurveNormalParams) => void, record: boolean) => onEdit((q) => f(q.curveNormal), record);

  return (
    <aside className="dock" aria-label="Panels">
      <StyleSection params={params} units={units} onEdit={onEdit} onBrowse={onBrowse} onReset={() => onResetSection("Style", [params.method])} />
      <Sec title="Source" meta={params.method === "curveNormal" ? "Formulas only" : sourceMeta} startOpen onReset={() => onResetSection("Size and rotation", ["sourceSettings"])}>
        {params.method === "curveNormal" && <p className="note">Along a curve builds the fins from the formulas in Method; the model below is not used.</p>}
        <Choice label="Model from" value={kind} onPick={(v) => {
          if (v === "mesh") { if (fileName) onEdit((q) => { q.source = { kind: "mesh", fileName, units: "auto", upAxis: "Y" }; }, true); else fileRef.current?.click(); return; }
          if (v === "image") { if (photo) onEdit((q) => { q.source = { ...structuredClone(IMAGE_DEFAULTS), fileName: photo.name }; }, true); else photoRef.current?.click(); return; }
          if (v === "text") { onEdit((q) => { q.source = structuredClone(TEXT_DEFAULTS); }, true); return; }
          onEdit((q) => { q.source = v === "library" ? { kind: "library", id: "abstract-head-cc0" } : structuredClone(FORMULA_DEFAULTS.heightfield); }, true);
        }} options={[
          { v: "library", text: "Library" },
          { v: "mesh", text: "3D file", title: "Import an STL, OBJ or GLB model", locked: sourceLocked("mesh") },
          { v: "image", text: "Photo", title: "Turn a photo into a relief using estimated depth", locked: sourceLocked("image") },
          { v: "text", text: "Text", title: "Type a letter, word or name and slice it", locked: sourceLocked("text") },
          { v: "formula", text: "Formula", title: "A surface z = f(x, y) or a turned shape r = f(h)", locked: sourceLocked("formula") },
        ]} />
        {kind === "text" && (
          <>
            <label className="pe-pick">Text
              <input className="textin" aria-label="Text" dir="auto" spellCheck={false} value={src.text}
                onChange={(e) => onEdit((q) => { if (q.source.kind === "text") q.source.text = e.target.value; }, false)}
                onBlur={(e) => onEdit((q) => { if (q.source.kind === "text") q.source.text = e.target.value; }, true)} />
            </label>
            <label className="pe-pick">Font
              <select className="sel" aria-label="Font" value={src.font} onChange={(e) => onEdit((q) => { if (q.source.kind === "text") q.source.font = e.target.value; }, true)}>
                {BUNDLED_FONTS.map((f) => <option key={f.id} value={f.id}>{f.name}{f.scripts.includes("arabic") ? " (Persian)" : ""}</option>)}
              </select>
            </label>
            {textMissing.length > 0 && (
              <p className="note warn" role="status">{fontInfo(src.font)?.name ?? "This font"} has no {textMissing.map((c) => `“${c}”`).join(" ")}. Pick a font that covers these letters.</p>
            )}
            <Choice label="Profile" value={src.profile} def={TEXT_DEFAULTS.profile} onPick={(v) => onEdit((q) => { if (q.source.kind === "text") q.source.profile = v; }, true)} options={[
              { v: "rounded", text: "Rounded", title: "Pillow letters: the fins rise from the edge to the full depth" },
              { v: "flat", text: "Flat", title: "Straight-sided letters: every fin has the full depth" },
            ]} />
            <div className="grid2">{fields("text")}</div>
          </>
        )}
        {depthBusy && <p className="note" role="status">Reading depth from the photo. The first time downloads the 27 MB depth model.</p>}
        {kind === "image" && (
          <>
            <div className="pe-file">
              <span title={src.fileName}>{src.fileName}</span>
              <button type="button" className="btn-auto" disabled={depthBusy} onClick={() => photoRef.current?.click()}>Replace…</button>
            </div>
            {photo?.preview && (
              <div className="pe-photos">
                <figure><img src={photo.preview} alt="The photo" /><figcaption>Photo</figcaption></figure>
                {photo.depthPreview && <figure><img src={photo.depthPreview} alt="Estimated depth, lighter is nearer" /><figcaption>Depth (light = near)</figcaption></figure>}
              </div>
            )}
            <div className="grid2">{fields("photo")}</div>
            <Choice label="Background" value={src.subjectMask} def={IMAGE_DEFAULTS.subjectMask} onPick={(m) => onEdit((q) => { if (q.source.kind === "image") q.source.subjectMask = m; }, true)} options={[
              { v: "auto", text: "Cut away", title: "Keep only the nearest subject; the background is left out" },
              { v: "none", text: "Keep", title: "Use the whole photo as a rectangular relief" },
            ]} />
            <CheckField label="Invert depth" checked={src.invert} def={IMAGE_DEFAULTS.invert} onChange={(on) => onEdit((q) => { if (q.source.kind === "image") q.source.invert = on; }, true)} />
            <p className="note">Depth from a single photo is an estimate: shapes read well, but faces come out softer than a 3D scan or model.</p>
          </>
        )}
        {kind === "library" && (
          <select className="sel" aria-label="Library model" value={src.id} onChange={(e) => onEdit((q) => { q.source = { kind: "library", id: e.target.value as LibraryId }; }, true)}>
            {LIBRARY_GROUPS.map(([label, ids]) => (
              <optgroup key={label} label={label}>
                {LIBRARY.filter((l) => ids.includes(l.id)).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </optgroup>
            ))}
          </select>
        )}
        {kind === "mesh" && (
          <>
            {askUnits && src.units === "auto" && result && (
              <div className="verdict warn pe-units">
                <span className="dot" />
                <span>
                  This model is {Math.round(Math.max(...[0, 1, 2].map((k) => result.bounds.max[k] - result.bounds.min[k])))} units across, which looks wrong in millimetres. It was made in
                  {(["mm", "cm", "m", "in"] as const).map((u) => (
                    <button key={u} type="button" onClick={() => onEdit((q) => { if (q.source.kind === "mesh") q.source.units = u; }, true)}>{u === "in" ? "inches" : u}</button>
                  ))}
                </span>
              </div>
            )}
            <div className="pe-file">
              <span title={src.fileName}>{src.fileName}</span>
              <button type="button" className="btn-auto" onClick={() => fileRef.current?.click()}>Replace…</button>
            </div>
            <div className="grid2">
              <label className="pe-pick">Units
                <select className="sel" aria-label="Model units" value={src.units} onChange={(e) => onEdit((q) => { if (q.source.kind === "mesh") q.source.units = e.target.value as ModelUnits; }, true)}>
                  <option value="auto">Auto</option><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option><option value="in">inches</option>
                </select>
              </label>
              <label className="pe-pick">Up axis
                <select className="sel" aria-label="Up axis" value={src.upAxis} onChange={(e) => onEdit((q) => { if (q.source.kind === "mesh") q.source.upAxis = e.target.value as "Y" | "Z"; }, true)}>
                  <option value="Y">Y up</option><option value="Z">Z up</option>
                </select>
              </label>
            </div>
          </>
        )}
        {formula && (
          <>
            <Choice<FormulaSpec["type"]> label="Formula type" value={formula.type} onPick={(t) => onEdit((q) => { q.source = structuredClone(FORMULA_DEFAULTS[t]); }, true)} options={[
              { v: "heightfield", text: "Surface", title: "A relief z = f(x, y): height off the wall at each point" },
              { v: "revolution", text: "Turned", title: "A shape r = f(h) turned around the vertical axis" },
              { v: "radial-profile", text: "Radial", title: "Height z = f(θ, s) off the wall round a centre: a sunburst profile for radial fins" },
            ]} />
            <ShapePicker
              target={formula.type}
              label={formula.type === "revolution" ? "Profile" : "Relief"}
              expression={formula.expression}
              stored={params.shapes?.[formula.type]}
              ctx={contextOf(formula)}
              units={units}
              formulaLabel="Formula"
              multiline
              note={`${FORMULA_NOTES[formula.type]}, pi, sin, cos, sqrt, abs, min, max, noise2, smoothstep and more.`}
              onShape={(s, r) => onEdit((q) => applyShape(q, formula.type, s), r)}
              onFormula={(v, r) => onEdit((q) => { if (q.source.kind === "formula") q.source.expression = v; }, r)}
            />
            <div className="grid2">{fields("formula")}</div>
          </>
        )}
        <CheckField label="Set the size" checked={!!params.sourceSettings.targetSize} def={!!defaults.sourceSettings.targetSize} onChange={(on) => onEdit((q) => {
          const b = result?.bounds;
          const h = b ? b.max[1] - b.min[1] : 200;
          q.sourceSettings.targetSize = on ? { axis: "height", value: Math.round(h) || 200 } : null;
        }, true)} />
        {params.sourceSettings.targetSize && (
          <Choice label="Size measures" value={params.sourceSettings.targetSize.axis} onPick={(a) => onEdit((q) => { if (q.sourceSettings.targetSize) q.sourceSettings.targetSize.axis = a; }, true)} options={[
            { v: "width", text: "Width" }, { v: "height", text: "Height" }, { v: "depth", text: "Depth" },
          ]} />
        )}
        <div className="grid2">{fields("transform")}</div>
        {result && (
          <p className="note">Model {fmtLen(result.bounds.max[0] - result.bounds.min[0], units, true)} wide × {fmtLen(result.bounds.max[1] - result.bounds.min[1], units, true)} high × {fmtLen(result.bounds.max[2] - Math.max(0, result.bounds.min[2]), units, true)} off the wall.</p>
        )}
        <input ref={fileRef} type="file" accept=".stl,.obj,.glb" hidden aria-label="Import model" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ""; }} />
        <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="Load photo" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportPhoto(f); e.target.value = ""; }} />
      </Sec>

      <Sec title="Method" meta={methodMeta(params, units, result)} startOpen onReset={() => onResetSection("Method settings", [params.method])}>
        {params.method === "stacked" ? (
          <>
            <Choice label="Layers stacked along" value={params.stacked.axis} def={defaults.stacked.axis} onPick={(a) => onEdit((q) => { q.stacked.axis = a; }, true)} options={[
              { v: "Y", text: "Bottom to top (Y)", title: "Horizontal layers, like a topographic model" },
              { v: "Z", text: "Out of the wall (Z)", title: "Layers parallel to the wall, a relief built up from the back" },
            ]} />
            <CheckField label="Dowel holes to line up the layers" checked={params.stacked.dowels} def={defaults.stacked.dowels} onChange={(on) => onEdit((q) => { q.stacked.dowels = on; }, true)} />
            <CheckField label="Engrave the outline of the next layer" checked={params.stacked.registrationMarks} def={defaults.stacked.registrationMarks} onChange={(on) => onEdit((q) => { q.stacked.registrationMarks = on; }, true)} />
            <CheckField label="Hollow the inside to save material" checked={params.stacked.hollow} def={defaults.stacked.hollow} onChange={(on) => onEdit((q) => { q.stacked.hollow = on; }, true)} />
            <div className="grid2">{fields("method")}</div>
            <p className="note">Each layer is one sheet thick. Glue them in order; the dowels and engraved outlines keep them aligned.</p>
          </>
        ) : params.method === "waffle" ? (
          <>
            <Choice label="Rib families" value={params.waffle.familyAxes.join("")} def={defaults.waffle.familyAxes.join("")} onPick={(v) => onEdit((q) => { q.waffle.familyAxes = v === "XY" ? ["X", "Y"] : ["X", "Z"]; }, true)} options={[
              { v: "XZ", text: "Standing grid (X × Z)", title: "Vertical ribs: an egg-crate that stands on a table" },
              { v: "XY", text: "Wall grid (X × Y)", title: "Ribs square to the wall, crossing in a grid" },
            ]} />
            <Choice label="A ribs slotted from" value={params.waffle.lapDirection} def={defaults.waffle.lapDirection} onPick={(d) => onEdit((q) => { q.waffle.lapDirection = d; }, true)} options={[
              { v: "A-from-bottom", text: "Below" }, { v: "A-from-top", text: "Above" },
            ]} />
            <div className="grid2">{fields("method")}</div>
            <p className="note">Every crossing is a half-lap: each rib is slotted half way, and the partner&apos;s id is engraved beside the slot.</p>
          </>
        ) : params.method === "radial" ? (
          <>
            <Choice label="Fins turn round" value={params.radial.axis} def={defaults.radial.axis} onPick={(a) => onEdit((q) => { q.radial.axis = a; }, true)} options={[
              { v: "Z", text: "Out of the wall (Z)", title: "A sunburst on the wall" },
              { v: "Y", text: "Upright (Y)", title: "A lamp shade or vase standing up" },
              { v: "X", text: "Sideways (X)" },
            ]} />
            <Choice label="Hub rings" value={String(params.radial.hubPlates) as "0" | "1" | "2"} def={String(defaults.radial.hubPlates) as "0" | "1" | "2"} onPick={(h) => onEdit((q) => { q.radial.hubPlates = Number(h) as 0 | 1 | 2; }, true)} options={[
              { v: "0", text: "None", title: "Glue the fins yourself" },
              { v: "1", text: "One", title: "A slotted ring at the low end of the axis" },
              { v: "2", text: "Both ends", title: "Slotted rings at both ends of the axis" },
            ]} />
            <Choice label="Fin shape from" value={params.radial.profileSource} def={defaults.radial.profileSource} onPick={(s) => onEdit((q) => {
              q.radial.profileSource = s;
              if (s === "formula" && !(q.source.kind === "formula" && q.source.type === "radial-profile")) {
                q.source = structuredClone(FORMULA_DEFAULTS["radial-profile"]);
                q.radial.axis = "Z";
              }
            }, true)} options={[
              { v: "mesh", text: "The model", title: "Slice the model through the axis" },
              { v: "formula", text: "Radial formula", title: "Draw each fin straight from a radial-profile formula, without slicing" },
            ]} />
            <div className="grid2">{fields("method")}</div>
            {hubCrowd && (
              <div className="verdict warn pe-units">
                <span className="dot" />
                <span>
                  Fins meet at the hub. Use
                  <button type="button" onClick={() => onEdit((q) => { q.radial.count = hubCrowd.maxCount; }, true)}>{hubCrowd.maxCount} fins</button>
                  or
                  <button type="button" onClick={() => onEdit((q) => { q.radial.innerRadius = Math.ceil(hubCrowd.minRadius); }, true)}>a {fmtLen(Math.ceil(hubCrowd.minRadius), units, true)} hub</button>
                </span>
              </div>
            )}
            <p className="note">Each fin is a half-plane through the axis. Its inner edge sits in the hub slots; the tick engraved on the hub marks fin R01.</p>
          </>
        ) : params.method === "curveNormal" ? (
          <>
            <button type="button" className="btn-auto" onClick={() => onEdit((q) => { q.curveNormal = structuredClone(LEAF_CLOCK); }, true)}>Load the leaf clock</button>
            <Choice label="Guide curve" value={cn.guide.kind} def={defaults.curveNormal.guide.kind} onPick={(k) => editCurve((c) => {
              const g = c.guide;
              const size = g.kind === "ellipse" ? Math.max(g.w, g.h) : g.d;
              c.guide = k === "circle" ? { kind: "circle", d: size } : { kind: "ellipse", w: size, h: Math.round(size * 0.6) };
            }, true)} options={[
              { v: "ellipse", text: "Oval" }, { v: "circle", text: "Circle" },
            ]} />
            <CheckField label="Fit as many fins as the spacing allows" checked={cn.count === null} def={defaults.curveNormal.count === null} onChange={(on) => editCurve((c) => { c.count = on ? null : 48; }, true)} />
            <div className="grid2">{fields("method")}</div>
            <ShapePicker target="finLength" label="Fin length round the curve" expression={cn.finLength} stored={params.shapes?.finLength} units={units}
              formulaLabel="Fin length L(t)" note="Use t, which runs 0 to 1 round the guide. The result is in mm."
              onShape={(s, r) => onEdit((q) => applyShape(q, "finLength", s), r)} onFormula={(v, r) => editCurve((c) => { c.finLength = v; }, r)} />
            <ShapePicker target="finHeight" label="Fin height along each fin" expression={cn.finHeight} stored={params.shapes?.finHeight} units={units}
              formulaLabel="Fin height (t, s, L)" note="Use s (mm out along the fin), L (the fin's length) and t (0 to 1 round the guide)."
              onShape={(s, r) => onEdit((q) => applyShape(q, "finHeight", s), r)} onFormula={(v, r) => editCurve((c) => { c.finHeight = v; }, r)} />
            <ShapePicker target="twist" label="Twist round the curve" expression={cn.twist} stored={params.shapes?.twist} units={units}
              formulaLabel="Twist ° (t)" note="Use t, which runs 0 to 1 round the guide. The result is in degrees, at most ±45."
              onShape={(s, r) => onEdit((q) => applyShape(q, "twist", s), r)} onFormula={(v, r) => editCurve((c) => { c.twist = v; }, r)} />
            <Choice label="Outer outline" value={cn.outerBoundary.kind} def={defaults.curveNormal.outerBoundary.kind} onPick={(k) => onEdit((q) => {
              if (k === "formula") applyShape(q, "outline", q.shapes?.outline ?? SHAPE_TARGETS.outline.defaults);
              else q.curveNormal.outerBoundary = k === "none" ? { kind: "none" } : { kind: "ellipse", w: 300, h: 220 };
            }, true)} options={[
              { v: "none", text: "None", title: "Fins keep their full length" },
              { v: "ellipse", text: "Oval", title: "Fins are cut off at an oval" },
              { v: "formula", text: "Shape", title: "Fins are cut off at a shape round the centre, such as a leaf, heart or star" },
            ]} />
            {cn.outerBoundary.kind === "formula" && (
              <ShapePicker target="outline" label="Outline" expression={cn.outerBoundary.expression} stored={params.shapes?.outline} units={units}
                formulaLabel="Outline radius r(phi)" note="Use phi, the angle round the centre in radians. The result is the radius in mm and must stay positive."
                onShape={(s, r) => onEdit((q) => applyShape(q, "outline", s), r)}
                onFormula={(v, r) => editCurve((c) => { if (c.outerBoundary.kind === "formula") c.outerBoundary.expression = v; }, r)} />
            )}
            <CheckField label="Back plate with a slot for every tab" checked={cn.backPlate} def={defaults.curveNormal.backPlate} onChange={(on) => editCurve((c) => { c.backPlate = on; }, true)} />
            {cn.backPlate && (
              <Choice label="Centre" value={cn.centerFeature} def={defaults.curveNormal.centerFeature} onPick={(f) => editCurve((c) => { c.centerFeature = f; }, true)} options={[
                { v: "clock-insert", text: "Clock", title: "A round hole for a press-fit clock insert" },
                { v: "opening", text: "Opening", title: "Cut out the inside of the guide" },
                { v: "mirror", text: "Mirror", title: "An opening 3 mm smaller than the guide, for a mirror glued behind" },
                { v: "none", text: "None" },
              ]} />
            )}
            {cn.backPlate && cn.centerFeature === "clock-insert" && (
              <label className="pe-pick">Clock insert
                <select className="sel" aria-label="Clock insert" value={cn.clockInsertDia} onChange={(e) => editCurve((c) => { c.clockInsertDia = Number(e.target.value); }, true)}>
                  {CLOCK_INSERTS.map((d) => <option key={d} value={d}>{d} mm</option>)}
                </select>
              </label>
            )}
            <p className="note">Fins stand square to the guide curve and fan out from it.</p>
          </>
        ) : params.method === "folded" ? (
          <>
            <div className="grid2">{fields("method")}</div>
            <CheckField label="Glue tabs on one side of every cut edge" checked={params.folded.tabs} def={defaults.folded.tabs} onChange={(on) => onEdit((q) => { q.folded.tabs = on; }, true)} />
            <CheckField label="Number both sides of every cut edge" checked={params.folded.numbers} def={defaults.folded.numbers} onChange={(on) => onEdit((q) => { q.folded.numbers = on; }, true)} />
            {params.material.T > 1 && (
              <div className="verdict warn pe-units">
                <span className="dot" />
                <span>
                  Folding needs card or paper.
                  <button type="button" onClick={() => onEdit((q) => { q.material = { ...q.material, id: "custom", T: 0.3, K: 0.05 }; }, true)}>Use 0.3 mm card</button>
                </span>
              </div>
            )}
            <p className="note">The model is simplified to flat faces and unfolded into nets. Solid score lines fold away from you, dashed ones toward you; the engraved side is the outside.</p>
          </>
        ) : (
          <>
            <Choice label="Fins stacked along" value={params.parallel.axis} def={defaults.parallel.axis} onPick={(a) => onEdit((q) => { q.parallel.axis = a; }, true)} options={[
              { v: "X", text: "Left to right (X)" }, { v: "Y", text: "Bottom to top (Y)" },
            ]} />
            <Choice label="Backboard" value={params.parallel.backboard} def={defaults.parallel.backboard} onPick={(b) => onEdit((q) => { q.parallel.backboard = b; }, true)} options={[
              { v: "plate", text: "Plate", title: "One board behind the fins, shaped like the model, with a slot for every tab" },
              { v: "slats", text: "Slats", title: "A rectangular board; every fin row continues as a plain slat across it" },
              { v: "none", text: "None", title: "Fins only, to glue to a wall or your own board" },
            ]} />
            <div className="grid2">{fields("method")}</div>
            {params.parallel.backboard === "slats" && (
              <CheckField label="Fill the whole board with slats" checked={params.parallel.fillEmptySlots} def={defaults.parallel.fillEmptySlots} onChange={(on) => onEdit((q) => { q.parallel.fillEmptySlots = on; }, true)} />
            )}
            <p className="note">Each fin is a slice of the model standing out of the wall. Tabs on the wall edge fit slots in the backboard.</p>
          </>
        )}
      </Sec>

      <Sec title="Material" onReset={() => onResetSection("Material", ["material"])} meta={`${fmtLen(params.material.T, units, true)} · ${fmtLen(params.material.sheetW, units)} × ${fmtLen(params.material.sheetH, units)}`}>
        <select className="sel" aria-label="Material preset" value={params.material.id} onChange={(e) => {
          const m = MATERIALS[e.target.value];
          onEdit((q) => { q.material.id = e.target.value; if (m && m.T != null && m.K != null) { q.material.T = m.T; q.material.K = m.K; } }, true);
        }}>
          {Object.entries(MATERIALS).map(([k, m]) => <option key={k} value={k}>{m.name}</option>)}
        </select>
        <div className="grid2">{fields("material")}</div>
        <div className="grid2">{fields("sheet")}</div>
        <Choice label="Grain" value={params.material.grain} def={defaults.material.grain} onPick={(g) => onEdit((q) => { q.material.grain = g; }, true)} options={[
          { v: "any", text: "Any", title: "Parts may turn to fit better" },
          { v: "along-x", text: "Along sheet width" },
          { v: "along-y", text: "Along sheet height" },
        ]} />
        {params.method !== "folded" && (
          <Choice label="Nesting" value={params.material.nest ?? "box"} def={defaults.material.nest ?? "box"} onPick={(n) => onEdit((q) => { q.material.nest = n; }, true)} options={[
            { v: "box", text: "By box", title: "Pack the parts' bounding boxes: fast, keeps parts in order" },
            { v: "outline", text: "By outline", title: "Pack the true shapes, so parts fill each other's notches and holes" },
          ]} />
        )}
        <CheckField
          label="Calibration bar on every sheet" title="A scored 100 mm scale and a 10 mm test square along the bottom of every sheet, to check the cut size and the kerf"
          checked={!!params.material.calibration} def={!!defaults.material.calibration} onChange={(on) => onEdit((q) => { q.material.calibration = on; }, true)}
        />
      </Sec>

      <Sec title="Joints & Fit" onReset={() => onResetSection("Joints & Fit", ["joints"])}>
        {hasTabs(params) && (
          <Choice label={params.method === "radial" ? "Tabs per hub joint" : "Tabs per fin"} value={params.joints.tabCount === null ? "auto" : "count"} def={defaults.joints.tabCount === null ? "auto" : "count"} onPick={(v) => onEdit((q) => {
            q.joints.tabCount = v === "auto" ? null : Math.max(...parts.filter((x) => x.tabs?.length).map((x) => x.tabs!.length), 3);
          }, true)} options={[
            { v: "auto", text: "Auto", title: "Spread tabs along each fin, one about every “Tab every” mm" },
            { v: "count", text: "Set number", title: "The same number of tabs on every fin, where they fit" },
          ]} />
        )}
        <div className="grid2">{fields("joints")}</div>
        {hasTabs(params) && <p className="note">Tabs are spread evenly along each fin&apos;s wall edge; a short edge gets fewer, so every tab keeps 2 mm to the next.</p>}
        <p className="note">Slots are drawn {fmtLen(params.material.T, units, true)} + slot play wide; kerf is compensated once, on export.</p>
      </Sec>

      <Sec title="Quality" onReset={() => onResetSection("Quality", ["quality"])}>
        <div className="grid2">{fields("quality")}</div>
        <p className="note">Detail thinner than the minimum would snap when cut, so it is removed and reported.</p>
      </Sec>

      <Sec title="Slice Inspector" meta={part ? part.id : undefined} startOpen>
        {part ? (
          <div className="pe-inspect" tabIndex={0} aria-label="Slice Inspector, use the arrow keys to step through the parts" onKeyDown={(e) => {
            const d = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "Home" ? -Infinity : e.key === "End" ? Infinity : 0;
            if (!d) return;
            e.preventDefault();
            step(d);
          }}>
            <div className="pe-inspect-nav">
              <button type="button" className="btn-auto" aria-label="Previous part" disabled={selIdx <= 0} onClick={() => step(-1)}>‹</button>
              <span>{part.id} · {selIdx + 1} of {parts.length}</span>
              <button type="button" className="btn-auto" aria-label="Next part" disabled={selIdx >= parts.length - 1} onClick={() => step(1)}>›</button>
            </div>
            <input className="pe-scrub-range" type="range" min={0} max={parts.length - 1} value={Math.min(selIdx, parts.length - 1)} aria-label="Part" onChange={(e) => onSelect([parts[Number(e.target.value)].id])} />
            <PartDrawing part={part} />
            <dl className="stats">
              <dt>Kind</dt><dd>{KIND_NAMES[part.kind] ?? part.kind}</dd>
              <dt>Size</dt><dd>{fmtLen(part.shape.bbox.x1 - part.shape.bbox.x0, units, true)} × {fmtLen(part.shape.bbox.y1 - part.shape.bbox.y0, units, true)}</dd>
              <dt>Area</dt><dd>{units === "in" ? `${(partArea(part) / 645.16).toFixed(1)} in²` : `${(partArea(part) / 100).toFixed(1)} cm²`}</dd>
              <dt>Cut length</dt><dd>{units === "in" ? `${(partCut(part) / 25.4).toFixed(1)} in` : `${(partCut(part) / 1000).toFixed(2)} m`}</dd>
              {sheetOf >= 0 && <><dt>Sheet</dt><dd>{sheetOf + 1}</dd></>}
              {part.tabs && <><dt>Tabs</dt><dd>{part.tabs.length}</dd></>}
              {(part.kind === "backboard" || part.kind === "hub") && <><dt>Slots</dt><dd>{part.innerCuts.length}</dd></>}
              {part.kind === "layer" && part.innerCuts.length > 0 && <><dt>Dowels</dt><dd>{part.innerCuts.length}</dd></>}
              {part.plane >= 0 && result && !fannedPart(result, part) && onAxis(result.planes[part.plane].normal) && <><dt>Plane</dt><dd>{fmtLen(result.planes[part.plane].offset, units, true)} along {axisName(result.planes[part.plane].normal)}</dd></>}
              <dt>Next to</dt><dd>{part.neighbors.join(", ") || "—"}</dd>
            </dl>
            {partWarnings.length > 0 && <ul className="issues warn">{partWarnings.map((w, k) => <li key={k}>{w.message}</li>)}</ul>}
          </div>
        ) : <p className="note">{busy ? "Slicing…" : "No parts yet."}</p>}
      </Sec>

      <Sec title="Analysis" startOpen>
        {!result ? (
          error ? <div className="verdict err"><span className="dot" /><span>{error}</span></div> : <p className="note">Slicing…</p>
        ) : (
          <>
            {error && <div className="verdict err"><span className="dot" /><span>{error}</span></div>}
            {locks.length > 0 && (
              <div className="verdict warn pe-pro" data-testid="pro-note">
                <span className="dot" />
                <span>
                  Pro: {locks.join(", ")}. Preview it freely; exporting needs Pro. The Free plan exports library shapes as parallel fins with up to {FREE_PARAMETRIC_PARTS} parts.
                  <button type="button" onClick={onUpgrade}>Upgrade</button>
                </span>
              </div>
            )}
            <div className={`verdict ${serious ? "warn" : "ok"}`}>
              <span className="dot" />
              <span>{serious ? `${result.stats.partCount} parts, with things to check below.` : `Ready to cut: ${result.stats.partCount} parts on ${result.stats.sheetCount} sheet${result.stats.sheetCount === 1 ? "" : "s"}.`}</span>
            </div>
            <dl className="stats">
              <dt>Parts</dt><dd>{result.stats.partCount}</dd>
              <dt>Sheets</dt><dd>{result.stats.sheetCount}</dd>
              <dt>Cut length</dt><dd>{(result.stats.cutLength / 1000).toFixed(2)} m</dd>
              <dt>Engrave length</dt><dd>{(result.stats.engraveLength / 1000).toFixed(2)} m</dd>
              <dt>Material used</dt><dd>{Math.round(result.stats.materialUsage * 100)}%</dd>
              <dt title={`Laser time at ${speed.cut} mm/s cutting${speed.passes > 1 ? ` in ${speed.passes} passes` : ""} and ${speed.engrave} mm/s scoring, the preset for this material on a 40–60 W CO2 laser`}>Cut time</dt><dd data-testid="cut-time">{fmtMinutes(result.stats.estimatedCutTime)}</dd>
              <dt>Section method</dt><dd>{result.engine === "manifold" ? "Exact (closed solid)" : "Fallback (open mesh)"}</dd>
              {result.stats.fidelity !== undefined && (
                <>
                  <dt title="How closely the parts follow the model: 100% when every surface point lies on a part">Fidelity</dt><dd data-testid="fidelity">{Math.round(result.stats.fidelity * 100)}%</dd>
                  <dt title="Average distance from the model's surface to the nearest part">Mean deviation</dt><dd>{fmtLen(result.stats.meanDeviation ?? NaN, units)}</dd>
                  <dt title="Largest distance from the model's surface to the nearest part">Max deviation</dt><dd>{fmtLen(result.stats.maxDeviation ?? NaN, units)}</dd>
                </>
              )}
            </dl>
            {result.stats.fidelity !== undefined && result.deviation && <p className="note">Fidelity compares the model with the parts at {result.deviation.values.length} surface points; turn on Deviation in the 3D view to see where they differ.</p>}
            <IssueList
              issues={issues}
              onFix={applyFix}
              onAutoFix={() => onEdit((q) => { Object.assign(q, applySafeFixes(params, issues)); }, true)}
              onShow={onSelect}
            />
          </>
        )}
      </Sec>

      <Sec title="Layers & Export" startOpen onReset={() => onResetSection("Layers", ["layers", "labels"])}>
        <LayersPanel layers={params.layers} labels={params.labels.enabled} only={params.method === "folded" || params.material.calibration ? ["outline", "slots", "hinge", "labels"] : ["outline", "slots", "labels"]} names={{ hinge: "Score lines" }} onVis={layerVis} onExp={layerExp} onLabels={(on) => onEdit((q) => { q.labels.enabled = on; }, true)} />
        <div className="pe-export">
          <button type="button" className="btn-auto" disabled={!result?.sheets.length} onClick={onExportAll}>Export all sheets (SVG)</button>
          <button type="button" className="btn-auto" disabled={!result?.sheets.length} onClick={onExportDXF}>Export all sheets (DXF)</button>
          <button type="button" className="btn-auto" disabled={!result?.sheets.length} onClick={onExportZip}>Export all sheets (ZIP)</button>
          <button type="button" className="btn-auto" disabled={!result?.sheets.length} onClick={onExportSheet}>Export this sheet (SVG)</button>
          <button type="button" className="btn-auto" disabled={!result?.parts.length} onClick={onGuide}>Assembly guide</button>
        </div>
      </Sec>
    </aside>
  );
}
