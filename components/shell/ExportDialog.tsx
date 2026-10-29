"use client";

import { platform } from "@hingelab/platform";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import type { Units } from "@/components/editor/format";
import { makeExport, makeSTLExport, type ExportFile, type LaserFromMaterial } from "@/lib/export/bundle";
import { recordExport } from "@/lib/generators/localLists";
import { loadMaterials } from "@/lib/materials/library";
import { bedOf, CUSTOM_MACHINE, defaultExport, EXPORT_FORMATS, FORMAT_INFO, loadExport, MODEL_FORMATS, overBed, saveExport, type ExportFormat, type ExportSettings, type Rect } from "@/lib/export/profiles";
import { MACHINE_PROFILES } from "@/lib/studio/library";
import { loadPrefs } from "@/lib/studio/prefs";
import { gateLock } from "@/lib/gates";
import { usePlan } from "@/components/billing/usePlan";
import { useFlags } from "./useFlags";
import JobEstimate from "./JobEstimate";
import "./export-dialog.css";

function download(f: ExportFile) {
  void platform().saveFile({ name: f.name, data: f.data as string | Uint8Array, mime: f.mime, intent: "export" });
  recordExport(f.name);
}

/**
 * Export with more choices than the Export SVG button: the machine (its bed is checked against the
 * sheets), SVG, DXF, PDF or a LightBurn project, every sheet in one file or one file per sheet, a
 * mirrored copy and hairline strokes. The files are made from the same SVG the editor exports.
 */
