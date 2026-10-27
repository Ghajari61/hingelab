"use client";

import type { CutStyle, LayerKey, Pattern } from "@/lib/hinge";
import type { MaterialInfo } from "@/lib/materials/library";
import { MaterialPicker } from "@/components/shell/MaterialPicker";
import { LETTER_CUTOUT_KINDS, LETTER_DEFAULTS, bridgeWidthOf, cleanCutout, cornerRadiusOf, wallMaxLengthOf, type LetterModel, type LetterParams } from "@/lib/letters";
import { FRET_NAMES } from "@/lib/generators/fretwork";
import type { LetterCutout } from "@/lib/letters/types";
import { NumberField } from "@/components/editor/NumberField";
import { LayersPanel } from "@/components/editor/LayersPanel";
import { Sec, type SheetProps } from "@/components/editor/PanelDock";
import { SheetSection } from "@/components/shell/SheetSection";
import { CheckField, ResetMark } from "@/components/editor/ResetMark";
import { cleanFit } from "@/lib/fit/fitToSheets";
import type { Units } from "@/components/editor/format";
import { LETTER_FIELDS, MARQUEE_KEYS, isMarqueeKey, type LetterField, type LetterNumKey } from "./fields";
import { FontPicker } from "./FontPicker";
import { LettersAnalysis } from "./LettersAnalysis";
import type { StoredFontMeta } from "./fontStore";


type Patch = (partial: Partial<LetterParams>, record: boolean) => void;

function Choice<T extends string>({ label, value, def, options, onPick }: {
  label: string;
  value: T;
  def: T;
  options: { v: T; text: string; title?: string }[];
  onPick: (v: T) => void;
}) {
  const home = options.find((o) => o.v === def);
  return (
    <>
      <div className="rowlabel">{label}<ResetMark label={label} show={!!home && value !== def} to={home?.text} onReset={() => onPick(def)} /></div>
      <div className="iconseg full" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.v} type="button" title={o.title} aria-pressed={value === o.v} onClick={() => onPick(o.v)}>{o.text}</button>
        ))}
      </div>
    </>
  );
}

