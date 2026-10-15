"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import type { Units } from "@/components/editor/format";
import { readUnits, UNITS_KEY } from "@/hooks/useAutosave";
import { CUSTOM_MACHINE, defaultExport, EXPORT_FORMATS, FORMAT_INFO, loadExport, saveExport, type ExportSettings } from "@/lib/export/profiles";
import { DEFAULT_EDITOR_PREFS, type EditorPrefs } from "@/lib/prefs/editor";
import { saveEditorPrefs, useEditorPrefs } from "@/lib/prefs/editorStore";
import { MACHINE_PROFILES } from "@/lib/studio/library";
import { UNITS_EVENT } from "./DockColumn";
import "./export-dialog.css";

function Seg<T extends string | number>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="exp-row">
      <span className="rowlabel">{label}</span>
      <div className="iconseg full" role="group" aria-label={label}>
        {options.map((o) => <button key={String(o.value)} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>)}
      </div>
    </div>
  );
}

const Check = ({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) => (
  <label className="chk"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{children}</label>
);

/**
 * Edit › Settings… (Ctrl+,): preferences of this browser for every classic editor. They apply at
 * once and are not part of any design.
 */
export default function SettingsDialog({ onClose, toast }: { onClose: () => void; toast?: (msg: string) => void }) {
  const p = useEditorPrefs();
  const [units, setUnitsState] = useState<Units>(() => readUnits());
  const [exp, setExp] = useState<ExportSettings>(() => loadExport());
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button[aria-pressed]")?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);

  const set = (patch: Partial<EditorPrefs>) => saveEditorPrefs(patch);
  const setUnits = (u: Units) => {
    setUnitsState(u);
    try { localStorage.setItem(UNITS_KEY, u); } catch { /* private mode */ }
    window.dispatchEvent(new CustomEvent(UNITS_EVENT, { detail: u }));
  };
  const setExport = (patch: Partial<ExportSettings>) => {
    const next = { ...exp, ...patch };
    setExp(next);
    saveExport(next);
  };
  const pickMachine = (id: string) => {
    if (id === CUSTOM_MACHINE) setExport({ machine: id });
    else { const d = defaultExport(id); setExport({ machine: id, format: d.format, bedW: d.bedW, bedH: d.bedH }); }
  };
  const resetAll = () => {
    saveEditorPrefs(DEFAULT_EDITOR_PREFS);
    setUnits("mm");
    const d = defaultExport();
    setExp(d);
    saveExport(d);
    toast?.("Settings reset to the defaults");
  };

  return (
    <div className="modal-back" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal exp settings" role="dialog" aria-modal="true" aria-label="Settings" ref={ref}>
        <header>Settings<button type="button" aria-label="Close" onClick={onClose}>×</button></header>
        <div className="mb">
          <h3 className="set-h">Measurements</h3>
          <Seg label="Units" value={units} onChange={setUnits} options={[{ value: "mm", label: "Millimetres" }, { value: "in", label: "Inches" }]} />
          <Seg label="Decimals in 3D" value={p.decimals} onChange={(decimals) => set({ decimals })} options={[{ value: 0, label: "0" }, { value: 1, label: "0.0" }, { value: 2, label: "0.00" }]} />

          <h3 className="set-h">3D view</h3>
          <Seg label="Layout" value={p.quad ? "quad" : "single"} onChange={(v) => set({ quad: v === "quad" })} options={[{ value: "single", label: "One view" }, { value: "quad", label: "Four views" }]} />
          <Seg label="Shading" value={p.shade} onChange={(shade) => set({ shade })} options={[{ value: "shaded", label: "Shaded" }, { value: "edges", label: "Shaded with edges" }]} />
          <div className="exp-opts">
            <Check checked={p.dims3d} onChange={(dims3d) => set({ dims3d })}>Show overall dimensions</Check>
          </div>

          <h3 className="set-h">Editing</h3>
          <div className="exp-opts">
            <Check checked={p.autosave} onChange={(autosave) => set({ autosave })}>Save designs in this browser as I work</Check>
            <Check checked={p.confirmReset} onChange={(confirmReset) => set({ confirmReset })}>Ask before Reset all</Check>
            <Check checked={p.keepSetup} onChange={(keepSetup) => set({ keepSetup })}>New designs keep the material and sheet of the open one</Check>
          </div>

          <h3 className="set-h">Interface</h3>
          <Seg label="Size" value={p.uiSize} onChange={(uiSize) => set({ uiSize })} options={[{ value: "compact", label: "Compact" }, { value: "normal", label: "Normal" }, { value: "large", label: "Large" }]} />
          <div className="exp-opts">
            <Check checked={p.reduceMotion} onChange={(reduceMotion) => set({ reduceMotion })}>Reduce motion</Check>
          </div>

          <h3 className="set-h">Export</h3>
          <label className="exp-row">
            <span className="rowlabel">Machine</span>
            <select className="sel" aria-label="Machine" value={exp.machine} onChange={(e) => pickMachine(e.target.value)}>
              {MACHINE_PROFILES.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              <option value={CUSTOM_MACHINE}>Other machine (enter the bed size)</option>
            </select>
          </label>
          {exp.machine === CUSTOM_MACHINE && (
            <div className="exp-bed">
              <label>Bed width (mm)<input className="sel" type="number" min={20} max={3000} value={exp.bedW} onChange={(e) => setExport({ bedW: Math.max(20, Number(e.target.value) || 20) })} /></label>
              <label>Bed height (mm)<input className="sel" type="number" min={20} max={3000} value={exp.bedH} onChange={(e) => setExport({ bedH: Math.max(20, Number(e.target.value) || 20) })} /></label>
            </div>
          )}
          <Seg label="Format" value={exp.format} onChange={(format) => setExport({ format })} options={EXPORT_FORMATS.map((f) => ({ value: f, label: FORMAT_INFO[f].name }))} />

          <p className="exp-note">These settings are kept in this browser. Changes apply straight away.</p>
          <div className="rename-row">
            <button type="button" className="btn-ghost-sm" onClick={resetAll}><RotateCcw size={14} aria-hidden />Reset these settings</button>
            <button type="button" className="btn-export" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}
