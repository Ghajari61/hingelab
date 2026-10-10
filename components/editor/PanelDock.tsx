"use client";

import { useRef } from "react";
import { RotateCcw } from "lucide-react";
import { DEFAULTS, MATERIALS, type Params } from "@/lib/hinge";
import { FIELDS, type NumericKey } from "./fields";
import { NumberField } from "./NumberField";
import { AnalysisPanel } from "./AnalysisPanel";
import { LayersPanel } from "./LayersPanel";
import { HingeInspector } from "./HingeInspector";
import type { CutStyle, Model } from "@/lib/hinge";
import { cleanFit, type FitSettings } from "@/lib/fit/fitToSheets";
import type { FitInfo } from "@/lib/fit/arrange";
import { SheetSection } from "@/components/shell/SheetSection";
import type { Units } from "./format";

/** What the Sheet section needs from the editor: the fit result and the two setters. */
export interface SheetProps {
  info: FitInfo | null;
  size: string | null;
  meta?: string;
  onSheet: (w: number, h: number) => void;
  onFit: (f: FitSettings) => void;
}

function Chevron() {
  return <svg className="chev" width="8" height="8" viewBox="0 0 8 8"><path d="M2 1l4 3-4 3z" fill="currentColor" /></svg>;
}

export function Sec({ title, meta, startOpen, onReset, children }: {
  title: string;
  meta?: string;
  startOpen?: boolean;
  /** Shows a reset icon on the header that restores this section's defaults. */
  onReset?: () => void;
  children: React.ReactNode;
}) {
  const init = useRef(false);
  return (
    <details
      className="sec"
      ref={(el) => {
        if (el && startOpen && !init.current) {
          el.open = true;
          init.current = true;
        }
      }}
    >
      <summary>
        <Chevron />
        {title}
        {meta ? <span className="sum-meta">{meta}</span> : null}
        {onReset && (
          <button
            type="button" className="sec-rst" aria-label={`Reset ${title} section`} title={`Reset ${title} to defaults`}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onReset(); }}
          ><RotateCcw size={13} /></button>
        )}
      </summary>
      <div className="sec-body">{children}</div>
    </details>
  );
}

