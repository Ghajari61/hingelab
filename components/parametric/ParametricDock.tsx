"use client";

import { useRef } from "react";
import { MATERIALS, polyD, r3, type LayerKey } from "@/lib/hinge";
import {
  FORMULA_DEFAULTS, LIBRARY, finSpacingOf,
  type FormulaSpec, type LibraryId, type ModelUnits, type ParametricParams, type Part, type SliceResult, type WarningCode,
} from "@/lib/parametric";
import { NumberField } from "@/components/editor/NumberField";
import { LayersPanel } from "@/components/editor/LayersPanel";
import { Sec } from "@/components/editor/PanelDock";
import { fmtLen, type Units } from "@/components/editor/format";
import { PARAM_FIELDS, type ParamField, type ParamSection } from "./fields";

type Edit = (f: (q: ParametricParams) => void, record: boolean) => void;

function Choice<T extends string>({ label, value, options, onPick }: {
  label: string;
  value: T;
  options: { v: T; text: string; title?: string; disabled?: boolean }[];
  onPick: (v: T) => void;
}) {
  return (
    <>
      <div className="rowlabel">{label}</div>
      <div className="iconseg full" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.v} type="button" title={o.title} disabled={o.disabled} aria-pressed={value === o.v} onClick={() => onPick(o.v)}>{o.text}</button>
        ))}
      </div>
    </>
  );
}