export function LettersDock({
  params, model, error, units, uploads, showZones, onShowZones, onAutoFit, onResetSection, onPatch, onField, onMaterial, onPick, onUpload, onDeleteFont, sheet, checks,
}: {
  /** The checks list with its fixes (under Analysis). */
  checks?: React.ReactNode;
  params: LetterParams;
  model: LetterModel | null;
  error: string | null;
  units: Units;
  uploads: StoredFontMeta[];
  showZones: boolean;
  onShowZones: (on: boolean) => void;
  onAutoFit: () => void;
  onPatch: Patch;
  onField: (id: LetterNumKey, v: number, mat: boolean, record: boolean) => void;
  onMaterial: (id: string, info: MaterialInfo | null) => void;
  onPick: (id: string) => void;
  onUpload: (file: File) => void;
  onDeleteFont: (id: string) => void;
  onResetSection: (title: string, keys: (keyof LetterParams)[]) => void;
  sheet: SheetProps;
}) {
  const box = params.mode === "box";
  const hinge = box && params.wallStyle === "hinge";
  const value = (f: LetterField, p: LetterParams = params): number => {
    if (isMarqueeKey(f.id)) return p.marquee[MARQUEE_KEYS[f.id]];
    if (f.id === "stencilBridge") return bridgeWidthOf(p);
    if (f.id === "minCornerRadius") return cornerRadiusOf(p);
    if (f.id === "wallMaxLength") return wallMaxLengthOf(p);
    return p[f.id];
  };
  const fields = (sec: LetterField["sec"]) => LETTER_FIELDS.filter((f) => f.sec === sec).map((f) => (
    <NumberField
      key={f.id}
      field={f}
      value={value(f)}
      defaultValue={value(f, LETTER_DEFAULTS)}
      units={units}
      label={f.label}
      hidden={f.show ? !f.show(params) : false}
      onLive={(v) => onField(f.id, v, !!f.mat, false)}
      onCommit={(v) => onField(f.id, v, !!f.mat, true)}
    />
  ));
  const missing = model?.shaped.missing ?? [];
  const cutout = cleanCutout(params.cutout);
  const layerVis = (key: LayerKey) => onPatch({ layers: { ...params.layers, [key]: { ...params.layers[key], vis: !params.layers[key].vis } } }, true);
  const layerExp = (key: LayerKey, exp: boolean) => onPatch({ layers: { ...params.layers, [key]: { ...params.layers[key], exp } } }, true);

  return (
    <aside className="dock" aria-label="Panels">

      <Sec step="design" title="Text" meta={params.text.trim() ? `${[...params.text.trim()].length} chars` : undefined} startOpen onReset={() => onResetSection("Text", ["sizeMode", "size", "letterSpacing", "thicken", "weld", "noWeld", "direction"])}>
        <textarea
          className="textin"
          dir="auto"
          rows={2}
          aria-label="Text"
          placeholder="Type a name or word"
          spellCheck={false}
          value={params.text}
          onChange={(e) => onPatch({ text: e.target.value }, false)}
          onBlur={(e) => onPatch({ text: e.target.value }, true)}
        />
        <FontPicker fontId={params.fontId} text={params.text} uploads={uploads} onPick={onPick} onUpload={onUpload} onDelete={onDeleteFont} />
        {missing.length > 0 && <p className="fp-warn">This font has no {missing.map((c) => `“${c}”`).join(" ")}. Pick a font that covers your text.</p>}
        <Choice label="Size measures" value={params.sizeMode} def={LETTER_DEFAULTS.sizeMode} onPick={(v) => onPatch({ sizeMode: v }, true)} options={[
          { v: "capHeight", text: "Cap height", title: "Size is the height of a capital letter such as H" },
          { v: "totalHeight", text: "Total height", title: "Size is the full height of the text, ascenders and descenders included" },
        ]} />
        <div className="grid2">{fields("text")}</div>
        <CheckField label="No Weld" checked={!!params.noWeld} def={false} onChange={(on) => onPatch({ noWeld: on }, true)} />
        {!params.noWeld && <Choice label="Weld" value={params.weld} def={LETTER_DEFAULTS.weld} onPick={(v) => onPatch({ weld: v }, true)} options={[
          { v: "word", text: "Whole word", title: "Letters that touch become one piece" },
          { v: "letters", text: "Each letter", title: "One piece per letter, even where letters touch" },
        ]} />}
        <Choice label="Direction" value={params.direction} def={LETTER_DEFAULTS.direction} onPick={(v) => onPatch({ direction: v }, true)} options={[
          { v: "auto", text: "Auto" },
          { v: "ltr", text: "Left to right" },
          { v: "rtl", text: "Right to left" },
        ]} />
        <p className="note">Letter spacing never separates letters that join, as in connected scripts. Thicken grows every stroke outward.</p>
      </Sec>
      {box ? (
        <Sec step="dimensions" title="Box" meta={params.wallStyle === "hinge" ? "Living hinge" : "Flat panels"} startOpen onReset={() => onResetSection("Box", ["depth", "corners", "minCornerRadius", "facetTol", "panelMin", "wallMaxLength", "islandArea", "smallIslands", "stackIslands", "marquee", "cutout"])}>
          {hinge && (
            <Choice label="Corners" value={params.corners ?? "joint"} def={LETTER_DEFAULTS.corners ?? "joint"} onPick={(v) => onPatch({ corners: v }, true)} options={[
              { v: "joint", text: "Keep", title: "Keep the letter's corners sharp: the wall is split into strips that meet at each corner" },
              { v: "round", text: "Round off", title: "Round the corners so one strip bends all the way round each outline" },
            ]} />
          )}
          <div className="grid2">{fields("box")}</div>
          {hinge && params.corners === "round" && (
            <CheckField
              label="Corner radius follows the hinge" checked={params.minCornerRadius === "auto"} def={LETTER_DEFAULTS.minCornerRadius === "auto"}
              onChange={(on) => onPatch({ minCornerRadius: on ? "auto" : cornerRadiusOf(params) }, true)}
            />
          )}
          <Choice label="Small pieces (dots, accents)" value={params.smallIslands} def={LETTER_DEFAULTS.smallIslands} onPick={(v) => onPatch({ smallIslands: v }, true)} options={[
            { v: "flat", text: "Cut flat", title: "Cut them as flat pieces to glue on top of the lid" },
            { v: "drop", text: "Leave out" },
          ]} />
          {params.smallIslands === "flat" && (
            <CheckField label="Stack to full height" checked={params.stackIslands} def={LETTER_DEFAULTS.stackIslands} onChange={(on) => onPatch({ stackIslands: on }, true)}>
              Stack to full height ({Math.max(1, Math.round(params.depth / params.T))} layers each)
            </CheckField>
          )}
          <CheckField
            label="Marquee light holes" checked={params.marquee.enabled} def={LETTER_DEFAULTS.marquee.enabled}
            onChange={(on) => onPatch({ marquee: { ...params.marquee, enabled: on } }, true)}
          >
            Marquee light holes in the {params.lid === "open" ? "base" : "lid"}
          </CheckField>
          {params.marquee.enabled && <div className="grid2">{fields("marquee")}</div>}
          <div className="rowlabel">Cut-out pattern<ResetMark label="Cut-out pattern" show={!!cutout} to="None" onReset={() => onPatch({ cutout: undefined }, true)} /></div>
          <select className="sel" aria-label="Cut-out pattern" value={cutout?.kind ?? "none"} onChange={(e) => onPatch({ cutout: e.target.value === "none" ? undefined : { ...(cutout ?? { on: "both", cell: 16, bar: 3 }), kind: e.target.value as LetterCutout["kind"] } }, true)}>
            <option value="none">None</option>
            {LETTER_CUTOUT_KINDS.map((k) => <option key={k} value={k}>{FRET_NAMES[k]}</option>)}
          </select>
          {cutout && (
            <>
              <Choice label="Put it on" value={cutout.on} def="both" onPick={(v) => onPatch({ cutout: { ...cutout, on: v } }, true)} options={[
                { v: "both", text: "Lid and base" },
                { v: "lid", text: "Lid", title: "Light shines out through a lit letter's lid" },
                { v: "base", text: "Base" },
              ]} />
              <div className="grid2">
                <NumberField field={{ id: "cutoutCell", label: "Pattern size", len: true, step: 0.5, min: 6, max: 80 }} value={cutout.cell} defaultValue={16} units={units} label="Pattern size" hidden={false}
                  onLive={(v) => onPatch({ cutout: { ...cutout, cell: v } }, false)} onCommit={(v) => onPatch({ cutout: { ...cutout, cell: v } }, true)} />
                <NumberField field={{ id: "cutoutBar", label: "Bar width", len: true, step: 0.25, min: 1, max: 15 }} value={cutout.bar} defaultValue={3} units={units} label="Bar width" hidden={false}
                  onLive={(v) => onPatch({ cutout: { ...cutout, bar: v } }, false)} onCommit={(v) => onPatch({ cutout: { ...cutout, bar: v } }, true)} />
              </div>
            </>
          )}
          <p className="note">
            {hinge
              ? "Each outline and counter gets one bendable wall strip. Sharp corners are rounded to the corner radius so the hinge can follow them; seams land on flat stretches."
              : "Each outline and counter is approximated by flat panels within the tolerance. Square corners get finger joints, other corners are butt joints to glue."}
            {" "}Pieces smaller than the island size are not boxed.
          </p>
        </Sec>
      ) : params.mode === "stencil" ? (
        <Sec step="design" title="Stencil" meta={`${params.bridgesPerIsland} bridge${params.bridgesPerIsland > 1 ? "s" : ""} per centre`} startOpen onReset={() => onResetSection("Stencil", ["bridgesPerIsland", "stencilBridge", "sheetMargin"])}>
          <p className="note">The letters are cut out of one sheet. Bridges hold the centres of letters such as A, O and 8 so they don&apos;t fall out.</p>
          <Choice label="Bridges per centre" value={String(params.bridgesPerIsland) as "1" | "2"} def={String(LETTER_DEFAULTS.bridgesPerIsland) as "1" | "2"} onPick={(v) => onPatch({ bridgesPerIsland: v === "2" ? 2 : 1 }, true)} options={[
            { v: "1", text: "One", title: "One bridge across the thinnest stroke" },
            { v: "2", text: "Two", title: "A second bridge at least 120° from the first, for large or flexible stencils" },
          ]} />
          <div className="grid2">{fields("solid")}</div>
          <p className="note">Margin is the border of sheet around the text.</p>
        </Sec>
      ) : (
        <Sec step="design" title="Mode" meta="Solid" startOpen onReset={() => onResetSection("Mode", ["weldDots", "stencilBridge", "operation"])}>
          <p className="note">Cut makes flat letter pieces. Score traces the letters on your stock; the preview stock border is not a cut.</p>
          <CheckField label="No Weld" checked={!!params.noWeld} def={false} onChange={(on) => onPatch({ noWeld: on }, true)} />
          <Choice label="Letters" value={params.operation ?? "cut"} def="cut" onPick={(v) => onPatch({ operation: v }, true)} options={[{ v: "cut", text: "Cut" }, { v: "score", text: "Score" }]} />
          {!params.noWeld && params.operation !== "score" && <CheckField label="Weld dots" checked={params.weldDots} def={LETTER_DEFAULTS.weldDots} onChange={(on) => onPatch({ weldDots: on }, true)} />}
          <div className="grid2">{fields("solid")}</div>
          <p className="note">Weld dots joins every separate piece of a word, dots and accents included, with small bridges so each word cuts as one part.</p>
        </Sec>
      )}
      <Sec step="material" title="Material" startOpen onReset={() => onResetSection("Material", ["material", "T", "K"])}>
        <MaterialPicker value={params.material} units={units} onPick={onMaterial} current={{ T: params.T, kx: params.K, ky: params.K, minFeature: 0 }} />
        <div className="grid2">{fields("mat")}</div>
      </Sec>
      {hinge && (
        <Sec step="construction" title="Hinge Pattern" meta={params.pattern[0].toUpperCase() + params.pattern.slice(1)} startOpen onReset={() => onResetSection("Hinge pattern", ["cutStyle", "pattern", "slotW", "slit", "bridge", "pitch", "overrun", "stretch"])}>
          <Choice<CutStyle> label="Cut style" value={params.cutStyle} def={LETTER_DEFAULTS.cutStyle} onPick={(v) => onPatch({ cutStyle: v }, true)} options={[
            { v: "slot", text: "Slots", title: "Each cut is a round-ended slot of set width; edge cuts become notches in the outline" },
            { v: "line", text: "Single line", title: "Each cut is a single laser line (kerf width only)" },
          ]} />
          <Choice<Pattern> label="Pattern" value={params.pattern} def={LETTER_DEFAULTS.pattern} onPick={(v) => onPatch({ pattern: v }, true)} options={[
            { v: "straight", text: "Straight", title: "Straight lattice" },
            { v: "wave", text: "Wave", title: "Wave lattice: parallel waves, constant bar width" },
            { v: "relief", text: "Relief", title: "Lattice with round relief holes at every cut end" },
            { v: "serpentine", text: "Serpentine", title: "Serpentine: cuts from alternating edges, for very tight bends" },
          ]} />
          <div className="grid2">{fields("hinge")}</div>
          <button type="button" className="btn-auto" onClick={onAutoFit}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M7 1v2M7 11v2M1 7h2M11 7h2M2.8 2.8l1.4 1.4M9.8 9.8l1.4 1.4M2.8 11.2l1.4-1.4M9.8 4.2l1.4-1.4" /></svg>Auto-fit pattern to the tightest bend
          </button>
          <p className="note">Hinge cuts go only where the letter curves. Stretch shortens each curved stretch to make up for the cuts opening as the wall bends.</p>
        </Sec>
      )}
      <Sec step="validation" title="Analysis" startOpen>
        <LettersAnalysis model={model} error={error} units={units} showZones={showZones} onShowZones={onShowZones} />
        {checks}
      </Sec>
      {box && (
        <Sec step="construction" title="Joints & Fit" onReset={() => onResetSection("Joints & Fit", ["tabW", "slotClr", "baseRim", "lidGap"])}>
          <div className="grid2">{fields("joints")}</div>
          <p className="note">Tabs on the walls fit slots in the base{params.lid === "fixed" ? " and the lid" : ""}. Slot play loosens or tightens that fit; Base rim moves the slots in from the plate edge.</p>
        </Sec>
      )}
      <Sec step="export" title="Layers" startOpen onReset={() => onResetSection("Layers", ["layers", "labels"])}>
        <LayersPanel layers={params.layers} labels={params.labels} only={hinge ? undefined : ["outline", "slots", "labels"]} onVis={layerVis} onExp={layerExp} onLabels={(on) => onPatch({ labels: on }, true)} />
      </Sec>
      <Sec step="layout" title="Sheet" meta={sheet.meta} onReset={() => onResetSection("Sheet", ["bedW", "bedH", "gap", "fit"])}>
        <SheetSection
          bedW={params.bedW} bedH={params.bedH} fit={cleanFit(params.fit)} info={sheet.info} size={sheet.size} original={sheet.original} preview={sheet.preview}
          onSheet={sheet.onSheet} onFit={sheet.onFit}
        >
          <div className="grid2">{fields("sheet")}</div>
        </SheetSection>
        <p className="note">Parts are packed in reading order.</p>
      </Sec>
    </aside>
  );
}
