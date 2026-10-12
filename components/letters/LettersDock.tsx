"use client";

import { MATERIALS, type CutStyle, type LayerKey, type Pattern } from "@/lib/hinge";
import { LETTER_DEFAULTS, bridgeWidthOf, cornerRadiusOf, wallMaxLengthOf, type LetterModel, type LetterParams } from "@/lib/letters";
import { NumberField } from "@/components/editor/NumberField";
import { LayersPanel } from "@/components/editor/LayersPanel";
import { Sec, type SheetProps } from "@/components/editor/PanelDock";
import { SheetSection } from "@/components/shell/SheetSection";
import { cleanFit } from "@/lib/fit/fitToSheets";
import type { Units } from "@/components/editor/format";
import { LETTER_FIELDS, MARQUEE_KEYS, isMarqueeKey, type LetterField, type LetterNumKey } from "./fields";
import { FontPicker } from "./FontPicker";
import { LettersAnalysis } from "./LettersAnalysis";
import type { StoredFontMeta } from "./fontStore";


type Patch = (partial: Partial<LetterParams>, record: boolean) => void;

function Choice<T extends string>({ label, value, options, onPick }: {
  label: string;
  value: T;
  options: { v: T; text: string; title?: string }[];
  onPick: (v: T) => void;
}) {
  return (
    <>
      <div className="rowlabel">{label}</div>
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
  onMaterial: (id: string) => void;
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
  const layerVis = (key: LayerKey) => onPatch({ layers: { ...params.layers, [key]: { ...params.layers[key], vis: !params.layers[key].vis } } }, true);
  const layerExp = (key: LayerKey, exp: boolean) => onPatch({ layers: { ...params.layers, [key]: { ...params.layers[key], exp } } }, true);

  return (
    <aside className="dock" aria-label="Panels">

      <Sec title="Text" meta={params.text.trim() ? `${[...params.text.trim()].length} chars` : undefined} startOpen onReset={() => onResetSection("Text", ["sizeMode", "size", "letterSpacing", "thicken", "weld", "direction"])}>
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
        <Choice label="Size measures" value={params.sizeMode} onPick={(v) => onPatch({ sizeMode: v }, true)} options={[
          { v: "capHeight", text: "Cap height", title: "Size is the height of a capital letter such as H" },
          { v: "totalHeight", text: "Total height", title: "Size is the full height of the text, ascenders and descenders included" },
        ]} />
        <div className="grid2">{fields("text")}</div>
        <Choice label="Weld" value={params.weld} onPick={(v) => onPatch({ weld: v }, true)} options={[
          { v: "word", text: "Whole word", title: "Letters that touch become one piece" },
          { v: "letters", text: "Each letter", title: "One piece per letter, even where letters touch" },
        ]} />
        <Choice label="Direction" value={params.direction} onPick={(v) => onPatch({ direction: v }, true)} options={[
          { v: "auto", text: "Auto" },
          { v: "ltr", text: "Left to right" },
          { v: "rtl", text: "Right to left" },
        ]} />
        <p className="note">Letter spacing never separates letters that join, as in Persian. Thicken grows every stroke outward.</p>
      </Sec>
      {box ? (
        <Sec title="Box" meta={params.wallStyle === "hinge" ? "Living hinge" : "Flat panels"} startOpen onReset={() => onResetSection("Box", ["depth", "minCornerRadius", "facetTol", "panelMin", "wallMaxLength", "islandArea", "smallIslands", "stackIslands", "marquee"])}>
          <div className="grid2">{fields("box")}</div>
          {hinge && (
            <label className="chk">
              <input
                type="checkbox"
                checked={params.minCornerRadius === "auto"}
                onChange={(e) => onPatch({ minCornerRadius: e.target.checked ? "auto" : cornerRadiusOf(params) }, true)}
              /> Corner radius follows the hinge
            </label>
          )}
          <Choice label="Small pieces (dots, accents)" value={params.smallIslands} onPick={(v) => onPatch({ smallIslands: v }, true)} options={[
            { v: "flat", text: "Cut flat", title: "Cut them as flat pieces to glue on top of the lid" },
            { v: "drop", text: "Leave out" },
          ]} />
          {params.smallIslands === "flat" && (
            <label className="chk">
              <input type="checkbox" checked={params.stackIslands} onChange={(e) => onPatch({ stackIslands: e.target.checked }, true)} /> Stack to full height ({Math.max(1, Math.round(params.depth / params.T))} layers each)
            </label>
          )}
          <label className="chk">
            <input
              type="checkbox"
              checked={params.marquee.enabled}
              onChange={(e) => onPatch({ marquee: { ...params.marquee, enabled: e.target.checked } }, true)}
            /> Marquee light holes in the {params.lid === "open" ? "base" : "lid"}
          </label>
          {params.marquee.enabled && <div className="grid2">{fields("marquee")}</div>}
          <p className="note">
            {hinge
              ? "Each outline and counter gets one bendable wall strip. Sharp corners are rounded to the corner radius so the hinge can follow them; seams land on flat stretches."
              : "Each outline and counter is approximated by flat panels within the tolerance. Square corners get finger joints, other corners are butt joints to glue."}
            {" "}Pieces smaller than the island size are not boxed.
          </p>
        </Sec>
      ) : params.mode === "stencil" ? (
        <Sec title="Stencil" meta={`${params.bridgesPerIsland} bridge${params.bridgesPerIsland > 1 ? "s" : ""} per centre`} startOpen onReset={() => onResetSection("Stencil", ["bridgesPerIsland", "stencilBridge", "sheetMargin"])}>
          <p className="note">The letters are cut out of one sheet. Bridges hold the centres of letters such as A, O and 8 so they don&apos;t fall out.</p>
          <Choice label="Bridges per centre" value={String(params.bridgesPerIsland) as "1" | "2"} onPick={(v) => onPatch({ bridgesPerIsland: v === "2" ? 2 : 1 }, true)} options={[
            { v: "1", text: "One", title: "One bridge across the thinnest stroke" },
            { v: "2", text: "Two", title: "A second bridge at least 120° from the first, for large or flexible stencils" },
          ]} />
          <div className="grid2">{fields("solid")}</div>
          <p className="note">Margin is the border of sheet around the text.</p>
        </Sec>
      ) : (
        <Sec title="Mode" meta="Solid" startOpen onReset={() => onResetSection("Solid", ["weldDots", "stencilBridge"])}>
          <p className="note">Solid cuts each letter shape out as a flat piece, with counters as inner cuts.</p>
          <label className="chk">
            <input type="checkbox" checked={params.weldDots} onChange={(e) => onPatch({ weldDots: e.target.checked }, true)} /> Weld dots
          </label>
          <div className="grid2">{fields("solid")}</div>
          <p className="note">Weld dots joins every separate piece of a word, dots and accents included, with small bridges so each word cuts as one part.</p>
        </Sec>
      )}
      <Sec title="Material" startOpen onReset={() => onResetSection("Material", ["material", "T", "K"])}>
        <select className="sel" aria-label="Material preset" value={params.material} onChange={(e) => onMaterial(e.target.value)}>
          {Object.entries(MATERIALS).map(([k, m]) => <option key={k} value={k}>{m.name}</option>)}
        </select>
        <div className="grid2">{fields("mat")}</div>
      </Sec>
      {hinge && (
        <Sec title="Hinge Pattern" meta={params.pattern[0].toUpperCase() + params.pattern.slice(1)} startOpen onReset={() => onResetSection("Hinge pattern", ["cutStyle", "pattern", "slotW", "slit", "bridge", "pitch", "overrun", "stretch"])}>
          <Choice<CutStyle> label="Cut style" value={params.cutStyle} onPick={(v) => onPatch({ cutStyle: v }, true)} options={[
            { v: "slot", text: "Slots", title: "Each cut is a round-ended slot of set width; edge cuts become notches in the outline" },
            { v: "line", text: "Single line", title: "Each cut is a single laser line (kerf width only)" },
          ]} />
          <Choice<Pattern> label="Pattern" value={params.pattern} onPick={(v) => onPatch({ pattern: v }, true)} options={[
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
      <Sec title="Analysis" startOpen>
        <LettersAnalysis model={model} error={error} units={units} showZones={showZones} onShowZones={onShowZones} />
        {checks}
      </Sec>
      {box && (
        <Sec title="Joints & Fit" onReset={() => onResetSection("Joints & Fit", ["tabW", "slotClr", "baseRim", "lidGap"])}>
          <div className="grid2">{fields("joints")}</div>
          <p className="note">Tabs on the walls fit slots in the base{params.lid === "fixed" ? " and the lid" : ""}. Slot play loosens or tightens that fit; Base rim moves the slots in from the plate edge.</p>
        </Sec>
      )}
      <Sec title="Layers" startOpen onReset={() => onResetSection("Layers", ["layers", "labels"])}>
        <LayersPanel layers={params.layers} labels={params.labels} only={hinge ? undefined : ["outline", "slots", "labels"]} onVis={layerVis} onExp={layerExp} onLabels={(on) => onPatch({ labels: on }, true)} />
      </Sec>
      <Sec title="Sheet" meta={sheet.meta} onReset={() => onResetSection("Sheet", ["bedW", "bedH", "gap", "fit"])}>
        <SheetSection
          bedW={params.bedW} bedH={params.bedH} fit={cleanFit(params.fit)} info={sheet.info} size={sheet.size}
          onSheet={sheet.onSheet} onFit={sheet.onFit}
        >
          <div className="grid2">{fields("sheet")}</div>
        </SheetSection>
        <p className="note">Parts are packed in reading order.</p>
      </Sec>
    </aside>
  );
}