export function PanelDock({
  params, model, error, units, dimsMeta, patMeta,
  onLive, onCommit, onMaterial, onSplit, onCutStyle, onAutoFit, onTestStrip,
  onVis, onExp, onLabels, onResetSection, sheet,
}: {
  params: Params;
  model: Model | null;
  error: string | null;
  units: Units;
  dimsMeta: string;
  patMeta: string;
  onLive: (id: NumericKey, v: number, mat?: boolean) => void;
  onCommit: (id: NumericKey, v: number, mat?: boolean) => void;
  onMaterial: (id: string) => void;
  onSplit: (n: number) => void;
  onCutStyle: (v: CutStyle) => void;
  onAutoFit: () => void;
  onTestStrip: (on: boolean) => void;
  onVis: (key: keyof Params["layers"]) => void;
  onExp: (key: keyof Params["layers"], exp: boolean) => void;
  onLabels: (on: boolean) => void;
  onResetSection: (title: string, keys: (keyof Params)[]) => void;
  sheet: SheetProps;
}) {
  const fields = (sec: (typeof FIELDS)[number]["sec"]) => FIELDS.filter((f) => f.sec === sec).map((f) => (
    <NumberField
      key={f.id}
      field={f}
      value={params[f.id]}
      defaultValue={DEFAULTS[f.id]}
      units={units}
      label={f.lab ? f.lab(params) : f.label}
      hidden={f.show ? !f.show(params) : false}
      onLive={(v) => onLive(f.id, v, f.mat)}
      onCommit={(v) => onCommit(f.id, v, f.mat)}
    />
  ));
  return (
    <aside className="dock" aria-label="Panels">
      <Sec title="Dimensions" meta={dimsMeta} startOpen onReset={() => onResetSection("Dimensions", ["W", "D", "H", "R", "sides", "dia", "cylFlats"])}>

        <div className="grid2">{fields("secDims")}</div>
      </Sec>
      <Sec title="Material" startOpen onReset={() => onResetSection("Material", ["material", "T", "K"])}>
        <select className="sel" aria-label="Material preset" value={params.material} onChange={(e) => onMaterial(e.target.value)}>
          {Object.entries(MATERIALS).map(([k, m]) => <option key={k} value={k}>{m.name}</option>)}
        </select>
        <div className="grid2">{fields("secMat")}</div>
      </Sec>
      <Sec title="Hinge Pattern" meta={patMeta} startOpen onReset={() => onResetSection("Hinge pattern", ["pattern", "cutStyle", "slotW", "slit", "bridge", "pitch", "overrun", "stretch"])}>
        <div className="rowlabel">Cut style</div>
        <div className="iconseg" id="cutSeg" role="group" aria-label="Cut style">
          <button type="button" data-v="slot" aria-pressed={params.cutStyle === "slot"} onClick={() => onCutStyle("slot")} title="Each cut is a round-ended slot of set width; edge cuts become notches in the outline">
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="4" y="1" width="3" height="12" rx="1.5" /><rect x="11" y="1" width="3" height="12" rx="1.5" /></svg>Slots
          </button>
          <button type="button" data-v="line" aria-pressed={params.cutStyle === "line"} onClick={() => onCutStyle("line")} title="Each cut is a single laser line (kerf width only)">
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M5.5 1v12M12.5 1v12" /></svg>Single line
          </button>
        </div>
        <div className="grid2">{fields("secHinge")}</div>
        <button type="button" className="btn-auto" onClick={onAutoFit}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M7 1v2M7 11v2M1 7h2M11 7h2M2.8 2.8l1.4 1.4M9.8 9.8l1.4 1.4M2.8 11.2l1.4-1.4M9.8 4.2l1.4-1.4" /></svg>Auto-fit pattern to this corner
        </button>
        <HingeInspector model={model} params={params} units={units} />
        <p className="note">Drag a field label left or right to scrub its value. Hold Shift for bigger steps. Stretch shortens each hinge zone to make up for the cuts opening as the wall bends; raise it only if a test wall comes out too long.</p>
      </Sec>
      <Sec title="Bend Analysis" startOpen>
        <AnalysisPanel model={model} error={error} units={units} />
      </Sec>
      <Sec title="Joints & Fit" onReset={() => onResetSection("Joints & Fit", ["tabW", "slotClr", "lidGap", "split"])}>
        <div className="grid2">{fields("secJoints")}</div>
        <div className="rowlabel">Wall pieces</div>
        <div className="iconseg" role="group" aria-label="Wall pieces">
          <button type="button" aria-pressed={params.split === 1} onClick={() => onSplit(1)}>One strip</button>
          <button type="button" aria-pressed={params.split === 2} onClick={() => onSplit(2)}>Two halves</button>
        </div>
        <p className="note">Two halves fits long walls on small beds. Seams land in the middle of flat sides.</p>
      </Sec>
      <Sec title="Layers" startOpen onReset={() => onResetSection("Layers", ["layers", "labels"])}>
        <LayersPanel layers={params.layers} labels={params.labels} onVis={onVis} onExp={onExp} onLabels={onLabels} />
      </Sec>
      <Sec title="Sheet" meta={sheet.meta} onReset={() => onResetSection("Sheet", ["bedW", "bedH", "gap", "testStrip", "fit"])}>
        <SheetSection
          bedW={params.bedW} bedH={params.bedH} fit={cleanFit(params.fit)} info={sheet.info} size={sheet.size}
          onSheet={sheet.onSheet} onFit={sheet.onFit}
        >
          <div className="grid2">{fields("secSheet")}</div>
        </SheetSection>
        <label className="chk"><input type="checkbox" checked={!!params.testStrip} onChange={(e) => onTestStrip(e.target.checked)} /> Add a bend test strip</label>
        <p className="note">The test strip carries one corner&apos;s hinge with 15 mm of flat on each side. Cut it first to check the bend in your material.</p>
      </Sec>
    </aside>
  );
}
