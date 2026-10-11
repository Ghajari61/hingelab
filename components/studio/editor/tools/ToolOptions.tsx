"use client";

import type { ReactNode } from "react";
import { NumberInput, SegmentedControl, Select } from "@/components/ui";
import { CALLIGRAPHY_DEFAULTS, CALLIGRAPHY_PRESETS, type CalligraphyParams } from "@/lib/studio/calligraphy";
import { TOOL_INFO, type ToolId } from "@/lib/studio/commands";
import { FILL_DEFAULTS } from "@/lib/studio/fillArea";
import { SPRAY_DEFAULTS, SPRAY_PRESETS, type SprayParams } from "@/lib/studio/spray";
import { TWEAK_DEFAULTS, TWEAK_MODES, type TweakParams } from "@/lib/studio/tweak";
import { fmtLength } from "@/lib/studio/units";
import type { Document } from "@/lib/studio/types";
import { useEditor, useEditorApi } from "../store";
import { measureToItem } from "./brushTools";

export const OPTION_TOOLS = new Set<ToolId>(["eraser", "measure", "fill", "calligraphy", "tweak", "spray"]);

/** Id of the preset whose values all match, or "" (custom). */
function presetOf<T extends object>(cur: T, presets: { id: string; params: Partial<T> }[]): string {
  return presets.find((p) => (Object.keys(p.params) as (keyof T)[]).every((k) => cur[k] === p.params[k]))?.id ?? "";
}