const WARNING_TITLES: Partial<Record<WarningCode, string>> = {
  PART_TOO_BIG: "Larger than the sheet",
  TOO_MANY_SHEETS: "Too many sheets",
  TOO_MANY_PARTS: "Too many parts",
  NON_MANIFOLD: "Open mesh",
  NON_MANIFOLD_SECTION: "Open sections",
  MIN_FEATURE_REMOVED: "Thin detail removed",
  ISLAND_DROPPED: "Tiny pieces left out",
  SHORT_FIN_DROPPED: "Short fins left out",
  BRIDGE_ADDED: "Bridges added",
  FLOATING_PIECE: "Floating pieces",
  NO_TAB: "Pieces without a tab",
  LABEL_SKIPPED: "Labels skipped",
  SIMPLIFIED: "Model simplified",
  METHOD_NOT_READY: "Method not ready",
};
const SERIOUS: WarningCode[] = ["PART_TOO_BIG", "TOO_MANY_SHEETS", "TOO_MANY_PARTS", "NON_MANIFOLD", "FLOATING_PIECE", "METHOD_NOT_READY"];

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
  params, result, error, busy, units, selected, fileName, askUnits, onEdit, onSelect, onImport, onExportSheet, onExportZip, onGuide,
}: {
  params: ParametricParams;
  result: SliceResult | null;
  error: string | null;
  busy: boolean;
  units: Units;
  selected: string[];
  fileName: string | null;
  /** The imported model's size looks wrong in millimetres. */
  askUnits: boolean;
  onEdit: Edit;
  onSelect: (ids: string[]) => void;
  onImport: (f: File) => void;
  onExportSheet: () => void;
  onExportZip: () => void;
  onGuide: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const field = (f: ParamField) => (
    <NumberField
      key={f.id}
      field={f}
      value={f.get(params)}
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

  const groups = new Map<WarningCode, { messages: string[]; ids: string[] }>();
  for (const w of result?.warnings ?? []) {
    const g = groups.get(w.code) ?? { messages: [], ids: [] };
    g.messages.push(w.message);
    g.ids.push(...(w.partIds ?? []));
    groups.set(w.code, g);
  }
  const serious = [...groups.keys()].some((c) => SERIOUS.includes(c));
  const layerVis = (key: LayerKey) => onEdit((q) => { q.layers[key].vis = !q.layers[key].vis; }, true);
  const layerExp = (key: LayerKey, exp: boolean) => onEdit((q) => { q.layers[key].exp = exp; }, true);
  const sourceMeta = kind === "library" ? LIBRARY.find((l) => l.id === src.id)?.name : kind === "mesh" ? src.fileName : formula?.type === "revolution" ? "Turned formula" : "Surface formula";

  return (
    <aside className="dock" aria-label="Panels">
      <Sec title="Source" meta={sourceMeta} startOpen>
        <Choice label="Model from" value={kind} onPick={(v) => {
          if (v === "mesh") { if (fileName) onEdit((q) => { q.source = { kind: "mesh", fileName, units: "auto", upAxis: "Y" }; }, true); else fileRef.current?.click(); return; }
          onEdit((q) => { q.source = v === "library" ? { kind: "library", id: "abstract-head-cc0" } : structuredClone(FORMULA_DEFAULTS.heightfield); }, true);
        }} options={[
          { v: "library", text: "Library" },
          { v: "mesh", text: "3D file", title: "Import an STL, OBJ or GLB model" },
          { v: "formula", text: "Formula", title: "A surface z = f(x, y) or a turned shape r = f(h)" },
        ]} />
        {kind === "library" && (
          <select className="sel" aria-label="Library model" value={src.id} onChange={(e) => onEdit((q) => { q.source = { kind: "library", id: e.target.value as LibraryId }; }, true)}>
            {LIBRARY.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
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
              { v: "heightfield", text: "Surface z = f(x, y)", title: "A relief: height off the wall at each point" },
              { v: "revolution", text: "Turned r = f(h)", title: "A shape turned around the vertical axis" },
            ]} />
            <textarea
              className="textin mono"
              rows={2}
              aria-label="Formula"
              spellCheck={false}
              value={formula.expression}
              onChange={(e) => onEdit((q) => { if (q.source.kind === "formula") q.source.expression = e.target.value; }, false)}
              onBlur={(e) => onEdit((q) => { if (q.source.kind === "formula") q.source.expression = e.target.value; }, true)}
            />
            <div className="grid2">{fields("formula")}</div>
            <p className="note">Use {formula.type === "heightfield" ? "x and y" : "h"} in mm, pi, sin, cos, sqrt, abs, min, max, noise2, smoothstep and more.</p>
          </>
        )}
        <label className="chk">
          <input type="checkbox" checked={!!params.sourceSettings.targetSize} onChange={(e) => onEdit((q) => {
            const b = result?.bounds;
            const h = b ? b.max[1] - b.min[1] : 200;
            q.sourceSettings.targetSize = e.target.checked ? { axis: "height", value: Math.round(h) || 200 } : null;
          }, true)} /> Set the size
        </label>
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
      </Sec>

      <Sec title="Method" meta={`Parallel fins every ${fmtLen(finSpacingOf(params), units, true)}`} startOpen>
        <Choice label="Fins stacked along" value={params.parallel.axis} onPick={(a) => onEdit((q) => { q.parallel.axis = a; }, true)} options={[
          { v: "X", text: "Left to right (X)" }, { v: "Y", text: "Bottom to top (Y)" },
        ]} />
        <Choice label="Backboard" value={params.parallel.backboard} onPick={(b) => onEdit((q) => { q.parallel.backboard = b; }, true)} options={[
          { v: "plate", text: "Plate", title: "One board behind the fins, shaped like the model, with a slot for every tab" },
          { v: "slats", text: "Slats", title: "A rectangular board; every fin row continues as a plain slat across it" },
          { v: "none", text: "None", title: "Fins only, to glue to a wall or your own board" },
        ]} />
        <div className="grid2">{fields("method")}</div>
        {params.parallel.backboard === "slats" && (
          <label className="chk">
            <input type="checkbox" checked={params.parallel.fillEmptySlots} onChange={(e) => onEdit((q) => { q.parallel.fillEmptySlots = e.target.checked; }, true)} /> Fill the whole board with slats
          </label>
        )}
        <p className="note">Each fin is a slice of the model standing out of the wall. Tabs on the wall edge fit slots in the backboard.</p>
      </Sec>

      <Sec title="Material" meta={`${fmtLen(params.material.T, units, true)} · ${fmtLen(params.material.sheetW, units)} × ${fmtLen(params.material.sheetH, units)}`}>
        <select className="sel" aria-label="Material preset" value={params.material.id} onChange={(e) => {
          const m = MATERIALS[e.target.value];
          onEdit((q) => { q.material.id = e.target.value; if (m && m.T != null && m.K != null) { q.material.T = m.T; q.material.K = m.K; } }, true);
        }}>
          {Object.entries(MATERIALS).map(([k, m]) => <option key={k} value={k}>{m.name}</option>)}
        </select>
        <div className="grid2">{fields("material")}</div>
        <div className="grid2">{fields("sheet")}</div>
        <Choice label="Grain" value={params.material.grain} onPick={(g) => onEdit((q) => { q.material.grain = g; }, true)} options={[
          { v: "any", text: "Any", title: "Parts may turn to fit better" },
          { v: "along-x", text: "Along sheet width" },
          { v: "along-y", text: "Along sheet height" },
        ]} />
      </Sec>

      <Sec title="Joints & Fit">
        <div className="grid2">{fields("joints")}</div>
        <p className="note">Slots are drawn {fmtLen(params.material.T, units, true)} + slot play wide; kerf is compensated once, on export.</p>
      </Sec>

      <Sec title="Quality">
        <div className="grid2">{fields("quality")}</div>
        <p className="note">Detail thinner than the minimum would snap when cut, so it is removed and reported.</p>
      </Sec>

      <Sec title="Slice Inspector" meta={part ? part.id : undefined} startOpen>
        {part ? (
          <>
            <label className="pe-scrub">
              <span>{part.id} · {selIdx + 1} of {parts.length}</span>
              <input type="range" min={0} max={parts.length - 1} value={Math.min(selIdx, parts.length - 1)} aria-label="Part" onChange={(e) => onSelect([parts[Number(e.target.value)].id])} />
            </label>
            <PartDrawing part={part} />
            <dl className="stats">
              <dt>Kind</dt><dd>{part.kind === "backboard" ? "Backboard" : part.kind === "slat" ? "Slat" : "Fin"}</dd>
              <dt>Size</dt><dd>{fmtLen(part.shape.bbox.x1 - part.shape.bbox.x0, units, true)} × {fmtLen(part.shape.bbox.y1 - part.shape.bbox.y0, units, true)}</dd>
              {part.tabs && <><dt>Tabs</dt><dd>{part.tabs.length}</dd></>}
              {part.kind === "backboard" && <><dt>Slots</dt><dd>{part.innerCuts.length}</dd></>}
              {part.plane >= 0 && result && <><dt>Plane</dt><dd>{fmtLen(result.planes[part.plane].offset, units, true)} along {params.parallel.axis}</dd></>}
              <dt>Next to</dt><dd>{part.neighbors.join(", ") || "—"}</dd>
            </dl>
            {partWarnings.length > 0 && <ul className="issues warn">{partWarnings.map((w, k) => <li key={k}>{w.message}</li>)}</ul>}
          </>
        ) : <p className="note">{busy ? "Slicing…" : "No parts yet."}</p>}
      </Sec>

      <Sec title="Analysis" startOpen>
        {!result ? (
          error ? <div className="verdict err"><span className="dot" /><span>{error}</span></div> : <p className="note">Slicing…</p>
        ) : (
          <>
            {error && <div className="verdict err"><span className="dot" /><span>{error}</span></div>}
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
              <dt>Section method</dt><dd>{result.engine === "manifold" ? "Exact (closed solid)" : "Fallback (open mesh)"}</dd>
            </dl>
            {groups.size > 0 && (
              <>
                <p className="issues-title">To check</p>
                <ul className="pe-warnings">
                  {[...groups].map(([code, g]) => (
                    <li key={code} className={SERIOUS.includes(code) ? "warn" : undefined}>
                      <div>
                        <strong>{WARNING_TITLES[code] ?? code}</strong>
                        {g.ids.length > 0 && <button type="button" onClick={() => onSelect([...new Set(g.ids)])}>Show</button>}
                      </div>
                      <span>{g.messages.join(" ")}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </Sec>

      <Sec title="Layers & Export" startOpen>
        <LayersPanel layers={params.layers} labels={params.labels.enabled} only={["outline", "slots", "labels"]} onVis={layerVis} onExp={layerExp} onLabels={(on) => onEdit((q) => { q.labels.enabled = on; }, true)} />
        <div className="pe-export">
          <button type="button" className="btn-auto" disabled={!result?.sheets.length} onClick={onExportZip}>Export all sheets (ZIP)</button>
          <button type="button" className="btn-auto" disabled={!result?.sheets.length} onClick={onExportSheet}>Export this sheet (SVG)</button>
          <button type="button" className="btn-auto" disabled={!result?.parts.length} onClick={onGuide}>Assembly guide</button>
        </div>
      </Sec>
    </aside>
  );
}
