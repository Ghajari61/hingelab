"use client";

import { Minus, Plus, RotateCw } from "lucide-react";
import { SHEET_PRESETS } from "@/lib/studio/library";
import { MAX_FIT_SHEETS, type FitSettings } from "@/lib/fit/fitToSheets";
import type { FitInfo } from "@/lib/fit/arrange";

const GROUPS = ["Machine bed", "Paper", "Common"] as const;

export const presetIdOf = (w: number, h: number) =>
  SHEET_PRESETS.find((s) => Math.abs(s.w - w) < 0.05 && Math.abs(s.h - h) < 0.05)?.id ?? "custom";

/** One line describing what Fit did, for the Sheet section and the status bar. */
export function fitSummary(fit: FitSettings, info: FitInfo | null, size: string | null): string {
  if (fit.mode === "off" || !info) return "Parts are laid out in rows on one sheet.";
  const sheets = `${info.sheets} sheet${info.sheets === 1 ? "" : "s"}`;
  if (fit.mode === "auto") return `Design size on ${sheets}${info.fits ? "" : ". A part is larger than the sheet"}.`;
  if (!info.fits) return `Does not fit ${fit.sheets} sheet${fit.sheets === 1 ? "" : "s"} at any size this design can be built at. Use a larger sheet or more sheets.`;
  const pct = Math.round(info.scale * 1000) / 10;
  return `${info.scale < 1 ? `Scaled to ${pct} %` : "Full size"}${size ? ` · ${size}` : ""} · ${sheets}`;
}

/**
 * The "Sheet" section body shared by Hinge Box and Letters: sheet preset, size fields (children),
 * and Fit product to Off / 1 sheet / N sheets / Auto with the result.
 */
export function SheetSection({ bedW, bedH, fit, info, size, onSheet, onFit, children }: {
  bedW: number;
  bedH: number;
  fit: FitSettings;
  info: FitInfo | null;
  /** Fitted product size, already formatted. */
  size: string | null;
  onSheet: (w: number, h: number) => void;
  onFit: (f: FitSettings) => void;
  children?: React.ReactNode;
}) {
  const preset = presetIdOf(bedW, bedH);
  const n = fit.mode === "sheets" ? fit.sheets : 1;
  const warn = fit.mode !== "off" && !!info && !info.fits;
  return (
    <>
      <div className="rowlabel">Sheet</div>
      <select
        className="sel" aria-label="Sheet preset" value={preset}
        onChange={(e) => { const s = SHEET_PRESETS.find((x) => x.id === e.target.value); if (s) onSheet(s.w, s.h); }}
      >
        {preset === "custom" && <option value="custom">Custom size</option>}
        {GROUPS.map((g) => (
          <optgroup key={g} label={g}>
            {SHEET_PRESETS.filter((s) => s.group === g).map((s) => <option key={s.id} value={s.id}>{s.name}{s.group === "Machine bed" ? ` (${s.w} × ${s.h} mm)` : ""}</option>)}
          </optgroup>
        ))}
      </select>
      {Math.abs(bedW - bedH) > 0.05 && (
        <button type="button" className="btn-auto sheet-rotate" onClick={() => onSheet(bedH, bedW)} title="Swap the sheet's width and height">
          <RotateCw size={14} aria-hidden /> Turn sheet ({bedH} × {bedW} mm)
        </button>
      )}
      {children}
      <div className="rowlabel">Fit product to</div>
      <div className="iconseg full" role="group" aria-label="Fit product to">
        <button type="button" aria-pressed={fit.mode === "off"} onClick={() => onFit({ ...fit, mode: "off" })} title="Parts in rows on one sheet, at the design size">Off</button>
        <button type="button" aria-pressed={fit.mode === "sheets" && fit.sheets === 1} onClick={() => onFit({ mode: "sheets", sheets: 1 })} title="Shrink the product so every part fits one sheet">1 sheet</button>
        <button type="button" aria-pressed={fit.mode === "sheets" && fit.sheets > 1} onClick={() => onFit({ mode: "sheets", sheets: Math.max(2, fit.sheets) })} title="Shrink the product so every part fits the number of sheets you choose">N sheets</button>
        <button type="button" aria-pressed={fit.mode === "auto"} onClick={() => onFit({ ...fit, mode: "auto" })} title="Keep the design size and nest the parts on as many sheets as needed">Auto</button>
      </div>
      {fit.mode === "sheets" && fit.sheets > 1 && (
        <div className="fit-count" role="group" aria-label="Number of sheets">
          <span>Sheets</span>
          <button type="button" aria-label="Fewer sheets" disabled={n <= 2} onClick={() => onFit({ mode: "sheets", sheets: n - 1 })}><Minus size={13} /></button>
          <output aria-label="Sheets">{n}</output>
          <button type="button" aria-label="More sheets" disabled={n >= MAX_FIT_SHEETS} onClick={() => onFit({ mode: "sheets", sheets: n + 1 })}><Plus size={13} /></button>
        </div>
      )}
      <p className={`fit-result${warn ? " warn" : ""}`} role="status" aria-label="Fit result">{fitSummary(fit, info, size)}</p>
      {fit.mode !== "off" && <p className="note">Fit only shrinks the design and nests the parts upright. Material, kerf, hinge cuts and joints keep their sizes.</p>}
    </>
  );
}
