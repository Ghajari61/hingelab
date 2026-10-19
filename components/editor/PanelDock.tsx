"use client";

import { useRef } from "react";
import { RotateCcw } from "lucide-react";
import { DEFAULTS, type Params } from "@/lib/hinge";
import type { MaterialInfo } from "@/lib/materials/library";
import { MaterialPicker } from "@/components/shell/MaterialPicker";
import { FIELDS, type NumericKey } from "./fields";
import { NumberField } from "./NumberField";
import { AnalysisPanel } from "./AnalysisPanel";
import { LayersPanel } from "./LayersPanel";
import { HingeInspector } from "./HingeInspector";
import type { CutStyle, Model } from "@/lib/hinge";
import { cleanFit, type FitSettings } from "@/lib/fit/fitToSheets";
import type { FitInfo } from "@/lib/fit/arrange";
import { SheetSection } from "@/components/shell/SheetSection";
import { HelpMark } from "@/components/help/HelpContext";
import { CheckField, ResetMark } from "./ResetMark";
import type { Units } from "./format";
import { applyStandardSize, insideText, STANDARD_GROUPS, STANDARD_SIZES, standardSizeOf } from "@/lib/hinge/standardSizes";
import { BASE_TEXT_FONT, BASE_TEXT_SIZE, MAX_BASE_TEXT } from "@/lib/hinge/baseText";
import { BUNDLED_FONTS } from "@/lib/letters/fontList";
import { FRET_KINDS, FRET_NAMES } from "@/lib/generators/fretwork";

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
        <HelpMark title={title} />
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

/** Lid openings: value, button text, tooltip. */
const LID_HOLES = [
  ["none", "None", "A plain lid"],
  ["finger", "Finger", "A round hole to lift the lid with a fingertip"],
  ["knob", "Knob", "A small hole for a knob's screw"],
  ["tissue", "Tissue", "A long slot to pull tissues through"],
  ["coin", "Coin", "A narrow slot for coins: a money box"],
  ["rim", "Rim", "An open top: the lid's middle is cut away, leaving a rim round the edge, as on a pen holder"],
] as const;