export default function ExportDialog({ getSVG, localSVG, getGLB, getBOM, sheets, size, base, units, material, thickness, onClose, toast }: {
  /** The assembled 3D model as a .glb file (none: the editor has no 3D model to offer). */
  getGLB?: () => Promise<Uint8Array | null>;
  /** The parts list as CSV (none: not offered). */
  getBOM?: () => string | null;
  /** The design's material id: the user's own laser settings for it go into a LightBurn file. */
  material?: string;
  /** The design's material thickness, mm: how thick an STL's parts are unless the user changes it. */
  thickness?: number;
  /** The design's SVG built on this device, for the job summary (none: no summary). */
  localSVG?: () => string | null;
  /** The design's SVG, or null when it cannot be exported (the editor has said why). */
  getSVG: () => Promise<string | null>;
  sheets: Rect[] | null | undefined;
  /** The whole layout, used when there are no sheets. */
  size: { w: number; h: number };
  base: string;
  units: Units;
  onClose: () => void;
  toast: (msg: string) => void;
}) {
  const offered = (f: ExportFormat) => (f === "glb" ? !!getGLB : f === "csv" ? !!getBOM : true);
  const [s, setS] = useState<ExportSettings>(() => { const x = loadExport(loadPrefs().machineId); return offered(x.format) ? x : { ...x, format: "svg" }; });
  const [busy, setBusy] = useState(false);
  const [mat] = useState<LaserFromMaterial | undefined>(() => {
    const m = material ? loadMaterials().find((x) => x.id === material) : undefined;
    return m && Object.keys(m.laser).length ? { name: m.name, laser: m.laser } : undefined;
  });
  const ref = useRef<HTMLDivElement>(null);
  const upd = (p: Partial<ExportSettings>) => setS((o) => ({ ...o, ...p }));
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("select")?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);

  const rects = useMemo<Rect[]>(() => (sheets?.length ? sheets : [{ x: 0, y: 0, w: size.w, h: size.h }]), [sheets, size.w, size.h]);
  const bed = bedOf(s);
  const over = overBed(rects, bed);
  const many = rects.length > 1;
  const dims = (w: number, h: number) => (units === "in" ? `${(w / 25.4).toFixed(2)} × ${(h / 25.4).toFixed(2)} in` : `${Math.round(w * 10) / 10} × ${Math.round(h * 10) / 10} mm`);
  const fmt = FORMAT_INFO[s.format];
  const account = usePlan();
  const flags = useFlags();
  const locked = s.format === "lbrn2" ? gateLock("lbrn2", account.plan, flags) : null;

  function pickMachine(id: string) {
    if (id === CUSTOM_MACHINE) upd({ machine: id });
    else { const d = defaultExport(id); upd({ machine: id, format: d.format, bedW: d.bedW, bedH: d.bedH }); }
  }

  async function run() {
    if (busy || locked) return;
    setBusy(true);
    try {
      if (s.format === "glb" || s.format === "csv") {
        const data = s.format === "glb" ? await getGLB?.() : getBOM?.();
        if (!data) { toast("There is nothing to export yet."); return; }
        const name = `${base}${s.format === "csv" ? "-parts" : ""}.${FORMAT_INFO[s.format].ext}`;
        download({ name, data, mime: FORMAT_INFO[s.format].mime });
        saveExport(s);
        toast(`Downloading ${name}`);
        onClose();
        return;
      }
      const svg = await getSVG();
      if (!svg) return;
      const r = s.format === "stl" ? await makeSTLExport(svg, s, base, thickness) : makeExport(svg, sheets, s, base, mat);
      download(r.file);
      saveExport(s);
      toast(`Downloading ${r.file.name}${r.count > 1 ? ` (${r.count} files)` : ""}`);
      if (r.notes.length) window.setTimeout(() => toast(r.notes.join(" ")), 1800);
      onClose();
    } catch {
      toast("Export failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const action = s.split && many ? "Download ZIP" : `Export ${fmt.name}`;
  return (
    <div className="modal-back" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal exp" role="dialog" aria-modal="true" aria-label="Export" ref={ref}>
        <header>Export<button type="button" aria-label="Close" onClick={onClose}>×</button></header>
        <div className="mb">
          <label className="exp-row">
            <span className="rowlabel">Machine</span>
            <select className="sel" aria-label="Machine" value={s.machine} onChange={(e) => pickMachine(e.target.value)}>
              {MACHINE_PROFILES.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              <option value={CUSTOM_MACHINE}>Other machine (enter the bed size)</option>
            </select>
          </label>
          {s.machine === CUSTOM_MACHINE && (
            <div className="exp-bed">
              <label>Bed width (mm)<input className="sel" type="number" min={20} max={3000} value={s.bedW} onChange={(e) => upd({ bedW: Math.max(20, Number(e.target.value) || 20) })} /></label>
              <label>Bed height (mm)<input className="sel" type="number" min={20} max={3000} value={s.bedH} onChange={(e) => upd({ bedH: Math.max(20, Number(e.target.value) || 20) })} /></label>
            </div>
          )}
          <p className={`exp-check ${over.length ? "warn" : "ok"}`} role="status">
            {over.length
              ? `${over.length === rects.length && many ? "Every sheet is" : many ? `Sheet ${over.map((i) => i + 1).join(", ")} ${over.length === 1 ? "is" : "are"}` : "The design is"} larger than this bed (${dims(bed.w, bed.h)}). Set the sheet size in the Sheet section to the bed, or choose another machine.`
              : `${many ? `All ${rects.length} sheets fit` : "It fits"} this machine's ${dims(bed.w, bed.h)} bed.`}
          </p>

          <div className="exp-row">
            <span className="rowlabel">Format</span>
            <div className="iconseg full" role="group" aria-label="Format">
              {EXPORT_FORMATS.filter(offered).map((f) => <button key={f} type="button" aria-pressed={s.format === f} onClick={() => upd({ format: f })}>{FORMAT_INFO[f].name}</button>)}
            </div>
          </div>
          <p className="exp-about">{fmt.about}</p>
          <p className="exp-about">{fmt.order}</p>
          {locked && <p className="exp-check warn" role="status">{locked} <a href="/app/billing" target="_blank" rel="noopener">See Pro</a></p>}

          {many && !MODEL_FORMATS.includes(s.format) && (
            <div className="exp-row">
              <span className="rowlabel">Sheets</span>
              <div className="iconseg full" role="group" aria-label="Sheets">
                <button type="button" aria-pressed={!s.split} onClick={() => upd({ split: false })}>{s.format === "pdf" ? "One PDF, a page each" : "All in one file"}</button>
                <button type="button" aria-pressed={s.split} onClick={() => upd({ split: true })}>One file per sheet (ZIP)</button>
              </div>
            </div>
          )}

          {s.format === "stl" && (
            <div className="exp-bed">
              <label>Part thickness (mm)<input className="sel" type="number" min={0.2} max={100} step={0.1} value={s.stlT ?? thickness ?? 3} onChange={(e) => upd({ stlT: Math.min(100, Math.max(0.2, Number(e.target.value) || 3)) })} /></label>
            </div>
          )}
          {s.format !== "stl" && !MODEL_FORMATS.includes(s.format) && <div className="exp-opts">
            <label className="chk"><input type="checkbox" checked={s.merge !== false} onChange={(e) => upd({ merge: e.target.checked })} />Cut shared lines once (where touching parts share an edge)</label>
            <label className="chk"><input type="checkbox" checked={s.mirror} onChange={(e) => upd({ mirror: e.target.checked })} />Mirror left to right (to engrave the back of clear acrylic)</label>
            {(s.format === "svg" || s.format === "pdf") && (
              <label className="chk"><input type="checkbox" checked={s.hairline} onChange={(e) => upd({ hairline: e.target.checked })} />Hairline lines, 0.001 in (Epilog, Trotec and Universal print drivers cut these)</label>
            )}
            {s.format === "dxf" && (
              <label className="chk"><input type="checkbox" checked={s.inches} onChange={(e) => upd({ inches: e.target.checked })} />Numbers in inches (for software that reads a DXF as inches)</label>
            )}
          </div>}

          {localSVG && <JobEstimate svg={localSVG} version={0} sheets={sheets} material={material} units={units === "in" ? "in" : "mm"} machine={s.machine} title="Job summary" />}

          <p className="exp-note">
            {s.format === "lbrn2" && mat
              ? `Files are made on your device. The LightBurn file carries the speed, power and passes you saved for “${mat.name}”; layers without your settings keep LightBurn's own.`
              : s.format === "glb" ? "The model is made on your device from the 3D preview, assembled. It shows the design; cut from the SVG, DXF, PDF or LightBurn file."
              : s.format === "csv" ? "The list is made on your device from the design's parts, before kerf."
              : s.format === "stl" ? "The file is made on your device. Check the part thickness, and print a small part first to check the fit of slots and tabs."
              : "Files are made on your device. Laser power and speed are not set: use your own tested settings for each layer. Measure your real material thickness and cut a small test before the whole job."}
          </p>
          <div className="rename-row">
            <button type="button" className="btn-ghost-sm" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-export" disabled={busy || !!locked} onClick={() => void run()}><Download size={16} aria-hidden />{action}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