/** Control bar options for the Eraser, Measure, Fill Bounded Area, Calligraphy, Tweak and Spray tools. */
export function ToolOptions({ tool, units, onResetToast }: { tool: ToolId; units: Document["units"]; onResetToast: (m: string) => void }) {
  const api = useEditorApi();
  const st = {
    eraserSize: useEditor((s) => s.eraserSize), eraserMode: useEditor((s) => s.eraserMode), measure: useEditor((s) => s.measure), fill: useEditor((s) => s.fill),
    calligraphy: useEditor((s) => s.calligraphy), tweak: useEditor((s) => s.tweak), spray: useEditor((s) => s.spray), selected: useEditor((s) => s.selection.length),
  };
  const common = { units, onResetToast };
  const set = api.getState().set;
  const cal = (p: Partial<CalligraphyParams>) => set({ calligraphy: { ...api.getState().calligraphy, ...p } });
  const tw = (p: Partial<TweakParams>) => set({ tweak: { ...api.getState().tweak, ...p } });
  const sp = (p: Partial<SprayParams>) => set({ spray: { ...api.getState().spray, ...p } });
  const pct = { suffix: "%", onResetToast };
  let body: ReactNode = null;
  let hint = TOOL_INFO[tool].description;

  if (tool === "eraser") {
    body = (
      <div className="grp" data-testid="eraser-options">
        <SegmentedControl label="Eraser mode" hideLabel value={st.eraserMode} onChange={(eraserMode) => set({ eraserMode })}
          options={[{ value: "cut", label: "Cut away", title: "Remove what the brush covers" }, { value: "delete", label: "Delete objects", title: "Delete every object the brush touches" }]} />
        <NumberInput label="Size" value={st.eraserSize} length min={0.1} max={100} defaultValue={4} {...common} onChange={(v) => set({ eraserSize: v })} testId="eraser-size" />
      </div>
    );
    hint = (st.eraserMode === "delete" ? "Drag over objects to delete them." : "Drag to cut away parts of shapes and lines.") + (st.selected ? " Only the selection is erased." : "");
  } else if (tool === "measure") {
    const m = st.measure, r = m?.result;
    const dx = m ? m.b.x - m.a.x : 0, dy = m ? m.b.y - m.a.y : 0, d = Math.hypot(dx, dy);
    const read = (label: string, v: string) => <span className="ctl-read"><span className="k">{label}</span> <span className="v">{v}</span></span>;
    body = (
      <>
        <div className="grp sep" data-testid="measure-read">
          {read("D", m ? fmtLength(d, units, true) : "—")}
          {read("ΔX", m ? fmtLength(Math.abs(dx), units) : "—")}
          {read("ΔY", m ? fmtLength(Math.abs(dy), units) : "—")}
          {read("Angle", m && d > 1e-9 ? `${Math.round((Math.atan2(-dy, dx) * 1800) / Math.PI) / 10}°` : "—")}
          {read("Crossings", r ? String(r.hits.length) : "—")}
          {r && r.crossed > 0 && read("Paths crossed", `${r.crossed} · ${fmtLength(r.crossedLength, units, true)}`)}
        </div>
        <div className="grp">
          <button type="button" className="ui-btn small" disabled={!m || d < 1e-6} onClick={() => measureToItem(api, onResetToast)} title="Keep this measurement as a dimension (Enter)" data-testid="measure-to-item">Convert to Item</button>
        </div>
      </>
    );
  } else if (tool === "fill") {
    body = (
      <div className="grp" data-testid="fill-options">
        <NumberInput label="Gap" value={st.fill.gap} length min={0} max={10} step={0.1} defaultValue={FILL_DEFAULTS.gap} {...common} onChange={(gap) => set({ fill: { ...api.getState().fill, gap } })} testId="fill-gap" />
        <NumberInput label="Grow" value={st.fill.grow} length min={-20} max={20} step={0.1} defaultValue={FILL_DEFAULTS.grow} {...common} onChange={(grow) => set({ fill: { ...api.getState().fill, grow } })} testId="fill-grow" />
      </div>
    );
    hint = `${hint}${st.selected ? " Only the selection's outlines count as walls." : ""}`;
  } else if (tool === "calligraphy") {
    const c = st.calligraphy;
    body = (
      <>
        <div className="grp" data-testid="calligraphy-options">
          <Select label="Preset" hideLabel value={presetOf(c, CALLIGRAPHY_PRESETS)} testId="calligraphy-preset"
            options={[{ value: "", label: "Custom" }, ...CALLIGRAPHY_PRESETS.map((p) => ({ value: p.id, label: p.label }))]}
            onChange={(id) => { const p = CALLIGRAPHY_PRESETS.find((x) => x.id === id); if (p) cal({ ...p.params, relative: false }); }} />
          {c.relative
            ? <NumberInput label="Width" value={c.width} min={0.1} max={100} step={0.5} defaultValue={1} {...pct} onChange={(width) => cal({ width })} testId="calligraphy-width" />
            : <NumberInput label="Width" value={c.width} length min={0.05} max={100} step={0.1} defaultValue={CALLIGRAPHY_DEFAULTS.width} {...common} onChange={(width) => cal({ width })} testId="calligraphy-width" />}
          <SegmentedControl label="Width unit" hideLabel value={c.relative ? "view" : "abs"} onChange={(v) => cal(v === "view" ? { relative: true, width: 1 } : { relative: false, width: CALLIGRAPHY_DEFAULTS.width })}
            options={[{ value: "abs", label: units, title: "Width in document units" }, { value: "view", label: "% view", title: "Width as a percentage of the visible canvas, so it follows zoom" }]} />
        </div>
        <div className="grp sep">
          <NumberInput label="Thinning" value={c.thinning} min={-100} max={100} defaultValue={CALLIGRAPHY_DEFAULTS.thinning} onResetToast={onResetToast} onChange={(thinning) => cal({ thinning })} testId="calligraphy-thinning" />
          <NumberInput label="Angle" value={c.angle} min={-90} max={90} suffix="°" defaultValue={CALLIGRAPHY_DEFAULTS.angle} onResetToast={onResetToast} onChange={(angle) => cal({ angle })} testId="calligraphy-angle" />
          <NumberInput label="Fixation" value={c.fixation} min={0} max={100} defaultValue={CALLIGRAPHY_DEFAULTS.fixation} onResetToast={onResetToast} onChange={(fixation) => cal({ fixation })} testId="calligraphy-fixation" />
          <NumberInput label="Caps" value={c.caps} min={0} max={5} step={0.1} defaultValue={CALLIGRAPHY_DEFAULTS.caps} onResetToast={onResetToast} onChange={(caps) => cal({ caps })} testId="calligraphy-caps" />
        </div>
        <div className="grp sep">
          <NumberInput label="Tremor" value={c.tremor} min={0} max={100} defaultValue={CALLIGRAPHY_DEFAULTS.tremor} onResetToast={onResetToast} onChange={(tremor) => cal({ tremor })} testId="calligraphy-tremor" />
          <NumberInput label="Mass" value={c.mass} min={0} max={100} defaultValue={CALLIGRAPHY_DEFAULTS.mass} onResetToast={onResetToast} onChange={(mass) => cal({ mass })} testId="calligraphy-mass" />
          <label className="pn-check"><input type="checkbox" checked={c.pressure} onChange={(e) => cal({ pressure: e.target.checked })} data-testid="calligraphy-pressure" /> Pressure</label>
        </div>
      </>
    );
    hint = "Draws a filled outline on an engrave layer.";
  } else if (tool === "tweak") {
    const t = st.tweak;
    const mode = TWEAK_MODES.find((m) => m.id === t.mode) ?? TWEAK_MODES[0];
    body = (
      <div className="grp" data-testid="tweak-options">
        <Select label="Mode" hideLabel value={t.mode} testId="tweak-mode" onChange={(m) => tw({ mode: m })}
          options={TWEAK_MODES.map((m) => ({ value: m.id, label: m.label, group: m.nodes ? "Paths" : "Objects" }))} />
        <NumberInput label="Radius" value={t.radius} length min={0.5} max={500} defaultValue={TWEAK_DEFAULTS.radius} {...common} onChange={(radius) => tw({ radius })} testId="tweak-radius" />
        <NumberInput label="Force" value={t.force} min={1} max={100} defaultValue={TWEAK_DEFAULTS.force} {...pct} onChange={(force) => tw({ force })} testId="tweak-force" />
        {mode.nodes && <NumberInput label="Fidelity" value={t.fidelity} min={0} max={100} defaultValue={TWEAK_DEFAULTS.fidelity} {...pct} onChange={(fidelity) => tw({ fidelity })} testId="tweak-fidelity" />}
      </div>
    );
    hint = `${mode.hint} ${st.selected ? "Only the selection is tweaked." : "Works on everything under the brush."}`;
  } else if (tool === "spray") {
    const p = st.spray;
    body = (
      <>
        <div className="grp" data-testid="spray-options">
          <Select label="Preset" hideLabel value={presetOf(p, SPRAY_PRESETS)} testId="spray-preset"
            options={[{ value: "", label: "Custom" }, ...SPRAY_PRESETS.map((x) => ({ value: x.id, label: x.label }))]}
            onChange={(id) => { const x = SPRAY_PRESETS.find((q) => q.id === id); if (x) sp(x.params); }} />
          <SegmentedControl label="Spray mode" hideLabel value={p.mode} onChange={(mode) => sp({ mode })}
            options={[{ value: "copies", label: "Copies" }, { value: "clones", label: "Clones", title: "Live copies that follow the original" }, { value: "single", label: "Single path", title: "Everything sprayed in one stroke becomes one path" }]} />
        </div>
        <div className="grp sep">
          <NumberInput label="Radius" value={p.radius} length min={0.5} max={1000} defaultValue={SPRAY_DEFAULTS.radius} {...common} onChange={(radius) => sp({ radius })} testId="spray-radius" />
          <NumberInput label="Amount" value={p.amount} integer min={1} max={20} defaultValue={SPRAY_DEFAULTS.amount} onResetToast={onResetToast} onChange={(amount) => sp({ amount })} testId="spray-amount" />
          <NumberInput label="Focus" value={p.focus} min={0} max={100} defaultValue={SPRAY_DEFAULTS.focus} {...pct} onChange={(focus) => sp({ focus })} testId="spray-focus" />
          <NumberInput label="Scale ±" value={p.scaleVar} min={0} max={90} defaultValue={SPRAY_DEFAULTS.scaleVar} {...pct} onChange={(scaleVar) => sp({ scaleVar })} testId="spray-scale" />
          <NumberInput label="Rotate ±" value={p.rotateVar} min={0} max={180} suffix="°" defaultValue={SPRAY_DEFAULTS.rotateVar} onResetToast={onResetToast} onChange={(rotateVar) => sp({ rotateVar })} testId="spray-rotate" />
        </div>
        <div className="grp sep">
          <label className="pn-check"><input type="checkbox" checked={p.noOverlap} onChange={(e) => sp({ noOverlap: e.target.checked })} data-testid="spray-no-overlap" /> No overlap</label>
          {p.noOverlap && <NumberInput label="Gap" value={p.gap} length min={0} max={50} step={0.1} defaultValue={SPRAY_DEFAULTS.gap} {...common} onChange={(gap) => sp({ gap })} testId="spray-gap" />}
          <NumberInput label="Seed" value={p.seed} integer min={1} max={99999} defaultValue={SPRAY_DEFAULTS.seed} onResetToast={onResetToast} onChange={(seed) => sp({ seed })} testId="spray-seed" />
        </div>
      </>
    );
    hint = st.selected ? "Drag to spray the selection." : "Select the objects to spray, then drag.";
  }

  return (
    <div className="st-control" aria-label="Control bar" data-testid="control-bar">
      <div className="grp"><span className="lbl kind">{TOOL_INFO[tool].label}</span></div>
      {body}
      <div className="grp"><span className="hint">{hint}</span></div>
    </div>
  );
}