export function PanelDock({
  params, model, error, units, dimsMeta, patMeta,
  onLive, onCommit, onMaterial, onPatch, onStandard, textError, onSplit, onCutStyle, onAutoFit, onTestStrip,
  onVis, onExp, onLabels, onResetSection, sheet, checks,
}: {
  /** A standard size picked: the new settings and the size's name. */
  onStandard?: (next: Params, name: string) => void;
  /** The text under the box could not be shaped (font failed to load). */
  textError?: string | null;
  /** Several settings at once, as one undo step. */
  onPatch: (next: Params) => void;
  /** The checks list with its fixes (under Bend Analysis). */
  checks?: React.ReactNode;
  params: Params;
  model: Model | null;
  error: string | null;
  units: Units;
  dimsMeta: string;
  patMeta: string;
  onLive: (id: NumericKey, v: number, mat?: boolean) => void;
  onCommit: (id: NumericKey, v: number, mat?: boolean) => void;
  onMaterial: (id: string, info: MaterialInfo | null) => void;
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
      value={params[f.id] ?? f.unset?.(params) ?? 0}
      defaultValue={DEFAULTS[f.id] ?? f.unset?.(params)}
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
        <div className="rowlabel">Standard size</div>
        <select
          className="sel" aria-label="Standard size" value={standardSizeOf(params) || "custom"}
          title="Sizes for what goes inside: tissues, cards, jewellery and more. The outside size follows your material."
          onChange={(e) => { const st = STANDARD_SIZES.find((x) => x.id === e.target.value); if (st) (onStandard ?? ((n) => onPatch(n)))(applyStandardSize(params, st), st.name); }}
        >
          <option value="custom">My own size</option>
          {STANDARD_GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {STANDARD_SIZES.filter((x) => x.group === g).map((x) => <option key={x.id} value={x.id}>{x.name} ({insideText(x)})</option>)}
            </optgroup>
          ))}
        </select>
        <div className="grid2">{fields("secDims")}</div>
      </Sec>
      <Sec title="Material" startOpen onReset={() => onResetSection("Material", ["material", "T", "K", "Ky", "gamma", "minFeature"])}>
        <MaterialPicker
          value={params.material} units={units} onPick={onMaterial}
          current={{ T: params.T, kx: params.K, ky: params.Ky ?? params.K, minFeature: params.minFeature ?? 0 }}
        />
        <div className="grid2">{fields("secMat")}</div>
        <CheckField
          label="Separate X and Y kerf" title="For a machine that cuts wider along one axis: cut a 20 mm square and measure it across both ways"
          checked={params.Ky != null} def={DEFAULTS.Ky != null}
          onChange={(on) => {
            const next: Params = { ...params };
            if (on) next.Ky = params.K;
            else delete next.Ky;
            onPatch(next);
          }}
        />
      </Sec>
      <Sec title="Hinge Pattern" meta={patMeta} startOpen onReset={() => onResetSection("Hinge pattern", ["pattern", "cutStyle", "slotW", "slit", "bridge", "pitch", "overrun", "stretch"])}>
        <div className="rowlabel">Cut style<ResetMark label="Cut style" show={params.cutStyle !== DEFAULTS.cutStyle} to={DEFAULTS.cutStyle === "slot" ? "Slots" : "Single line"} onReset={() => onCutStyle(DEFAULTS.cutStyle)} /></div>
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
        {checks}
      </Sec>
      <Sec title="Joints & Fit" onReset={() => onResetSection("Joints & Fit", ["tabW", "slotClr", "lidGap", "split", "baseRing", "baseRingW", "seamFingers"])}>
        <div className="grid2">{fields("secJoints")}</div>
        <CheckField
          label="Support ring" title="A ring glued on the base, inside the wall, so the bottom of the hinge has a shoulder to sit on"
          checked={params.baseRing === true} def={false}
          onChange={(on) => { const next: Params = { ...params, baseRing: on }; if (!on) delete next.baseRingW; onPatch(next); }}
        />
        <CheckField
          label="Seam fingers" title="The two ends of the wall lock together with fingers"
          checked={params.seamFingers !== false} def={DEFAULTS.seamFingers !== false}
          onChange={(on) => onPatch({ ...params, seamFingers: on })}
        />
        <div className="rowlabel">Wall pieces<ResetMark label="Wall pieces" show={params.split !== DEFAULTS.split} to={DEFAULTS.split === 2 ? "Two halves" : "One strip"} onReset={() => onSplit(DEFAULTS.split)} /></div>
        <div className="iconseg" role="group" aria-label="Wall pieces">
          <button type="button" aria-pressed={params.split === 1} onClick={() => onSplit(1)}>One strip</button>
          <button type="button" aria-pressed={params.split === 2} onClick={() => onSplit(2)}>Two halves</button>
        </div>
        <p className="note">Two halves fits long walls on small beds. Seams land in the middle of flat sides.</p>
      </Sec>
      <Sec title="Lid" onReset={() => onResetSection("Lid", ["lidOver", "lidHole", "lidHoleD", "lidHoleW", "lidLip", "lidLipScore"])}>
        <div className="grid2">{fields("secLid")}</div>
        <div className="rowlabel">Hole<ResetMark label="Lid hole" show={(params.lidHole ?? "none") !== "none"} to="None" onReset={() => { const next: Params = { ...params }; delete next.lidHole; delete next.lidHoleD; delete next.lidHoleW; onPatch(next); }} /></div>
        <div className="iconseg wrap" role="group" aria-label="Lid hole">
          {LID_HOLES.map(([v, text, title]) => (
            <button
              key={v} type="button" title={title} aria-pressed={(params.lidHole ?? "none") === v}
              onClick={() => { const next: Params = { ...params, lidHole: v }; delete next.lidHoleD; delete next.lidHoleW; onPatch(next); }}
            >{text}</button>
          ))}
        </div>
        {params.lid === "removable" && (
          <CheckField
            label="Lip under the lid" title="A second plate under the lid that sits inside the walls and keeps it in place"
            checked={params.lidLip !== false} def={DEFAULTS.lidLip !== false} onChange={(on) => onPatch({ ...params, lidLip: on })}
          />
        )}
        {params.lid === "removable" && params.lidLip !== false && (
          <CheckField
            label="Score the lip on the lid" title="Marks the lip's outline on the lid, so the lip lines up when you glue it. Put the scored side down."
            checked={params.lidLipScore === true} def={false}
            onChange={(on) => { const next: Params = { ...params, lidLipScore: on }; if (!on) delete next.lidLipScore; onPatch(next); }}
          />
        )}
        <p className="note">Overhang makes a flat top wider than the box. A finger hole lifts a removable lid; a knob hole takes a knob&apos;s screw. A tissue slot makes a tissue box, a coin slot a money box, and a rim an open top with a frame, as on a pen holder.</p>
      </Sec>
      <Sec title="Dividers" meta={(params.divX ?? 0) + (params.divY ?? 0) > 0 ? `${(params.divX ?? 0) + 1} × ${(params.divY ?? 0) + 1}` : undefined} onReset={() => onResetSection("Dividers", ["divX", "divY", "divH"])}>
        <div className="grid2">{fields("secDiv")}</div>
        <p className="note">Dividers split the inside into compartments. They stand in slots in the base, lock together where they cross, and step up onto a support ring.</p>
      </Sec>
      <Sec title="Cut-out pattern" meta={params.fret && params.fret !== "none" ? FRET_NAMES[params.fret] : undefined} onReset={() => onResetSection("Cut-out pattern", ["fret", "fretOn", "fretCell", "fretBar"])}>
        <div className="rowlabel">Pattern</div>
        <select className="sel" aria-label="Cut-out pattern" value={params.fret ?? "none"} onChange={(e) => { const next: Params = { ...params, fret: e.target.value as Params["fret"] }; if (e.target.value === "none") { delete next.fret; delete next.fretOn; } onPatch(next); }}>
          {FRET_KINDS.map((k) => <option key={k} value={k}>{FRET_NAMES[k]}</option>)}
        </select>
        {params.fret && params.fret !== "none" ? (
          <>
            <div className="iconseg full" role="group" aria-label="Where the pattern goes">
              {([["both", "Lid and walls"], ["lid", "Lid"], ["walls", "Walls"]] as const).map(([v, text]) => (
                <button key={v} type="button" aria-pressed={(params.fretOn ?? "both") === v} onClick={() => onPatch({ ...params, fretOn: v })}>{text}</button>
              ))}
            </div>
            <div className="grid2">{fields("secFret")}</div>
          </>
        ) : null}
        <p className="note">A decorative pattern cut right through the lid and the wall&apos;s flat stretches, as on a pierced jewellery box or a lantern. Holes stay clear of the tabs, the hinge and the lid&apos;s opening.</p>
      </Sec>
      <Sec title="Text under the box" meta={params.baseText?.trim() ? "On" : undefined} onReset={() => onResetSection("Text under the box", ["baseText", "baseTextSize", "baseTextFont"])}>
        <textarea
          className="txt base-text" rows={3} maxLength={MAX_BASE_TEXT} dir="auto" aria-label="Text under the box"
          placeholder={"Company name\nPhone 0912 000 0000"} value={params.baseText ?? ""}
          onChange={(e) => { const next: Params = { ...params, baseText: e.target.value }; if (!e.target.value.trim()) delete next.baseText; onPatch(next); }}
        />
        {params.baseText?.trim() ? (
          <>
            <div className="grid2">
              <NumberField
                field={{ id: "baseTextSize", label: "Letter height", len: true, step: 0.5, min: 1.5, max: 40 }}
                value={params.baseTextSize ?? BASE_TEXT_SIZE} defaultValue={BASE_TEXT_SIZE} units={units} label="Letter height" hidden={false}
                onLive={(v) => onPatch({ ...params, baseTextSize: v })} onCommit={(v) => onPatch({ ...params, baseTextSize: v })}
              />
            </div>
            <div className="rowlabel">Font</div>
            <select className="sel" aria-label="Font for the text under the box" value={params.baseTextFont ?? BASE_TEXT_FONT} onChange={(e) => onPatch({ ...params, baseTextFont: e.target.value })}>
              {BUNDLED_FONTS.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.note}</option>)}
            </select>
          </>
        ) : null}
        {textError && <p className="note warn">{textError}</p>}
        <p className="note">Engraved in the middle of the base, as filled vectors, so any laser program reads it. Long text shrinks to fit inside the walls. Put the engraved side down when you assemble.</p>
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
        <CheckField label="Add a bend test strip" checked={!!params.testStrip} def={!!DEFAULTS.testStrip} onChange={onTestStrip} />
        <p className="note">The test strip carries one corner&apos;s hinge with 15 mm of flat on each side. Cut it first to check the bend in your material.</p>
      </Sec>
    </aside>
  );
}
